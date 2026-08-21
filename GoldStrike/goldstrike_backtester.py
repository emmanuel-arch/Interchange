"""
GoldStrike v3.0 — bar-based backtester using the same entry rules as the live engine.

Requires CSV exports from ``export_mt5_history.py`` (UTC ``time`` column).
Mirrors: ``evaluate_signal_core``, session (EAT), spread cap, max 1 open trade,
max trades/day, post-close cooldown, opposite-signal reversal delay, and a
compact multi-stage exit model aligned with ``position_manager`` (BE → TP1
partial → post-TP1 lock → trail).

Usage (from GoldStrike directory, after exporting data):
  python goldstrike_backtester.py
  python goldstrike_backtester.py --m1 data/XAUUSDc_M1_*.csv --balance 10000
"""

from __future__ import annotations

import argparse
import glob
import math

import numpy as np
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

import config
import session_filter
from goldstrike_engine import evaluate_signal_core


# Approximate XAU contract notional per 1.0 lot / $1 move (backtest only).
BACKTEST_CONTRACT_SIZE = 100.0
DEFAULT_BALANCE = 10_000.0


def _load_ohlc(path: Path) -> pd.DataFrame:
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"CSV not found: {path}")
    if path.stat().st_size == 0:
        raise ValueError(
            f"CSV is empty (0 bytes): {path}\n"
            "Re-run export with MT5 connected and the symbol in Market Watch; "
            "if copy_rates_range returns nothing, the file is written with no rows."
        )
    try:
        df = pd.read_csv(path)
    except pd.errors.EmptyDataError as e:
        raise ValueError(
            f"Pandas could not read any columns from {path} (file empty or not valid CSV)."
        ) from e
    if df.empty or len(df.columns) == 0:
        raise ValueError(
            f"CSV has no data rows: {path}. Delete it and export again from MT5."
        )
    df["time"] = pd.to_datetime(df["time"], utc=True)
    return df.sort_values("time").reset_index(drop=True)


def _precompute_bar_end_ns(df: pd.DataFrame, period_minutes: int) -> np.ndarray:
    ends = df["time"] + pd.Timedelta(minutes=period_minutes)
    return ends.astype(np.int64).to_numpy()


def _slice_closed_num(
    df: pd.DataFrame,
    bar_end_ns: np.ndarray,
    ts_close_ns: int,
    tail: int,
) -> pd.DataFrame:
    idx = int(np.searchsorted(bar_end_ns, ts_close_ns, side="right"))
    if idx <= 0:
        return df.iloc[0:0].copy()
    start = max(0, idx - tail)
    return df.iloc[start:idx].reset_index(drop=True)


def _m1_window_with_dummy(m1: pd.DataFrame, i: int) -> pd.DataFrame:
    """Match live M1 buffer: last row is synthetic 'forming' bar; patterns use iloc[-2]."""
    body = m1.iloc[: i + 1].copy()
    t_last = m1["time"].iloc[i]
    dummy = pd.DataFrame(
        [
            {
                "time": t_last + pd.Timedelta(minutes=1),
                "open": float(m1["close"].iloc[i]),
                "high": float(m1["close"].iloc[i]),
                "low": float(m1["close"].iloc[i]),
                "close": float(m1["close"].iloc[i]),
                "volume": 0.0,
            }
        ]
    )
    return pd.concat([body, dummy], ignore_index=True)


def _lot_size(atr: float, balance: float) -> float:
    risk_amount = balance * config.RISK_PERCENT
    sl_distance = atr * config.ATR_SL_MULT
    if sl_distance <= 0:
        return config.MIN_LOT
    lot = risk_amount / (sl_distance * BACKTEST_CONTRACT_SIZE)
    lot = math.floor(lot * 100) / 100
    return max(config.MIN_LOT, min(lot, config.MAX_LOT))


def _find_latest(patterns: list[str]) -> Path | None:
    matches: list[Path] = []
    for pat in patterns:
        matches.extend(Path(p) for p in glob.glob(pat))
    if not matches:
        return None
    # Prefer non-empty files: failed exports sometimes leave 0-byte CSVs that still
    # "win" by modification time.
    nonempty = [p for p in matches if p.is_file() and p.stat().st_size > 32]
    pool = nonempty if nonempty else matches
    return max(pool, key=lambda p: p.stat().st_mtime)


@dataclass
class SimPosition:
    direction: int  # 1 = long, -1 = short
    entry: float
    atr: float
    volume: float
    remaining: float
    sl: float
    tp2: float
    early_be_set: bool = False
    tp1_closed: bool = False
    breakeven_set: bool = False
    entry_time: pd.Timestamp | None = None


@dataclass
class BacktestResult:
    trades: list[dict[str, Any]] = field(default_factory=list)
    pnl_usd: float = 0.0
    wins: int = 0
    losses: int = 0


def _apply_bar_long(pos: SimPosition, o: float, h: float, l: float, c: float) -> tuple[float, SimPosition | None, str]:
    """Return (pnl_delta_usd, new_pos_or_None, reason_if_closed)."""
    atr = pos.atr
    rem = pos.remaining
    pnl = 0.0

    if l <= pos.sl:
        exit_px = pos.sl
        pts = exit_px - pos.entry
        pnl = pts * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL"

    if not pos.early_be_set and not pos.tp1_closed:
        if h >= pos.entry + atr * config.ATR_BREAKEVEN_TRIGGER:
            buf = atr * 0.1
            pos.sl = max(pos.sl, pos.entry + buf)
            pos.early_be_set = True

    if l <= pos.sl:
        pnl = (pos.sl - pos.entry) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL"

    tp1_px = pos.entry + atr * config.ATR_TP1_MULT
    if not pos.tp1_closed and h >= tp1_px:
        partial = math.floor(pos.volume * config.PARTIAL_CLOSE_PCT * 100) / 100
        partial = min(partial, rem - config.MIN_LOT) if rem - partial >= config.MIN_LOT else rem
        if partial < config.MIN_LOT:
            partial = rem
        pnl_partial = (tp1_px - pos.entry) * partial * BACKTEST_CONTRACT_SIZE
        pnl += pnl_partial
        rem -= partial
        pos.remaining = rem
        pos.tp1_closed = True
        lock = pos.entry + atr * config.ATR_BREAKEVEN_MULT
        pos.sl = max(pos.sl, lock)
        pos.tp2 = pos.entry + atr * config.ATR_TP2_MULT

    if rem <= 0:
        return pnl, None, "TP1_FULL"

    if l <= pos.sl:
        pnl += (pos.sl - pos.entry) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL"

    if not pos.breakeven_set and pos.tp1_closed:
        pos.breakeven_set = True

    if pos.breakeven_set:
        trail = h - atr * config.ATR_TRAIL_MULT
        pos.sl = max(pos.sl, trail)

    if l <= pos.sl:
        pnl += (pos.sl - pos.entry) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL_TRAIL"

    if h >= pos.tp2:
        pnl += (pos.tp2 - pos.entry) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "TP2"

    return pnl, pos, "OPEN"


def _apply_bar_short(pos: SimPosition, o: float, h: float, l: float, c: float) -> tuple[float, SimPosition | None, str]:
    atr = pos.atr
    rem = pos.remaining
    pnl = 0.0

    if h >= pos.sl:
        pnl = (pos.entry - pos.sl) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL"

    if not pos.early_be_set and not pos.tp1_closed:
        if l <= pos.entry - atr * config.ATR_BREAKEVEN_TRIGGER:
            buf = atr * 0.1
            pos.sl = min(pos.sl, pos.entry - buf)
            pos.early_be_set = True

    if h >= pos.sl:
        pnl = (pos.entry - pos.sl) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL"

    tp1_px = pos.entry - atr * config.ATR_TP1_MULT
    if not pos.tp1_closed and l <= tp1_px:
        partial = math.floor(pos.volume * config.PARTIAL_CLOSE_PCT * 100) / 100
        partial = min(partial, rem - config.MIN_LOT) if rem - partial >= config.MIN_LOT else rem
        if partial < config.MIN_LOT:
            partial = rem
        pnl_partial = (pos.entry - tp1_px) * partial * BACKTEST_CONTRACT_SIZE
        pnl += pnl_partial
        rem -= partial
        pos.remaining = rem
        pos.tp1_closed = True
        lock = pos.entry - atr * config.ATR_BREAKEVEN_MULT
        pos.sl = min(pos.sl, lock)
        pos.tp2 = pos.entry - atr * config.ATR_TP2_MULT

    if rem <= 0:
        return pnl, None, "TP1_FULL"

    if h >= pos.sl:
        pnl += (pos.entry - pos.sl) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL"

    if not pos.breakeven_set and pos.tp1_closed:
        pos.breakeven_set = True

    if pos.breakeven_set:
        trail = l + atr * config.ATR_TRAIL_MULT
        pos.sl = min(pos.sl, trail)

    if h >= pos.sl:
        pnl += (pos.entry - pos.sl) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "SL_TRAIL"

    if l <= pos.tp2:
        pnl += (pos.entry - pos.tp2) * rem * BACKTEST_CONTRACT_SIZE
        return pnl, None, "TP2"

    return pnl, pos, "OPEN"


def run_backtest(
    m1: pd.DataFrame,
    m5: pd.DataFrame,
    m15: pd.DataFrame,
    *,
    spread: float,
    initial_balance: float,
) -> BacktestResult:
    out = BacktestResult()
    balance = initial_balance
    pos: SimPosition | None = None

    m15_end_ns = _precompute_bar_end_ns(m15, 15)
    m5_end_ns = _precompute_bar_end_ns(m5, 5)
    ts_close_all_ns = (m1["time"] + pd.Timedelta(minutes=1)).astype(np.int64).to_numpy()

    last_close_ts: pd.Timestamp | None = None
    last_open_ts: pd.Timestamp | None = None
    last_dir_opened: int | None = None
    trades_today = 0
    current_eat_date: datetime | None = None
    trade_pnl_accum = 0.0

    i_start = 0
    for i in range(len(m1)):
        ts_close_ns = int(ts_close_all_ns[i])
        m15_sub = _slice_closed_num(m15, m15_end_ns, ts_close_ns, 250)
        m5_sub = _slice_closed_num(m5, m5_end_ns, ts_close_ns, 250)
        if len(m15_sub) < 200 or len(m5_sub) < 200:
            i_start = i + 1
            continue
        break
    else:
        return out

    for i in range(i_start, len(m1)):
        ts_close_ns = int(ts_close_all_ns[i])
        ts_close = pd.to_datetime(ts_close_ns, unit="ns", utc=True)
        eat_now = session_filter._ensure_eat(ts_close.to_pydatetime())

        eat_date = eat_now.date()
        if current_eat_date != eat_date:
            current_eat_date = eat_date
            trades_today = 0

        # Manage open trades on the current M1 bar (entry was open of this bar).
        curr = m1.iloc[i]
        o = float(curr["open"])
        h = float(curr["high"])
        l = float(curr["low"])
        c = float(curr["close"])

        if pos is not None:
            if session_filter.is_friday_cutoff_at(eat_now):
                if pos.direction == 1:
                    pnl = (c - pos.entry) * pos.remaining * BACKTEST_CONTRACT_SIZE
                else:
                    pnl = (pos.entry - c) * pos.remaining * BACKTEST_CONTRACT_SIZE
                balance += pnl
                trade_pnl_accum += pnl
                out.trades.append({"pnl": trade_pnl_accum, "reason": "FRIDAY", "time": str(ts_close)})
                if trade_pnl_accum > 0:
                    out.wins += 1
                elif trade_pnl_accum < 0:
                    out.losses += 1
                pos = None
                trade_pnl_accum = 0.0
                last_close_ts = ts_close
                continue

            if pos.direction == 1:
                dpnl, pos, reason = _apply_bar_long(pos, o, h, l, c)
            else:
                dpnl, pos, reason = _apply_bar_short(pos, o, h, l, c)
            balance += dpnl
            trade_pnl_accum += dpnl
            if pos is None:
                last_close_ts = ts_close
                out.trades.append({"pnl": trade_pnl_accum, "reason": reason, "time": str(ts_close)})
                if trade_pnl_accum > 0:
                    out.wins += 1
                elif trade_pnl_accum < 0:
                    out.losses += 1
                trade_pnl_accum = 0.0
            continue

        in_session = session_filter.is_trading_session_at(eat_now)
        if session_filter.is_weekend_at(eat_now):
            continue

        m15_sub = _slice_closed_num(m15, m15_end_ns, ts_close_ns, 250)
        m5_sub = _slice_closed_num(m5, m5_end_ns, ts_close_ns, 250)
        m1_win = _m1_window_with_dummy(m1, i)

        sig, ctx = evaluate_signal_core(
            m15_sub,
            m5_sub,
            m1_win,
            spread,
            eat_now=eat_now,
            current_session=session_filter.get_current_session_at(eat_now),
            in_session=in_session,
            bid=float(m1["close"].iloc[i]),
            silent=True,
        )

        if sig == 0:
            continue

        if i + 1 >= len(m1):
            continue

        if trades_today >= config.MAX_TRADES_PER_DAY:
            continue

        if last_close_ts is not None:
            elapsed = (ts_close - last_close_ts).total_seconds()
            if elapsed < config.TRADE_COOLDOWN_SECONDS:
                continue

        if (
            last_dir_opened is not None
            and last_open_ts is not None
            and sig != last_dir_opened
        ):
            elapsed_rev = (ts_close - last_open_ts).total_seconds()
            if elapsed_rev < config.MIN_SIGNAL_REVERSAL_SECONDS:
                continue

        atr = float(ctx["atr"])
        if atr <= 0:
            continue

        lot = _lot_size(atr, balance)
        if session_filter.is_monday_caution_at(eat_now):
            lot = max(config.MIN_LOT, round(lot * 0.5, 2))

        row_entry = m1.iloc[i + 1]
        eo = float(row_entry["open"])
        half_spread = spread / 2.0
        if sig == 1:
            entry = eo + half_spread
            sl = entry - atr * config.ATR_SL_MULT
            tp2 = entry + atr * config.ATR_TP2_MULT
        else:
            entry = eo - half_spread
            sl = entry + atr * config.ATR_SL_MULT
            tp2 = entry - atr * config.ATR_TP2_MULT

        trade_pnl_accum = 0.0
        pos = SimPosition(
            direction=sig,
            entry=entry,
            atr=atr,
            volume=lot,
            remaining=lot,
            sl=sl,
            tp2=tp2,
            entry_time=ts_close,
        )
        last_open_ts = ts_close
        last_dir_opened = sig
        trades_today += 1

    out.pnl_usd = sum(t["pnl"] for t in out.trades)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="GoldStrike bar backtest (v3.0 rules)")
    ap.add_argument("--m1", type=Path, help="M1 CSV path")
    ap.add_argument("--m5", type=Path, help="M5 CSV path")
    ap.add_argument("--m15", type=Path, help="M15 CSV path")
    ap.add_argument("--data-dir", type=Path, default=config.BASE_DIR / "data")
    ap.add_argument("--spread", type=float, default=min(0.35, config.MAX_SPREAD_PRICE))
    ap.add_argument("--balance", type=float, default=DEFAULT_BALANCE)
    args = ap.parse_args()

    data_dir = args.data_dir
    sym_glob = config.SYMBOL.replace(".", "_")

    m1_path = args.m1 or _find_latest([str(data_dir / f"{sym_glob}_M1_*.csv"), str(data_dir / "*_M1_*.csv")])
    m5_path = args.m5 or _find_latest([str(data_dir / f"{sym_glob}_M5_*.csv"), str(data_dir / "*_M5_*.csv")])
    m15_path = args.m15 or _find_latest([str(data_dir / f"{sym_glob}_M15_*.csv"), str(data_dir / "*_M15_*.csv")])

    if not m1_path or not m5_path or not m15_path:
        raise SystemExit(
            f"No CSV data found under {data_dir}. Run: python export_mt5_history.py"
        )

    print(f"M1:  {m1_path}")
    print(f"M5:  {m5_path}")
    print(f"M15: {m15_path}")

    m1 = _load_ohlc(m1_path)
    m5 = _load_ohlc(m5_path)
    m15 = _load_ohlc(m15_path)

    res = run_backtest(m1, m5, m15, spread=args.spread, initial_balance=args.balance)
    n = len(res.trades)
    print(f"\nTrades closed: {n} | Wins: {res.wins} | Losses: {res.losses}")
    print(f"Net P&L (approx USD): {res.pnl_usd:+.2f}")


if __name__ == "__main__":
    main()

"""
Export M1 / M5 / M15 OHLCV for the configured symbol from MT5 (default: 180 days).

Run from the GoldStrike folder with MT5 logged in (same credentials as live engine):
  python export_mt5_history.py

Outputs CSV under GoldStrike/data/ with UTC timestamps (ISO8601).

Long ranges use multiple MT5 requests (M1 in ~14-day slices): a single
``copy_rates_range`` for many months of M1 often returns (-2, Invalid params).
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import MetaTrader5 as mt5
import pandas as pd

import config

UTC = timezone.utc


def _rates_to_df(rates) -> pd.DataFrame:
    if rates is None or len(rates) == 0:
        return pd.DataFrame()
    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
    return df[["time", "open", "high", "low", "close", "tick_volume"]].rename(
        columns={"tick_volume": "volume"}
    )


def _copy_rates_range_chunked(
    symbol: str,
    timeframe: int,
    start: datetime,
    end: datetime,
    *,
    chunk_days: int,
    label: str,
) -> pd.DataFrame:
    """
    MT5 often returns (-2, 'Terminal: Invalid params') for a single huge
    copy_rates_range (e.g. 180 days of M1). Pull in calendar slices and merge.
    """
    chunks: list[pd.DataFrame] = []
    cur = start
    while cur < end:
        chunk_end = min(cur + timedelta(days=chunk_days), end)
        rates = mt5.copy_rates_range(symbol, timeframe, cur, chunk_end)
        part = _rates_to_df(rates)
        if not part.empty:
            chunks.append(part)
        cur = chunk_end

    if not chunks:
        return pd.DataFrame()
    out = pd.concat(chunks, ignore_index=True)
    out = out.drop_duplicates(subset=["time"], keep="last").sort_values("time")
    return out.reset_index(drop=True)


def export_range(
    symbol: str,
    days: int,
    out_dir: Path,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    if not mt5.initialize(timeout=60000):
        raise SystemExit(f"MT5 initialize failed: {mt5.last_error()}")
    try:
        if not mt5.login(config.MT5_LOGIN, config.MT5_PASSWORD, config.MT5_SERVER):
            raise SystemExit(f"MT5 login failed: {mt5.last_error()}")
        if not mt5.symbol_select(symbol, True):
            raise SystemExit(f"Symbol {symbol} not available in Market Watch")

        info = mt5.symbol_info(symbol)
        if info is None:
            raise SystemExit(f"symbol_info({symbol!r}) is None — check exact broker symbol name.")

        # Naive UTC — avoids some "Invalid params" cases with aware datetimes.
        end = datetime.now(UTC).replace(tzinfo=None)
        start = end - timedelta(days=days)
        stamp = f"{start.date()}_{end.date()}"

        # M1: small chunks — a full 180d M1 range often hits (-2, Invalid params).
        # M5/M15: larger chunks; still chunked for consistency under big --days.
        tf_jobs: tuple[tuple[int, str, int], ...] = (
            (mt5.TIMEFRAME_M1, "M1", 14),
            (mt5.TIMEFRAME_M5, "M5", 60),
            (mt5.TIMEFRAME_M15, "M15", 120),
        )

        for tf, name, chunk_days in tf_jobs:
            df = _copy_rates_range_chunked(
                symbol, tf, start, end, chunk_days=chunk_days, label=name
            )
            if df.empty:
                raise SystemExit(
                    f"No {name} bars returned for {symbol} between {start} and {end}. "
                    f"Check symbol name and MT5 history (Tools → History). "
                    f"last_error={mt5.last_error()}"
                )
            path = out_dir / f"{symbol.replace('.', '_')}_{name}_{stamp}.csv"
            df.to_csv(path, index=False)
            print(f"Wrote {len(df):,} rows -> {path}")
    finally:
        mt5.shutdown()


def main() -> None:
    p = argparse.ArgumentParser(description="Export MT5 history for GoldStrike backtests")
    p.add_argument("--days", type=int, default=180, help="Calendar days of history (default 180)")
    p.add_argument(
        "--symbol",
        default=config.SYMBOL,
        help=f"Symbol (default from config: {config.SYMBOL})",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=config.BASE_DIR / "data",
        help="Output directory (default: GoldStrike/data)",
    )
    args = p.parse_args()
    export_range(args.symbol, args.days, args.out)


if __name__ == "__main__":
    main()

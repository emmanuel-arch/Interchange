"""
GoldStrike v3.0 — Backtester Engine
Mirrors the live goldstrike_engine.py signal logic exactly.
Runs against historical M1/M5/M15 CSV data.

Usage:
    from backtester import GoldStrikeBacktester
    bt = GoldStrikeBacktester(config)
    results = bt.run(m1_df, m5_df, m15_df)
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Optional
import indicators


@dataclass
class BacktestConfig:
    """All tunable parameters — mirrors config.py exactly."""
    # Strategy
    RISK_PERCENT: float = 0.01
    ATR_SL_MULT: float = 1.0
    ATR_TP1_MULT: float = 2.0
    ATR_TP2_MULT: float = 3.5
    ATR_TRAIL_MULT: float = 1.0
    ATR_BREAKEVEN_TRIGGER: float = 1.0
    PARTIAL_CLOSE_PCT: float = 0.50

    # Indicators
    EMA_FAST: int = 50
    EMA_SLOW: int = 200
    EMA_PULLBACK: int = 20
    RSI_PERIOD: int = 14
    ATR_PERIOD: int = 14
    ADX_PERIOD: int = 14
    ADX_MINIMUM: int = 18
    RSI_LOW: float = 40.0
    RSI_HIGH: float = 65.0

    # Signal Quality
    EMA20_SLOPE_BARS: int = 3
    EMA20_SLOPE_TOLERANCE: float = 0.5
    TRADE_COOLDOWN_SECONDS: int = 600
    MIN_SIGNAL_REVERSAL_SECONDS: int = 900

    # Candle Pattern
    MOMENTUM_BODY_ATR_PCT: float = 0.30
    MOMENTUM_BODY_RATIO: float = 0.55

    # MIXED Trend
    ALLOW_MIXED_TREND: bool = True
    ADX_MIXED_MINIMUM: int = 18
    SLOPE_GATE_MIXED: bool = True  # v3.0: only trade slope direction in MIXED

    # Risk
    MAX_SPREAD_PRICE: float = 0.40
    MAX_DAILY_LOSS_PCT: float = 0.025
    MAX_WEEKLY_LOSS_PCT: float = 0.08
    MAX_DRAWDOWN_PCT: float = 0.04
    MAX_TRADES_PER_DAY: int = 3
    MAX_OPEN_TRADES: int = 1
    MAX_LOT: float = 0.10
    MIN_LOT: float = 0.01

    # Sessions (UTC hours — data is in UTC)
    LONDON_START_UTC: int = 7   # 10:00 EAT = 07:00 UTC
    LONDON_END_UTC: int = 10    # 13:00 EAT
    NY_OVERLAP_START_UTC: int = 12  # 15:00 EAT
    NY_OVERLAP_END_UTC: int = 15    # 18:00 EAT
    NY_CONT_START_UTC: int = 15     # 18:00 EAT
    NY_CONT_END_UTC: int = 17       # 20:00 EAT
    FRIDAY_CUTOFF_UTC: int = 12     # 15:00 EAT Friday
    SESSION_MODE: str = "baseline"  # baseline | narrow
    USE_NEWS_BLACKOUT: bool = True
    # UTC intraday windows (start_hour, end_hour) blocked when enabled.
    NEWS_BLACKOUT_WINDOWS_UTC: tuple = ((12, 13),)

    # Simulation
    SPREAD: float = 0.30       # Simulated average spread in USD
    STARTING_BALANCE: float = 100000.0  # FTMO challenge size
    MONDAY_LOT_REDUCTION: float = 0.5
    ENTRY_SLIPPAGE_PCT_ATR: float = 0.03
    EXIT_SLIPPAGE_PCT_ATR: float = 0.03

    # Volatility regime filter (M5 ATR in price units)
    USE_ATR_REGIME_FILTER: bool = True
    ATR_MIN_FILTER: float = 0.6
    ATR_MAX_FILTER: float = 12.0


@dataclass
class Trade:
    """Single trade record."""
    entry_time: pd.Timestamp
    direction: int              # 1=BUY, -1=SELL
    entry_price: float
    sl: float
    tp: float
    lot: float
    atr: float
    exit_time: Optional[pd.Timestamp] = None
    exit_price: Optional[float] = None
    exit_reason: str = ""
    pnl: float = 0.0
    max_favorable: float = 0.0
    max_adverse: float = 0.0
    # Position management state
    breakeven_set: bool = False
    partial_closed: bool = False
    remaining_lot: float = 0.0

    def __post_init__(self):
        self.remaining_lot = self.lot


@dataclass
class DailyStats:
    """Track daily risk limits."""
    date: str = ""
    start_balance: float = 0.0
    trades: int = 0
    pnl: float = 0.0
    peak_balance: float = 0.0


class GoldStrikeBacktester:
    """
    Full backtester mirroring GoldStrike v3.0 engine logic.
    Processes M1 candles, computes M5/M15 indicators, evaluates signals,
    manages positions with trailing/partial close/breakeven.
    """

    def __init__(self, config: BacktestConfig = None):
        self.cfg = config or BacktestConfig()
        self.trades: list[Trade] = []
        self.open_trades: list[Trade] = []
        self.balance = self.cfg.STARTING_BALANCE
        self.peak_balance = self.cfg.STARTING_BALANCE
        self.daily_stats: dict[str, DailyStats] = {}
        self.equity_curve: list[dict] = []

        # State tracking
        self._last_trade_close_time: Optional[pd.Timestamp] = None
        self._last_trade_direction: Optional[int] = None
        self._last_trade_open_time: Optional[pd.Timestamp] = None
        self._daily_loss_triggered = False
        self._current_day = ""
        self._daily_start_balance = 0.0
        self._trades_today = 0

    def run(self, m1: pd.DataFrame, m5: pd.DataFrame, m15: pd.DataFrame) -> dict:
        """
        Run the backtest on historical data.

        Args:
            m1: M1 candle data (columns: time, open, high, low, close, volume)
            m5: M5 candle data
            m15: M15 candle data

        Returns:
            dict with results summary and trade list
        """
        print(f"Starting backtest: {len(m1)} M1 candles, balance=${self.cfg.STARTING_BALANCE:,.0f}")
        print(f"Config: ADX>={self.cfg.ADX_MINIMUM}, SL={self.cfg.ATR_SL_MULT}xATR, "
              f"TP={self.cfg.ATR_TP1_MULT}xATR, MIXED_ADX>={self.cfg.ADX_MIXED_MINIMUM}, "
              f"SlopeGate={self.cfg.SLOPE_GATE_MIXED}")

        # Parse timestamps
        m1 = m1.copy()
        m5 = m5.copy()
        m15 = m15.copy()
        m1['time'] = pd.to_datetime(m1['time'], utc=True)
        m5['time'] = pd.to_datetime(m5['time'], utc=True)
        m15['time'] = pd.to_datetime(m15['time'], utc=True)

        # Pre-compute M5 and M15 indicators (much faster than per-candle)
        print("Pre-computing indicators...")
        m15_ind = self._compute_m15_indicators(m15)
        m5_ind = self._compute_m5_indicators(m5)

        # Build time-indexed lookups for fast alignment
        m15_ind = m15_ind.set_index('time').sort_index()
        m5_ind = m5_ind.set_index('time').sort_index()

        total = len(m1)
        report_every = total // 20

        for i in range(4, total):  # need at least 4 M1 candles for patterns
            if report_every > 0 and i % report_every == 0:
                pct = (i / total) * 100
                print(f"  {pct:.0f}% | {len(self.trades)} trades | Balance: ${self.balance:,.2f}")

            row = m1.iloc[i]
            t = row['time']

            # ── Daily reset ──
            day_str = t.strftime('%Y-%m-%d')
            if day_str != self._current_day:
                self._current_day = day_str
                self._daily_start_balance = self.balance
                self._trades_today = 0
                self._daily_loss_triggered = False

            # ── Session check ──
            if not self._in_session(t):
                # Still manage open positions outside session
                self._manage_positions(row)
                continue

            # ── Friday cutoff ──
            if t.weekday() == 4 and t.hour >= self.cfg.FRIDAY_CUTOFF_UTC:
                self._close_all(row, "Friday cutoff")
                continue

            # ── Manage open positions first ──
            self._manage_positions(row)

            # ── Risk checks ──
            if self._daily_loss_triggered:
                continue
            if not self._check_daily_loss():
                self._daily_loss_triggered = True
                continue
            if self._trades_today >= self.cfg.MAX_TRADES_PER_DAY:
                continue
            if len(self.open_trades) >= self.cfg.MAX_OPEN_TRADES:
                continue

            # ── Get aligned M5/M15 data ──
            m15_row = self._get_latest_before(m15_ind, t)
            m5_row = self._get_latest_before(m5_ind, t)
            if m15_row is None or m5_row is None:
                continue

            # ── Evaluate signal ──
            m1_window = m1.iloc[max(0, i-3):i+1]
            signal = self._evaluate_signal(m15_row, m5_row, m1_window, t)

            if signal == 0:
                continue

            # ── Cooldown check ──
            if self._last_trade_close_time is not None:
                elapsed = (t - self._last_trade_close_time).total_seconds()
                if elapsed < self.cfg.TRADE_COOLDOWN_SECONDS:
                    continue

            # ── Anti-whipsaw: no reversal within MIN_SIGNAL_REVERSAL_SECONDS ──
            if (self._last_trade_direction is not None
                    and signal != self._last_trade_direction
                    and self._last_trade_open_time is not None):
                elapsed = (t - self._last_trade_open_time).total_seconds()
                if elapsed < self.cfg.MIN_SIGNAL_REVERSAL_SECONDS:
                    continue

            # ── Duplicate direction check ──
            for ot in self.open_trades:
                if ot.direction == signal:
                    signal = 0
                    break
            if signal == 0:
                continue

            # ── Execute trade ──
            atr = m5_row['atr']
            self._execute_trade(signal, row, atr, t)

        # Close any remaining positions at end
        if self.open_trades and len(m1) > 0:
            self._close_all(m1.iloc[-1], "End of data")

        return self._compile_results()

    def _compute_m15_indicators(self, m15: pd.DataFrame) -> pd.DataFrame:
        """Pre-compute all M15 indicators."""
        df = m15.copy()
        df['ema50'] = indicators.calc_ema(df['close'], self.cfg.EMA_FAST)
        df['ema200'] = indicators.calc_ema(df['close'], self.cfg.EMA_SLOW)
        df['adx'] = indicators.calc_adx(df['high'], df['low'], df['close'], self.cfg.ADX_PERIOD)
        return df

    def _compute_m5_indicators(self, m5: pd.DataFrame) -> pd.DataFrame:
        """Pre-compute all M5 indicators."""
        df = m5.copy()
        df['ema20'] = indicators.calc_ema(df['close'], self.cfg.EMA_PULLBACK)
        df['rsi'] = indicators.calc_rsi(df['close'], self.cfg.RSI_PERIOD)
        df['atr'] = indicators.calc_atr(df['high'], df['low'], df['close'], self.cfg.ATR_PERIOD)

        # EMA20 slope
        n = self.cfg.EMA20_SLOPE_BARS
        df['ema20_slope'] = df['ema20'] - df['ema20'].shift(n)
        df['ema20_slope'] = df['ema20_slope'].fillna(0)

        return df

    def _get_latest_before(self, df_indexed: pd.DataFrame, t: pd.Timestamp):
        """Get the most recent row from a time-indexed DataFrame before time t."""
        mask = df_indexed.index <= t
        if not mask.any():
            return None
        return df_indexed.loc[mask].iloc[-1]

    def _in_session(self, t: pd.Timestamp) -> bool:
        """Check if timestamp is in a trading session (UTC hours)."""
        h = t.hour
        dow = t.weekday()
        if dow >= 5:  # Weekend
            return False
        if self._in_news_blackout(t):
            return False
        # London: 07-10 UTC, NY Overlap: 12-15 UTC, NY Cont: 15-17 UTC
        if self.cfg.SESSION_MODE == "narrow":
            return ((8 <= h < 10) or (13 <= h < 16))
        return ((self.cfg.LONDON_START_UTC <= h < self.cfg.LONDON_END_UTC) or
                (self.cfg.NY_OVERLAP_START_UTC <= h < self.cfg.NY_CONT_END_UTC))

    def _in_news_blackout(self, t: pd.Timestamp) -> bool:
        """Simple recurring intraday blackout windows in UTC."""
        if not self.cfg.USE_NEWS_BLACKOUT:
            return False
        h = t.hour
        for start_h, end_h in self.cfg.NEWS_BLACKOUT_WINDOWS_UTC:
            if start_h <= h < end_h:
                return True
        return False

    def _check_daily_loss(self) -> bool:
        """Check if daily loss limit is breached."""
        if self._daily_start_balance <= 0:
            return True
        daily_pnl_pct = (self.balance - self._daily_start_balance) / self._daily_start_balance
        return daily_pnl_pct > -self.cfg.MAX_DAILY_LOSS_PCT

    def _evaluate_signal(self, m15_row, m5_row, m1_window: pd.DataFrame,
                         t: pd.Timestamp) -> int:
        """
        Mirror of evaluate_signal() from goldstrike_engine.py v3.0.
        Returns: 1 (BUY), -1 (SELL), 0 (no signal)
        """
        price = m1_window['close'].iloc[-1]
        spread = self.cfg.SPREAD

        # ── M15: Trend Filter ──
        ema50 = m15_row['ema50']
        ema200 = m15_row['ema200']
        adx = m15_row['adx']

        bullish_trend = price > ema50 and price > ema200
        bearish_trend = price < ema50 and price < ema200
        mixed_trend = not bullish_trend and not bearish_trend
        trend_strong = adx >= self.cfg.ADX_MINIMUM

        mixed_tradeable = (self.cfg.ALLOW_MIXED_TREND and mixed_trend
                           and adx >= self.cfg.ADX_MIXED_MINIMUM)

        # ── M5: Entry Zone ──
        ema20 = m5_row['ema20']
        rsi = m5_row['rsi']
        atr = m5_row['atr']
        ema20_slope = m5_row['ema20_slope']

        if atr <= 0:
            return 0
        if self.cfg.USE_ATR_REGIME_FILTER:
            if atr < self.cfg.ATR_MIN_FILTER or atr > self.cfg.ATR_MAX_FILTER:
                return 0

        pullback_dist = abs(price - ema20)
        near_ema20 = pullback_dist <= atr
        rsi_neutral = self.cfg.RSI_LOW <= rsi <= self.cfg.RSI_HIGH

        # EMA20 slope check
        slope_flat = abs(ema20_slope) < self.cfg.EMA20_SLOPE_TOLERANCE
        if slope_flat:
            ema20_slope_ok = True
        elif bullish_trend:
            ema20_slope_ok = ema20_slope >= 0
        elif bearish_trend:
            ema20_slope_ok = ema20_slope <= 0
        elif mixed_trend:
            ema20_slope_ok = True  # pattern determines direction
        else:
            ema20_slope_ok = False

        # ── M1: Candle Triggers ──
        m1_atr = atr / (5 ** 0.5) if atr > 0 else 2.0

        bull_engulf = indicators.is_bullish_engulfing(m1_window['open'], m1_window['close'])
        bear_engulf = indicators.is_bearish_engulfing(m1_window['open'], m1_window['close'])
        bull_momentum = indicators.is_strong_momentum_candle(
            m1_window['open'], m1_window['close'], m1_window['high'], m1_window['low'],
            1, m1_atr, self.cfg.MOMENTUM_BODY_ATR_PCT, self.cfg.MOMENTUM_BODY_RATIO)
        bear_momentum = indicators.is_strong_momentum_candle(
            m1_window['open'], m1_window['close'], m1_window['high'], m1_window['low'],
            -1, m1_atr, self.cfg.MOMENTUM_BODY_ATR_PCT, self.cfg.MOMENTUM_BODY_RATIO)

        bull_trigger = bull_engulf or bull_momentum
        bear_trigger = bear_engulf or bear_momentum

        # ── Signal Logic ──
        spread_ok = spread <= self.cfg.MAX_SPREAD_PRICE
        if not (spread_ok and near_ema20 and rsi_neutral and ema20_slope_ok):
            return 0

        # Clear trend
        if bullish_trend and trend_strong and bull_trigger:
            return 1
        if bearish_trend and trend_strong and bear_trigger:
            return -1

        # MIXED trend — v3.0 slope-gated
        if mixed_tradeable:
            if self.cfg.SLOPE_GATE_MIXED:
                # Only trade in slope direction
                if ema20_slope > self.cfg.EMA20_SLOPE_TOLERANCE and bull_trigger:
                    return 1
                if ema20_slope < -self.cfg.EMA20_SLOPE_TOLERANCE and bear_trigger:
                    return -1
            else:
                # v2.1 behavior: pattern decides
                if bull_trigger:
                    return 1
                if bear_trigger:
                    return -1

        return 0

    def _execute_trade(self, signal: int, m1_row, atr: float, t: pd.Timestamp):
        """Open a trade."""
        sl_distance = atr * self.cfg.ATR_SL_MULT
        tp_distance = atr * self.cfg.ATR_TP1_MULT
        entry_slip = atr * self.cfg.ENTRY_SLIPPAGE_PCT_ATR

        if signal == 1:
            entry = m1_row['close'] + self.cfg.SPREAD / 2 + entry_slip  # adverse fill
            sl = entry - sl_distance
            tp = entry + tp_distance
        else:
            entry = m1_row['close'] - self.cfg.SPREAD / 2 - entry_slip  # adverse fill
            sl = entry + sl_distance
            tp = entry - tp_distance

        # Lot sizing
        risk_amount = self.balance * self.cfg.RISK_PERCENT
        lot = risk_amount / (sl_distance * 100)  # 100 = XAU point value per lot
        lot = round(min(max(lot, self.cfg.MIN_LOT), self.cfg.MAX_LOT), 2)

        # Monday caution
        if t.weekday() == 0:
            lot = max(self.cfg.MIN_LOT, round(lot * self.cfg.MONDAY_LOT_REDUCTION, 2))

        trade = Trade(
            entry_time=t, direction=signal, entry_price=entry,
            sl=sl, tp=tp, lot=lot, atr=atr,
        )
        self.open_trades.append(trade)
        self._trades_today += 1
        self._last_trade_direction = signal
        self._last_trade_open_time = t

    def _manage_positions(self, m1_row):
        """Simulate position management: SL, TP, breakeven, trailing."""
        t = m1_row['time'] if 'time' in m1_row.index else m1_row.name
        high = m1_row['high']
        low = m1_row['low']

        closed = []
        for trade in self.open_trades:
            # Track max favorable/adverse excursion
            if trade.direction == 1:
                mfe = high - trade.entry_price
                mae = trade.entry_price - low
                current_profit = m1_row['close'] - trade.entry_price
            else:
                mfe = trade.entry_price - low
                mae = high - trade.entry_price
                current_profit = trade.entry_price - m1_row['close']

            trade.max_favorable = max(trade.max_favorable, mfe)
            trade.max_adverse = max(trade.max_adverse, mae)

            # ── Check SL hit ──
            if trade.direction == 1 and low <= trade.sl:
                self._close_trade(trade, trade.sl, t, "SL")
                closed.append(trade)
                continue
            elif trade.direction == -1 and high >= trade.sl:
                self._close_trade(trade, trade.sl, t, "SL")
                closed.append(trade)
                continue

            # ── Check TP hit ──
            if trade.direction == 1 and high >= trade.tp:
                self._close_trade(trade, trade.tp, t, "TP")
                closed.append(trade)
                continue
            elif trade.direction == -1 and low <= trade.tp:
                self._close_trade(trade, trade.tp, t, "TP")
                closed.append(trade)
                continue

            # ── Breakeven ──
            if not trade.breakeven_set:
                be_trigger = trade.atr * self.cfg.ATR_BREAKEVEN_TRIGGER
                if current_profit >= be_trigger:
                    if trade.direction == 1:
                        trade.sl = trade.entry_price + self.cfg.SPREAD
                    else:
                        trade.sl = trade.entry_price - self.cfg.SPREAD
                    trade.breakeven_set = True

            # ── Trailing stop (after breakeven) ──
            if trade.breakeven_set:
                trail_distance = trade.atr * self.cfg.ATR_TRAIL_MULT
                if trade.direction == 1:
                    new_sl = high - trail_distance
                    if new_sl > trade.sl:
                        trade.sl = new_sl
                else:
                    new_sl = low + trail_distance
                    if new_sl < trade.sl:
                        trade.sl = new_sl

        for trade in closed:
            self.open_trades.remove(trade)

    def _close_trade(self, trade: Trade, exit_price: float,
                     exit_time, reason: str):
        """Close a trade and record P&L."""
        exit_slip = trade.atr * self.cfg.EXIT_SLIPPAGE_PCT_ATR
        if trade.direction == 1:
            exit_price -= exit_slip
        else:
            exit_price += exit_slip
        trade.exit_time = exit_time
        trade.exit_price = exit_price
        trade.exit_reason = reason

        if trade.direction == 1:
            pnl_pts = exit_price - trade.entry_price
        else:
            pnl_pts = trade.entry_price - exit_price

        # P&L in USD (lot * points * 100 for XAU)
        trade.pnl = pnl_pts * trade.remaining_lot * 100
        self.balance += trade.pnl
        self.peak_balance = max(self.peak_balance, self.balance)

        self.trades.append(trade)
        self._last_trade_close_time = exit_time

        # Record equity curve point
        self.equity_curve.append({
            'time': exit_time,
            'balance': self.balance,
            'pnl': trade.pnl,
            'direction': 'BUY' if trade.direction == 1 else 'SELL',
            'reason': reason,
        })

    def _close_all(self, m1_row, reason: str):
        """Force close all open positions."""
        t = m1_row['time'] if 'time' in m1_row.index else m1_row.name
        for trade in list(self.open_trades):
            if trade.direction == 1:
                exit_price = m1_row['close'] - self.cfg.SPREAD / 2
            else:
                exit_price = m1_row['close'] + self.cfg.SPREAD / 2
            self._close_trade(trade, exit_price, t, reason)
        self.open_trades.clear()

    def _compile_results(self) -> dict:
        """Compile backtest results into a summary dict."""
        if not self.trades:
            return {'total_trades': 0, 'error': 'No trades generated'}

        wins = [t for t in self.trades if t.pnl > 0]
        losses = [t for t in self.trades if t.pnl <= 0]

        total_profit = sum(t.pnl for t in wins) if wins else 0
        total_loss = abs(sum(t.pnl for t in losses)) if losses else 0.001

        # Daily P&L for FTMO compliance
        daily_pnl = {}
        for t in self.trades:
            day = t.entry_time.strftime('%Y-%m-%d')
            daily_pnl[day] = daily_pnl.get(day, 0) + t.pnl

        daily_pnl_pct = {d: pnl / self.cfg.STARTING_BALANCE * 100
                         for d, pnl in daily_pnl.items()}
        worst_day_pct = min(daily_pnl_pct.values()) if daily_pnl_pct else 0

        # Max drawdown from equity curve
        running_peak = self.cfg.STARTING_BALANCE
        max_dd = 0
        for pt in self.equity_curve:
            running_peak = max(running_peak, pt['balance'])
            dd = (running_peak - pt['balance']) / running_peak
            max_dd = max(max_dd, dd)

        # Trading days count
        trading_days = len(set(t.entry_time.strftime('%Y-%m-%d') for t in self.trades))

        avg_win = total_profit / len(wins) if wins else 0
        avg_loss = total_loss / len(losses) if losses else 0

        results = {
            'total_trades': len(self.trades),
            'wins': len(wins),
            'losses': len(losses),
            'win_rate': len(wins) / len(self.trades) * 100,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'avg_rr': avg_win / avg_loss if avg_loss > 0 else 0,
            'profit_factor': total_profit / total_loss,
            'total_pnl': self.balance - self.cfg.STARTING_BALANCE,
            'total_return_pct': (self.balance - self.cfg.STARTING_BALANCE) / self.cfg.STARTING_BALANCE * 100,
            'final_balance': self.balance,
            'max_drawdown_pct': max_dd * 100,
            'worst_day_pct': worst_day_pct,
            'trading_days': trading_days,
            'trades_per_day': len(self.trades) / max(trading_days, 1),
            'max_consecutive_losses': self._max_consecutive_losses(),
            # FTMO compliance
            'ftmo_daily_pass': worst_day_pct > -5.0,
            'ftmo_drawdown_pass': max_dd < 0.10,
            'ftmo_profit_pass': (self.balance - self.cfg.STARTING_BALANCE) / self.cfg.STARTING_BALANCE >= 0.10,
            'ftmo_min_days_pass': trading_days >= 4,
        }
        return results

    def _max_consecutive_losses(self) -> int:
        """Calculate max consecutive losing trades."""
        max_streak = 0
        current = 0
        for t in self.trades:
            if t.pnl <= 0:
                current += 1
                max_streak = max(max_streak, current)
            else:
                current = 0
        return max_streak

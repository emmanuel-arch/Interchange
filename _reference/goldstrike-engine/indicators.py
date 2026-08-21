"""
GoldStrike v2.1 — Technical Indicators
Pure functions — no MT5 dependency, no side effects.
All functions take pandas Series/DataFrames and return pandas Series.

CHANGELOG v2.1 (2026-04-12):
  - is_strong_momentum_candle: thresholds now passed as parameters (configurable)
  - Default body_atr_pct lowered from 0.40 to 0.30 (M1 gold bodies are small)
  - Default body_ratio lowered from 0.60 to 0.55 (slightly more lenient)
"""

import pandas as pd
import numpy as np


def calc_ema(data: pd.Series, period: int) -> pd.Series:
    """Exponential Moving Average."""
    return data.ewm(span=period, adjust=False).mean()


def calc_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index using Wilder's smoothing."""
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta.where(delta < 0, 0.0))
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi


def calc_tr(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    """True Range — building block for ATR."""
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr


def calc_atr(high: pd.Series, low: pd.Series, close: pd.Series,
             period: int = 14) -> pd.Series:
    """Average True Range using Wilder's smoothing."""
    tr = calc_tr(high, low, close)
    return tr.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()


def calc_adx(high: pd.Series, low: pd.Series, close: pd.Series,
             period: int = 14) -> pd.Series:
    """Average Directional Index using Wilder's smoothing."""
    up_move = high.diff()
    down_move = -low.diff()

    # Directional movement
    plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0.0),
                        index=high.index)
    minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0.0),
                         index=high.index)

    # Wilder's smoothing for TR, +DM, -DM
    alpha = 1.0 / period
    atr = calc_atr(high, low, close, period)
    smooth_plus_dm = plus_dm.ewm(alpha=alpha, min_periods=period, adjust=False).mean()
    smooth_minus_dm = minus_dm.ewm(alpha=alpha, min_periods=period, adjust=False).mean()

    # Directional indicators
    plus_di = 100.0 * smooth_plus_dm / atr
    minus_di = 100.0 * smooth_minus_dm / atr

    # DX and ADX
    di_sum = plus_di + minus_di
    di_sum = di_sum.replace(0, np.nan)
    dx = 100.0 * (plus_di - minus_di).abs() / di_sum
    adx = dx.ewm(alpha=alpha, min_periods=period, adjust=False).mean()
    return adx


def is_bullish_engulfing(open_prices: pd.Series, close_prices: pd.Series) -> bool:
    """Check if the last COMPLETED candle is a bullish engulfing.
    Uses iloc[-2] vs iloc[-3] because iloc[-1] is the current forming bar.
    """
    if len(open_prices) < 3:
        return False
    prev_open = open_prices.iloc[-3]
    prev_close = close_prices.iloc[-3]
    curr_open = open_prices.iloc[-2]
    curr_close = close_prices.iloc[-2]
    prev_bearish = prev_close < prev_open
    curr_bullish = curr_close > curr_open
    engulfing = curr_close > prev_open and curr_open <= prev_close
    return prev_bearish and curr_bullish and engulfing


def is_bearish_engulfing(open_prices: pd.Series, close_prices: pd.Series) -> bool:
    """Check if the last COMPLETED candle is a bearish engulfing.
    Uses iloc[-2] vs iloc[-3] because iloc[-1] is the current forming bar.
    """
    if len(open_prices) < 3:
        return False
    prev_open = open_prices.iloc[-3]
    prev_close = close_prices.iloc[-3]
    curr_open = open_prices.iloc[-2]
    curr_close = close_prices.iloc[-2]
    prev_bullish = prev_close > prev_open
    curr_bearish = curr_close < curr_open
    engulfing = curr_close < prev_open and curr_open >= prev_close
    return prev_bullish and curr_bearish and engulfing


def is_strong_momentum_candle(open_prices: pd.Series, close_prices: pd.Series,
                               high_prices: pd.Series, low_prices: pd.Series,
                               direction: int, atr: float,
                               body_atr_pct: float = 0.30,
                               body_ratio: float = 0.55) -> bool:
    """
    Check if the last COMPLETED M1 candle shows strong directional momentum.
    Alternative trigger when engulfing can't form (consecutive same-direction candles).

    Criteria:
      - Body size >= body_atr_pct of ATR (default 30% — was 40%)
      - Body is >= body_ratio of total candle range (default 55% — was 60%)
      - Direction matches the trade direction

    direction: 1 = bullish, -1 = bearish
    body_atr_pct: minimum body as fraction of ATR (default 0.30)
    body_ratio: minimum body/range ratio (default 0.55)
    """
    if len(open_prices) < 2:
        return False

    o = open_prices.iloc[-2]   # last completed candle
    c = close_prices.iloc[-2]
    h = high_prices.iloc[-2]
    l = low_prices.iloc[-2]

    body = abs(c - o)
    candle_range = h - l

    if candle_range <= 0 or atr <= 0:
        return False

    candle_body_ratio = body / candle_range   # conviction ratio
    body_vs_atr = body / atr                  # strength ratio

    is_direction_match = (direction == 1 and c > o) or (direction == -1 and c < o)

    return is_direction_match and body_vs_atr >= body_atr_pct and candle_body_ratio >= body_ratio
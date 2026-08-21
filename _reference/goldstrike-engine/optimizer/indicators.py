"""
GoldStrike v3.0 — Technical Indicators (Backtester Version)
Pure functions — mirrors the live engine indicators.py exactly.
All functions take pandas Series and return pandas Series.
"""

import pandas as pd
import numpy as np


def calc_ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential Moving Average."""
    return series.ewm(span=period, adjust=False).mean()


def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def calc_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average True Range."""
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def calc_adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average Directional Index."""
    prev_high = high.shift(1)
    prev_low = low.shift(1)
    prev_close = close.shift(1)
    
    plus_dm = (high - prev_high).where((high - prev_high) > (prev_low - low), 0.0)
    plus_dm = plus_dm.where(plus_dm > 0, 0.0)
    minus_dm = (prev_low - low).where((prev_low - low) > (high - prev_high), 0.0)
    minus_dm = minus_dm.where(minus_dm > 0, 0.0)
    
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    
    atr = tr.ewm(span=period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(span=period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(span=period, adjust=False).mean() / atr)
    
    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
    adx = dx.ewm(span=period, adjust=False).mean()
    return adx.fillna(0)


def is_bullish_engulfing(open_s: pd.Series, close_s: pd.Series) -> bool:
    """Check if the last candle is a bullish engulfing pattern."""
    if len(open_s) < 2:
        return False
    prev_open = open_s.iloc[-2]
    prev_close = close_s.iloc[-2]
    curr_open = open_s.iloc[-1]
    curr_close = close_s.iloc[-1]
    
    prev_bearish = prev_close < prev_open
    curr_bullish = curr_close > curr_open
    engulfs = curr_close > prev_open and curr_open < prev_close
    
    return prev_bearish and curr_bullish and engulfs


def is_bearish_engulfing(open_s: pd.Series, close_s: pd.Series) -> bool:
    """Check if the last candle is a bearish engulfing pattern."""
    if len(open_s) < 2:
        return False
    prev_open = open_s.iloc[-2]
    prev_close = close_s.iloc[-2]
    curr_open = open_s.iloc[-1]
    curr_close = close_s.iloc[-1]
    
    prev_bullish = prev_close > prev_open
    curr_bearish = curr_close < curr_open
    engulfs = curr_close < prev_open and curr_open > prev_close
    
    return prev_bullish and curr_bearish and engulfs


def is_strong_momentum_candle(
    open_s: pd.Series, close_s: pd.Series,
    high_s: pd.Series, low_s: pd.Series,
    direction: int, atr: float,
    body_atr_pct: float = 0.30,
    body_ratio: float = 0.55,
) -> bool:
    """
    Check if the last candle is a strong momentum candle.
    direction: 1 = bullish, -1 = bearish
    """
    if len(open_s) < 1 or atr <= 0:
        return False
    
    o = open_s.iloc[-1]
    c = close_s.iloc[-1]
    h = high_s.iloc[-1]
    l = low_s.iloc[-1]
    
    body = abs(c - o)
    candle_range = h - l
    
    if candle_range <= 0:
        return False
    
    # Body must be >= body_atr_pct of ATR
    body_big = body >= (atr * body_atr_pct)
    # Body must be >= body_ratio of total range
    body_dominant = (body / candle_range) >= body_ratio
    
    if direction == 1:
        return c > o and body_big and body_dominant
    else:
        return c < o and body_big and body_dominant

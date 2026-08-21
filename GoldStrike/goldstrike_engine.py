"""
GoldStrike v2.1 — Main Strategy Engine
Multi-timeframe EMA + RSI + ADX gold scalping system.
Runs alongside MT5 on Windows for sub-500ms execution.

CHANGELOG v2.1 (2026-04-12):
  - Signal logic: dropped price_extended filter (was blocking 55% of entries)
  - Signal logic: softened ema20_slope — flat slopes now allowed (tolerance param)
  - Signal logic: ADX lowered to 18 (from 22/25) — gold rarely sustains >25
  - Signal logic: MIXED trend trading — trade pattern direction when ADX >= 15
  - Momentum candle: thresholds now configurable via config.py
  - Dashboard: shows new conditions clearly
  - CSV logger: updated fields

Architecture:
  config.py         → All settings from .env
  indicators.py     → EMA, RSI, ATR, ADX (pure math)
  session_filter.py → EAT trading hours
  risk_checker.py   → The Fortress (7 iron rules)
  mt5_bridge.py     → MT5 connection, orders, candles
  telegram_alerts.py→ Notifications
  server_logger.py  → SQLite + server sync
  position_manager.py → Trailing, partial close, breakeven
"""

import sys
import time
import logging
from datetime import datetime
from typing import Any

import MetaTrader5 as mt5
import pandas as pd

import config
import mt5_bridge
import indicators
import session_filter
import risk_checker as rc
import telegram_alerts
import server_logger
import position_manager

# ══════════════════════════════════════════
# LOGGING SETUP
# ══════════════════════════════════════════

def setup_logging():
    """Configure logging to file + console."""
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    today = datetime.now().strftime('%Y-%m-%d')
    log_file = config.LOG_DIR / f"goldstrike_{today}.log"

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s | %(name)-20s | %(levelname)-7s | %(message)s',
        handlers=[
            logging.FileHandler(str(log_file), encoding='utf-8'),
            logging.StreamHandler(sys.stdout),
        ],
    )

log = logging.getLogger('GoldStrike.Engine')


# ══════════════════════════════════════════
# SIGNAL EVALUATION
# ══════════════════════════════════════════

def evaluate_signal_core(
    m15: pd.DataFrame,
    m5: pd.DataFrame,
    m1: pd.DataFrame,
    spread: float,
    *,
    eat_now: datetime,
    current_session: str,
    in_session: bool,
    bid: float = 0.0,
    silent: bool = False,
    data_error: str | None = None,
) -> tuple[int, dict[str, Any]]:
    """
    Pure MT5-free entry logic (mirrors live ``evaluate_signal``).
    Callers supply OHLCV slices aligned like ``mt5_bridge.get_candles`` output.

    Returns ``(signal, ctx)`` where ``ctx`` unpacks into ``_print_dashboard``.
    """
    if data_error:
        return 0, {
            'eat_now': eat_now, 'bid': bid, 'spread': spread,
            'price_m15': 0.0, 'ema50': 0.0, 'ema200': 0.0, 'adx': 0.0,
            'trend_dir': 'N/A', 'trend_strong': False,
            'bullish_trend': False, 'bearish_trend': False,
            'mixed_trend': False, 'mixed_tradeable': False,
            'price_m5': 0.0, 'ema20': 0.0, 'rsi': 0.0, 'atr': 0.0,
            'pullback_dist': 0.0, 'near_ema20': False, 'rsi_neutral': False,
            'm5_ok': False,
            'bull_engulf': False, 'bear_engulf': False, 'm1_ok': False,
            'bull_momentum': False, 'bear_momentum': False,
            'bull_trigger': False, 'bear_trigger': False,
            'trigger_type': '',
            'session': current_session, 'in_session': in_session,
            'ema20_slope_ok': False, 'ema20_slope_val': 0.0,
            'data_error': data_error, 'signal': 0,
        }

    ema50_m15 = indicators.calc_ema(m15['close'], config.EMA_FAST)
    ema200_m15 = indicators.calc_ema(m15['close'], config.EMA_SLOW)
    adx_m15 = indicators.calc_adx(m15['high'], m15['low'], m15['close'], config.ADX_PERIOD)

    price_m15 = m15['close'].iloc[-1]
    ema50_val = ema50_m15.iloc[-1]
    ema200_val = ema200_m15.iloc[-1]
    adx_val = adx_m15.iloc[-1]

    bullish_trend = price_m15 > ema50_val and price_m15 > ema200_val
    bearish_trend = price_m15 < ema50_val and price_m15 < ema200_val
    mixed_trend = not bullish_trend and not bearish_trend
    trend_strong = adx_val >= config.ADX_MINIMUM

    if bullish_trend:
        trend_dir = "BULLISH"
    elif bearish_trend:
        trend_dir = "BEARISH"
    else:
        trend_dir = "MIXED"

    mixed_tradeable = (config.ALLOW_MIXED_TREND and mixed_trend
                       and adx_val >= config.ADX_MIXED_MINIMUM)

    m5_ok = m5 is not None and len(m5) >= 200

    ema20_val = rsi_val = atr_val = price_m5 = 0.0
    near_ema20 = False
    rsi_neutral = False
    pullback_dist = 0.0

    ema20_slope_ok = False
    ema20_slope_val = 0.0

    if m5_ok:
        ema20_m5 = indicators.calc_ema(m5['close'], config.EMA_PULLBACK)
        rsi_m5 = indicators.calc_rsi(m5['close'], config.RSI_PERIOD)
        atr_m5 = indicators.calc_atr(m5['high'], m5['low'], m5['close'], config.ATR_PERIOD)

        price_m5 = m5['close'].iloc[-1]
        ema20_val = ema20_m5.iloc[-1]
        rsi_val = rsi_m5.iloc[-1]
        atr_val = atr_m5.iloc[-1]

        pullback_dist = abs(price_m5 - ema20_val)
        near_ema20 = pullback_dist <= atr_val
        rsi_neutral = config.RSI_LOW <= rsi_val <= config.RSI_HIGH

        n = config.EMA20_SLOPE_BARS
        if len(ema20_m5) > n:
            ema20_slope_val = ema20_m5.iloc[-1] - ema20_m5.iloc[-(n+1)]
            slope_flat = abs(ema20_slope_val) < config.EMA20_SLOPE_TOLERANCE

            if slope_flat:
                ema20_slope_ok = True
            elif bullish_trend:
                ema20_slope_ok = ema20_slope_val >= 0
            elif bearish_trend:
                ema20_slope_ok = ema20_slope_val <= 0
            elif mixed_trend:
                ema20_slope_ok = True

    m1_ok = m1 is not None and len(m1) >= 4

    bull_engulf = False
    bear_engulf = False
    bull_momentum = False
    bear_momentum = False
    m1_atr = 0.0

    if m1_ok:
        bull_engulf = indicators.is_bullish_engulfing(m1['open'], m1['close'])
        bear_engulf = indicators.is_bearish_engulfing(m1['open'], m1['close'])
        m1_atr = atr_val / (5 ** 0.5) if atr_val > 0 else 2.0
        bull_momentum = indicators.is_strong_momentum_candle(
            m1['open'], m1['close'], m1['high'], m1['low'], 1, m1_atr,
            body_atr_pct=config.MOMENTUM_BODY_ATR_PCT,
            body_ratio=config.MOMENTUM_BODY_RATIO)
        bear_momentum = indicators.is_strong_momentum_candle(
            m1['open'], m1['close'], m1['high'], m1['low'], -1, m1_atr,
            body_atr_pct=config.MOMENTUM_BODY_ATR_PCT,
            body_ratio=config.MOMENTUM_BODY_RATIO)

    bull_trigger = bull_engulf or bull_momentum
    bear_trigger = bear_engulf or bear_momentum
    trigger_type = ""
    if bull_engulf:
        trigger_type = "Bullish Engulfing"
    elif bull_momentum:
        trigger_type = "Bullish Momentum"
    if bear_engulf:
        trigger_type = "Bearish Engulfing"
    elif bear_momentum:
        trigger_type = "Bearish Momentum"

    signal = 0

    if in_session and m5_ok and m1_ok:
        spread_ok = spread <= config.MAX_SPREAD_PRICE
        if spread_ok and near_ema20 and rsi_neutral and ema20_slope_ok:
            if bullish_trend and trend_strong and bull_trigger:
                signal = 1
                if not silent:
                    log.info(
                        f"BUY SIGNAL | M15 trend UP | M5 pullback to EMA20 | "
                        f"M1 {trigger_type} | RSI={rsi_val:.1f} ADX={adx_val:.1f}")
            elif bearish_trend and trend_strong and bear_trigger:
                signal = -1
                if not silent:
                    log.info(
                        f"SELL SIGNAL | M15 trend DOWN | M5 pullback to EMA20 | "
                        f"M1 {trigger_type} | RSI={rsi_val:.1f} ADX={adx_val:.1f}")
            elif mixed_tradeable:
                if ema20_slope_val > config.EMA20_SLOPE_TOLERANCE and bull_trigger:
                    signal = 1
                    if not silent:
                        log.info(
                            f"BUY SIGNAL [MIXED] | M15 between EMAs | M5 pullback to EMA20 | "
                            f"M1 {trigger_type} | RSI={rsi_val:.1f} ADX={adx_val:.1f}")
                elif ema20_slope_val < -config.EMA20_SLOPE_TOLERANCE and bear_trigger:
                    signal = -1
                    if not silent:
                        log.info(
                            f"SELL SIGNAL [MIXED] | M15 between EMAs | M5 pullback to EMA20 | "
                            f"M1 {trigger_type} | RSI={rsi_val:.1f} ADX={adx_val:.1f}")

    ctx: dict[str, Any] = {
        'eat_now': eat_now, 'bid': bid, 'spread': spread,
        'price_m15': price_m15, 'ema50': ema50_val, 'ema200': ema200_val,
        'adx': adx_val, 'trend_dir': trend_dir, 'trend_strong': trend_strong,
        'bullish_trend': bullish_trend, 'bearish_trend': bearish_trend,
        'mixed_trend': mixed_trend, 'mixed_tradeable': mixed_tradeable,
        'price_m5': price_m5, 'ema20': ema20_val, 'rsi': rsi_val, 'atr': atr_val,
        'pullback_dist': pullback_dist, 'near_ema20': near_ema20, 'rsi_neutral': rsi_neutral,
        'm5_ok': m5_ok,
        'bull_engulf': bull_engulf, 'bear_engulf': bear_engulf, 'm1_ok': m1_ok,
        'bull_momentum': bull_momentum, 'bear_momentum': bear_momentum,
        'bull_trigger': bull_trigger, 'bear_trigger': bear_trigger,
        'trigger_type': trigger_type,
        'session': current_session, 'in_session': in_session,
        'ema20_slope_ok': ema20_slope_ok, 'ema20_slope_val': ema20_slope_val,
        'data_error': None, 'signal': signal,
    }
    return signal, ctx


def evaluate_signal(in_session: bool = True) -> int:
    """
    Multi-timeframe signal evaluation (v2.1).
    M15 → trend direction + strength (EMA50, EMA200, ADX)
    M5  → pullback zone + momentum (EMA20, RSI, ATR)
    M1  → candle pattern trigger (engulfing or momentum)

    v2.1 changes:
      - Removed price_extended filter
      - Softened ema20_slope (flat = OK)
      - MIXED trend: trade pattern direction when ADX >= ADX_MIXED_MINIMUM
      - Momentum candle thresholds from config

    Returns: 1 (BUY), -1 (SELL), 0 (NO SIGNAL)
    """
    eat_now = session_filter.now_eat()
    current_session = session_filter.get_current_session()
    tick = mt5_bridge.get_tick()
    bid = tick.bid if tick else 0.0
    ask = tick.ask if tick else 0.0
    spread = (ask - bid) if tick else 0.0

    m15 = mt5_bridge.get_candles(mt5.TIMEFRAME_M15, 250)
    if m15 is None or len(m15) < 200:
        log.warning("Not enough M15 data")
        _print_dashboard(
            eat_now, bid, spread, data_error="M15 data insufficient",
            session=current_session, in_session=in_session,
        )
        return 0

    m5 = mt5_bridge.get_candles(mt5.TIMEFRAME_M5, 250)
    m1 = mt5_bridge.get_candles(mt5.TIMEFRAME_M1, 10)

    sig, ctx = evaluate_signal_core(
        m15, m5 if m5 is not None else pd.DataFrame(),
        m1 if m1 is not None else pd.DataFrame(),
        spread,
        eat_now=eat_now,
        current_session=current_session,
        in_session=in_session,
        bid=bid,
        silent=False,
    )
    _print_dashboard(**ctx)
    return sig


def _next_session_info(eat_now) -> str:
    """Return a human-readable string about the next trading session."""
    if eat_now is None:
        return "N/A"
    hour = eat_now.hour
    if hour < config.LONDON_START:
        return f"London opens at {config.LONDON_START}:00 EAT"
    elif hour < config.NY_OVERLAP_START:
        return f"NY Overlap opens at {config.NY_OVERLAP_START}:00 EAT"
    elif hour < config.NY_CONT_START:
        return f"NY Continuation opens at {config.NY_CONT_START}:00 EAT"
    else:
        return "Done for today — next session tomorrow"


def _print_dashboard(eat_now=None, bid=0.0, spread=0.0,
                     price_m15=0.0, ema50=0.0, ema200=0.0, adx=0.0,
                     trend_dir="N/A", trend_strong=False,
                     bullish_trend=False, bearish_trend=False,
                     mixed_trend=False, mixed_tradeable=False,
                     price_m5=0.0, ema20=0.0, rsi=0.0, atr=0.0,
                     pullback_dist=0.0, near_ema20=False, rsi_neutral=False,
                     m5_ok=True,
                     bull_engulf=False, bear_engulf=False, m1_ok=True,
                     bull_momentum=False, bear_momentum=False,
                     bull_trigger=False, bear_trigger=False,
                     trigger_type="",
                     session="OFF", in_session=True,
                     ema20_slope_ok=False, ema20_slope_val=0.0,
                     data_error=None, signal: int = 0):
    """Print a live condition checklist to the terminal."""
    P = "\033[92m[PASS]\033[0m"  # green
    F = "\033[91m[FAIL]\033[0m"  # red
    W = "\033[93m[WAIT]\033[0m"  # yellow

    time_str = eat_now.strftime('%H:%M:%S %A') if eat_now else "N/A"
    spread_ok = spread <= config.MAX_SPREAD_PRICE

    # Session display with color
    if in_session:
        session_display = f"\033[92m{session}\033[0m"
    else:
        next_sess = _next_session_info(eat_now)
        session_display = f"\033[91mOFF\033[0m ({next_sess})"

    # Clear screen and print header
    print("\033[2J\033[H", end="")
    print(f"\033[96m{'='*60}\033[0m")
    print(f"\033[96m  GOLDSTRIKE v2.1 — LIVE CONDITION MONITOR\033[0m")
    print(f"\033[96m{'='*60}\033[0m")
    print(f"  Time: {time_str} EAT | Session: {session_display}")
    print(f"  Bid: {bid:.3f} | Spread: ${spread:.3f}")
    print()

    if data_error:
        print(f"  {F} Data Error: {data_error}")
        print(f"\033[96m{'='*60}\033[0m")
        return

    # ── M15 Trend ──
    print(f"\033[97m  M15 TREND FILTER\033[0m")
    print(f"  {'─'*56}")
    print(f"    Price:  {price_m15:.3f}  |  EMA50: {ema50:.3f}  |  EMA200: {ema200:.3f}")

    if bullish_trend:
        print(f"    {P} Trend Direction: {trend_dir} (Price > EMA50 > EMA200)")
    elif bearish_trend:
        print(f"    {P} Trend Direction: {trend_dir} (Price < EMA50 < EMA200)")
    elif mixed_tradeable:
        print(f"    {W} Trend Direction: {trend_dir} (between EMAs — pattern-led mode)")
    else:
        print(f"    {F} Trend Direction: {trend_dir} (between EMAs, ADX {adx:.1f} < {config.ADX_MIXED_MINIMUM})")

    adx_gap = adx - config.ADX_MINIMUM
    if trend_strong:
        print(f"    {P} ADX Strength:   {adx:.1f} >= {config.ADX_MINIMUM} (strong by {adx_gap:+.1f})")
    elif mixed_tradeable:
        print(f"    {W} ADX Strength:   {adx:.1f} (below {config.ADX_MINIMUM} but >= {config.ADX_MIXED_MINIMUM} — MIXED OK)")
    else:
        print(f"    {F} ADX Strength:   {adx:.1f} < {config.ADX_MINIMUM} (need {abs(adx_gap):.1f} more)")
    print()

    # ── M5 Entry Zone ──
    print(f"\033[97m  M5 ENTRY ZONE\033[0m")
    print(f"  {'─'*56}")

    if not m5_ok:
        print(f"    {F} M5 data insufficient")
    else:
        print(f"    Price:  {price_m5:.3f}  |  EMA20: {ema20:.3f}  |  ATR: {atr:.3f}")
        if near_ema20:
            print(f"    {P} Pullback Zone:  Dist={pullback_dist:.3f} <= ATR {atr:.3f} (IN ZONE)")
        else:
            overshoot = pullback_dist - atr
            print(f"    {F} Pullback Zone:  Dist={pullback_dist:.3f} > ATR {atr:.3f} ({overshoot:.3f} too far)")

        if rsi_neutral:
            print(f"    {P} RSI Neutral:    {rsi:.1f} (range {config.RSI_LOW}-{config.RSI_HIGH})")
        elif rsi < config.RSI_LOW:
            print(f"    {F} RSI Too Low:    {rsi:.1f} < {config.RSI_LOW} (oversold, need +{config.RSI_LOW - rsi:.1f})")
        else:
            print(f"    {F} RSI Too High:   {rsi:.1f} > {config.RSI_HIGH} (overbought, need -{rsi - config.RSI_HIGH:.1f})")

        # v2.1: EMA20 Slope with tolerance
        slope_dir = "↑" if ema20_slope_val > 0 else "↓" if ema20_slope_val < 0 else "→"
        is_flat = abs(ema20_slope_val) < config.EMA20_SLOPE_TOLERANCE
        if ema20_slope_ok:
            if is_flat:
                print(f"    {P} EMA20 Slope:    {slope_dir} {ema20_slope_val:+.3f} (flat — neutral OK)")
            else:
                print(f"    {P} EMA20 Slope:    {slope_dir} {ema20_slope_val:+.3f} (agrees with trend)")
        else:
            print(f"    {F} EMA20 Slope:    {slope_dir} {ema20_slope_val:+.3f} (AGAINST trend — no entry)")
    print()

    # ── M1 Candle Trigger ──
    print(f"\033[97m  M1 CANDLE TRIGGER\033[0m")
    print(f"  {'─'*56}")

    if not m1_ok:
        print(f"    {F} M1 data insufficient")
    else:
        # Determine which patterns to look for based on trend
        if bullish_trend or (mixed_trend and mixed_tradeable):
            if bull_engulf:
                print(f"    {P} Engulfing:  Bullish Engulfing DETECTED!")
            else:
                print(f"    {W} Engulfing:  No bullish engulfing yet")
            if bull_momentum:
                print(f"    {P} Momentum:   Strong bullish candle DETECTED!")
            else:
                print(f"    {W} Momentum:   No strong bullish candle yet")
            if bull_trigger:
                print(f"    \033[92m>>> BUY TRIGGER FIRED: {trigger_type} <<<\033[0m")

        if bearish_trend or (mixed_trend and mixed_tradeable):
            if bear_engulf:
                print(f"    {P} Engulfing:  Bearish Engulfing DETECTED!")
            else:
                print(f"    {W} Engulfing:  No bearish engulfing yet")
            if bear_momentum:
                print(f"    {P} Momentum:   Strong bearish candle DETECTED!")
            else:
                print(f"    {W} Momentum:   No strong bearish candle yet")
            if bear_trigger:
                print(f"    \033[92m>>> SELL TRIGGER FIRED: {trigger_type} <<<\033[0m")

        if not (bullish_trend or bearish_trend or mixed_tradeable):
            print(f"    {F} No qualified trend — candle patterns not evaluated")
    print()

    # ── Spread ──
    print(f"\033[97m  SPREAD\033[0m")
    print(f"  {'─'*56}")
    if spread_ok:
        print(f"    {P} Spread:  ${spread:.3f} <= ${config.MAX_SPREAD_PRICE:.2f}")
    else:
        print(f"    {F} Spread:  ${spread:.3f} > ${config.MAX_SPREAD_PRICE:.2f} (too wide)")
    print()

    # ── Summary ──
    has_trend = bullish_trend or bearish_trend or mixed_tradeable
    has_adx = trend_strong or mixed_tradeable
    has_trigger = False
    if m1_ok:
        if bullish_trend and bull_trigger:
            has_trigger = True
        elif bearish_trend and bear_trigger:
            has_trigger = True
        elif mixed_tradeable and (bull_trigger or bear_trigger):
            has_trigger = True

    conditions = [
        in_session,
        has_trend,
        has_adx,
        near_ema20 if m5_ok else False,
        rsi_neutral if m5_ok else False,
        ema20_slope_ok if m5_ok else False,
        has_trigger,
        spread_ok,
    ]
    passed = sum(conditions)
    total = len(conditions)
    labels = ["Session", "Trend Dir", "ADX", "Pullback", "RSI", "EMA20 Slope", "Trigger", "Spread"]
    blockers = [labels[i] for i, c in enumerate(conditions) if not c]

    print(f"\033[96m{'='*60}\033[0m")
    if passed == total:
        print(f"\033[92m  >>> ALL {total} CONDITIONS MET — EXECUTING TRADE <<<\033[0m")
    else:
        print(f"  Conditions: {passed}/{total} met | "
              f"\033[93mBlocked by: {', '.join(blockers)}\033[0m")
    print(f"\033[96m{'='*60}\033[0m")
    print()

    # ── Log conditions to CSV ──
    _log_conditions_csv(
        eat_now=eat_now, session=session, bid=bid, spread=spread,
        price_m15=price_m15, ema50=ema50, ema200=ema200, adx=adx,
        trend_dir=trend_dir, price_m5=price_m5, ema20=ema20,
        rsi=rsi, atr=atr, pullback_dist=pullback_dist,
        near_ema20=near_ema20, rsi_neutral=rsi_neutral, trend_strong=trend_strong,
        bull_engulf=bull_engulf, bear_engulf=bear_engulf,
        bull_momentum=bull_momentum, bear_momentum=bear_momentum,
        spread_ok=spread_ok, in_session=in_session,
        ema20_slope_ok=ema20_slope_ok, ema20_slope_val=ema20_slope_val,
        mixed_tradeable=mixed_tradeable,
        conditions_met=passed, signal=signal,
    )


def _log_conditions_csv(**data):
    """Append condition data to a daily CSV file for post-analysis."""
    import csv
    eat_now = data.get('eat_now')
    if eat_now is None:
        return

    csv_file = config.LOG_DIR / f"conditions_{eat_now.strftime('%Y-%m-%d')}.csv"
    file_exists = csv_file.exists()

    fields = [
        'timestamp', 'session', 'bid', 'spread',
        'price_m15', 'ema50', 'ema200', 'adx', 'trend_dir',
        'price_m5', 'ema20', 'rsi', 'atr', 'pullback_dist',
        'near_ema20', 'rsi_neutral', 'trend_strong',
        'bull_engulf', 'bear_engulf', 'bull_momentum', 'bear_momentum',
        'ema20_slope_ok', 'ema20_slope_val',
        'mixed_tradeable',
        'spread_ok', 'in_session', 'conditions_met', 'signal',
    ]

    row = {
        'timestamp': eat_now.isoformat(),
        'session': data.get('session', ''),
        'bid': f"{data.get('bid', 0):.3f}",
        'spread': f"{data.get('spread', 0):.3f}",
        'price_m15': f"{data.get('price_m15', 0):.3f}",
        'ema50': f"{data.get('ema50', 0):.3f}",
        'ema200': f"{data.get('ema200', 0):.3f}",
        'adx': f"{data.get('adx', 0):.1f}",
        'trend_dir': data.get('trend_dir', ''),
        'price_m5': f"{data.get('price_m5', 0):.3f}",
        'ema20': f"{data.get('ema20', 0):.3f}",
        'rsi': f"{data.get('rsi', 0):.1f}",
        'atr': f"{data.get('atr', 0):.3f}",
        'pullback_dist': f"{data.get('pullback_dist', 0):.3f}",
        'near_ema20': data.get('near_ema20', False),
        'rsi_neutral': data.get('rsi_neutral', False),
        'trend_strong': data.get('trend_strong', False),
        'bull_engulf': data.get('bull_engulf', False),
        'bear_engulf': data.get('bear_engulf', False),
        'bull_momentum': data.get('bull_momentum', False),
        'bear_momentum': data.get('bear_momentum', False),
        'ema20_slope_ok': data.get('ema20_slope_ok', False),
        'ema20_slope_val': f"{data.get('ema20_slope_val', 0):.3f}",
        'mixed_tradeable': data.get('mixed_tradeable', False),
        'spread_ok': data.get('spread_ok', False),
        'in_session': data.get('in_session', False),
        'conditions_met': data.get('conditions_met', 0),
        'signal': data.get('signal', 0),
    }

    try:
        with open(csv_file, 'a', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)
    except Exception as e:
        log.debug(f"CSV logging error: {e}")


def get_current_atr() -> float:
    """Fetch current ATR from M5 data."""
    m5 = mt5_bridge.get_candles(mt5.TIMEFRAME_M5, 200)
    if m5 is None:
        return 2.0  # Safe fallback
    return indicators.calc_atr(m5['high'], m5['low'], m5['close'], config.ATR_PERIOD).iloc[-1]


# ══════════════════════════════════════════
# TRADE EXECUTION
# ══════════════════════════════════════════

def execute_trade(signal: int) -> bool:
    """Calculate parameters and execute a trade."""
    atr = get_current_atr()
    lot = mt5_bridge.calculate_lot_size(atr)

    # Monday caution: reduce lot by 50%
    if session_filter.is_monday_caution():
        lot = max(config.MIN_LOT, round(lot * 0.5, 2))
        log.info(f"Monday caution: lot reduced to {lot}")

    # Calculate SL and TP
    tick = mt5_bridge.get_tick()
    if tick is None:
        return False

    sl_distance = atr * config.ATR_SL_MULT
    tp1_distance = atr * config.ATR_TP1_MULT

    if signal == 1:  # BUY
        entry_price = tick.ask
        sl = entry_price - sl_distance
        tp = entry_price + tp1_distance
    else:  # SELL
        entry_price = tick.bid
        sl = entry_price + sl_distance
        tp = entry_price - tp1_distance

    # Execute
    result = mt5_bridge.send_order(signal, lot, sl, tp)
    if result is None:
        telegram_alerts.send_error(f"Trade execution failed | {'BUY' if signal == 1 else 'SELL'}")
        return False

    # Get spread at entry
    spread = mt5_bridge.get_spread()

    # Register for position management
    position_manager.register_trade(result['ticket'], result['price'], atr, result['direction'])

    # Log to database
    server_logger.log_trade_open(
        ticket=result['ticket'],
        direction=result['direction'],
        price=result['price'],
        sl=sl,
        tp=tp,
        lot=lot,
        atr=atr,
        spread=spread,
    )

    # Send Telegram alert
    telegram_alerts.send_trade_alert(
        direction=result['direction'],
        price=result['price'],
        sl=sl,
        tp=tp,
        lot=lot,
        atr=atr,
        spread=spread,
        ticket=result['ticket'],
    )

    return True


# ══════════════════════════════════════════
# MAIN LOOP
# ══════════════════════════════════════════

def main():
    setup_logging()

    print("""
╔══════════════════════════════════════════╗
║       GOLDSTRIKE v2.1 ENGINE             ║
║    Gold Scalping Domination System       ║
║    FTMO-Optimized · Choppy Market Mode   ║
╚══════════════════════════════════════════╝
    """)

    # Initialize database
    server_logger.init_db()

    # Connect to MT5
    if not mt5_bridge.connect():
        log.critical("Cannot connect to MT5 — exiting")
        return

    # Initialize risk checker
    account = mt5_bridge.get_account_info()
    if account is None:
        log.critical("Cannot get account info — exiting")
        return

    risk = rc.RiskChecker()
    risk.reset_daily(account.balance)
    risk.reset_weekly(account.balance)
    risk.update_peak(account.balance)

    # Send startup notification
    telegram_alerts.send_startup()
    log.info(f"Balance: ${account.balance:.2f} | Symbol: {config.SYMBOL} | "
             f"Mode: {config.TRADING_MODE}")

    # Sync any pending trades from previous sessions
    server_logger.sync_pending_trades()

    last_candle_time = None
    last_daily_reset = None
    last_weekly_reset = None
    last_heartbeat = 0
    last_session = None
    morning_sent = False
    kill_switch_active = False
    last_executed_signal = None  # 1 = last open was BUY, -1 = SELL
    last_executed_signal_time = None  # time.time() after successful open

    try:
        while True:
            try:
                # ── Kill Switch & Heartbeat (every 30s) ──
                now = time.time()
                if now - last_heartbeat >= 30:
                    if server_logger.check_kill_switch():
                        if not kill_switch_active:
                            kill_switch_active = True
                            telegram_alerts.send_risk_alert(
                                "KILL SWITCH ACTIVATED",
                                "Server ordered trading halt. No new trades. "
                                "Open positions will still be managed.")
                            log.critical("Kill switch ON — halting new trades")
                    else:
                        if kill_switch_active:
                            kill_switch_active = False
                            log.info("Kill switch OFF — resuming trading")
                            telegram_alerts.send_message(
                                "🟢 Kill switch deactivated — trading resumed")
                    last_heartbeat = now

                # Reconnect check
                if not mt5_bridge.is_connected():
                    log.warning("MT5 disconnected — reconnecting...")
                    if not mt5_bridge.connect():
                        time.sleep(30)
                        continue

                # ── Friday Cutoff ──
                if session_filter.is_friday_cutoff():
                    position_manager.close_all_for_weekend()
                    log.info("Friday cutoff — waiting until Monday")
                    while session_filter.is_weekend() or session_filter.is_friday_cutoff():
                        time.sleep(60)
                    risk.reset_weekly(mt5_bridge.get_account_info().balance)
                    continue

                # ── Weekend Check ──
                if session_filter.is_weekend():
                    time.sleep(60)
                    continue

                # ── Daily Reset (at midnight EAT) ──
                today = session_filter.now_eat().strftime('%Y-%m-%d')
                if last_daily_reset != today:
                    balance = mt5_bridge.get_account_info().balance
                    risk.reset_daily(balance)
                    last_daily_reset = today
                    morning_sent = False

                    if session_filter.now_eat().weekday() == 0 and last_weekly_reset != today:
                        risk.reset_weekly(balance)
                        last_weekly_reset = today

                # ── Good Morning Message ──
                if not morning_sent:
                    eat_now = session_filter.now_eat()
                    if eat_now.hour >= 9 and eat_now.hour < config.LONDON_START:
                        balance = mt5_bridge.get_account_info().balance
                        yesterday_stats = server_logger.get_daily_stats()
                        telegram_alerts.send_good_morning(
                            balance=balance,
                            yesterday_pnl=yesterday_stats.get('gross_pnl', 0),
                            yesterday_trades=yesterday_stats.get('total', 0),
                        )
                        morning_sent = True
                        log.info("Good morning message sent to Telegram")

                # ── Always manage open positions ──
                position_manager.manage_positions()

                # ── Check for new M1 candle ──
                m1_check = mt5_bridge.get_candles(mt5.TIMEFRAME_M1, 1)
                if m1_check is None:
                    time.sleep(5)
                    continue

                current_candle_time = m1_check['time'].iloc[-1]
                if current_candle_time == last_candle_time:
                    time.sleep(1)
                    continue

                last_candle_time = current_candle_time

                # ── Kill Switch Guard ──
                if kill_switch_active:
                    time.sleep(5)
                    continue

                # ── Evaluate signal (dashboard shown even outside session) ──
                in_session = session_filter.is_trading_session()
                signal = evaluate_signal(in_session=in_session)

                # ── Session Transition Tracking ──
                current_session = session_filter.get_current_session()
                if last_session is not None and current_session != last_session:
                    if current_session == "OFF" and last_session != "OFF":
                        stats = server_logger.get_daily_stats()
                        eat_h = session_filter.now_eat().hour
                        if eat_h < config.NY_OVERLAP_START:
                            next_name = "NY Overlap"
                            next_time = f"{config.NY_OVERLAP_START}:00"
                        elif eat_h < config.NY_CONT_START:
                            next_name = "NY Continuation"
                            next_time = f"{config.NY_CONT_START}:00"
                        else:
                            next_name = "London (tomorrow)"
                            next_time = f"{config.LONDON_START}:00"
                        telegram_alerts.send_session_break(
                            from_session=last_session,
                            next_session=next_name,
                            next_time=next_time,
                            trades_today=stats.get('total', 0),
                            pnl_today=stats.get('gross_pnl', 0),
                        )
                        log.info(f"Session transition: {last_session} → OFF")
                    elif last_session == "OFF" and current_session != "OFF":
                        log.info(f"Session transition: OFF → {current_session}")
                last_session = current_session

                # ── Session Check ──
                if not in_session:
                    time.sleep(10)
                    continue

                if signal == 0:
                    continue

                # ── Cooldown Check ──
                if position_manager.last_trade_close_time is not None:
                    elapsed = (datetime.now() - position_manager.last_trade_close_time).total_seconds()
                    if elapsed < config.TRADE_COOLDOWN_SECONDS:
                        remaining = int(config.TRADE_COOLDOWN_SECONDS - elapsed)
                        log.debug(f"Cooldown active: {remaining}s remaining")
                        continue

                # ── Opposite-signal reversal guard (anti-whipsaw) ──
                if (
                    last_executed_signal is not None
                    and last_executed_signal_time is not None
                    and signal != last_executed_signal
                ):
                    elapsed_rev = time.time() - last_executed_signal_time
                    if elapsed_rev < config.MIN_SIGNAL_REVERSAL_SECONDS:
                        remaining_rev = int(
                            config.MIN_SIGNAL_REVERSAL_SECONDS - elapsed_rev
                        )
                        log.debug(
                            f"Reversal guard: opposite signal blocked "
                            f"({remaining_rev}s / {config.MIN_SIGNAL_REVERSAL_SECONDS}s)"
                        )
                        continue

                # ── Risk Check ──
                if not risk.check_max_trades():
                    continue
                balance = mt5_bridge.get_account_info().balance
                if not risk.check_daily_loss(balance):
                    telegram_alerts.send_risk_alert("Daily Loss Limit",
                                                     f"Daily loss limit reached. No more trades today.")
                    continue
                if not risk.check_max_drawdown(balance):
                    telegram_alerts.send_risk_alert("MAX DRAWDOWN",
                                                     "Drawdown limit breached — SYSTEM PAUSED")
                    telegram_alerts.send_shutdown("Max drawdown breached")
                    break

                # ── Full Risk Check ──
                can_trade, reason = risk.can_trade(signal)
                if not can_trade:
                    log.info(f"Trade blocked by risk: {reason}")
                    continue

                # ── Execute Trade ──
                direction = "BUY" if signal == 1 else "SELL"
                log.info(f"EXECUTING {direction} TRADE")

                if execute_trade(signal):
                    risk.record_trade()
                    last_executed_signal = signal
                    last_executed_signal_time = time.time()
                    log.info(f"Trade #{risk.trades_today} of {config.MAX_TRADES_PER_DAY} today")

            except KeyboardInterrupt:
                raise
            except Exception as e:
                log.error(f"Loop error: {e}", exc_info=True)
                telegram_alerts.send_error(str(e))
                time.sleep(10)

    except KeyboardInterrupt:
        log.info("Shutdown requested by user")
    finally:
        server_logger.send_heartbeat('OFFLINE')

        account = mt5_bridge.get_account_info()
        if account:
            position_manager.manage_positions()
            server_logger.save_daily_summary(account.balance)
            stats = server_logger.get_daily_stats()

            try:
                from datetime import datetime as dt, timedelta
                deals = mt5.history_deals_get(
                    dt.now() - timedelta(days=1), dt.now() + timedelta(hours=1),
                    group=f"*{config.SYMBOL}*"
                )
                if deals:
                    mt5_trades = sum(1 for d in deals
                                    if d.entry == 1 and d.magic == config.MAGIC_NUMBER)
                    mt5_pnl = sum(d.profit for d in deals
                                 if d.entry == 1 and d.magic == config.MAGIC_NUMBER)
                    mt5_wins = sum(1 for d in deals
                                  if d.entry == 1 and d.magic == config.MAGIC_NUMBER and d.profit > 0)

                    if mt5_trades > stats['total']:
                        log.info(f"MT5 history shows {mt5_trades} trades (DB has {stats['total']})")
                        stats['total'] = mt5_trades
                        stats['wins'] = mt5_wins
                        stats['losses'] = mt5_trades - mt5_wins
                        stats['gross_pnl'] = mt5_pnl
            except Exception as e:
                log.error(f"Error checking MT5 deal history: {e}")

            telegram_alerts.send_daily_summary(
                trades=stats['total'],
                wins=stats['wins'],
                losses=stats['losses'],
                gross_pnl=stats['gross_pnl'],
                balance=account.balance,
            )

        telegram_alerts.send_shutdown("Closed for the day")
        mt5_bridge.disconnect()
        log.info("GoldStrike v2.1 shut down cleanly")


if __name__ == '__main__':
    main()
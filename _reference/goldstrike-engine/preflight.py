"""
GoldStrike v2.0 — Pre-Flight Check
Run this before London open to verify everything works.
Usage: python preflight.py
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

def check(name, fn):
    try:
        result = fn()
        print(f"  [PASS] {name}: {result}")
        return True
    except Exception as e:
        print(f"  [FAIL] {name}: {e}")
        return False

def run_preflight():
    print()
    print("=" * 55)
    print("  GOLDSTRIKE v2.0 — PRE-FLIGHT CHECK")
    print("=" * 55)
    results = []

    # 1. Config
    print("\n1. CONFIGURATION")
    import config
    results.append(check("Symbol", lambda: config.SYMBOL))
    results.append(check("Risk %", lambda: f"{config.RISK_PERCENT*100}%"))
    results.append(check("DB path", lambda: str(config.DB_PATH)))
    results.append(check("Mode", lambda: config.TRADING_MODE))

    # 2. Telegram
    print("\n2. TELEGRAM")
    token_set = config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_BOT_TOKEN != 'YOUR_BOT_TOKEN_HERE'
    chat_set = config.TELEGRAM_CHAT_ID and config.TELEGRAM_CHAT_ID != 'YOUR_CHAT_ID_HERE'
    results.append(check("Bot token configured", lambda: "YES" if token_set else "NOT SET — update .env"))
    results.append(check("Chat ID configured", lambda: "YES" if chat_set else "NOT SET — update .env"))

    if token_set and chat_set:
        import telegram_alerts
        results.append(check("Telegram test message", lambda: "SENT" if telegram_alerts.send_message("GoldStrike preflight test") else "FAILED"))

    # 3. Database
    print("\n3. DATABASE")
    import server_logger
    server_logger.init_db()
    results.append(check("SQLite DB", lambda: "OK"))
    stats = server_logger.get_daily_stats()
    results.append(check("Daily stats query", lambda: stats))

    # 4. Indicators
    print("\n4. INDICATORS")
    import indicators
    import pandas as pd
    import numpy as np
    np.random.seed(42)
    close = pd.Series(2650 + np.cumsum(np.random.randn(200) * 0.5))
    high = close + np.abs(np.random.randn(200) * 0.3)
    low = close - np.abs(np.random.randn(200) * 0.3)
    results.append(check("EMA", lambda: f"{indicators.calc_ema(close, 20).iloc[-1]:.2f}"))
    results.append(check("RSI", lambda: f"{indicators.calc_rsi(close).iloc[-1]:.2f}"))
    results.append(check("ATR", lambda: f"{indicators.calc_atr(high, low, close).iloc[-1]:.4f}"))
    results.append(check("ADX", lambda: f"{indicators.calc_adx(high, low, close).iloc[-1]:.2f}"))

    # 5. Session
    print("\n5. SESSION FILTER")
    import session_filter
    results.append(check("EAT Time", lambda: session_filter.now_eat().strftime('%H:%M EAT %A')))
    results.append(check("Current session", lambda: session_filter.get_current_session()))
    results.append(check("Is trading", lambda: session_filter.is_trading_session()))

    # 6. MT5 Connection
    print("\n6. MT5 CONNECTION")
    import mt5_bridge
    connected = mt5_bridge.connect()
    results.append(check("MT5 connect", lambda: "CONNECTED" if connected else "FAILED — open MT5 terminal"))

    if connected:
        import MetaTrader5 as mt5

        acc = mt5_bridge.get_account_info()
        results.append(check("Account", lambda: f"{acc.login} | Balance: {acc.balance}"))

        info = mt5_bridge.get_symbol_info()
        results.append(check("Symbol info", lambda: f"{info.name} | Point: {info.point} | Contract: {info.trade_contract_size}"))

        tick = mt5_bridge.get_tick()
        if tick:
            spread = mt5_bridge.get_spread()
            results.append(check("Market data", lambda: f"Bid: {tick.bid} | Ask: {tick.ask} | Spread: ${spread:.3f}"))

        m5 = mt5_bridge.get_candles(mt5.TIMEFRAME_M5, 200)
        if m5 is not None:
            atr = indicators.calc_atr(m5['high'], m5['low'], m5['close']).iloc[-1]
            lot = mt5_bridge.calculate_lot_size(atr)
            results.append(check("ATR + Lot calc", lambda: f"ATR={atr:.2f} | Lot={lot:.2f}"))

        m15 = mt5_bridge.get_candles(mt5.TIMEFRAME_M15, 250)
        if m15 is not None:
            ema50 = indicators.calc_ema(m15['close'], 50).iloc[-1]
            ema200 = indicators.calc_ema(m15['close'], 200).iloc[-1]
            adx = indicators.calc_adx(m15['high'], m15['low'], m15['close']).iloc[-1]
            price = m15['close'].iloc[-1]
            trend = "BULLISH" if price > ema50 and price > ema200 else "BEARISH" if price < ema50 and price < ema200 else "RANGING"
            results.append(check("M15 Trend", lambda: f"{trend} | ADX={adx:.1f} | EMA50={ema50:.2f} | EMA200={ema200:.2f}"))

        positions = mt5_bridge.get_positions()
        results.append(check("Open positions", lambda: len(positions)))

        mt5_bridge.disconnect()

    # Summary
    passed = sum(results)
    total = len(results)
    failed = total - passed
    print("\n" + "=" * 55)
    if failed == 0:
        print(f"  ALL {total} CHECKS PASSED — READY FOR LONDON")
    else:
        print(f"  {passed}/{total} PASSED | {failed} FAILED")
        print("  Fix the failed items before going live")
    print("=" * 55)
    print()


if __name__ == '__main__':
    run_preflight()

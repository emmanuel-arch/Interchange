"""
GoldStrike v2.0 — MT5 Bridge
Clean interface to MetaTrader 5 terminal.
Handles: connection, candle fetching, order execution, position management.
"""

import math
import logging
import MetaTrader5 as mt5
import pandas as pd
from datetime import datetime
import config

log = logging.getLogger('GoldStrike.MT5')


# ══════════════════════════════════════════
# CONNECTION
# ══════════════════════════════════════════

def connect() -> bool:
    """Initialize MT5 and log in."""
    if not mt5.initialize(timeout=60000):
        log.error(f"MT5 initialize failed: {mt5.last_error()}")
        return False

    if not mt5.login(config.MT5_LOGIN, config.MT5_PASSWORD, config.MT5_SERVER):
        log.error(f"MT5 login failed: {mt5.last_error()}")
        return False

    if not mt5.symbol_select(config.SYMBOL, True):
        log.error(f"Failed to select {config.SYMBOL} in Market Watch")
        return False

    account = mt5.account_info()
    log.info(f"MT5 connected | Account: {account.login} | "
             f"Balance: ${account.balance:.2f} | Server: {account.server}")
    return True


def disconnect():
    """Shut down MT5 connection."""
    mt5.shutdown()
    log.info("MT5 disconnected")


def is_connected() -> bool:
    """Check if MT5 is still connected."""
    info = mt5.account_info()
    return info is not None


# ══════════════════════════════════════════
# MARKET DATA
# ══════════════════════════════════════════

def get_candles(timeframe: int, count: int = 200) -> pd.DataFrame | None:
    """
    Fetch OHLCV candles from MT5.
    Returns DataFrame with columns: time, open, high, low, close, volume.
    """
    rates = mt5.copy_rates_from_pos(config.SYMBOL, timeframe, 0, count)
    if rates is None or len(rates) == 0:
        log.error(f"Failed to fetch candles: {mt5.last_error()}")
        return None

    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    return df[['time', 'open', 'high', 'low', 'close', 'tick_volume']].rename(
        columns={'tick_volume': 'volume'}
    )


def get_tick():
    """Get current bid/ask tick."""
    return mt5.symbol_info_tick(config.SYMBOL)


def get_spread() -> float:
    """Get current spread in USD price terms (works for cent and standard)."""
    tick = mt5.symbol_info_tick(config.SYMBOL)
    if tick is None:
        return 999.0  # Return high spread to block trading
    return tick.ask - tick.bid


def get_symbol_info():
    """Get symbol info (point, digits, contract size, etc.)."""
    return mt5.symbol_info(config.SYMBOL)


def get_account_info():
    """Get account info (balance, equity, margin, etc.)."""
    return mt5.account_info()


# ══════════════════════════════════════════
# LOT SIZE CALCULATION
# ══════════════════════════════════════════

def calculate_lot_size(atr_value: float) -> float:
    """
    Dynamic lot size based on ATR and account balance.
    Rule 1: Never risk more than RISK_PERCENT per trade.
    """
    account = mt5.account_info()
    if account is None:
        return config.MIN_LOT

    balance = account.balance
    risk_amount = balance * config.RISK_PERCENT
    sl_distance = atr_value * config.ATR_SL_MULT  # In price units (USD per oz)

    # Use symbol_info for contract size (works for both Standard and Cent)
    info = mt5.symbol_info(config.SYMBOL)
    contract_size = info.trade_contract_size if info else 100.0

    if sl_distance <= 0:
        return config.MIN_LOT

    lot = risk_amount / (sl_distance * contract_size)

    # Round DOWN to nearest 0.01
    lot = math.floor(lot * 100) / 100

    # Enforce min/max
    lot = max(config.MIN_LOT, min(lot, config.MAX_LOT))

    log.info(f"Lot calc: balance=${balance:.2f} risk=${risk_amount:.2f} "
             f"SL_dist={sl_distance:.2f} -> {lot:.2f} lots")
    return lot


# ══════════════════════════════════════════
# ORDER EXECUTION
# ══════════════════════════════════════════

def send_order(signal: int, lot: float, sl: float, tp: float) -> dict | None:
    """
    Execute a market order.
    signal: 1 = BUY, -1 = SELL
    Returns dict with trade details on success, None on failure.
    """
    tick = mt5.symbol_info_tick(config.SYMBOL)
    if tick is None:
        log.error("Cannot get tick for order")
        return None

    if signal == 1:
        price = tick.ask
        order_type = mt5.ORDER_TYPE_BUY
        direction = 'BUY'
    else:
        price = tick.bid
        order_type = mt5.ORDER_TYPE_SELL
        direction = 'SELL'

    request = {
        'action': mt5.TRADE_ACTION_DEAL,
        'symbol': config.SYMBOL,
        'volume': lot,
        'type': order_type,
        'price': price,
        'sl': round(sl, 2),
        'tp': round(tp, 2),
        'deviation': 20,
        'magic': config.MAGIC_NUMBER,
        'comment': 'GoldStrike_v2',
        'type_time': mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    }

    # ── Margin Safety Check: reduce lot if insufficient margin ──
    margin_needed = mt5.order_calc_margin(order_type, config.SYMBOL, lot, price)
    account = mt5.account_info()
    if margin_needed is not None and account is not None:
        free_margin = account.margin_free
        # Keep at least 30% free margin as safety buffer
        max_usable_margin = free_margin * 0.70
        if margin_needed > max_usable_margin and max_usable_margin > 0:
            reduction_ratio = max_usable_margin / margin_needed
            adjusted_lot = math.floor(lot * reduction_ratio * 100) / 100
            adjusted_lot = max(config.MIN_LOT, adjusted_lot)
            log.warning(f"Margin check: need ${margin_needed:.2f} but only "
                        f"${free_margin:.2f} free | Reducing lot {lot} -> {adjusted_lot}")
            lot = adjusted_lot
            request['volume'] = lot
            # Re-check margin with adjusted lot
            margin_needed = mt5.order_calc_margin(order_type, config.SYMBOL, lot, price)
            if margin_needed is not None and margin_needed > free_margin:
                log.error(f"Still insufficient margin even at {lot} lots "
                          f"(need ${margin_needed:.2f}, have ${free_margin:.2f})")
                return None

    result = mt5.order_send(request)

    if result is None:
        log.error(f"order_send returned None: {mt5.last_error()}")
        return None

    if result.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f"Trade FAILED | {direction} {lot} lots | "
                  f"Retcode: {result.retcode} | Comment: {result.comment}")
        return None

    fill_price = result.price if result.price > 0 else price
    log.info(f"Trade EXECUTED | {direction} {lot} lots @ {fill_price:.2f} | "
             f"SL: {sl:.2f} | TP: {tp:.2f} | Ticket: #{result.order}")

    return {
        'ticket': result.order,
        'direction': direction,
        'price': fill_price,
        'sl': sl,
        'tp': tp,
        'lot': lot,
    }


# ══════════════════════════════════════════
# POSITION MANAGEMENT
# ══════════════════════════════════════════

def get_positions() -> list:
    """Get all open GoldStrike positions."""
    positions = mt5.positions_get(symbol=config.SYMBOL)
    if positions is None:
        return []
    return [p for p in positions if p.magic == config.MAGIC_NUMBER]


def modify_sl_tp(ticket: int, sl: float, tp: float) -> bool:
    """Modify stop loss and/or take profit of an open position."""
    request = {
        'action': mt5.TRADE_ACTION_SLTP,
        'position': ticket,
        'symbol': config.SYMBOL,
        'sl': round(sl, 2),
        'tp': round(tp, 2),
    }
    result = mt5.order_send(request)
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f"Modify SL/TP failed for #{ticket}: "
                  f"{result.retcode if result else 'None'}")
        return False
    return True


def close_position(ticket: int, volume: float | None = None) -> dict | None:
    """
    Close a position (full or partial).
    If volume is None, closes the full position.
    Returns trade result dict on success, None on failure.
    """
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        log.error(f"Position #{ticket} not found")
        return None

    pos = positions[0]
    close_volume = volume if volume else pos.volume

    # Round volume to 2 decimal places
    close_volume = round(close_volume, 2)
    if close_volume < config.MIN_LOT:
        close_volume = pos.volume  # Close full if remainder too small

    # Close order is opposite direction
    if pos.type == 0:  # BUY position -> close with SELL
        price = mt5.symbol_info_tick(config.SYMBOL).bid
        order_type = mt5.ORDER_TYPE_SELL
    else:  # SELL position -> close with BUY
        price = mt5.symbol_info_tick(config.SYMBOL).ask
        order_type = mt5.ORDER_TYPE_BUY

    request = {
        'action': mt5.TRADE_ACTION_DEAL,
        'symbol': config.SYMBOL,
        'volume': close_volume,
        'type': order_type,
        'position': ticket,
        'price': price,
        'deviation': 20,
        'magic': config.MAGIC_NUMBER,
        'comment': 'GoldStrike_close',
        'type_time': mt5.ORDER_TIME_GTC,
        'type_filling': mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request)
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        log.error(f"Close #{ticket} failed: {result.retcode if result else 'None'}")
        return None

    log.info(f"Closed #{ticket} | {close_volume} lots @ {result.price:.2f}")
    return {
        'ticket': ticket,
        'close_price': result.price,
        'volume_closed': close_volume,
    }


def close_all_positions() -> int:
    """Close all GoldStrike positions. Returns count of closed positions."""
    positions = get_positions()
    closed = 0
    for pos in positions:
        if close_position(pos.ticket):
            closed += 1
    return closed
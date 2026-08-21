"""
GoldStrike v2.1 — Position Manager
Handles: delayed breakeven, trailing stop, partial close (TP1), and Friday cutoff.

CHANGELOG v2.1 (2026-04-12):
  - Stage 1 breakeven trigger: 0.7 → 1.0 × ATR (give trades room to breathe)
  - Partial close: 60% → 50% at TP1 (keep more size for the runner)
  - TP1 at 2.0 × ATR (was 1.5) — wider target for better R:R
  - TP2 at 3.5 × ATR (was 2.5) — trail the runner further
  - SL at 1.0 × ATR (was 1.5) — tighter stop = smaller losses

Position Management Stages:
  Stage 0: Initial SL set at entry ± ATR × 1.0
  Stage 1: Profit >= 1.0 × ATR → Move SL to breakeven (entry ± spread buffer)
  Stage 2: Profit >= 2.0 × ATR → Partial close 50%, lock SL at entry + 0.5 × ATR
  Stage 3: Trail remaining 50% with ATR × 1.0 trailing stop toward TP2 (3.5 × ATR)
"""

import math
import logging
import MetaTrader5 as mt5
import config
import mt5_bridge
import telegram_alerts
import server_logger

log = logging.getLogger('GoldStrike.Positions')

# Track which positions have already had TP1 partial close
# Key: ticket, Value: dict with state flags
_position_state = {}

# Timestamp of last trade closure (used for cooldown logic)
last_trade_close_time = None


def register_trade(ticket: int, entry_price: float, atr: float, direction: str):
    """Register a new trade for position management tracking."""
    _position_state[ticket] = {
        'early_be_set': False,     # Stage 1: breakeven
        'tp1_closed': False,       # Stage 2: TP1 partial close done
        'breakeven_set': False,    # Stage 2b: post-TP1 SL lock
        'entry_price': entry_price,
        'atr': atr,
        'direction': direction,
        'max_favorable': 0.0,      # Track peak profit for logging
    }
    log.info(f"Position #{ticket} registered for management | ATR={atr:.2f} | "
             f"BE trigger at {atr * config.ATR_BREAKEVEN_TRIGGER:.2f} pts | "
             f"TP1 at {atr * config.ATR_TP1_MULT:.2f} pts")


def manage_positions():
    """
    Main position management loop. Called every tick cycle.
    For each open GoldStrike position:
      Stage 1: Breakeven when profit >= 1.0 × ATR (delayed from 0.7)
      Stage 2: Partial close 50% when profit >= 2.0 × ATR, lock SL
      Stage 3: Trail remaining with ATR × 1.0
    """
    positions = mt5_bridge.get_positions()

    # Clean up state for positions that no longer exist
    open_tickets = {p.ticket for p in positions}
    closed_tickets = [t for t in _position_state if t not in open_tickets]
    for ticket in closed_tickets:
        state = _position_state.pop(ticket)
        _handle_external_close(ticket, state)
        # Update cooldown timestamp
        global last_trade_close_time
        from datetime import datetime
        last_trade_close_time = datetime.now()

    # Manage each open position
    for pos in positions:
        _manage_single_position(pos)


def _manage_single_position(pos):
    """Apply breakeven, TP1 partial close, and trailing stop to one position."""
    ticket = pos.ticket
    state = _position_state.get(ticket)

    if state is None:
        # Position opened before engine started or external — register with defaults
        atr_estimate = abs(pos.tp - pos.price_open) / config.ATR_TP1_MULT if pos.tp else 2.0
        direction = 'BUY' if pos.type == 0 else 'SELL'
        register_trade(ticket, pos.price_open, atr_estimate, direction)
        state = _position_state[ticket]

    atr = state['atr']
    entry = state['entry_price']
    direction = state['direction']
    current_price = pos.price_current

    # Calculate current profit in price points
    if direction == 'BUY':
        profit_points = current_price - entry
    else:
        profit_points = entry - current_price

    # Track max favorable excursion
    if profit_points > state['max_favorable']:
        state['max_favorable'] = profit_points

    # ── Stage 1: BREAKEVEN — delayed to 1.0 × ATR ──
    # When profit reaches 1.0 × ATR, move SL to entry (+ small buffer for spread)
    # This gives the trade a full ATR of breathing room before locking in
    if not state['early_be_set'] and not state['tp1_closed']:
        be_trigger = atr * config.ATR_BREAKEVEN_TRIGGER

        if profit_points >= be_trigger:
            # Move SL to just beyond entry (0.1 × ATR buffer covers spread)
            spread_buffer = atr * 0.1
            if direction == 'BUY':
                new_sl = entry + spread_buffer
            else:
                new_sl = entry - spread_buffer

            if mt5_bridge.modify_sl_tp(ticket, round(new_sl, 2), pos.tp):
                state['early_be_set'] = True
                server_logger.log_sl_modification(ticket, new_sl, "BREAKEVEN")
                telegram_alerts.send_breakeven_alert(ticket, direction, entry, new_sl)
                log.info(f"#{ticket} ★ BREAKEVEN SET | SL: {new_sl:.2f} | "
                         f"Profit was {profit_points:.2f} pts ({profit_points/atr:.1f}x ATR)")

    # ── Stage 2: Check if TP1 distance reached → partial close 50% ──
    if not state['tp1_closed']:
        tp1_distance = atr * config.ATR_TP1_MULT

        if direction == 'BUY':
            tp1_hit = current_price >= entry + tp1_distance
        else:
            tp1_hit = current_price <= entry - tp1_distance

        if tp1_hit:
            _execute_partial_close(pos, state)
            return  # Let the next cycle handle trail

    # ── Stage 2b: Lock profit SL after TP1 partial close ──
    if state['tp1_closed'] and not state['breakeven_set']:
        lock_offset = atr * config.ATR_BREAKEVEN_MULT

        if direction == 'BUY':
            new_sl = entry + lock_offset
        else:
            new_sl = entry - lock_offset

        # Set TP2 as the final target for the remaining position
        tp2_distance = atr * config.ATR_TP2_MULT
        if direction == 'BUY':
            new_tp = entry + tp2_distance
        else:
            new_tp = entry - tp2_distance

        if mt5_bridge.modify_sl_tp(ticket, round(new_sl, 2), round(new_tp, 2)):
            state['breakeven_set'] = True
            server_logger.log_sl_modification(ticket, new_sl, "POST_TP1_LOCK")
            log.info(f"#{ticket} Post-TP1 SL locked at {new_sl:.2f} | TP2: {new_tp:.2f}")

    # ── Stage 3: Trail with ATR × 1.0 after TP1 ──
    if state['breakeven_set']:
        trail_distance = atr * config.ATR_TRAIL_MULT

        if direction == 'BUY':
            new_trail_sl = current_price - trail_distance
            # Only move SL up, never down
            if new_trail_sl > pos.sl:
                mt5_bridge.modify_sl_tp(ticket, round(new_trail_sl, 2), pos.tp)
                server_logger.log_sl_modification(ticket, new_trail_sl, "TRAIL")
                log.info(f"#{ticket} Trailing SL ↑ {new_trail_sl:.2f}")
        else:
            new_trail_sl = current_price + trail_distance
            # Only move SL down, never up
            if new_trail_sl < pos.sl:
                mt5_bridge.modify_sl_tp(ticket, round(new_trail_sl, 2), pos.tp)
                server_logger.log_sl_modification(ticket, new_trail_sl, "TRAIL")
                log.info(f"#{ticket} Trailing SL ↓ {new_trail_sl:.2f}")


def _execute_partial_close(pos, state):
    """Close 50% of the position at TP1."""
    ticket = pos.ticket
    direction = state['direction']
    entry = state['entry_price']

    # Calculate 50% volume
    partial_volume = math.floor(pos.volume * config.PARTIAL_CLOSE_PCT * 100) / 100
    if partial_volume < config.MIN_LOT:
        # Position too small to partial close — skip, let TP handle it
        log.info(f"#{ticket} too small for partial close ({pos.volume} lots)")
        state['tp1_closed'] = True
        state['breakeven_set'] = True
        return

    result = mt5_bridge.close_position(ticket, partial_volume)
    if result:
        close_price = result['close_price']

        # Calculate P&L on the partial
        if direction == 'BUY':
            pnl_per_lot = close_price - entry
        else:
            pnl_per_lot = entry - close_price

        info = mt5_bridge.get_symbol_info()
        contract_size = info.trade_contract_size if info else 100.0
        pnl = pnl_per_lot * partial_volume * contract_size

        state['tp1_closed'] = True
        server_logger.log_partial_close(ticket, close_price, partial_volume, pnl)
        telegram_alerts.send_partial_close_alert(ticket, direction, close_price,
                                                  partial_volume, pnl)
        log.info(f"#{ticket} TP1 partial close: {partial_volume} lots @ {close_price:.2f} "
                 f"P&L: ${pnl:+.2f}")


def _handle_external_close(ticket: int, state: dict):
    """Handle a position that closed externally (SL hit, TP hit, manual close)."""
    log.info(f"#{ticket} closed externally — looking up exit details...")

    direction = state.get('direction', 'UNKNOWN')
    entry = state.get('entry_price', 0)
    max_fav = state.get('max_favorable', 0)

    try:
        from datetime import datetime, timedelta

        # Use wide time range to avoid timezone mismatch
        start = datetime(2020, 1, 1)
        end = datetime.now() + timedelta(days=1)

        deals = mt5.history_deals_get(start, end, group=f"*{config.SYMBOL}*")

        if not deals:
            deals = mt5.history_deals_get(start, end)

        if deals:
            for deal in reversed(deals):
                if deal.position_id == ticket and deal.entry == 1:
                    exit_price = deal.price
                    pnl = deal.profit

                    comment = (deal.comment or '').lower()
                    if 'sl' in comment or 'stop' in comment:
                        reason = 'SL'
                    elif 'tp' in comment or 'take' in comment:
                        reason = 'TP'
                    else:
                        reason = 'EXTERNAL'

                    account = mt5_bridge.get_account_info()
                    balance = account.balance if account else 0
                    pnl_pct = (pnl / balance * 100) if balance > 0 else 0

                    server_logger.log_trade_close(ticket, exit_price, pnl, pnl_pct, reason)
                    telegram_alerts.send_close_alert(
                        ticket, direction, entry, exit_price, pnl, reason, balance)

                    log.info(f"#{ticket} EXIT RECORDED | {reason} @ {exit_price:.2f} | "
                             f"P&L: ${pnl:+.2f} | Max favorable: {max_fav:.2f} pts")
                    return

        log.warning(f"#{ticket} no exit deal found in MT5 history — recording with estimated data")
        account = mt5_bridge.get_account_info()
        balance = account.balance if account else 0
        server_logger.log_trade_close(ticket, 0, 0, 0, 'UNKNOWN')
        telegram_alerts.send_close_alert(
            ticket, direction, entry, 0, 0, 'UNKNOWN', balance)

    except Exception as e:
        log.error(f"Error handling external close for #{ticket}: {e}", exc_info=True)
        try:
            server_logger.log_trade_close(ticket, 0, 0, 0, 'ERROR')
        except Exception:
            pass


def close_all_for_weekend():
    """Friday cutoff — close all positions."""
    positions = mt5_bridge.get_positions()
    if not positions:
        return
    log.warning("FRIDAY CUTOFF — Closing all positions")
    for pos in positions:
        result = mt5_bridge.close_position(pos.ticket)
        if result:
            direction = 'BUY' if pos.type == 0 else 'SELL'
            pnl = pos.profit
            account = mt5_bridge.get_account_info()
            balance = account.balance if account else 0
            pnl_pct = pnl / balance if balance > 0 else 0
            server_logger.log_trade_close(pos.ticket, result['close_price'],
                                          pnl, pnl_pct, 'FRIDAY_CUTOFF')
            telegram_alerts.send_close_alert(pos.ticket, direction,
                                             result['close_price'], pnl, 'FRIDAY_CUTOFF')
    telegram_alerts.send_message("🔒 All positions closed for weekend")
"""
GoldStrike v2.0 — Telegram Alerts
Professional trade notifications, daily briefings, and investor communication.
"""

import logging
import requests
from datetime import datetime
import config
from session_filter import now_eat

log = logging.getLogger('GoldStrike.Telegram')

TELEGRAM_API = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}"


def send_message(text: str) -> bool:
    """Send a plain text message to Telegram."""
    if not config.TELEGRAM_BOT_TOKEN or config.TELEGRAM_BOT_TOKEN == 'YOUR_BOT_TOKEN_HERE':
        log.warning("Telegram bot token not configured — skipping alert")
        return False

    try:
        response = requests.post(
            f"{TELEGRAM_API}/sendMessage",
            json={
                'chat_id': config.TELEGRAM_CHAT_ID,
                'text': text,
                'parse_mode': 'HTML',
            },
            timeout=10,
        )
        if response.status_code == 200:
            return True
        log.error(f"Telegram send failed: {response.status_code} {response.text}")
        return False
    except Exception as e:
        log.error(f"Telegram error: {e}")
        return False


# ══════════════════════════════════════════
# MORNING & STARTUP
# ══════════════════════════════════════════

def send_good_morning(balance: float, yesterday_pnl: float = 0, yesterday_trades: int = 0):
    """Send a motivational morning briefing before the first session."""
    eat_now = now_eat()
    day_name = eat_now.strftime('%A')
    date_str = eat_now.strftime('%d %B %Y')

    # Dynamic message based on yesterday's results
    if yesterday_pnl > 0:
        momentum = (f"📈 Yesterday: +${yesterday_pnl:.2f} ({yesterday_trades} trades)\n"
                     f"Momentum is on our side. Let's keep it going.")
    elif yesterday_pnl < 0:
        momentum = (f"📉 Yesterday: ${yesterday_pnl:.2f} ({yesterday_trades} trades)\n"
                     f"We learn, we adapt, we come back stronger.")
    else:
        momentum = "Fresh start today. Focus on quality setups."

    text = (
        f"☀️ <b>GOOD MORNING, BIRGENAI TRADERS</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 {day_name}, {date_str}\n"
        f"💰 Balance: ${balance:.2f}\n\n"
        f"{momentum}\n\n"
        f"🛡️ <b>Today's Safeguards:</b>\n"
        f"• Risk: {config.RISK_PERCENT*100:.1f}% per trade\n"
        f"• Breakeven protection at 0.7x ATR\n"
        f"• Max daily loss: {config.MAX_DAILY_LOSS_PCT*100:.0f}%\n"
        f"• Max trades: {config.MAX_TRADES_PER_DAY}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🏛️ London session opens at {config.LONDON_START}:00 EAT\n"
        f"Let's trade smart today. 💰"
    )
    send_message(text)


def send_startup():
    """Send system startup notification when engine goes online."""
    mode = config.TRADING_MODE.upper()
    eat_now = now_eat()
    from session_filter import get_current_session
    session = get_current_session()
    session_emoji = "🏛️" if "LONDON" in session.upper() else "🗽" if "NY" in session.upper() else "⏳"

    text = (
        f"⚡ <b>GOLDSTRIKE v2.0 ONLINE</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Mode: {mode}\n"
        f"Symbol: {config.SYMBOL}\n"
        f"Risk: {config.RISK_PERCENT*100:.1f}% per trade\n"
        f"Max daily loss: {config.MAX_DAILY_LOSS_PCT*100:.0f}%\n"
        f"Max trades/day: {config.MAX_TRADES_PER_DAY}\n"
        f"Breakeven: Active at 0.7x ATR\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{session_emoji} Scanning for setups...\n"
        f"⏰ {eat_now.strftime('%H:%M EAT | %A')}"
    )
    send_message(text)


# ══════════════════════════════════════════
# TRADE LIFECYCLE
# ══════════════════════════════════════════

def send_trade_alert(direction: str, price: float, sl: float, tp: float,
                     lot: float, atr: float, spread: float, ticket: int):
    """Send a formatted trade entry notification."""
    emoji = "🟢" if direction == "BUY" else "🔴"
    sl_dist = abs(price - sl)
    tp_dist = abs(tp - price)
    rr = tp_dist / sl_dist if sl_dist > 0 else 0

    text = (
        f"{emoji} <b>GOLDSTRIKE TRADE EXECUTED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Direction: <b>{direction}</b>\n"
        f"Entry: <b>${price:.2f}</b>\n"
        f"Stop Loss: ${sl:.2f} ({sl_dist:.2f})\n"
        f"Take Profit: ${tp:.2f} ({tp_dist:.2f})\n"
        f"Lot Size: {lot:.2f}\n"
        f"R:R = 1:{rr:.1f}\n"
        f"ATR: {atr:.2f} | Spread: ${spread:.3f}\n"
        f"Ticket: #{ticket}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🛡️ Breakeven will activate at +{atr * config.ATR_BREAKEVEN_TRIGGER:.1f} pts\n"
        f"⏰ {now_eat().strftime('%H:%M EAT | %A')}"
    )
    send_message(text)


def send_breakeven_alert(ticket: int, direction: str, entry: float, new_sl: float):
    """Notify when SL is moved to breakeven — zero risk."""
    text = (
        f"🛡️ <b>BREAKEVEN SET — ZERO RISK</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Ticket: #{ticket} ({direction})\n"
        f"Entry: ${entry:.2f}\n"
        f"New SL: ${new_sl:.2f}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"✅ This trade can no longer lose money.\n"
        f"Letting profits run..."
    )
    send_message(text)


def send_partial_close_alert(ticket: int, direction: str, close_price: float,
                             volume_closed: float, pnl: float):
    """Notify when TP1 partial close fires."""
    text = (
        f"💰 <b>PARTIAL CLOSE — TP1 HIT</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Ticket: #{ticket} ({direction})\n"
        f"Closed {volume_closed:.2f} lots @ ${close_price:.2f}\n"
        f"P&L: <b>${pnl:+.2f}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📈 60% secured. Remaining 40% trailing for TP2."
    )
    send_message(text)


def send_close_alert(ticket: int, direction: str, entry: float, exit_price: float,
                     pnl: float, reason: str, balance: float = 0):
    """Notify when a position fully closes — with personality."""
    is_win = pnl > 0
    is_breakeven = abs(pnl) < 2.0  # Less than $2 is effectively breakeven

    if is_breakeven and reason != 'TP':
        emoji = "📊"
        title = "TRADE CLOSED AT BREAKEVEN"
        footer = ("Capital protected. The setup didn't follow through,\n"
                  "but that's exactly what breakeven protection is for. 🛡️\n"
                  "On to the next setup. 🔍")
    elif is_win:
        emoji = "🎯"
        title = "TRADE WON"
        if pnl > 50:
            footer = "Excellent execution! The analysis was spot on. 🏆"
        else:
            footer = "Solid profit secured. Consistency builds wealth. 📈"
    else:
        emoji = "❌"
        title = "TRADE STOPPED OUT"
        if reason == 'SL':
            footer = ("This is part of trading. Risk was managed at "
                      f"{config.RISK_PERCENT*100:.1f}%.\n"
                      "The strategy is sound — we'll bounce back. 💪")
        else:
            footer = "Position closed. Preserving capital for the next opportunity."

    # Build message
    entry_str = f"${entry:.2f}" if entry > 0 else "N/A"
    exit_str = f"${exit_price:.2f}" if exit_price > 0 else "N/A"

    text = (
        f"{emoji} <b>{title}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Ticket: #{ticket} ({direction})\n"
        f"Entry: {entry_str} → Exit: {exit_str}\n"
        f"P&L: <b>${pnl:+.2f}</b>\n"
        f"Reason: {reason}\n"
    )
    if balance > 0:
        text += f"Balance: ${balance:.2f}\n"
    text += (
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{footer}"
    )
    send_message(text)


# ══════════════════════════════════════════
# SESSION MANAGEMENT
# ══════════════════════════════════════════

def send_session_break(from_session: str, next_session: str, next_time: str,
                       trades_today: int = 0, pnl_today: float = 0):
    """Notify when entering a session gap — keep investors informed."""
    text = (
        f"⏸️ <b>SESSION BREAK</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{from_session} session closed.\n"
        f"Next: {next_session} at {next_time} EAT\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Today so far: {trades_today} trades | P&L: ${pnl_today:+.2f}\n"
        f"Engine monitoring... will resume at {next_time}."
    )
    send_message(text)


# ══════════════════════════════════════════
# RISK & ALERTS
# ══════════════════════════════════════════

def send_risk_alert(rule: str, details: str):
    """Alert when a risk rule is triggered."""
    text = (
        f"🛡️ <b>RISK ALERT</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Rule: {rule}\n"
        f"{details}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"The system is protecting your capital."
    )
    send_message(text)


def send_error(error: str):
    """Send an error notification."""
    text = f"⚠️ <b>GOLDSTRIKE ERROR</b>\n{error}"
    send_message(text)


# ══════════════════════════════════════════
# DAILY SUMMARY & SHUTDOWN
# ══════════════════════════════════════════

def send_daily_summary(trades: int, wins: int, losses: int,
                       gross_pnl: float, balance: float):
    """End-of-day performance summary with personality."""
    win_rate = (wins / trades * 100) if trades > 0 else 0
    eat_now = now_eat()
    date_str = eat_now.strftime('%A, %d %B %Y')

    # Dynamic messaging based on results
    if trades == 0:
        emoji = "📊"
        title = "DAILY SUMMARY — NO TRADES"
        footer = "No setups met our criteria today. Patience is a virtue in trading."
    elif gross_pnl > 0:
        emoji = "📈"
        title = "DAILY SUMMARY — PROFITABLE DAY"
        if win_rate >= 75:
            footer = "Outstanding accuracy. Consistency like this compounds wealth. 🏆"
        else:
            footer = "Another solid day in the books. The strategy is working. 📈"
    else:
        emoji = "📉"
        title = "DAILY SUMMARY — RED DAY"
        if abs(gross_pnl) < balance * 0.02:
            footer = "Minor setback. Risk was well-managed. Tomorrow we reset. 🔄"
        else:
            footer = ("Every professional trader has red days.\n"
                      "The strategy is sound — we'll recover. 💪")

    text = (
        f"{emoji} <b>{title}</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 {date_str}\n\n"
        f"Trades: {trades} | Wins: {wins} | Losses: {losses}\n"
        f"Win Rate: {win_rate:.0f}%\n"
        f"P&L: <b>${gross_pnl:+.2f}</b>\n"
        f"Balance: ${balance:.2f}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{footer}\n\n"
        f"See you tomorrow at {config.LONDON_START}:00 EAT. 👋"
    )
    send_message(text)


def send_shutdown(reason: str = "Manual"):
    """Send system shutdown notification."""
    eat_now = now_eat()
    text = (
        f"🔴 <b>GOLDSTRIKE OFFLINE</b>\n"
        f"Reason: {reason}\n"
        f"⏰ {eat_now.strftime('%H:%M EAT | %A, %d %B %Y')}"
    )
    send_message(text)

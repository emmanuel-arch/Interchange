"""
GoldStrike v2.0 — Telegram Bot Command Handler
Runs as a background thread in the Flask server.
Provides /status, /kill, /resume, /today, /week, /trades commands.
"""

import logging
import threading
import time
import requests

from database.db_manager import (
    get_open_trades, get_today_stats, get_weekly_stats,
    get_all_time_stats, get_recent_trades,
    get_kill_switch, set_kill_switch,
    get_engine_status,
)

log = logging.getLogger('GoldStrike.TelegramBot')


class TelegramBot:
    """Lightweight Telegram bot using long-polling (no extra dependencies)."""

    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = chat_id
        self.api_url = f"https://api.telegram.org/bot{token}"
        self.offset = 0
        self._thread = None
        self._running = False

    def start(self):
        """Start polling in a background daemon thread."""
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def _poll_loop(self):
        """Main polling loop — runs in background thread."""
        log.info("Telegram bot polling started")
        while self._running:
            try:
                updates = self._get_updates()
                for update in updates:
                    self._handle_update(update)
            except Exception as e:
                log.error(f"Telegram poll error: {e}")
                time.sleep(5)

    def _get_updates(self) -> list:
        """Long-poll for Telegram updates."""
        try:
            resp = requests.get(
                f"{self.api_url}/getUpdates",
                params={'offset': self.offset, 'timeout': 30},
                timeout=35,
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            if not data.get('ok'):
                return []
            updates = data.get('result', [])
            if updates:
                self.offset = updates[-1]['update_id'] + 1
            return updates
        except requests.exceptions.Timeout:
            return []
        except Exception as e:
            log.error(f"getUpdates error: {e}")
            time.sleep(2)
            return []

    def _handle_update(self, update: dict):
        """Route incoming message to the right command handler."""
        message = update.get('message', {})
        text = message.get('text', '').strip()
        chat_id = str(message.get('chat', {}).get('id', ''))

        # Only respond to the authorized chat
        if chat_id != self.chat_id:
            log.warning(f"Unauthorized chat ID: {chat_id}")
            return

        if not text.startswith('/'):
            return

        command = text.split()[0].lower().split('@')[0]  # Handle /command@botname

        handlers = {
            '/start': self._cmd_help,
            '/help': self._cmd_help,
            '/status': self._cmd_status,
            '/kill': self._cmd_kill,
            '/resume': self._cmd_resume,
            '/today': self._cmd_today,
            '/week': self._cmd_week,
            '/trades': self._cmd_trades,
            '/alltime': self._cmd_alltime,
            '/balance': self._cmd_balance,
            '/sessions': self._cmd_sessions,
        }

        handler = handlers.get(command, self._cmd_unknown)
        try:
            handler(chat_id)
        except Exception as e:
            log.error(f"Command {command} error: {e}")
            self._send(chat_id, f"⚠️ Error: {e}")

    # ── Command Handlers ──────────────────────────

    def _cmd_help(self, chat_id: str):
        text = (
            "⚡ <b>GOLDSTRIKE COMMANDS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "/status — Engine status + open trades\n"
            "/today — Today's performance\n"
            "/week — Weekly performance\n"
            "/alltime — All-time stats\n"
            "/trades — Recent 5 trades\n"
            "/balance — Current balance\n"
            "/sessions — Trading session schedule\n"
            "/kill — 🚨 HALT all trading\n"
            "/resume — ✅ Resume trading\n"
            "/help — Show this menu\n"
            "━━━━━━━━━━━━━━━━━━━━"
        )
        self._send(chat_id, text)

    def _cmd_status(self, chat_id: str):
        engine = get_engine_status()
        kill = get_kill_switch()
        trades = get_open_trades()
        today = get_today_stats()

        engine_status = engine.get('engine_status', {})
        status_val = engine_status.get('value', 'UNKNOWN') if isinstance(engine_status, dict) else str(engine_status)
        last_seen = engine_status.get('updated_at', '?') if isinstance(engine_status, dict) else '?'

        status_emoji = "🟢" if status_val == 'ONLINE' else "🔴"
        kill_emoji = "🚨" if kill == 'ON' else "✅"

        text = (
            f"📊 <b>GOLDSTRIKE STATUS</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Engine: {status_emoji} {status_val}\n"
            f"Kill Switch: {kill_emoji} {kill}\n"
            f"Last Heartbeat: {last_seen}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Open Trades: {len(trades)}\n"
        )

        for t in trades:
            direction = t.get('direction', '?')
            entry = t.get('entry_price', 0)
            lot = t.get('lot_size', 0)
            emoji = "🟢" if direction == 'BUY' else "🔴"
            text += f"  {emoji} #{t.get('ticket')} {direction} {lot} lots @ ${entry}\n"

        text += (
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Today: {today.get('total', 0)} trades | "
            f"P&L: ${float(today.get('gross_pnl', 0)):+.2f}"
        )
        self._send(chat_id, text)

    def _cmd_today(self, chat_id: str):
        stats = get_today_stats()
        total = stats.get('total', 0)
        wins = stats.get('wins', 0)
        losses = stats.get('losses', 0)
        pnl = float(stats.get('gross_pnl', 0))
        open_t = stats.get('open_trades', 0)
        win_rate = (wins / total * 100) if total > 0 else 0
        emoji = "📈" if pnl >= 0 else "📉"

        text = (
            f"{emoji} <b>TODAY'S PERFORMANCE</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Trades: {total} | Wins: {wins} | Losses: {losses}\n"
            f"Win Rate: {win_rate:.0f}%\n"
            f"P&L: ${pnl:+.2f}\n"
            f"Open: {open_t}\n"
            f"━━━━━━━━━━━━━━━━━━━━"
        )
        self._send(chat_id, text)

    def _cmd_week(self, chat_id: str):
        stats = get_weekly_stats()
        total = stats.get('total', 0)
        wins = stats.get('wins', 0)
        losses = stats.get('losses', 0)
        pnl = float(stats.get('gross_pnl', 0))
        win_rate = (wins / total * 100) if total > 0 else 0
        emoji = "📈" if pnl >= 0 else "📉"

        text = (
            f"{emoji} <b>WEEKLY PERFORMANCE</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Trades: {total} | Wins: {wins} | Losses: {losses}\n"
            f"Win Rate: {win_rate:.0f}%\n"
            f"P&L: ${pnl:+.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━"
        )
        self._send(chat_id, text)

    def _cmd_alltime(self, chat_id: str):
        stats = get_all_time_stats()
        total = stats.get('total', 0)
        wins = stats.get('wins', 0)
        losses = stats.get('losses', 0)
        pnl = float(stats.get('gross_pnl', 0))
        avg = float(stats.get('avg_pnl', 0))
        win_rate = (wins / total * 100) if total > 0 else 0

        text = (
            f"📊 <b>ALL-TIME STATS</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Total Trades: {total}\n"
            f"Wins: {wins} | Losses: {losses}\n"
            f"Win Rate: {win_rate:.0f}%\n"
            f"Total P&L: ${pnl:+.2f}\n"
            f"Avg P&L: ${avg:+.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━"
        )
        self._send(chat_id, text)

    def _cmd_trades(self, chat_id: str):
        trades = get_recent_trades(5)
        if not trades:
            self._send(chat_id, "📭 No trades recorded yet.")
            return

        text = "📋 <b>RECENT TRADES</b>\n━━━━━━━━━━━━━━━━━━━━\n"
        for t in trades:
            direction = t.get('direction', '?')
            ticket = t.get('ticket', '?')
            entry = t.get('entry_price', 0)
            status = t.get('status', 'OPEN')
            pnl = t.get('pnl_usd')

            emoji = "🟢" if direction == 'BUY' else "🔴"
            if status == 'CLOSED' and pnl is not None:
                pnl_str = f"${float(pnl):+.2f}"
                result = "✅" if float(pnl) >= 0 else "❌"
                text += f"{emoji} #{ticket} {direction} @ ${entry} → {result} {pnl_str}\n"
            else:
                text += f"{emoji} #{ticket} {direction} @ ${entry} → ⏳ OPEN\n"

        text += "━━━━━━━━━━━━━━━━━━━━"
        self._send(chat_id, text)

    def _cmd_kill(self, chat_id: str):
        set_kill_switch('ON')
        log.critical("KILL SWITCH activated via Telegram")
        self._send(chat_id,
                   "🚨 <b>KILL SWITCH ACTIVATED</b>\n"
                   "All new trading HALTED immediately.\n"
                   "Open positions will still be managed.\n"
                   "Use /resume to re-enable trading.")

    def _cmd_resume(self, chat_id: str):
        set_kill_switch('OFF')
        log.info("Kill switch deactivated via Telegram")
        self._send(chat_id,
                   "✅ <b>TRADING RESUMED</b>\n"
                   "Kill switch deactivated. Engine will resume on next heartbeat.")

    def _cmd_unknown(self, chat_id: str):
        self._send(chat_id, "❓ Unknown command. Use /help to see available commands.")

    def _cmd_balance(self, chat_id: str):
        """Show current account balance from engine status."""
        engine = get_engine_status()
        engine_status = engine.get('engine_status', {})
        status_val = engine_status.get('value', 'UNKNOWN') if isinstance(engine_status, dict) else str(engine_status)

        stats = get_all_time_stats()
        total_pnl = float(stats.get('gross_pnl', 0))
        total_trades = stats.get('total', 0)

        text = (
            f"💰 <b>ACCOUNT OVERVIEW</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"Engine: {'🟢' if status_val == 'ONLINE' else '🔴'} {status_val}\n"
            f"Total Trades: {total_trades}\n"
            f"Total P&L: ${total_pnl:+.2f}\n"
            f"━━━━━━━━━━━━━━━━━━━━"
        )
        self._send(chat_id, text)

    def _cmd_sessions(self, chat_id: str):
        """Show trading session schedule."""
        text = (
            "🕐 <b>TRADING SESSIONS (EAT/UTC+3)</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "🏛️ London: 10:00 - 13:00\n"
            "⏸️ Break: 13:00 - 15:00\n"
            "🗽 NY Overlap: 15:00 - 18:00\n"
            "🗽 NY Continuation: 18:00 - 20:00\n"
            "━━━━━━━━━━━━━━━━━━━━\n"
            "📅 Friday cutoff: 15:00 EAT\n"
            "🔒 No weekend trading"
        )
        self._send(chat_id, text)

    # ── Send Message ──────────────────────────────

    def _send(self, chat_id: str, text: str):
        """Send a message to the Telegram chat."""
        try:
            requests.post(
                f"{self.api_url}/sendMessage",
                json={
                    'chat_id': chat_id,
                    'text': text,
                    'parse_mode': 'HTML',
                },
                timeout=10,
            )
        except Exception as e:
            log.error(f"Telegram send error: {e}")

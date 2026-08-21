"""
GoldStrike v2.0 — Server API
Flask endpoints for trade logging, monitoring, and kill switch.
"""

import os
import logging
from decimal import Decimal
from flask import Flask, request, jsonify
from functools import wraps
from database.db_manager import (
    init_db, upsert_trade, get_open_trades, get_today_trades,
    get_today_stats, get_weekly_stats, get_all_time_stats,
    get_recent_trades, get_trade_events,
    get_kill_switch, set_kill_switch,
    get_engine_status, set_engine_status,
)

# ══════════════════════════════════════════
# APP SETUP
# ══════════════════════════════════════════

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s',
)
log = logging.getLogger('GoldStrike.Server')

API_KEY = os.getenv('SERVER_API_KEY', '')

# Telegram config for server-side alerts
TG_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TG_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')

# Initialize DB and Telegram bot on import (works with gunicorn --preload)
_bot_started = False

def _init_app():
    global _bot_started
    if _bot_started:
        return
    _bot_started = True
    try:
        init_db()
        log.info("Database initialized")
    except Exception as e:
        log.error(f"DB init failed: {e}")
    if TG_TOKEN and TG_CHAT_ID:
        try:
            import sys
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
            from telegram_bot import TelegramBot
            bot = TelegramBot(TG_TOKEN, TG_CHAT_ID)
            bot.start()
            log.info("Telegram bot started — accepting commands")
        except Exception as e:
            log.error(f"Failed to start Telegram bot: {e}")

_init_app()


# ══════════════════════════════════════════
# AUTH MIDDLEWARE
# ══════════════════════════════════════════

def require_api_key(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not API_KEY:
            log.error("SERVER_API_KEY not configured — rejecting all API requests")
            return jsonify({'error': 'Server misconfigured'}), 500
        key = request.headers.get('X-API-Key', '')
        if not key or key != API_KEY:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


# ══════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'GoldStrike Control Server v2.0'})


# ══════════════════════════════════════════
# TRADE LOGGING
# ══════════════════════════════════════════

@app.route('/api/log_trade', methods=['POST'])
@require_api_key
def log_trade():
    """Receive trade data from the Windows engine and save to PostgreSQL."""
    data = request.get_json()
    if not data or 'ticket' not in data:
        return jsonify({'error': 'Missing ticket'}), 400

    try:
        upsert_trade(data)
        log.info(f"Trade #{data['ticket']} logged: {data.get('status', 'UNKNOWN')}")
        return jsonify({'status': 'ok', 'ticket': data['ticket']})
    except Exception as e:
        log.error(f"Error logging trade: {e}")
        return jsonify({'error': str(e)}), 500


# ══════════════════════════════════════════
# MONITORING ENDPOINTS
# ══════════════════════════════════════════

@app.route('/api/open_trades', methods=['GET'])
@require_api_key
def api_open_trades():
    """Get all currently open trades."""
    trades = get_open_trades()
    return jsonify({'status': 'ok', 'count': len(trades), 'trades': _serialize(trades)})


@app.route('/api/today', methods=['GET'])
@require_api_key
def api_today():
    """Get today's trades and stats."""
    trades = get_today_trades()
    stats = get_today_stats()
    return jsonify({'status': 'ok', 'stats': _serialize_dict(stats), 'trades': _serialize(trades)})


@app.route('/api/stats', methods=['GET'])
@require_api_key
def api_stats():
    """Get performance stats: today, week, all-time."""
    return jsonify({
        'status': 'ok',
        'today': _serialize_dict(get_today_stats()),
        'week': _serialize_dict(get_weekly_stats()),
        'all_time': _serialize_dict(get_all_time_stats()),
    })


@app.route('/api/recent', methods=['GET'])
@require_api_key
def api_recent():
    """Get recent trades."""
    limit = request.args.get('limit', 20, type=int)
    trades = get_recent_trades(limit)
    return jsonify({'status': 'ok', 'count': len(trades), 'trades': _serialize(trades)})


@app.route('/api/trade/<int:ticket>/events', methods=['GET'])
@require_api_key
def api_trade_events(ticket):
    """Get audit trail for a specific trade."""
    events = get_trade_events(ticket)
    return jsonify({'status': 'ok', 'ticket': ticket, 'events': _serialize(events)})


# ══════════════════════════════════════════
# KILL SWITCH
# ══════════════════════════════════════════

@app.route('/api/kill_switch', methods=['GET'])
@require_api_key
def api_kill_switch_status():
    """Check kill switch state."""
    state = get_kill_switch()
    engine = get_engine_status()
    return jsonify({'status': 'ok', 'kill_switch': state, 'engine': engine})


@app.route('/api/kill_switch/on', methods=['POST'])
@require_api_key
def api_kill_switch_on():
    """ACTIVATE kill switch — engine will stop trading."""
    set_kill_switch('ON')
    _send_server_telegram("🚨 <b>KILL SWITCH ACTIVATED</b>\nAll trading halted by server command.")
    log.critical("KILL SWITCH ACTIVATED")
    return jsonify({'status': 'ok', 'kill_switch': 'ON'})


@app.route('/api/kill_switch/off', methods=['POST'])
@require_api_key
def api_kill_switch_off():
    """DEACTIVATE kill switch — engine can resume trading."""
    set_kill_switch('OFF')
    _send_server_telegram("✅ <b>KILL SWITCH DEACTIVATED</b>\nTrading resumed.")
    log.info("Kill switch deactivated")
    return jsonify({'status': 'ok', 'kill_switch': 'OFF'})


# ══════════════════════════════════════════
# ENGINE HEARTBEAT
# ══════════════════════════════════════════

@app.route('/api/heartbeat', methods=['POST'])
@require_api_key
def api_heartbeat():
    """Engine sends periodic heartbeat to confirm it's alive."""
    data = request.get_json() or {}
    status = data.get('status', 'ONLINE')
    set_engine_status(status)

    # Return kill switch state so engine can check
    kill_state = get_kill_switch()
    return jsonify({'status': 'ok', 'kill_switch': kill_state})


# ══════════════════════════════════════════
# SERVER-SIDE TELEGRAM
# ══════════════════════════════════════════

def _send_server_telegram(text: str):
    """Send Telegram message from the server side."""
    import requests as req
    try:
        req.post(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            json={'chat_id': TG_CHAT_ID, 'text': text, 'parse_mode': 'HTML'},
            timeout=10,
        )
    except Exception as e:
        log.error(f"Server Telegram error: {e}")


# ══════════════════════════════════════════
# SERIALIZATION HELPERS
# ══════════════════════════════════════════

def _convert_value(v):
    """Convert a single value to JSON-safe type."""
    if v is None:
        return v
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    if isinstance(v, (float, int, str, bool)):
        return v
    return str(v)


def _serialize(rows):
    """Convert psycopg2 RealDictRow list to JSON-safe list."""
    return [{k: _convert_value(v) for k, v in dict(row).items()} for row in rows]


def _serialize_dict(d):
    """Convert a single dict to JSON-safe."""
    return {k: _convert_value(v) for k, v in d.items()}


# ══════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════

if __name__ == '__main__':
    log.info("GoldStrike Control Server v2.0 starting...")
    app.run(host='0.0.0.0', port=5000, debug=False)

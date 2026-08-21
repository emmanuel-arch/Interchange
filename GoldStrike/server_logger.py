"""
GoldStrike v2.0 — Server Logger
Dual persistence: local SQLite (always) + remote server POST (when available).
Trades are NEVER lost — SQLite is the source of truth.
"""

import sqlite3
import logging
import requests
from datetime import datetime
from contextlib import contextmanager
import config
from session_filter import now_eat, get_current_session

log = logging.getLogger('GoldStrike.Logger')


# ══════════════════════════════════════════
# SQLITE DATABASE
# ══════════════════════════════════════════

def init_db():
    """Create tables if they don't exist."""
    with _get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket INTEGER UNIQUE NOT NULL,
                timestamp TEXT NOT NULL,
                symbol TEXT NOT NULL,
                direction TEXT NOT NULL,
                entry_price REAL NOT NULL,
                stop_loss REAL NOT NULL,
                take_profit REAL NOT NULL,
                lot_size REAL NOT NULL,
                atr_at_entry REAL NOT NULL,
                spread_at_entry REAL,
                exit_price REAL,
                exit_time TEXT,
                pnl_usd REAL,
                pnl_pct REAL,
                exit_reason TEXT,
                session TEXT,
                magic_number INTEGER DEFAULT 202600,
                partial_closed INTEGER DEFAULT 0,
                partial_close_price REAL,
                partial_close_pnl REAL,
                synced_to_server INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS daily_summary (
                date TEXT PRIMARY KEY,
                trades_count INTEGER,
                wins INTEGER,
                losses INTEGER,
                gross_pnl REAL,
                net_pnl REAL,
                max_drawdown_pct REAL,
                ending_balance REAL
            );

            CREATE TABLE IF NOT EXISTS trade_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                details TEXT
            );
        """)
    log.info(f"Database initialized: {config.DB_PATH}")


@contextmanager
def _get_db():
    conn = sqlite3.connect(str(config.DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ══════════════════════════════════════════
# TRADE LOGGING
# ══════════════════════════════════════════

def log_trade_open(ticket: int, direction: str, price: float,
                   sl: float, tp: float, lot: float,
                   atr: float, spread: float):
    """Save a new trade to SQLite and attempt server sync."""
    timestamp = now_eat().isoformat()
    session = get_current_session()

    with _get_db() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO trades
            (ticket, timestamp, symbol, direction, entry_price, stop_loss,
             take_profit, lot_size, atr_at_entry, spread_at_entry, session, magic_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (ticket, timestamp, config.SYMBOL, direction, price, sl, tp,
              lot, atr, spread, session, config.MAGIC_NUMBER))

        conn.execute("""
            INSERT INTO trade_events (ticket, timestamp, event_type, details)
            VALUES (?, ?, 'OPEN', ?)
        """, (ticket, timestamp,
              f"{direction} {lot} lots @ {price:.2f} SL={sl:.2f} TP={tp:.2f}"))

    log.info(f"Trade #{ticket} saved to database")

    # Async server sync (non-blocking)
    _sync_trade_to_server({
        'ticket': ticket,
        'timestamp': timestamp,
        'symbol': config.SYMBOL,
        'direction': direction,
        'entry_price': price,
        'stop_loss': sl,
        'take_profit': tp,
        'lot_size': lot,
        'atr_at_entry': atr,
        'spread_at_entry': spread,
        'session': session,
        'status': 'OPEN',
    })


def log_partial_close(ticket: int, close_price: float, volume_closed: float,
                      pnl: float):
    """Record a partial close (TP1 hit)."""
    timestamp = now_eat().isoformat()

    with _get_db() as conn:
        conn.execute("""
            UPDATE trades SET partial_closed = 1,
            partial_close_price = ?, partial_close_pnl = ?
            WHERE ticket = ?
        """, (close_price, pnl, ticket))

        conn.execute("""
            INSERT INTO trade_events (ticket, timestamp, event_type, details)
            VALUES (?, ?, 'PARTIAL_CLOSE', ?)
        """, (ticket, timestamp,
              f"Closed {volume_closed} lots @ {close_price:.2f} P&L=${pnl:+.2f}"))

    log.info(f"Partial close #{ticket} saved | P&L: ${pnl:+.2f}")


def log_trade_close(ticket: int, exit_price: float, pnl: float,
                    pnl_pct: float, reason: str):
    """Record a full trade close."""
    timestamp = now_eat().isoformat()

    with _get_db() as conn:
        conn.execute("""
            UPDATE trades SET exit_price = ?, exit_time = ?,
            pnl_usd = ?, pnl_pct = ?, exit_reason = ?
            WHERE ticket = ?
        """, (exit_price, timestamp, pnl, pnl_pct, reason, ticket))

        conn.execute("""
            INSERT INTO trade_events (ticket, timestamp, event_type, details)
            VALUES (?, ?, 'CLOSE', ?)
        """, (ticket, timestamp,
              f"Exit @ {exit_price:.2f} P&L=${pnl:+.2f} Reason={reason}"))

    log.info(f"Trade #{ticket} closed | P&L: ${pnl:+.2f} | Reason: {reason}")

    # Sync close to server
    _sync_trade_to_server({
        'ticket': ticket,
        'exit_price': exit_price,
        'exit_time': timestamp,
        'pnl_usd': pnl,
        'pnl_pct': pnl_pct,
        'exit_reason': reason,
        'status': 'CLOSED',
    })


def log_sl_modification(ticket: int, new_sl: float, reason: str):
    """Record SL modification (breakeven, trailing)."""
    timestamp = now_eat().isoformat()
    with _get_db() as conn:
        conn.execute("""
            INSERT INTO trade_events (ticket, timestamp, event_type, details)
            VALUES (?, ?, 'MODIFY_SL', ?)
        """, (ticket, timestamp, f"New SL={new_sl:.2f} Reason={reason}"))


# ══════════════════════════════════════════
# DAILY STATS
# ══════════════════════════════════════════

def get_daily_stats() -> dict:
    """Get today's trading statistics from the database."""
    today = now_eat().strftime('%Y-%m-%d')

    with _get_db() as conn:
        row = conn.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN pnl_usd <= 0 THEN 1 ELSE 0 END) as losses,
                COALESCE(SUM(pnl_usd), 0) as gross_pnl
            FROM trades
            WHERE date(timestamp) = ?
            AND exit_price IS NOT NULL
        """, (today,)).fetchone()

        open_count = conn.execute("""
            SELECT COUNT(*) FROM trades
            WHERE date(timestamp) = ? AND exit_price IS NULL
        """, (today,)).fetchone()[0]

    return {
        'total': row['total'] or 0,
        'wins': row['wins'] or 0,
        'losses': row['losses'] or 0,
        'gross_pnl': row['gross_pnl'] or 0.0,
        'open_trades': open_count,
    }


def save_daily_summary(balance: float):
    """Save end-of-day summary."""
    today = now_eat().strftime('%Y-%m-%d')
    stats = get_daily_stats()

    with _get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO daily_summary
            (date, trades_count, wins, losses, gross_pnl, net_pnl, ending_balance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (today, stats['total'], stats['wins'], stats['losses'],
              stats['gross_pnl'], stats['gross_pnl'], balance))

    log.info(f"Daily summary saved | {stats['total']} trades | P&L: ${stats['gross_pnl']:+.2f}")


def get_open_trades_from_db() -> list:
    """Get trades that haven't been closed yet."""
    with _get_db() as conn:
        rows = conn.execute("""
            SELECT * FROM trades WHERE exit_price IS NULL
        """).fetchall()
    return [dict(r) for r in rows]


# ══════════════════════════════════════════
# SERVER SYNC
# ══════════════════════════════════════════

def _sync_trade_to_server(trade_data: dict):
    """POST trade data to Linux server. Fire-and-forget with error logging."""
    if not config.SERVER_URL:
        return

    try:
        response = requests.post(
            f"{config.SERVER_URL}/api/log_trade",
            json=trade_data,
            headers={'X-API-Key': config.SERVER_API_KEY},
            timeout=5,
        )
        if response.status_code == 200:
            # Mark as synced in local DB
            ticket = trade_data.get('ticket')
            if ticket:
                with _get_db() as conn:
                    conn.execute(
                        "UPDATE trades SET synced_to_server = 1 WHERE ticket = ?",
                        (ticket,)
                    )
            log.debug(f"Trade synced to server")
        else:
            log.warning(f"Server sync failed: HTTP {response.status_code}")
    except Exception as e:
        log.warning(f"Server sync failed (will retry): {e}")


def sync_pending_trades():
    """Retry syncing any trades that haven't been sent to server yet."""
    with _get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM trades WHERE synced_to_server = 0"
        ).fetchall()

    synced = 0
    for row in rows:
        trade = dict(row)
        trade['status'] = 'CLOSED' if trade.get('exit_price') else 'OPEN'
        _sync_trade_to_server(trade)
        synced += 1

    if synced > 0:
        log.info(f"Synced {synced} pending trades to server")


# ══════════════════════════════════════════
# KILL SWITCH & HEARTBEAT
# ══════════════════════════════════════════

def check_kill_switch() -> bool:
    """
    Send heartbeat to server and check kill switch state.
    Returns True if kill switch is ON (trading should stop).
    Returns False if OFF or server unreachable (fail-open).
    """
    if not config.SERVER_URL:
        return False

    try:
        response = requests.post(
            f"{config.SERVER_URL}/api/heartbeat",
            json={'status': 'ONLINE'},
            headers={'X-API-Key': config.SERVER_API_KEY},
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            kill_state = data.get('kill_switch', 'OFF')
            if kill_state == 'ON':
                log.critical("KILL SWITCH IS ON — server ordered trading halt")
                return True
        return False
    except Exception as e:
        log.debug(f"Heartbeat failed (continuing): {e}")
        return False


def send_heartbeat(status: str = 'ONLINE'):
    """Send status heartbeat without checking kill switch."""
    if not config.SERVER_URL:
        return
    try:
        requests.post(
            f"{config.SERVER_URL}/api/heartbeat",
            json={'status': status},
            headers={'X-API-Key': config.SERVER_API_KEY},
            timeout=3,
        )
    except Exception:
        pass

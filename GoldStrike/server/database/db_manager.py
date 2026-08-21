"""
GoldStrike v2.0 — Server Database Manager
PostgreSQL interface for the Linux control server.
"""

import os
import logging
from datetime import datetime, date
from contextlib import contextmanager
import psycopg2
from psycopg2.extras import RealDictCursor

log = logging.getLogger('GoldStrike.Server.DB')

DATABASE_URL = os.getenv('DATABASE_URL', '')

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required. "
                       "Example: postgresql://user:pass@localhost/quantempire")


@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Run schema.sql to initialize tables."""
    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    with open(schema_path) as f:
        sql = f.read()
    with get_db() as conn:
        conn.cursor().execute(sql)
    log.info("Database schema initialized")


# ══════════════════════════════════════════
# TRADE OPERATIONS
# ══════════════════════════════════════════

def upsert_trade(trade_data: dict):
    """Insert or update a trade record."""
    with get_db() as conn:
        cur = conn.cursor()

        status = trade_data.get('status', 'OPEN')

        if status == 'OPEN':
            cur.execute("""
                INSERT INTO trades (ticket, timestamp, symbol, direction, entry_price,
                    stop_loss, take_profit, lot_size, atr_at_entry, spread_at_entry,
                    session, magic_number, status)
                VALUES (%(ticket)s, %(timestamp)s, %(symbol)s, %(direction)s, %(entry_price)s,
                    %(stop_loss)s, %(take_profit)s, %(lot_size)s, %(atr_at_entry)s,
                    %(spread_at_entry)s, %(session)s, 202600, 'OPEN')
                ON CONFLICT (ticket) DO UPDATE SET
                    stop_loss = EXCLUDED.stop_loss,
                    take_profit = EXCLUDED.take_profit,
                    status = EXCLUDED.status
            """, trade_data)

            cur.execute("""
                INSERT INTO trade_events (ticket, timestamp, event_type, details)
                VALUES (%(ticket)s, %(timestamp)s, 'OPEN',
                    %(direction)s || ' ' || %(lot_size)s || ' lots @ ' || %(entry_price)s)
            """, trade_data)

        elif status == 'CLOSED':
            cur.execute("""
                UPDATE trades SET
                    exit_price = %(exit_price)s,
                    exit_time = %(exit_time)s,
                    pnl_usd = %(pnl_usd)s,
                    pnl_pct = %(pnl_pct)s,
                    exit_reason = %(exit_reason)s,
                    status = 'CLOSED'
                WHERE ticket = %(ticket)s
            """, trade_data)

            cur.execute("""
                INSERT INTO trade_events (ticket, timestamp, event_type, details)
                VALUES (%(ticket)s, NOW(), 'CLOSE',
                    'Exit @ ' || %(exit_price)s || ' P&L=$' || %(pnl_usd)s)
            """, trade_data)

    log.info(f"Trade #{trade_data.get('ticket')} upserted: {status}")


def get_open_trades() -> list:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM trades WHERE status = 'OPEN' ORDER BY timestamp DESC")
        return cur.fetchall()


def get_today_trades() -> list:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT * FROM trades
            WHERE DATE(timestamp) = CURRENT_DATE
            ORDER BY timestamp DESC
        """)
        return cur.fetchall()


def get_today_stats() -> dict:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(CASE WHEN pnl_usd <= 0 AND status='CLOSED' THEN 1 ELSE 0 END), 0) as losses,
                COALESCE(SUM(pnl_usd), 0) as gross_pnl,
                SUM(CASE WHEN status='OPEN' THEN 1 ELSE 0 END) as open_trades
            FROM trades
            WHERE DATE(timestamp) = CURRENT_DATE
        """)
        row = cur.fetchone()
        return dict(row) if row else {'total': 0, 'wins': 0, 'losses': 0, 'gross_pnl': 0, 'open_trades': 0}


def get_weekly_stats() -> dict:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(CASE WHEN pnl_usd <= 0 AND status='CLOSED' THEN 1 ELSE 0 END), 0) as losses,
                COALESCE(SUM(pnl_usd), 0) as gross_pnl
            FROM trades
            WHERE timestamp >= DATE_TRUNC('week', CURRENT_DATE)
        """)
        row = cur.fetchone()
        return dict(row) if row else {'total': 0, 'wins': 0, 'losses': 0, 'gross_pnl': 0}


def get_all_time_stats() -> dict:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END), 0) as wins,
                COALESCE(SUM(CASE WHEN pnl_usd <= 0 AND status='CLOSED' THEN 1 ELSE 0 END), 0) as losses,
                COALESCE(SUM(pnl_usd), 0) as gross_pnl,
                COALESCE(AVG(CASE WHEN pnl_usd IS NOT NULL THEN pnl_usd END), 0) as avg_pnl
            FROM trades WHERE status = 'CLOSED'
        """)
        row = cur.fetchone()
        return dict(row) if row else {}


def get_recent_trades(limit: int = 20) -> list:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM trades ORDER BY timestamp DESC LIMIT %s", (limit,))
        return cur.fetchall()


def get_trade_events(ticket: int) -> list:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT * FROM trade_events WHERE ticket = %s ORDER BY timestamp", (ticket,)
        )
        return cur.fetchall()


# ══════════════════════════════════════════
# KILL SWITCH
# ══════════════════════════════════════════

def get_kill_switch() -> str:
    """Returns 'ON' or 'OFF'."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT value FROM system_state WHERE key = 'kill_switch'")
        row = cur.fetchone()
        return row[0] if row else 'OFF'


def set_kill_switch(state: str):
    """Set kill switch to 'ON' or 'OFF'."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO system_state (key, value, updated_at)
            VALUES ('kill_switch', %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = NOW()
        """, (state, state))
    log.warning(f"Kill switch set to: {state}")


def set_engine_status(status: str):
    """Update engine heartbeat status."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO system_state (key, value, updated_at)
            VALUES ('engine_status', %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = NOW()
        """, (status, status))


def get_engine_status() -> dict:
    with get_db() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM system_state")
        rows = cur.fetchall()
        return {row['key']: {'value': row['value'], 'updated_at': str(row['updated_at'])} for row in rows}

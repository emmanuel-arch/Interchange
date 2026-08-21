-- ══════════════════════════════════════════
-- GoldStrike — Seed Data for 2026-04-07
-- Run: psql -U emmanuel -d quantempire -f seed_20260407.sql
-- ══════════════════════════════════════════

-- First ensure tables exist
\i schema.sql

-- Insert the trade from April 7, 2026
INSERT INTO trades (
    ticket, timestamp, symbol, direction, entry_price,
    stop_loss, take_profit, lot_size, atr_at_entry,
    spread_at_entry, exit_price, exit_time,
    pnl_usd, pnl_pct, exit_reason, session,
    magic_number, status
) VALUES (
    273984193,
    '2026-04-07 17:27:00+03',
    'XAUUSDc',
    'SELL',
    4638.582,
    4655.420,
    4616.130,
    0.10,
    11.230,
    0.280,
    4655.420,
    '2026-04-07 18:30:20+03',
    -168.40,
    -18.67,
    'SL',
    'NY_OVERLAP',
    202600,
    'CLOSED'
) ON CONFLICT (ticket) DO UPDATE SET
    exit_price = EXCLUDED.exit_price,
    exit_time = EXCLUDED.exit_time,
    pnl_usd = EXCLUDED.pnl_usd,
    pnl_pct = EXCLUDED.pnl_pct,
    exit_reason = EXCLUDED.exit_reason,
    status = EXCLUDED.status;

-- Insert trade events
INSERT INTO trade_events (ticket, timestamp, event_type, details)
VALUES
    (273984193, '2026-04-07 17:27:00+03', 'OPEN',
     'SELL 0.10 lots @ 4638.582 SL=4655.42 TP=4616.13'),
    (273984193, '2026-04-07 18:30:20+03', 'CLOSE',
     'Exit @ 4655.42 P&L=-$168.40 Reason=SL hit — no breakeven protection was active')
ON CONFLICT DO NOTHING;

-- Insert daily summary
INSERT INTO daily_summary (date, trades_count, wins, losses, gross_pnl, net_pnl, ending_balance)
VALUES ('2026-04-07', 1, 0, 1, -168.40, -168.40, 734.40)
ON CONFLICT (date) DO UPDATE SET
    trades_count = EXCLUDED.trades_count,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    gross_pnl = EXCLUDED.gross_pnl,
    net_pnl = EXCLUDED.net_pnl,
    ending_balance = EXCLUDED.ending_balance;

-- Verify
SELECT '=== TRADE ===' AS section;
SELECT ticket, direction, entry_price, exit_price, pnl_usd, exit_reason, status
FROM trades WHERE ticket = 273984193;

SELECT '=== EVENTS ===' AS section;
SELECT ticket, timestamp, event_type, details
FROM trade_events WHERE ticket = 273984193 ORDER BY timestamp;

SELECT '=== DAILY SUMMARY ===' AS section;
SELECT * FROM daily_summary WHERE date = '2026-04-07';

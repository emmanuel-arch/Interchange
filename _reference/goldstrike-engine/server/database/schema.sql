-- ══════════════════════════════════════════
-- GoldStrike v2.0 — PostgreSQL Schema
-- Deploy: psql -U emmanuel -d quantempire -f schema.sql
-- ══════════════════════════════════════════

-- Trade Log Table
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    ticket INTEGER UNIQUE NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(10) NOT NULL DEFAULT 'XAUUSDc',
    direction VARCHAR(4) NOT NULL,
    entry_price DECIMAL(10,3) NOT NULL,
    stop_loss DECIMAL(10,3) NOT NULL,
    take_profit DECIMAL(10,3) NOT NULL,
    lot_size DECIMAL(5,2) NOT NULL,
    atr_at_entry DECIMAL(10,4) NOT NULL,
    spread_at_entry DECIMAL(10,4),
    exit_price DECIMAL(10,3),
    exit_time TIMESTAMPTZ,
    pnl_usd DECIMAL(10,2),
    pnl_pct DECIMAL(6,4),
    exit_reason VARCHAR(20),
    session VARCHAR(20),
    magic_number INT DEFAULT 202600,
    partial_closed BOOLEAN DEFAULT FALSE,
    partial_close_price DECIMAL(10,3),
    partial_close_pnl DECIMAL(10,2),
    status VARCHAR(10) DEFAULT 'OPEN'
);

-- Daily Summary Table
CREATE TABLE IF NOT EXISTS daily_summary (
    date DATE PRIMARY KEY,
    trades_count INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    gross_pnl DECIMAL(10,2) DEFAULT 0,
    net_pnl DECIMAL(10,2) DEFAULT 0,
    max_drawdown_pct DECIMAL(6,4),
    ending_balance DECIMAL(10,2)
);

-- Trade Events (audit trail)
CREATE TABLE IF NOT EXISTS trade_events (
    id SERIAL PRIMARY KEY,
    ticket INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type VARCHAR(20) NOT NULL,
    details TEXT
);

-- Kill Switch State
CREATE TABLE IF NOT EXISTS system_state (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize kill switch to OFF
INSERT INTO system_state (key, value)
VALUES ('kill_switch', 'OFF')
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_state (key, value)
VALUES ('engine_status', 'OFFLINE')
ON CONFLICT (key) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_ticket ON trades(ticket);
CREATE INDEX IF NOT EXISTS idx_trade_events_ticket ON trade_events(ticket);

-- Condition Monitor Log (minute-by-minute market data)
CREATE TABLE IF NOT EXISTS condition_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session VARCHAR(20),
    bid DECIMAL(10,3),
    spread DECIMAL(10,4),
    price_m15 DECIMAL(10,3),
    ema50 DECIMAL(10,3),
    ema200 DECIMAL(10,3),
    adx DECIMAL(6,2),
    trend_dir VARCHAR(10),
    price_m5 DECIMAL(10,3),
    ema20 DECIMAL(10,3),
    rsi DECIMAL(6,2),
    atr DECIMAL(10,3),
    pullback_dist DECIMAL(10,3),
    near_ema20 BOOLEAN,
    rsi_neutral BOOLEAN,
    trend_strong BOOLEAN,
    bull_engulf BOOLEAN,
    bear_engulf BOOLEAN,
    bull_momentum BOOLEAN,
    bear_momentum BOOLEAN,
    spread_ok BOOLEAN,
    in_session BOOLEAN,
    conditions_met INT,
    signal INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_condition_logs_timestamp ON condition_logs(timestamp);

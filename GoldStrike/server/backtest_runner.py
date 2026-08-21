"""
GoldStrike v2.0 — Daily Backtest Runner
Runs once daily on the Linux server via cron.
Downloads historical XAUUSD data, replays the strategy logic,
and sends a summary report via Telegram.

Cron: 0 18 * * 1-5 (18:00 UTC = 21:00 EAT, after NY close)
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
import requests

# ── Resolve imports when run from server directory ──
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database.db_manager import get_db

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(name)s | %(levelname)s | %(message)s',
)
log = logging.getLogger('GoldStrike.Backtest')

# ══════════════════════════════════════════
# STRATEGY CONSTANTS (mirror config.py)
# ══════════════════════════════════════════
EMA_FAST = 50
EMA_SLOW = 200
EMA_PULLBACK = 20
RSI_PERIOD = 14
ATR_PERIOD = 14
ADX_MINIMUM = 25
RSI_LOW = 40
RSI_HIGH = 60
ATR_SL_MULT = 1.5
ATR_TP1_MULT = 2.0
ATR_TP2_MULT = 3.5
RISK_PERCENT = 0.015


# ══════════════════════════════════════════
# INDICATORS (self-contained, no MT5 needed)
# ══════════════════════════════════════════

def calc_ema(data: pd.Series, period: int) -> pd.Series:
    return data.ewm(span=period, adjust=False).mean()


def calc_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta.where(delta < 0, 0.0))
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def calc_tr(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    prev_close = close.shift(1)
    return pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)


def calc_atr(high: pd.Series, low: pd.Series, close: pd.Series,
             period: int = 14) -> pd.Series:
    tr = calc_tr(high, low, close)
    return tr.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()


def calc_adx(high: pd.Series, low: pd.Series, close: pd.Series,
             period: int = 14) -> pd.Series:
    up_move = high.diff()
    down_move = -low.diff()
    alpha = 1.0 / period
    plus_dm = pd.Series(
        np.where((up_move > down_move) & (up_move > 0), up_move, 0.0),
        index=high.index)
    minus_dm = pd.Series(
        np.where((down_move > up_move) & (down_move > 0), down_move, 0.0),
        index=high.index)
    atr = calc_atr(high, low, close, period)
    smooth_plus = plus_dm.ewm(alpha=alpha, min_periods=period, adjust=False).mean()
    smooth_minus = minus_dm.ewm(alpha=alpha, min_periods=period, adjust=False).mean()
    plus_di = 100.0 * smooth_plus / atr
    minus_di = 100.0 * smooth_minus / atr
    di_sum = (plus_di + minus_di).replace(0, np.nan)
    dx = 100.0 * (plus_di - minus_di).abs() / di_sum
    return dx.ewm(alpha=alpha, min_periods=period, adjust=False).mean()


def is_bullish_engulfing(open_p: pd.Series, close_p: pd.Series, idx: int) -> bool:
    if idx < 1:
        return False
    prev_bearish = close_p.iloc[idx - 1] < open_p.iloc[idx - 1]
    curr_bullish = close_p.iloc[idx] > open_p.iloc[idx]
    engulf = close_p.iloc[idx] > open_p.iloc[idx - 1] and open_p.iloc[idx] <= close_p.iloc[idx - 1]
    return prev_bearish and curr_bullish and engulf


def is_bearish_engulfing(open_p: pd.Series, close_p: pd.Series, idx: int) -> bool:
    if idx < 1:
        return False
    prev_bullish = close_p.iloc[idx - 1] > open_p.iloc[idx - 1]
    curr_bearish = close_p.iloc[idx] < open_p.iloc[idx]
    engulf = close_p.iloc[idx] < open_p.iloc[idx - 1] and open_p.iloc[idx] >= close_p.iloc[idx - 1]
    return prev_bullish and curr_bearish and engulf


# ══════════════════════════════════════════
# DATA FETCHING
# ══════════════════════════════════════════

def fetch_gold_data(days: int = 30) -> pd.DataFrame | None:
    """
    Fetch gold OHLCV data from a free API.
    Uses Yahoo Finance via yfinance if available, otherwise falls back to
    generating synthetic data from the database's recorded trades.
    """
    try:
        import yfinance as yf
        end = datetime.now()
        start = end - timedelta(days=days)
        df = yf.download('GC=F', start=start, end=end, interval='5m', progress=False)
        if df is not None and len(df) > 200:
            df = df.reset_index()
            df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
            df = df.rename(columns={'datetime': 'time', 'adj close': 'close'})
            if 'time' not in df.columns and 'date' in df.columns:
                df = df.rename(columns={'date': 'time'})
            return df[['time', 'open', 'high', 'low', 'close', 'volume']].dropna()
    except ImportError:
        log.warning("yfinance not installed — using database trade history for analysis")
    except Exception as e:
        log.warning(f"yfinance fetch failed: {e}")

    return None


# ══════════════════════════════════════════
# BACKTEST ENGINE
# ══════════════════════════════════════════

def run_backtest(df: pd.DataFrame, initial_balance: float = 10000.0) -> dict:
    """
    Replay the GoldStrike strategy on historical data.
    Returns performance metrics.
    """
    if len(df) < 250:
        return {'error': 'Not enough data for backtest (need 250+ candles)'}

    # Pre-compute indicators on full dataset
    ema50 = calc_ema(df['close'], EMA_FAST)
    ema200 = calc_ema(df['close'], EMA_SLOW)
    ema20 = calc_ema(df['close'], EMA_PULLBACK)
    rsi = calc_rsi(df['close'], RSI_PERIOD)
    atr = calc_atr(df['high'], df['low'], df['close'], ATR_PERIOD)
    adx = calc_adx(df['high'], df['low'], df['close'])

    trades = []
    balance = initial_balance
    position = None  # {'direction', 'entry', 'sl', 'tp', 'lot', 'atr'}

    for i in range(250, len(df)):
        price = df['close'].iloc[i]
        high = df['high'].iloc[i]
        low = df['low'].iloc[i]

        # ── Manage open position ──
        if position is not None:
            if position['direction'] == 'BUY':
                if low <= position['sl']:
                    pnl = (position['sl'] - position['entry']) * position['lot'] * 100
                    balance += pnl
                    trades.append({**position, 'exit': position['sl'], 'pnl': pnl, 'reason': 'SL'})
                    position = None
                    continue
                if high >= position['tp']:
                    pnl = (position['tp'] - position['entry']) * position['lot'] * 100
                    balance += pnl
                    trades.append({**position, 'exit': position['tp'], 'pnl': pnl, 'reason': 'TP'})
                    position = None
                    continue
            else:
                if high >= position['sl']:
                    pnl = (position['entry'] - position['sl']) * position['lot'] * 100
                    balance += pnl
                    trades.append({**position, 'exit': position['sl'], 'pnl': pnl, 'reason': 'SL'})
                    position = None
                    continue
                if low <= position['tp']:
                    pnl = (position['entry'] - position['tp']) * position['lot'] * 100
                    balance += pnl
                    trades.append({**position, 'exit': position['tp'], 'pnl': pnl, 'reason': 'TP'})
                    position = None
                    continue

        # ── Skip if already in a position ──
        if position is not None:
            continue

        # ── Signal evaluation ──
        if adx.iloc[i] < ADX_MINIMUM:
            continue

        bullish_trend = price > ema50.iloc[i] and price > ema200.iloc[i]
        bearish_trend = price < ema50.iloc[i] and price < ema200.iloc[i]
        if not (bullish_trend or bearish_trend):
            continue

        near_ema20 = abs(price - ema20.iloc[i]) <= atr.iloc[i]
        rsi_ok = RSI_LOW <= rsi.iloc[i] <= RSI_HIGH
        if not (near_ema20 and rsi_ok):
            continue

        current_atr = atr.iloc[i]
        sl_dist = current_atr * ATR_SL_MULT
        tp_dist = current_atr * ATR_TP1_MULT

        # Check engulfing pattern
        signal = 0
        if bullish_trend and price > ema20.iloc[i]:
            if is_bullish_engulfing(df['open'], df['close'], i):
                signal = 1
        elif bearish_trend and price < ema20.iloc[i]:
            if is_bearish_engulfing(df['open'], df['close'], i):
                signal = -1

        if signal == 0:
            continue

        # Size position
        risk_amount = balance * RISK_PERCENT
        lot = risk_amount / (sl_dist * 100)
        lot = max(0.01, min(lot, 0.50))
        lot = round(lot, 2)

        if signal == 1:
            position = {
                'direction': 'BUY', 'entry': price,
                'sl': price - sl_dist, 'tp': price + tp_dist,
                'lot': lot, 'atr': current_atr,
                'time': df['time'].iloc[i],
            }
        else:
            position = {
                'direction': 'SELL', 'entry': price,
                'sl': price + sl_dist, 'tp': price - tp_dist,
                'lot': lot, 'atr': current_atr,
                'time': df['time'].iloc[i],
            }

    # Close any remaining position at last price
    if position is not None:
        last_price = df['close'].iloc[-1]
        if position['direction'] == 'BUY':
            pnl = (last_price - position['entry']) * position['lot'] * 100
        else:
            pnl = (position['entry'] - last_price) * position['lot'] * 100
        balance += pnl
        trades.append({**position, 'exit': last_price, 'pnl': pnl, 'reason': 'EOD'})

    return _calculate_metrics(trades, initial_balance, balance)


def _calculate_metrics(trades: list, initial_balance: float, final_balance: float) -> dict:
    """Calculate backtest performance metrics."""
    if not trades:
        return {
            'total_trades': 0, 'wins': 0, 'losses': 0,
            'win_rate': 0, 'total_pnl': 0, 'profit_factor': 0,
            'max_drawdown_pct': 0, 'final_balance': initial_balance,
        }

    wins = [t for t in trades if t['pnl'] > 0]
    losses = [t for t in trades if t['pnl'] <= 0]

    gross_profit = sum(t['pnl'] for t in wins) if wins else 0
    gross_loss = abs(sum(t['pnl'] for t in losses)) if losses else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

    # Calculate max drawdown
    equity_curve = [initial_balance]
    for t in trades:
        equity_curve.append(equity_curve[-1] + t['pnl'])
    peak = initial_balance
    max_dd = 0
    for eq in equity_curve:
        peak = max(peak, eq)
        dd = (peak - eq) / peak if peak > 0 else 0
        max_dd = max(max_dd, dd)

    return {
        'total_trades': len(trades),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': len(wins) / len(trades) * 100 if trades else 0,
        'total_pnl': sum(t['pnl'] for t in trades),
        'avg_pnl': sum(t['pnl'] for t in trades) / len(trades),
        'avg_win': gross_profit / len(wins) if wins else 0,
        'avg_loss': -gross_loss / len(losses) if losses else 0,
        'profit_factor': profit_factor,
        'max_drawdown_pct': max_dd * 100,
        'final_balance': final_balance,
        'return_pct': (final_balance - initial_balance) / initial_balance * 100,
    }


# ══════════════════════════════════════════
# DATABASE COMPARISON
# ══════════════════════════════════════════

def get_live_performance() -> dict:
    """Pull live trading stats from PostgreSQL for comparison."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT
                    COUNT(*) as total,
                    COALESCE(SUM(CASE WHEN pnl_usd > 0 THEN 1 ELSE 0 END), 0) as wins,
                    COALESCE(SUM(CASE WHEN pnl_usd <= 0 AND status='CLOSED' THEN 1 ELSE 0 END), 0) as losses,
                    COALESCE(SUM(pnl_usd), 0) as gross_pnl,
                    COALESCE(AVG(CASE WHEN pnl_usd IS NOT NULL THEN pnl_usd END), 0) as avg_pnl
                FROM trades WHERE status = 'CLOSED'
                AND timestamp >= NOW() - INTERVAL '7 days'
            """)
            row = cur.fetchone()
            if row:
                return {
                    'total': row[0], 'wins': row[1], 'losses': row[2],
                    'gross_pnl': float(row[3]), 'avg_pnl': float(row[4]),
                }
    except Exception as e:
        log.error(f"Failed to get live stats: {e}")
    return {'total': 0, 'wins': 0, 'losses': 0, 'gross_pnl': 0, 'avg_pnl': 0}


# ══════════════════════════════════════════
# TELEGRAM REPORT
# ══════════════════════════════════════════

def send_backtest_report(metrics: dict, live_stats: dict):
    """Send backtest + live comparison report via Telegram."""
    token = os.getenv('TELEGRAM_BOT_TOKEN', '')
    chat_id = os.getenv('TELEGRAM_CHAT_ID', '')
    if not token or not chat_id:
        log.warning("Telegram not configured — skipping report")
        return

    pnl = metrics.get('total_pnl', 0)
    emoji = "📈" if pnl >= 0 else "📉"

    text = (
        f"{emoji} <b>DAILY BACKTEST REPORT</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Backtest (30-day replay)</b>\n"
        f"Trades: {metrics.get('total_trades', 0)}\n"
        f"Win Rate: {metrics.get('win_rate', 0):.0f}%\n"
        f"P&L: ${pnl:+.2f}\n"
        f"Profit Factor: {metrics.get('profit_factor', 0):.2f}\n"
        f"Max Drawdown: {metrics.get('max_drawdown_pct', 0):.1f}%\n"
        f"Avg Win: ${metrics.get('avg_win', 0):+.2f}\n"
        f"Avg Loss: ${metrics.get('avg_loss', 0):+.2f}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Live (last 7 days)</b>\n"
        f"Trades: {live_stats.get('total', 0)}\n"
        f"P&L: ${live_stats.get('gross_pnl', 0):+.2f}\n"
        f"Avg P&L: ${live_stats.get('avg_pnl', 0):+.2f}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📅 {datetime.now().strftime('%A, %d %B %Y')}"
    )

    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'},
            timeout=10,
        )
        log.info("Backtest report sent to Telegram")
    except Exception as e:
        log.error(f"Failed to send Telegram report: {e}")


# ══════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════

def main():
    log.info("Starting daily backtest...")

    # Fetch data
    df = fetch_gold_data(days=30)
    if df is None or len(df) < 250:
        log.warning("Not enough market data for backtest — skipping")
        return

    log.info(f"Data loaded: {len(df)} candles from {df['time'].iloc[0]} to {df['time'].iloc[-1]}")

    # Run backtest
    metrics = run_backtest(df)
    if 'error' in metrics:
        log.error(f"Backtest failed: {metrics['error']}")
        return

    log.info(f"Backtest complete: {metrics['total_trades']} trades | "
             f"Win rate: {metrics['win_rate']:.0f}% | P&L: ${metrics['total_pnl']:+.2f}")

    # Get live comparison
    live = get_live_performance()

    # Send report
    send_backtest_report(metrics, live)

    log.info("Daily backtest finished")


if __name__ == '__main__':
    main()

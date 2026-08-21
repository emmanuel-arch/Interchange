"""
GoldStrike v2.1 — Configuration
All strategy constants and environment-loaded secrets.

CHANGELOG v2.1 (2026-04-12):
  - ADX_MINIMUM: 22 → 18 (gold rarely sustains >25 on M15 in current market)
  - ATR_SL_MULT: 1.5 → 1.0 (tighter SL = smaller losses, critical for FTMO)
  - ATR_TP1_MULT: 1.5 → 2.0 (let winners run to 2x ATR before partial close)
  - ATR_TP2_MULT: 2.5 → 3.5 (trail remaining 40% toward 3.5x ATR)
  - ATR_BREAKEVEN_TRIGGER: 0.7 → 1.0 (delay breakeven — 0.7 was chopping winners)
  - PARTIAL_CLOSE_PCT: 0.60 → 0.50 (keep more size for the runner)
  - MAX_EXTENSION_ATR: 3.5 → REMOVED (was blocking 55% of trend entries)
  - EMA20_SLOPE_BARS: 3 → 3 (kept, but logic softened in engine to allow flat)
  - MOMENTUM_BODY_ATR_PCT: NEW 0.30 (was hardcoded 0.40, too strict for M1 gold)
  - MOMENTUM_BODY_RATIO: NEW 0.55 (was hardcoded 0.60, slightly relaxed)
  - RISK_PERCENT: 0.015 → 0.01 (1% risk for FTMO safety margin)
  - MAX_DRAWDOWN_PCT: 0.08 → 0.04 (FTMO max daily is 5%, we buffer at 4%)
  - MAX_DAILY_LOSS_PCT: 0.04 → 0.03 (tighter daily loss cap for FTMO)
  - MAX_WEEKLY_LOSS_PCT: 0.06 → 0.08 (FTMO overall max is 10%, buffer at 8%)
  - ADX_MIXED_MINIMUM: NEW 15 (allow MIXED trend trades when ADX shows some direction)
  - ALLOW_MIXED_TREND: NEW True (trade pattern direction when trend is MIXED)
"""

import os
from pathlib import Path 
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent / '.env')

# ══════════════════════════════════════════
# MT5 CONNECTION
# ══════════════════════════════════════════
MT5_LOGIN = int(os.getenv('MT5_LOGIN', '0'))
MT5_PASSWORD = os.getenv('MT5_PASSWORD', '')
MT5_SERVER = os.getenv('MT5_SERVER', '')

# ══════════════════════════════════════════
# SYMBOL
# ══════════════════════════════════════════
SYMBOL = os.getenv('TRADE_SYMBOL', 'XAUUSDc')

# ══════════════════════════════════════════
# STRATEGY PARAMETERS
# ══════════════════════════════════════════
MAGIC_NUMBER = 202600
RISK_PERCENT = 0.005          # 0.5% per trade (FTMO-safe: max ~2 losses before daily limit)
ATR_SL_MULT = 1.0            # SL = ATR × 1.0 (tighter: ~7 pts gold → ~$7/0.1 lot)
ATR_TP1_MULT = 2.0           # TP1 = ATR × 2.0 (close 50%) — wider: let winners breathe
ATR_TP2_MULT = 3.5           # TP2 = ATR × 3.5 (trail remaining 50%) — capture big moves
ATR_TRAIL_MULT = 1.0         # Trailing stop = ATR × 1.0
ATR_BREAKEVEN_TRIGGER = 1.0  # Move SL to breakeven when profit >= 1.0 × ATR (was 0.7)
ATR_BREAKEVEN_MULT = 0.5     # Move SL to entry + 0.5 ATR after TP1
PARTIAL_CLOSE_PCT = 0.50     # Close 50% at TP1 (keep more for the runner)

# ══════════════════════════════════════════
# SIGNAL QUALITY FILTERS (v2.1)
# ══════════════════════════════════════════
EMA20_SLOPE_BARS = 3          # Check EMA20 direction over last N M5 candles
EMA20_SLOPE_TOLERANCE = 0.5   # Allow flat slopes (abs(slope) < 0.5 = "flat" = OK)
# MAX_EXTENSION_ATR — REMOVED in v2.1 (was blocking 55% of trend entries)
TRADE_COOLDOWN_SECONDS = 600  # 10 min cooldown after any trade closes before re-entry

# ══════════════════════════════════════════
# CANDLE PATTERN SETTINGS (v2.1 — tunable)
# ══════════════════════════════════════════
MOMENTUM_BODY_ATR_PCT = 0.30  # Momentum candle body >= 30% of M1 ATR (was 0.40)
MOMENTUM_BODY_RATIO = 0.55    # Body >= 55% of candle range (was 0.60)

# ══════════════════════════════════════════
# INDICATOR SETTINGS
# ══════════════════════════════════════════
EMA_FAST = 50                # M15 medium trend
EMA_SLOW = 200               # M15 major trend
EMA_PULLBACK = 20            # M5 pullback zone
RSI_PERIOD = 14
ATR_PERIOD = 14
ADX_PERIOD = 14
ADX_MINIMUM = 18             # Minimum trend strength (lowered: gold choppy, 25 killed all trades)
RSI_LOW = 40                 # RSI neutral zone lower
RSI_HIGH = 65                # RSI neutral zone upper (widened for gold trends)

# ══════════════════════════════════════════
# MIXED TREND TRADING (v2.1 — NEW)
# ══════════════════════════════════════════
ALLOW_MIXED_TREND = True      # Allow trades when M15 trend is MIXED
ADX_MIXED_MINIMUM = 18        # Minimum ADX for MIXED trend trades (some directional movement)
MIN_SIGNAL_REVERSAL_SECONDS = 900  # 15 minutes anti-whipsaw (opposite signal after open)

# ══════════════════════════════════════════
# RISK MANAGEMENT — THE FORTRESS (FTMO-tuned)
# ══════════════════════════════════════════
MAX_SPREAD_PRICE = 0.40      # Max spread in USD
MAX_DAILY_LOSS_PCT = 0.0025    # 0.25% max daily loss (FTMO allows 5%, we buffer)
MAX_WEEKLY_LOSS_PCT = 0.08   # 8% max weekly loss (FTMO allows 10%, we buffer)
MAX_DRAWDOWN_PCT = 0.04      # 4% max drawdown trigger (FTMO daily limit is 5%)
MAX_TRADES_PER_DAY = 3       # Quality over quantity
MAX_OPEN_TRADES = 1          # No simultaneous hedging
MAX_LOT = 0.10               # Hard cap on lot size
MIN_LOT = 0.01               # Minimum lot size

# ══════════════════════════════════════════
# TRADING SESSIONS (EAT / GMT+3)
# ══════════════════════════════════════════
LONDON_START = 10             # 10:00 AM EAT
LONDON_END = 13              # 1:00 PM EAT
NY_OVERLAP_START = 15         # 3:00 PM EAT
NY_OVERLAP_END = 18           # 6:00 PM EAT
NY_CONT_START = 18            # 6:00 PM EAT
NY_CONT_END = 20              # 8:00 PM EAT
FRIDAY_CUTOFF_HOUR = 15       # Close all by 3:00 PM Friday

# ══════════════════════════════════════════
# TELEGRAM
# ══════════════════════════════════════════
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')

# ══════════════════════════════════════════
# SERVER
# ══════════════════════════════════════════
SERVER_URL = os.getenv('SERVER_URL', 'http://45.150.190.19:5000')
SERVER_API_KEY = os.getenv('SERVER_API_KEY', '')

# ══════════════════════════════════════════
# POSTGRESQL DATABASE
# ══════════════════════════════════════════
DATABASE_URL = os.getenv('DATABASE_URL', '')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')

# ══════════════════════════════════════════
# TRADING MODE
# ══════════════════════════════════════════
TRADING_MODE = os.getenv('TRADING_MODE', 'LIVE')

# ══════════════════════════════════════════
# PATHS
# ══════════════════════════════════════════
BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / 'logs'
DB_PATH = BASE_DIR / 'goldstrike_trades.db'
LOG_DIR.mkdir(exist_ok=True)
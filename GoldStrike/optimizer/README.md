# GoldStrike v3.0 — Optimization Framework

## Overview

This framework backtests and optimizes the GoldStrike trading engine against
historical gold (XAUUSDc) data. It mirrors the live engine logic exactly and
runs walk-forward validation to prevent overfitting.

## Files

```
goldstrike_optimizer/
├── indicators.py       # Technical indicators (EMA, RSI, ATR, ADX, patterns)
├── backtester.py       # Core backtester engine (mirrors goldstrike_engine.py)
├── run_optimizer.py    # Grid search optimization with walk-forward validation
├── run_single.py       # Run a single backtest with specific parameters
└── README.md           # This file
```

## Setup

### Requirements
```bash
pip install pandas numpy
```

### Data Files
Place your exported CSV files in the same directory (or specify --data-dir):
- `XAUUSDc_M1_2025-10-15_2026-04-13.csv`
- `XAUUSDc_M5_2025-10-15_2026-04-13.csv`
- `XAUUSDc_M15_2025-10-15_2026-04-13.csv`

Each CSV must have columns: `time, open, high, low, close, volume`

### Exporting Data from MT5 (if not already done)
```python
import MetaTrader5 as mt5
import pandas as pd
from datetime import datetime

mt5.initialize()

for tf_name, tf in [('M1', mt5.TIMEFRAME_M1), ('M5', mt5.TIMEFRAME_M5), ('M15', mt5.TIMEFRAME_M15)]:
    rates = mt5.copy_rates_range('XAUUSDc', tf,
        datetime(2025, 10, 15), datetime(2026, 4, 14))
    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s', utc=True)
    df.to_csv(f'XAUUSDc_{tf_name}.csv', index=False)
    print(f'{tf_name}: {len(df)} candles saved')

mt5.shutdown()
```

## Usage

### 1. Quick Test (36 combinations, ~15-30 min)
```bash
python run_optimizer.py --data-dir . --quick
```

### 2. Standard Optimization (324 combinations, ~2-4 hours)
```bash
python run_optimizer.py --data-dir .
```

### 3. Extended Search (2592 combinations, ~12-24 hours)
```bash
python run_optimizer.py --data-dir . --extended
```

### 4. Compare v2.1 vs v3.0
```bash
# v2.1 (broken MIXED mode)
python run_single.py --data-dir . --v21

# v3.0 (slope-gated MIXED mode)
python run_single.py --data-dir .
```

### 5. Custom Starting Balance
```bash
python run_optimizer.py --data-dir . --balance 100000  # FTMO $100K
python run_optimizer.py --data-dir . --balance 534.70  # Current Exness balance
```

## Parameter Grid (Standard: 324 combinations)

| Parameter            | Values Tested      | What It Controls                     |
|----------------------|--------------------|--------------------------------------|
| ADX_MINIMUM          | 16, 18, 20, 22     | Min trend strength for clear trades  |
| ADX_MIXED_MINIMUM    | 16, 18, 20         | Min trend strength for MIXED trades  |
| ATR_SL_MULT          | 0.8, 1.0, 1.2      | Stop loss width (ATR multiples)      |
| ATR_TP1_MULT         | 1.5, 2.0, 2.5      | Take profit width (ATR multiples)    |
| MOMENTUM_BODY_ATR_PCT| 0.25, 0.30, 0.35   | M1 candle body threshold             |
| SLOPE_GATE_MIXED     | True                | v3.0 slope direction gate (always on)|

## Walk-Forward Validation

The framework splits data 75% train / 25% test:
- **Train**: Optimize parameters on first 75% of data
- **Test**: Validate top 10 performers on unseen last 25%
- This prevents overfitting to specific market conditions

## Output Files

- `optimization_results.csv` — All combination results with scores
- `trade_log.csv` — Individual trade records (from run_single.py)
- `equity_curve.csv` — Balance over time (from run_single.py)

## FTMO Compliance Checks

The backtester automatically checks:
- ✓ Max daily loss < 5% (buffer: 2.5%)
- ✓ Max overall drawdown < 10% (buffer: 4%)
- ✓ Profit target >= 10%
- ✓ Minimum 4 trading days

## Key v3.0 Changes Tested

1. **Slope-gated MIXED trading**: In MIXED mode, only BUY when EMA20 slope > 0,
   only SELL when slope < 0. This is the critical fix from April 13 analysis.
2. **Higher ADX minimum for MIXED**: 18 instead of 15.
3. **Single position**: MAX_OPEN_TRADES = 1.
4. **Anti-whipsaw**: 15-minute minimum between opposing signals.
5. **Tighter risk**: 0.5% per trade, 2.5% daily limit, 3 trades/day max.

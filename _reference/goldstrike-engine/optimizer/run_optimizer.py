"""
GoldStrike v3.0 — Optimization Framework
Grid search + walk-forward validation over 486 parameter combinations.

Usage:
    python run_optimizer.py

This will:
1. Load 6 months of M1/M5/M15 data
2. Split into train (first 75%) and test (last 25%) for walk-forward
3. Run 486 parameter combinations on the train set
4. Re-test top 10 performers on the test set
5. Output results to CSV + console summary

Estimated runtime: 2-6 hours depending on your machine.
Use run_optimizer.py --quick for a fast 54-combination subset.
"""

import sys
import os
import time
import itertools
import pandas as pd
import numpy as np
from datetime import datetime
from dataclasses import asdict
from copy import deepcopy

# Add parent dir for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backtester import GoldStrikeBacktester, BacktestConfig

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass


# ═══════════════════════════════════════════
# PARAMETER GRID
# ═══════════════════════════════════════════

PARAM_GRID = {
    # Trend strength
    'ADX_MINIMUM':          [16, 18, 20, 22],
    'ADX_MIXED_MINIMUM':    [16, 18, 20],

    # Stop loss / Take profit (ATR multiples)
    'ATR_SL_MULT':          [0.8, 1.0, 1.2],
    'ATR_TP1_MULT':         [1.5, 2.0, 2.5],

    # Candle pattern sensitivity
    'MOMENTUM_BODY_ATR_PCT': [0.25, 0.30, 0.35],

    # v3.0 slope gate (always True in this optimization)
    'SLOPE_GATE_MIXED':     [True],
}
# Total combinations: 4 × 3 × 3 × 3 × 3 × 1 = 324

PARAM_GRID_EXTENDED = {
    **PARAM_GRID,
    # Additional params for extended search
    'RSI_HIGH':             [60, 65],
    'EMA20_SLOPE_TOLERANCE': [0.3, 0.5],
    'TRADE_COOLDOWN_SECONDS': [300, 600],
}
# Extended: 324 × 2 × 2 × 2 = 2592 (use --extended flag)

PARAM_GRID_QUICK = {
    'ADX_MINIMUM':          [18, 22],
    'ADX_MIXED_MINIMUM':    [18],
    'ATR_SL_MULT':          [0.8, 1.0, 1.2],
    'ATR_TP1_MULT':         [1.5, 2.0, 2.5],
    'MOMENTUM_BODY_ATR_PCT': [0.25, 0.30],
    'SLOPE_GATE_MIXED':     [True],
}
# Quick: 2 × 1 × 3 × 3 × 2 × 1 = 36

PARAM_GRID_FOCUSED = {
    # Smaller, hypothesis-driven search around the strongest train cluster.
    'ADX_MINIMUM': [20, 22],
    'ADX_MIXED_MINIMUM': [18, 20],
    'ATR_SL_MULT': [0.8, 1.0],
    'ATR_TP1_MULT': [1.5, 2.0],
    'MOMENTUM_BODY_ATR_PCT': [0.25, 0.30, 0.35],
    'SLOPE_GATE_MIXED': [True],
}
# Focused: 2 × 2 × 2 × 2 × 3 × 1 = 48

BASELINE_V30 = {
    'ADX_MINIMUM': 22,
    'ADX_MIXED_MINIMUM': 20,
    'ATR_SL_MULT': 1.0,
    'ATR_TP1_MULT': 1.5,
    'MOMENTUM_BODY_ATR_PCT': 0.30,
    'SLOPE_GATE_MIXED': True,
    # Regime / realism toggles
    'SESSION_MODE': 'baseline',
    'USE_NEWS_BLACKOUT': True,
    'USE_ATR_REGIME_FILTER': True,
    'ATR_MIN_FILTER': 0.6,
    'ATR_MAX_FILTER': 12.0,
    'ENTRY_SLIPPAGE_PCT_ATR': 0.03,
    'EXIT_SLIPPAGE_PCT_ATR': 0.03,
}


def generate_combinations(grid: dict) -> list[dict]:
    """Generate all parameter combinations from a grid."""
    keys = list(grid.keys())
    values = list(grid.values())
    combos = []
    for combo in itertools.product(*values):
        combos.append(dict(zip(keys, combo)))
    return combos


# ═══════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════

def load_data(data_dir: str = '.') -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Load M1, M5, M15 CSV data files.
    Searches for files matching the pattern XAUUSDc_M*_*.csv
    """
    m1_file = m5_file = m15_file = None

    for f in os.listdir(data_dir):
        fl = f.lower()
        if 'xauusd' in fl and '_m1_' in fl and fl.endswith('.csv'):
            m1_file = os.path.join(data_dir, f)
        elif 'xauusd' in fl and '_m5_' in fl and fl.endswith('.csv'):
            m5_file = os.path.join(data_dir, f)
        elif 'xauusd' in fl and '_m15_' in fl and fl.endswith('.csv'):
            m15_file = os.path.join(data_dir, f)

    if not all([m1_file, m5_file, m15_file]):
        # Try common names
        candidates = {
            'm1': ['XAUUSDc_M1.csv', 'xauusd_m1.csv', 'M1.csv'],
            'm5': ['XAUUSDc_M5.csv', 'xauusd_m5.csv', 'M5.csv'],
            'm15': ['XAUUSDc_M15.csv', 'xauusd_m15.csv', 'M15.csv'],
        }
        for tf, names in candidates.items():
            for name in names:
                path = os.path.join(data_dir, name)
                if os.path.exists(path):
                    if tf == 'm1': m1_file = path
                    elif tf == 'm5': m5_file = path
                    elif tf == 'm15': m15_file = path

    missing = []
    if not m1_file: missing.append('M1')
    if not m5_file: missing.append('M5')
    if not m15_file: missing.append('M15')
    if missing:
        print(f"\n❌ Missing data files: {', '.join(missing)}")
        print(f"   Searched in: {os.path.abspath(data_dir)}")
        print(f"   Expected files like: XAUUSDc_M1_*.csv, XAUUSDc_M5_*.csv, XAUUSDc_M15_*.csv")
        print(f"\n   To export from MT5, use this Python script:")
        print(f"   ─────────────────────────────────────────────")
        print(f"   import MetaTrader5 as mt5")
        print(f"   from datetime import datetime")
        print(f"   mt5.initialize()")
        print(f"   rates = mt5.copy_rates_range('XAUUSDc', mt5.TIMEFRAME_M1,")
        print(f"       datetime(2025, 10, 15), datetime(2026, 4, 14))")
        print(f"   pd.DataFrame(rates).to_csv('XAUUSDc_M1.csv', index=False)")
        sys.exit(1)

    print(f"Loading data...")
    print(f"  M1:  {m1_file}")
    print(f"  M5:  {m5_file}")
    print(f"  M15: {m15_file}")

    m1 = pd.read_csv(m1_file)
    m5 = pd.read_csv(m5_file)
    m15 = pd.read_csv(m15_file)

    print(f"  M1:  {len(m1):,} candles")
    print(f"  M5:  {len(m5):,} candles")
    print(f"  M15: {len(m15):,} candles")

    return m1, m5, m15


def split_walk_forward(m1: pd.DataFrame, m5: pd.DataFrame, m15: pd.DataFrame,
                       train_pct: float = 0.75) -> tuple:
    """
    Split data into train and test sets for walk-forward validation.
    Returns: (m1_train, m5_train, m15_train, m1_test, m5_test, m15_test)
    """
    m1['time'] = pd.to_datetime(m1['time'], utc=True)
    m5['time'] = pd.to_datetime(m5['time'], utc=True)
    m15['time'] = pd.to_datetime(m15['time'], utc=True)

    # Find the split point
    split_time = m1['time'].quantile(train_pct)
    print(f"\nWalk-forward split at: {split_time}")
    print(f"  Train: {m1['time'].min()} → {split_time}")
    print(f"  Test:  {split_time} → {m1['time'].max()}")

    m1_train = m1[m1['time'] <= split_time].copy()
    m1_test = m1[m1['time'] > split_time].copy()

    # For M5/M15, include some lookback before test start for indicator warmup
    lookback_time = split_time - pd.Timedelta(days=7)
    m5_train = m5[m5['time'] <= split_time].copy()
    m5_test = m5[m5['time'] > lookback_time].copy()
    m15_train = m15[m15['time'] <= split_time].copy()
    m15_test = m15[m15['time'] > lookback_time].copy()

    print(f"  M1 train: {len(m1_train):,} | M1 test: {len(m1_test):,}")

    return m1_train, m5_train, m15_train, m1_test, m5_test, m15_test


def build_purged_rolling_splits(
    m1: pd.DataFrame,
    m5: pd.DataFrame,
    m15: pd.DataFrame,
    n_splits: int = 3,
    train_pct: float = 0.60,
    test_pct: float = 0.20,
    purge_days: int = 2,
) -> list[tuple]:
    """
    Build purged rolling train/test windows (walk-forward with leakage buffer).
    Each element returns:
    (m1_train, m5_train, m15_train, m1_test, m5_test, m15_test, split_label)
    """
    m1 = m1.copy()
    m5 = m5.copy()
    m15 = m15.copy()
    m1['time'] = pd.to_datetime(m1['time'], utc=True)
    m5['time'] = pd.to_datetime(m5['time'], utc=True)
    m15['time'] = pd.to_datetime(m15['time'], utc=True)

    t_min = m1['time'].min()
    t_max = m1['time'].max()
    total_sec = (t_max - t_min).total_seconds()
    if total_sec <= 0:
        return []

    train_sec = total_sec * train_pct
    test_sec = total_sec * test_pct
    if train_sec <= 0 or test_sec <= 0:
        return []

    step_sec = max((total_sec - train_sec - test_sec) / max(1, n_splits - 1), 0)
    purge_delta = pd.Timedelta(days=purge_days)

    splits = []
    for i in range(n_splits):
        train_start = t_min + pd.Timedelta(seconds=i * step_sec)
        train_end = train_start + pd.Timedelta(seconds=train_sec)
        test_start = train_end + purge_delta
        test_end = test_start + pd.Timedelta(seconds=test_sec)
        if test_end > t_max:
            break

        m1_train = m1[(m1['time'] >= train_start) & (m1['time'] <= train_end)].copy()
        m1_test = m1[(m1['time'] >= test_start) & (m1['time'] <= test_end)].copy()
        if len(m1_train) < 5000 or len(m1_test) < 2000:
            continue

        # warmup for indicators
        lookback_train = train_start - pd.Timedelta(days=7)
        lookback_test = test_start - pd.Timedelta(days=7)
        m5_train = m5[(m5['time'] >= lookback_train) & (m5['time'] <= train_end)].copy()
        m15_train = m15[(m15['time'] >= lookback_train) & (m15['time'] <= train_end)].copy()
        m5_test = m5[(m5['time'] >= lookback_test) & (m5['time'] <= test_end)].copy()
        m15_test = m15[(m15['time'] >= lookback_test) & (m15['time'] <= test_end)].copy()

        label = (f"split_{i+1}: train[{train_start.date()}..{train_end.date()}] "
                 f"test[{test_start.date()}..{test_end.date()}]")
        splits.append((m1_train, m5_train, m15_train, m1_test, m5_test, m15_test, label))

    print(f"\nPurged rolling splits built: {len(splits)} (purge={purge_days}d)")
    for _, _, _, m1t, _, _, label in splits:
        print(f"  - {label} | test candles={len(m1t):,}")
    return splits


# ═══════════════════════════════════════════
# OPTIMIZATION RUNNER
# ═══════════════════════════════════════════

def run_single_backtest(params: dict, m1: pd.DataFrame, m5: pd.DataFrame,
                        m15: pd.DataFrame, label: str = "") -> dict:
    """Run a single backtest with given parameters. Returns results dict."""
    cfg = BacktestConfig()
    for key, val in params.items():
        if hasattr(cfg, key):
            setattr(cfg, key, val)

    bt = GoldStrikeBacktester(cfg)
    try:
        results = bt.run(m1.copy(), m5.copy(), m15.copy())
    except Exception as e:
        results = {'total_trades': 0, 'error': str(e)}

    results['params'] = params
    results['label'] = label
    return results


def run_optimization(grid: dict, splits: list[tuple], baseline: dict) -> pd.DataFrame:
    """
    Evaluate parameter combinations over purged rolling splits.
    Ranking is out-of-sample centric with a stability penalty.
    """
    combos = generate_combinations(grid)
    total = len(combos)
    print(f"\n{'='*80}")
    print(f"  GOLDSTRIKE v3.0 OPTIMIZATION (OOS ROBUSTNESS MODE)")
    print(f"  {total} combinations × {len(splits)} rolling splits")
    print(f"{'='*80}\n")

    rows: list[dict] = []
    started = time.time()

    for i, params in enumerate(combos):
        cfg = deepcopy(baseline)
        cfg.update(params)
        split_stats = []
        for split in splits:
            m1_train, m5_train, m15_train, m1_test, m5_test, m15_test, label = split
            tr = run_single_backtest(cfg, m1_train, m5_train, m15_train, label=f"train_{label}")
            te = run_single_backtest(cfg, m1_test, m5_test, m15_test, label=f"test_{label}")
            split_stats.append((tr, te))

        test_pf = np.array([s[1].get('profit_factor', 0.0) for s in split_stats], dtype=float)
        test_ret = np.array([s[1].get('total_return_pct', -999.0) for s in split_stats], dtype=float)
        test_dd = np.array([s[1].get('max_drawdown_pct', 99.0) for s in split_stats], dtype=float)
        test_trades = np.array([s[1].get('total_trades', 0) for s in split_stats], dtype=float)
        test_ftmo = np.array([
            (s[1].get('ftmo_daily_pass', False) and s[1].get('ftmo_drawdown_pass', False))
            for s in split_stats
        ], dtype=bool)

        train_pf = float(np.mean([s[0].get('profit_factor', 0.0) for s in split_stats]))
        train_ret = float(np.mean([s[0].get('total_return_pct', 0.0) for s in split_stats]))

        mean_test_pf = float(np.mean(test_pf))
        mean_test_ret = float(np.mean(test_ret))
        mean_test_dd = float(np.mean(test_dd))
        mean_test_trades = float(np.mean(test_trades))
        ftmo_pass_rate = float(np.mean(test_ftmo)) if len(test_ftmo) else 0.0

        # Penalize fragile parameter sets (high fold variance)
        sensitivity = float(np.std(test_pf) + 0.25 * np.std(test_ret))
        score = (mean_test_pf * 12.0) + (mean_test_ret * 0.8) - (mean_test_dd * 2.0) \
                + (min(mean_test_trades, 200) * 0.01) + (ftmo_pass_rate * 2.0) \
                - (sensitivity * 3.0)

        if mean_test_trades < 20 or ftmo_pass_rate < 0.66:
            score -= 15.0

        row = {
            'label': f'combo_{i+1}',
            'score': score,
            'oos_profit_factor': mean_test_pf,
            'oos_return_pct': mean_test_ret,
            'oos_max_drawdown_pct': mean_test_dd,
            'oos_avg_trades': mean_test_trades,
            'oos_ftmo_pass_rate': ftmo_pass_rate,
            'oos_sensitivity': sensitivity,
            'train_profit_factor': train_pf,
            'train_return_pct': train_ret,
            **cfg,
        }
        rows.append(row)

        elapsed = time.time() - started
        rate = elapsed / (i + 1)
        eta = rate * (total - (i + 1)) / 60
        print(f"\r  [{i+1}/{total}] ETA: {eta:.0f} min | "
              f"OOS PF={mean_test_pf:.2f} Ret={mean_test_ret:+.2f}% "
              f"DD={mean_test_dd:.2f}% Score={score:.2f}", end="", flush=True)

    print("\n")
    df = pd.DataFrame(rows).sort_values('score', ascending=False).reset_index(drop=True)

    print("═══ TOP 20 ROBUST RESULTS (RANKED BY OOS SCORE) ═══\n")
    print(f"  {'Rank':<5} {'OOS PF':<8} {'OOS Ret':<9} {'OOS DD':<8} {'FTMO%':<7} "
          f"{'Sens':<7} {'Score':<8} {'Key Params'}")
    print(f"  {'─'*110}")
    for i, r in df.head(20).iterrows():
        key_params = (f"ADX={int(r.get('ADX_MINIMUM',0))} "
                      f"MxADX={int(r.get('ADX_MIXED_MINIMUM',0))} "
                      f"SL={r.get('ATR_SL_MULT',0):.1f} "
                      f"TP={r.get('ATR_TP1_MULT',0):.1f} "
                      f"Mom={r.get('MOMENTUM_BODY_ATR_PCT',0):.2f} "
                      f"Sess={r.get('SESSION_MODE','?')}")
        print(f"  {i+1:<5} {r['oos_profit_factor']:<8.2f} {r['oos_return_pct']:<9.2f} "
              f"{r['oos_max_drawdown_pct']:<8.2f} {r['oos_ftmo_pass_rate']*100:<7.0f} "
              f"{r['oos_sensitivity']:<7.2f} {r['score']:<8.2f} {key_params}")
    return df


# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════

def main():
    import argparse
    parser = argparse.ArgumentParser(description='GoldStrike v3.0 Optimizer')
    parser.add_argument('--data-dir', default='.', help='Directory with CSV data files')
    parser.add_argument('--quick', action='store_true', help='Run quick 36-combination test')
    parser.add_argument('--extended', action='store_true', help='Run extended 2592-combination search')
    parser.add_argument('--focused', action='store_true', help='Run focused 48-combination search (default)')
    parser.add_argument('--baseline-only', action='store_true', help='Run only frozen baseline config')
    parser.add_argument('--output', default='optimization_results.csv', help='Output CSV file')
    parser.add_argument('--train-pct', type=float, default=0.75, help='Train/test split ratio')
    parser.add_argument('--rolling-splits', type=int, default=3, help='Purged rolling split count')
    parser.add_argument('--test-pct', type=float, default=0.20, help='Per-split OOS window ratio')
    parser.add_argument('--purge-days', type=int, default=2, help='Purge gap between train and test')
    parser.add_argument('--balance', type=float, default=100000, help='Starting balance')
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════════════╗
║     GOLDSTRIKE v3.0 OPTIMIZATION FRAMEWORK   ║
║     Walk-Forward Parameter Optimization       ║
╚══════════════════════════════════════════════╝
    """)

    # Select grid
    if args.baseline_only:
        grid = {'BASELINE_ONLY': [True]}
        print("Mode: BASELINE ONLY (1 frozen configuration)")
    elif args.quick:
        grid = PARAM_GRID_QUICK
        print("Mode: QUICK (36 combinations)")
    elif args.extended:
        grid = PARAM_GRID_EXTENDED
        print("Mode: EXTENDED (2592 combinations)")
    else:
        if args.focused:
            grid = PARAM_GRID_FOCUSED
            print("Mode: FOCUSED (48 combinations)")
        else:
            grid = PARAM_GRID_FOCUSED
            print("Mode: DEFAULT FOCUSED (48 combinations)")

    combos = generate_combinations(grid)
    print(f"Total combinations: {len(combos)}")

    baseline = deepcopy(BASELINE_V30)
    baseline['STARTING_BALANCE'] = args.balance

    # Load data
    m1, m5, m15 = load_data(args.data_dir)

    # Build purged rolling splits
    splits = build_purged_rolling_splits(
        m1, m5, m15,
        n_splits=args.rolling_splits,
        train_pct=args.train_pct,
        test_pct=args.test_pct,
        purge_days=args.purge_days,
    )
    if not splits:
        print("❌ Could not build valid rolling splits. Adjust --train-pct/--test-pct.")
        sys.exit(1)

    # Run optimization
    if args.baseline_only:
        results_df = run_optimization({'BASELINE_ONLY': [True]}, splits, baseline)
    else:
        results_df = run_optimization(grid, splits, baseline)

    # Save results
    output_path = args.output
    results_df.to_csv(output_path, index=False)
    print(f"\n✓ Results saved to: {output_path}")
    print(f"  {len(results_df)} rows ({len(combos)} train + up to 10 test)")

    # Print best robust candidate
    if len(results_df) > 0:
        best_params = results_df.sort_values('score', ascending=False).iloc[0]
        print(f"\n  Best score: {best_params.get('score', 'N/A')}")
        print(f"  Best OOS PF:    {best_params.get('oos_profit_factor', 'N/A')}")
        print(f"  Best OOS Return:{best_params.get('oos_return_pct', 'N/A')}%")
        print(f"  FTMO pass rate: {best_params.get('oos_ftmo_pass_rate', 0)*100:.0f}%")

    print(f"\n{'='*50}")
    print(f"  OPTIMIZATION COMPLETE")
    print(f"{'='*50}\n")


if __name__ == '__main__':
    main()

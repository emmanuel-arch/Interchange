"""
GoldStrike v3.0 — Single Backtest Runner
Run one backtest with specific parameters and get detailed output.

Usage:
    python run_single.py --data-dir /path/to/csv/files
    python run_single.py --data-dir . --v21  # Run with v2.1 (broken) params for comparison
"""

import sys
import os
import argparse
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backtester import GoldStrikeBacktester, BacktestConfig


def main():
    parser = argparse.ArgumentParser(description='GoldStrike Single Backtest')
    parser.add_argument('--data-dir', default='.', help='Directory with CSV data files')
    parser.add_argument('--balance', type=float, default=100000, help='Starting balance')
    parser.add_argument('--v21', action='store_true', help='Use v2.1 (broken) parameters')
    parser.add_argument('--output', default=None, help='Save trade log to CSV')
    args = parser.parse_args()

    # Configure
    if args.v21:
        print("\n═══ Running with v2.1 parameters (MIXED = pattern-led, no slope gate) ═══\n")
        cfg = BacktestConfig(
            STARTING_BALANCE=args.balance,
            ADX_MINIMUM=18,
            ADX_MIXED_MINIMUM=15,
            ATR_SL_MULT=1.0,
            ATR_TP1_MULT=2.0,
            MOMENTUM_BODY_ATR_PCT=0.30,
            MOMENTUM_BODY_RATIO=0.55,
            SLOPE_GATE_MIXED=False,  # v2.1: pattern decides direction
            MAX_TRADES_PER_DAY=5,
            MAX_OPEN_TRADES=2,
            RISK_PERCENT=0.01,
            MAX_DAILY_LOSS_PCT=0.03,
            TRADE_COOLDOWN_SECONDS=300,
            MIN_SIGNAL_REVERSAL_SECONDS=0,  # v2.1: no reversal guard
        )
    else:
        print("\n═══ Running with v3.0 parameters (slope-gated MIXED) ═══\n")
        cfg = BacktestConfig(
            STARTING_BALANCE=args.balance,
            ADX_MINIMUM=18,
            ADX_MIXED_MINIMUM=18,
            ATR_SL_MULT=1.0,
            ATR_TP1_MULT=2.0,
            MOMENTUM_BODY_ATR_PCT=0.30,
            MOMENTUM_BODY_RATIO=0.55,
            SLOPE_GATE_MIXED=True,   # v3.0: slope determines direction
            MAX_TRADES_PER_DAY=3,
            MAX_OPEN_TRADES=1,
            RISK_PERCENT=0.005,
            MAX_DAILY_LOSS_PCT=0.025,
            TRADE_COOLDOWN_SECONDS=600,
            MIN_SIGNAL_REVERSAL_SECONDS=900,
        )

    # Load data
    from run_optimizer import load_data
    m1, m5, m15 = load_data(args.data_dir)

    # Run backtest
    bt = GoldStrikeBacktester(cfg)
    results = bt.run(m1, m5, m15)

    # Print results
    print(f"\n{'='*60}")
    print(f"  BACKTEST RESULTS")
    print(f"{'='*60}\n")

    for key, val in results.items():
        if key in ('params', 'label'):
            continue
        if isinstance(val, float):
            print(f"  {key:<30} {val:>12.2f}")
        elif isinstance(val, bool):
            print(f"  {key:<30} {'✓ PASS' if val else '✗ FAIL':>12}")
        else:
            print(f"  {key:<30} {val:>12}")

    # FTMO summary
    print(f"\n{'='*60}")
    print(f"  FTMO COMPLIANCE CHECK")
    print(f"{'='*60}")
    checks = [
        ('Daily loss < 5%', results.get('ftmo_daily_pass', False)),
        ('Overall drawdown < 10%', results.get('ftmo_drawdown_pass', False)),
        ('Profit target >= 10%', results.get('ftmo_profit_pass', False)),
        ('Min 4 trading days', results.get('ftmo_min_days_pass', False)),
    ]
    all_pass = True
    for label, passed in checks:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {label:<35} {status}")
        if not passed:
            all_pass = False

    print(f"\n  {'★ FTMO CHALLENGE: WOULD PASS ★' if all_pass else '✗ FTMO CHALLENGE: WOULD FAIL'}\n")

    # Save trade log
    if args.output or True:  # always save
        output = args.output or 'trade_log.csv'
        trades_data = []
        for t in bt.trades:
            trades_data.append({
                'entry_time': t.entry_time,
                'exit_time': t.exit_time,
                'direction': 'BUY' if t.direction == 1 else 'SELL',
                'entry_price': t.entry_price,
                'exit_price': t.exit_price,
                'sl': t.sl,
                'tp': t.tp,
                'lot': t.lot,
                'atr': t.atr,
                'pnl': t.pnl,
                'exit_reason': t.exit_reason,
                'max_favorable': t.max_favorable,
                'max_adverse': t.max_adverse,
            })
        df = pd.DataFrame(trades_data)
        df.to_csv(output, index=False)
        print(f"  Trade log saved: {output} ({len(df)} trades)")

    # Save equity curve
    eq_df = pd.DataFrame(bt.equity_curve)
    eq_df.to_csv('equity_curve.csv', index=False)
    print(f"  Equity curve saved: equity_curve.csv")

    # Print last 20 trades
    print(f"\n{'='*60}")
    print(f"  LAST 20 TRADES")
    print(f"{'='*60}")
    print(f"  {'Time':<20} {'Dir':<5} {'Entry':>10} {'Exit':>10} {'P&L':>10} {'Reason':<8}")
    print(f"  {'─'*70}")
    for t in bt.trades[-20:]:
        d = 'BUY' if t.direction == 1 else 'SELL'
        pnl_color = '+' if t.pnl > 0 else ''
        print(f"  {str(t.entry_time)[:16]:<20} {d:<5} "
              f"{t.entry_price:>10.2f} {t.exit_price:>10.2f} "
              f"{pnl_color}{t.pnl:>9.2f} {t.exit_reason:<8}")


if __name__ == '__main__':
    main()

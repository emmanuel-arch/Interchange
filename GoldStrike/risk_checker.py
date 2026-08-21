"""
GoldStrike v2.0 — Risk Checker
The Fortress System — 7 Iron Rules enforced before every trade.
"""

import logging
import MetaTrader5 as mt5
import config

log = logging.getLogger('GoldStrike.Risk')


class RiskChecker:
    """Stateful risk manager that tracks daily/weekly counters and peak balance."""

    def __init__(self):
        self.trades_today = 0
        self.daily_start_balance = 0.0
        self.weekly_start_balance = 0.0
        self.peak_balance = 0.0
        self._daily_loss_triggered = False
        self._weekly_loss_triggered = False
        self._drawdown_triggered = False

    def reset_daily(self, balance: float):
        """Call at the start of each trading day."""
        self.trades_today = 0
        self.daily_start_balance = balance
        self._daily_loss_triggered = False
        log.info(f"Daily reset | Start balance: ${balance:.2f}")

    def reset_weekly(self, balance: float):
        """Call at the start of each trading week (Monday)."""
        self.weekly_start_balance = balance
        self._weekly_loss_triggered = False
        log.info(f"Weekly reset | Start balance: ${balance:.2f}")

    def update_peak(self, balance: float):
        """Track the highest balance for drawdown calculation."""
        if balance > self.peak_balance:
            self.peak_balance = balance

    def record_trade(self):
        """Increment daily trade counter after a successful execution."""
        self.trades_today += 1

    # ── Individual Rule Checks ──────────────────────────────

    def check_daily_loss(self, current_balance: float) -> bool:
        """Rule 2: Max 3% daily loss."""
        if self.daily_start_balance <= 0:
            return True
        daily_pnl_pct = (current_balance - self.daily_start_balance) / self.daily_start_balance
        if daily_pnl_pct <= -config.MAX_DAILY_LOSS_PCT:
            if not self._daily_loss_triggered:
                log.warning(f"DAILY LOSS LIMIT HIT: {daily_pnl_pct:.2%}")
                self._daily_loss_triggered = True
            return False
        return True

    def check_weekly_loss(self, current_balance: float) -> bool:
        """Rule 3: Max 6% weekly loss."""
        if self.weekly_start_balance <= 0:
            return True
        weekly_pnl_pct = (current_balance - self.weekly_start_balance) / self.weekly_start_balance
        if weekly_pnl_pct <= -config.MAX_WEEKLY_LOSS_PCT:
            if not self._weekly_loss_triggered:
                log.warning(f"WEEKLY LOSS LIMIT HIT: {weekly_pnl_pct:.2%}")
                self._weekly_loss_triggered = True
            return False
        return True

    def check_max_drawdown(self, current_balance: float) -> bool:
        """Rule 4: Max 15% drawdown from peak."""
        if self.peak_balance <= 0:
            return True
        drawdown = (self.peak_balance - current_balance) / self.peak_balance
        if drawdown >= config.MAX_DRAWDOWN_PCT:
            if not self._drawdown_triggered:
                log.critical(f"MAX DRAWDOWN BREACHED: {drawdown:.2%} — SYSTEM SHUTDOWN REQUIRED")
                self._drawdown_triggered = True
            return False
        return True

    def check_max_trades(self) -> bool:
        """Rule 6: Max trades per day."""
        if self.trades_today >= config.MAX_TRADES_PER_DAY:
            log.info(f"Max trades reached: {self.trades_today}/{config.MAX_TRADES_PER_DAY}")
            return False
        return True

    def check_open_positions(self) -> bool:
        """Rule 5: Max 2 open positions."""
        positions = mt5.positions_get(symbol=config.SYMBOL)
        if positions is None:
            return True
        our_positions = [p for p in positions if p.magic == config.MAGIC_NUMBER]
        if len(our_positions) >= config.MAX_OPEN_TRADES:
            log.info(f"Max open trades: {len(our_positions)}/{config.MAX_OPEN_TRADES}")
            return False
        return True

    def check_spread(self) -> tuple[bool, float]:
        """Check if current spread is acceptable. Returns (ok, spread_in_usd)."""
        tick = mt5.symbol_info_tick(config.SYMBOL)
        if tick is None:
            return False, 0.0
        spread_price = tick.ask - tick.bid  # Spread in USD — works for cent and standard
        ok = spread_price <= config.MAX_SPREAD_PRICE
        if not ok:
            log.info(f"Spread too wide: ${spread_price:.3f} (max ${config.MAX_SPREAD_PRICE:.2f})")
        return ok, spread_price

    def check_duplicate_direction(self, signal: int) -> bool:
        """No existing open trade in the same direction."""
        positions = mt5.positions_get(symbol=config.SYMBOL)
        if positions is None:
            return True
        for pos in positions:
            if pos.magic != config.MAGIC_NUMBER:
                continue
            # pos.type: 0 = BUY, 1 = SELL
            if signal == 1 and pos.type == 0:
                log.info("Already have a BUY position open")
                return False
            if signal == -1 and pos.type == 1:
                log.info("Already have a SELL position open")
                return False
        return True

    # ── Master Check ────────────────────────────────────────

    def can_trade(self, signal: int) -> tuple[bool, str]:
        """
        Run ALL risk checks before entering a trade.
        Returns (allowed, reason_if_blocked).
        """
        account = mt5.account_info()
        if account is None:
            return False, "Cannot get account info"

        balance = account.balance
        self.update_peak(balance)

        # Rule 2: Daily loss
        if not self.check_daily_loss(balance):
            return False, "Daily loss limit reached"

        # Rule 3: Weekly loss
        if not self.check_weekly_loss(balance):
            return False, "Weekly loss limit reached"

        # Rule 4: Max drawdown
        if not self.check_max_drawdown(balance):
            return False, "Max drawdown — SHUTDOWN"

        # Rule 5: Open positions
        if not self.check_open_positions():
            return False, "Max open positions reached"

        # Rule 6: Max trades per day
        if not self.check_max_trades():
            return False, "Max trades per day reached"

        # Spread check (Rule 1 support — ties into lot sizing)
        spread_ok, spread = self.check_spread()
        if not spread_ok:
            return False, f"Spread too wide: ${spread:.3f} (max ${config.MAX_SPREAD_PRICE:.2f})"

        # Duplicate direction
        if not self.check_duplicate_direction(signal):
            return False, "Already have position in this direction"

        return True, "OK"

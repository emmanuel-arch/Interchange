import type { Trade, MonthlyPerformance, EngineStatus, BacktestResult, EquityPoint, InvestorAccount, RiskMetrics, EconomicEvent } from "@/types";

// --- Mock Trades ---
export const mockOpenTrades: Trade[] = [
  {
    id: "t1", ticket: 90125001, symbol: "XAUUSD", direction: "BUY",
    entryPrice: 2342.50, lotSize: 0.50, stopLoss: 2330.00, takeProfit: 2365.00,
    pnl: 187.50, status: "OPEN", openedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "t2", ticket: 90125002, symbol: "XAUUSD", direction: "SELL",
    entryPrice: 2358.80, lotSize: 0.30, stopLoss: 2370.00, takeProfit: 2340.00,
    pnl: -42.30, status: "OPEN", openedAt: new Date(Date.now() - 1800000).toISOString(),
  },
];

export const mockClosedTrades: Trade[] = [
  {
    id: "t3", ticket: 90124990, symbol: "XAUUSD", direction: "BUY",
    entryPrice: 2315.40, exitPrice: 2338.20, lotSize: 0.50,
    stopLoss: 2305.00, takeProfit: 2340.00, pnl: 1140.00,
    commission: -3.50, swap: -1.20, status: "CLOSED",
    openedAt: "2026-04-04T08:30:00Z", closedAt: "2026-04-04T14:45:00Z",
  },
  {
    id: "t4", ticket: 90124988, symbol: "XAUUSD", direction: "SELL",
    entryPrice: 2348.90, exitPrice: 2330.10, lotSize: 0.40,
    stopLoss: 2360.00, takeProfit: 2325.00, pnl: 752.00,
    commission: -2.80, swap: 0, status: "CLOSED",
    openedAt: "2026-04-03T10:15:00Z", closedAt: "2026-04-03T16:20:00Z",
  },
  {
    id: "t5", ticket: 90124985, symbol: "XAUUSD", direction: "BUY",
    entryPrice: 2328.00, exitPrice: 2320.50, lotSize: 0.30,
    stopLoss: 2318.00, takeProfit: 2350.00, pnl: -225.00,
    commission: -2.10, swap: -0.80, status: "CLOSED",
    openedAt: "2026-04-02T09:00:00Z", closedAt: "2026-04-02T11:30:00Z",
  },
  {
    id: "t6", ticket: 90124980, symbol: "XAUUSD", direction: "BUY",
    entryPrice: 2290.00, exitPrice: 2318.40, lotSize: 0.50,
    stopLoss: 2278.00, takeProfit: 2320.00, pnl: 1420.00,
    commission: -3.50, swap: -2.40, status: "CLOSED",
    openedAt: "2026-04-01T07:45:00Z", closedAt: "2026-04-01T15:10:00Z",
  },
  {
    id: "t7", ticket: 90124975, symbol: "XAUUSD", direction: "SELL",
    entryPrice: 2310.50, exitPrice: 2295.80, lotSize: 0.40,
    stopLoss: 2322.00, takeProfit: 2290.00, pnl: 588.00,
    commission: -2.80, swap: 0, status: "CLOSED",
    openedAt: "2026-03-31T11:00:00Z", closedAt: "2026-03-31T16:45:00Z",
  },
  {
    id: "t8", ticket: 90124970, symbol: "XAUUSD", direction: "BUY",
    entryPrice: 2275.20, exitPrice: 2305.60, lotSize: 0.50,
    stopLoss: 2265.00, takeProfit: 2310.00, pnl: 1520.00,
    commission: -3.50, swap: -1.60, status: "CLOSED",
    openedAt: "2026-03-28T08:15:00Z", closedAt: "2026-03-28T14:50:00Z",
  },
];

// --- Monthly Performance ---
export const mockMonthlyPerformance: MonthlyPerformance[] = [
  { id: "m1", month: "2025-07", returnPct: 12.4, pnlUSD: 1240, totalTrades: 42, winRate: 67.8, maxDrawdown: 4.2, isPublic: true },
  { id: "m2", month: "2025-08", returnPct: 8.7, pnlUSD: 980, totalTrades: 38, winRate: 63.2, maxDrawdown: 5.8, isPublic: true },
  { id: "m3", month: "2025-09", returnPct: 15.2, pnlUSD: 1720, totalTrades: 45, winRate: 71.1, maxDrawdown: 3.1, isPublic: true },
  { id: "m4", month: "2025-10", returnPct: -3.8, pnlUSD: -440, totalTrades: 35, winRate: 48.6, maxDrawdown: 8.9, isPublic: true },
  { id: "m5", month: "2025-11", returnPct: 11.1, pnlUSD: 1250, totalTrades: 40, winRate: 65.0, maxDrawdown: 4.5, isPublic: true },
  { id: "m6", month: "2025-12", returnPct: 14.8, pnlUSD: 1680, totalTrades: 44, winRate: 70.5, maxDrawdown: 3.6, isPublic: true },
  { id: "m7", month: "2026-01", returnPct: 10.2, pnlUSD: 1160, totalTrades: 39, winRate: 64.1, maxDrawdown: 5.1, isPublic: true },
  { id: "m8", month: "2026-02", returnPct: 13.6, pnlUSD: 1560, totalTrades: 43, winRate: 69.8, maxDrawdown: 3.8, isPublic: true },
  { id: "m9", month: "2026-03", returnPct: 11.9, pnlUSD: 1370, totalTrades: 41, winRate: 66.7, maxDrawdown: 4.4, isPublic: true },
  { id: "m10", month: "2026-04", returnPct: 6.2, pnlUSD: 720, totalTrades: 15, winRate: 73.3, maxDrawdown: 2.1, isPublic: true },
];

// --- Engine Status ---
export const mockEngineStatus: EngineStatus = {
  isOnline: true,
  lastPing: new Date(Date.now() - 15000).toISOString(),
  currentSession: "London/NY Overlap",
  openPositions: 2,
  killSwitch: false,
  dailyPnl: 145.20,
  weeklyPnl: 3087.50,
};

// --- Risk Metrics ---
export const mockRiskMetrics: RiskMetrics = {
  dailyPnlPct: 1.45,
  weeklyPnlPct: 6.2,
  drawdownFromPeak: 2.1,
  tradesRemainingToday: 3,
  maxDailyTrades: 5,
  fortressRules: [
    { name: "Daily Loss Limit", description: "Halt trading if daily loss exceeds 3%", status: "ACTIVE", currentValue: 1.45, threshold: 3.0 },
    { name: "Weekly Loss Limit", description: "Halt trading if weekly loss exceeds 5%", status: "ACTIVE", currentValue: 6.2, threshold: 5.0 },
    { name: "Max Drawdown", description: "Kill switch if drawdown exceeds 12%", status: "ACTIVE", currentValue: 2.1, threshold: 12.0 },
    { name: "Consecutive Losses", description: "Pause after 3 consecutive losses", status: "ACTIVE", currentValue: 0, threshold: 3 },
    { name: "High-Impact News", description: "Skip NFP, CPI, FOMC trading days", status: "ACTIVE", currentValue: 0, threshold: 1 },
  ],
};

// --- Backtest Result ---
export const mockBacktestResult: BacktestResult = {
  id: "bt1",
  name: "GoldStrike v3.2 — Jul 2025 to Mar 2026",
  startDate: "2025-07-01",
  endDate: "2026-03-31",
  initialBalance: 10000,
  finalBalance: 23480,
  totalTrades: 367,
  winRate: 66.5,
  profitFactor: 1.82,
  sharpeRatio: 2.14,
  maxDrawdown: 8.9,
  monthlyReturns: {
    "2025-07": 12.4, "2025-08": 8.7, "2025-09": 15.2, "2025-10": -3.8,
    "2025-11": 11.1, "2025-12": 14.8, "2026-01": 10.2, "2026-02": 13.6, "2026-03": 11.9,
  },
  equityCurve: generateEquityCurve(),
  parameters: {
    adxThreshold: 25, rsiOversold: 30, rsiOverbought: 70,
    atrMultiplierSL: 1.5, atrMultiplierTP: 2.5, maxDailyTrades: 5, riskPct: 1.0,
  },
  isPublic: true,
};

function generateEquityCurve(): EquityPoint[] {
  const points: EquityPoint[] = [];
  let equity = 10000;
  let peak = equity;
  const startDate = new Date("2025-07-01");

  for (let i = 0; i < 270; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const dailyReturn = (Math.random() - 0.42) * 200;
    equity = Math.max(equity + dailyReturn, equity * 0.95);
    peak = Math.max(peak, equity);
    const drawdown = ((peak - equity) / peak) * 100;

    points.push({
      date: date.toISOString().split("T")[0],
      equity: Math.round(equity * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
    });
  }
  return points;
}

// --- Investor Account ---
export const mockInvestorAccount: InvestorAccount = {
  id: "ia1",
  profileId: "tp1",
  poolId: "pool1",
  startingCapital: 5000,
  currentValue: 7340,
  totalReturn: 46.8,
  profitSharePct: 70,
  userName: "Demo Investor",
  userEmail: "investor@demo.com",
};

// --- Engine Config ---
export const mockEngineConfig = [
  { id: "c1", key: "adx_threshold", value: 25, label: "ADX Threshold", description: "Minimum ADX value to confirm trend strength", category: "indicators" },
  { id: "c2", key: "rsi_oversold", value: 30, label: "RSI Oversold", description: "RSI level considered oversold for buy signals", category: "indicators" },
  { id: "c3", key: "rsi_overbought", value: 70, label: "RSI Overbought", description: "RSI level considered overbought for sell signals", category: "indicators" },
  { id: "c4", key: "atr_multiplier_sl", value: 1.5, label: "ATR Multiplier (SL)", description: "ATR multiplier for stop loss calculation", category: "risk" },
  { id: "c5", key: "atr_multiplier_tp", value: 2.5, label: "ATR Multiplier (TP)", description: "ATR multiplier for take profit calculation", category: "risk" },
  { id: "c6", key: "max_daily_trades", value: 5, label: "Max Daily Trades", description: "Maximum number of trades per day", category: "risk" },
  { id: "c7", key: "risk_per_trade", value: 1.0, label: "Risk Per Trade (%)", description: "Percentage of account risked per trade", category: "risk" },
  { id: "c8", key: "max_spread", value: 30, label: "Max Spread (points)", description: "Maximum spread allowed to enter a trade", category: "execution" },
  { id: "c9", key: "trailing_stop_activation", value: 150, label: "Trailing Stop Activation (points)", description: "Points in profit before trailing stop activates", category: "execution" },
  { id: "c10", key: "session_london_start", value: "08:00", label: "London Session Start", description: "Trading start time (UTC)", category: "sessions" },
  { id: "c11", key: "session_ny_end", value: "21:00", label: "NY Session End", description: "Trading end time (UTC)", category: "sessions" },
];

// --- Economic Calendar ---
export const mockEconomicEvents: EconomicEvent[] = [
  { id: "e1", title: "Non-Farm Payrolls (NFP)", country: "US", date: "2026-04-10", time: "13:30", impact: "HIGH", forecast: "180K", previous: "175K", isBlocked: true },
  { id: "e2", title: "CPI (YoY)", country: "US", date: "2026-04-15", time: "13:30", impact: "HIGH", forecast: "3.2%", previous: "3.1%", isBlocked: true },
  { id: "e3", title: "FOMC Rate Decision", country: "US", date: "2026-04-22", time: "19:00", impact: "HIGH", forecast: "5.25%", previous: "5.25%", isBlocked: true },
  { id: "e4", title: "Retail Sales (MoM)", country: "US", date: "2026-04-17", time: "13:30", impact: "MEDIUM", forecast: "0.4%", previous: "0.3%", isBlocked: false },
  { id: "e5", title: "PMI Manufacturing", country: "US", date: "2026-04-08", time: "14:45", impact: "MEDIUM", forecast: "51.2", previous: "50.8", isBlocked: false },
  { id: "e6", title: "Initial Jobless Claims", country: "US", date: "2026-04-09", time: "13:30", impact: "LOW", forecast: "215K", previous: "210K", isBlocked: false },
  { id: "e7", title: "ECB Rate Decision", country: "EU", date: "2026-04-18", time: "12:45", impact: "HIGH", forecast: "3.75%", previous: "3.75%", isBlocked: true },
];

// --- Dashboard Stats ---
export function getMockDashboardStats() {
  return {
    totalReturn: 46.8,
    monthlyReturn: 6.2,
    monthlyPnl: 720,
    currentValue: 7340,
    startingCapital: 5000,
    openTrades: 2,
    totalTrades: 367,
    winRate: 66.5,
    bestMonth: { month: "2025-09", returnPct: 15.2 },
    worstMonth: { month: "2025-10", returnPct: -3.8 },
  };
}

// Pre-computed constants for components that import by name
export const mockDashboardStats = getMockDashboardStats();
export const mockPerformanceData = mockMonthlyPerformance;

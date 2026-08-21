// ============================================================
// GoldStrike Trading Platform — Type Definitions
// ============================================================

// Trade types
export interface Trade {
  id: string;
  ticket: number;
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  exitPrice?: number;
  lotSize: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl?: number;
  commission?: number;
  swap?: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  poolId?: string;
  openedAt: string;
  closedAt?: string;
}

// Engine status
export interface EngineStatus {
  isOnline: boolean;
  lastPing: string;
  currentSession: string | null;
  openPositions: number;
  killSwitch: boolean;
  dailyPnl: number;
  weeklyPnl: number;
  metadata?: Record<string, unknown>;
}

// Engine config
export interface EngineConfigItem {
  id: string;
  key: string;
  value: unknown;
  label: string;
  description: string;
  category: string;
}

// Investor
export interface InvestorAccount {
  id: string;
  profileId: string;
  poolId: string;
  startingCapital: number;
  currentValue: number;
  totalReturn: number;
  profitSharePct: number;
  userName?: string;
  userEmail?: string;
}

// Pool
export interface Pool {
  id: string;
  name: string;
  description?: string;
  totalCapital: number;
  currentValue: number;
  isActive: boolean;
}

// Monthly performance
export interface MonthlyPerformance {
  id: string;
  month: string;
  returnPct: number;
  pnlUSD: number;
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  isPublic: boolean;
}

// Backtest
export interface BacktestResult {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  finalBalance: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  monthlyReturns: Record<string, number>;
  equityCurve: EquityPoint[];
  parameters: Record<string, unknown>;
  isPublic: boolean;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

// Risk dashboard
export interface RiskMetrics {
  dailyPnlPct: number;
  weeklyPnlPct: number;
  drawdownFromPeak: number;
  tradesRemainingToday: number;
  maxDailyTrades: number;
  fortressRules: FortressRule[];
}

export interface FortressRule {
  name: string;
  description: string;
  status: "ACTIVE" | "TRIGGERED" | "DISABLED";
  currentValue: number;
  threshold: number;
}

// Deposit / Withdrawal
export interface DepositRequest {
  id: string;
  profileId: string;
  amount: number;
  method: "MPESA" | "BANK_TRANSFER";
  mpesaRef?: string;
  bankRef?: string;
  phoneNumber?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  adminNote?: string;
  processedAt?: string;
  createdAt: string;
  userName?: string;
}

export interface WithdrawalRequest {
  id: string;
  profileId: string;
  amount: number;
  method: "MPESA" | "BANK_TRANSFER";
  phoneNumber?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  adminNote?: string;
  processedAt?: string;
  createdAt: string;
  userName?: string;
}

// Profit payment
export interface ProfitPayment {
  id: string;
  profileId: string;
  amount: number;
  period: string;
  profitShare: number;
  method: "MPESA" | "BANK_TRANSFER";
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  paidAt?: string;
  createdAt: string;
}

// Waitlist
export interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  phone?: string;
  investmentRange?: string;
  message?: string;
  status: "PENDING" | "CONTACTED" | "APPROVED" | "REJECTED";
  createdAt: string;
}

// Economic calendar
export interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  date: string;
  time: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  forecast?: string;
  previous?: string;
  actual?: string;
  isBlocked: boolean; // NFP, CPI, FOMC etc.
}

// Session / Auth
export interface TradingUser {
  id: string;
  email: string;
  name: string;
  tradingRole: "SUPER_ADMIN" | "INVESTOR" | "SUBSCRIBER";
  totpEnabled: boolean;
  isApproved: boolean;
}

// SSE event types
export type SSEEventType =
  | "trade_opened"
  | "trade_closed"
  | "trade_updated"
  | "engine_heartbeat"
  | "kill_switch"
  | "balance_update"
  | "config_change";

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

// Dashboard stats
export interface DashboardStats {
  totalReturn: number;
  monthlyReturn: number;
  currentValue: number;
  startingCapital: number;
  openTrades: number;
  totalTrades: number;
  winRate: number;
  bestMonth: { month: string; returnPct: number };
  worstMonth: { month: string; returnPct: number };
}

// API responses
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

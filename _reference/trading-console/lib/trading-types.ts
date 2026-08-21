// ============================================================
// GOLDSTRIKE TRADING PLATFORM — TYPE DEFINITIONS
// ============================================================

// === ENGINE & SYSTEM STATE ===

export type EngineStatus = "ONLINE" | "OFFLINE" | "STARTING" | "ERROR"
export type KillSwitchState = "ON" | "OFF"
export type TradingMode = "LIVE" | "DEMO"
export type TradeDirection = "BUY" | "SELL"
export type TradeStatus = "OPEN" | "CLOSED"
export type ExitReason = "SL" | "TP" | "TP1_PARTIAL" | "BREAKEVEN" | "TRAILING" | "EXTERNAL" | "FRIDAY_CUTOFF" | "MANUAL"

export type TradingSession = "LONDON" | "NY_OVERLAP" | "NY_CONT" | "OFF"
export type ConditionStatus = "PASS" | "FAIL" | "WAIT"
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL" | "SUCCESS"
export type AlertCategory = "ENGINE" | "RISK" | "TRADE" | "SYSTEM" | "SESSION" | "HEARTBEAT"

export type InfraNodeStatus = "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE"
export type ServerType = "LINUX_VPS" | "WINDOWS_LOCAL" | "PLATFORM" | "TELEGRAM_BOT"

export type UserRole = "ADMIN" | "INVESTOR" | "SUBSCRIBER"

// === HEARTBEAT ===

export interface Heartbeat {
  id: string
  timestamp: number
  status: EngineStatus
  latencyMs: number
  killSwitch: KillSwitchState
  uptime: number // seconds since engine start
  memoryUsageMb: number
  cpuPercent: number
}

// === LIVE CONDITIONS ===

export interface ConditionCheck {
  name: string
  status: ConditionStatus
  value: string
  detail: string
}

export interface LiveConditions {
  timestamp: number
  session: TradingSession
  bid: number
  spread: number
  // M15 Trend Filter
  m15: {
    price: number
    ema50: number
    ema200: number
    adx: number
    trendDirection: "BULLISH" | "BEARISH" | "MIXED"
  }
  // M5 Entry Zone
  m5: {
    price: number
    ema20: number
    atr: number
    rsi: number
    ema20Slope: number
    extensionAtr: number
  }
  // M1 Candle Trigger
  m1: {
    engulfing: boolean
    momentum: boolean
    pattern: string // "BULL_ENGULF" | "BEAR_ENGULF" | "BULL_MOM" | "BEAR_MOM" | "NONE"
  }
  conditions: ConditionCheck[]
  conditionsMet: number
  conditionsTotal: number
  blockedBy: string[]
  signal: 0 | 1 | -1
}

// === TRADES ===

export interface Trade {
  id: string
  ticket: number
  timestamp: number
  symbol: string
  direction: TradeDirection
  entryPrice: number
  stopLoss: number
  takeProfit: number
  lotSize: number
  atrAtEntry: number
  spreadAtEntry: number
  exitPrice: number | null
  exitTime: number | null
  pnlUsd: number | null
  pnlPct: number | null
  exitReason: ExitReason | null
  session: TradingSession
  magicNumber: number
  partialClosed: boolean
  partialClosePrice: number | null
  partialClosePnl: number | null
  status: TradeStatus
  // Position management stage
  breakevenSet: boolean
  trailingActive: boolean
}

// === RISK MANAGEMENT ===

export interface RiskRule {
  id: string
  name: string
  description: string
  currentValue: number
  threshold: number
  unit: string
  status: "OK" | "WARNING" | "BREACHED"
  enabled: boolean
}

export interface RiskState {
  dailyPnl: number
  dailyPnlPct: number
  weeklyPnl: number
  weeklyPnlPct: number
  maxDrawdownPct: number
  currentDrawdownPct: number
  peakBalance: number
  currentBalance: number
  tradesToday: number
  openPositions: number
  lastSpread: number
  rules: RiskRule[]
}

// === DAILY SUMMARY ===

export interface DailySummary {
  date: string
  tradesCount: number
  wins: number
  losses: number
  grossPnl: number
  netPnl: number
  maxDrawdownPct: number
  endingBalance: number
  winRate: number
}

// === INFRASTRUCTURE ===

export interface InfraNode {
  id: string
  name: string
  type: ServerType
  ip: string
  status: InfraNodeStatus
  uptime: number
  cpuPercent: number
  memoryPercent: number
  diskPercent: number
  lastPing: number
  latencyMs: number
  services: InfraService[]
}

export interface InfraService {
  name: string
  port: number
  status: "RUNNING" | "STOPPED" | "ERROR"
  pid?: number
  memoryMb?: number
  uptimeSeconds?: number
}

// === PLATFORM ALERTS ===

export interface PlatformAlert {
  id: string
  timestamp: number
  severity: AlertSeverity
  category: AlertCategory
  title: string
  message: string
  dismissed: boolean
  actionRequired: boolean
  source: string
}

// === TELEGRAM ===

export interface TelegramMessage {
  id: string
  timestamp: number
  direction: "INCOMING" | "OUTGOING"
  chatId: string
  text: string
  command?: string
}

// === BACKTEST ===

export interface BacktestResult {
  id: string
  timestamp: number
  period: string
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number
  maxDrawdown: number
  netPnl: number
  sharpeRatio: number
  status: "RUNNING" | "COMPLETED" | "FAILED"
}

// === SERVER COMMAND ===

export interface ServerCommand {
  id: string
  timestamp: number
  command: string
  args?: string[]
  status: "PENDING" | "EXECUTING" | "SUCCESS" | "FAILED"
  output?: string
  executionTimeMs?: number
}

// === ENGINE CONFIG (mirrors config.py) ===

export interface EngineConfig {
  symbol: string
  magicNumber: number
  tradingMode: TradingMode
  riskPercent: number
  atrSlMult: number
  atrTp1Mult: number
  atrTp2Mult: number
  atrTrailMult: number
  atrBreakevenTrigger: number
  atrBreakevenMult: number
  partialClosePct: number
  emaFast: number
  emaSlow: number
  emaPullback: number
  rsiPeriod: number
  atrPeriod: number
  adxPeriod: number
  adxMinimum: number
  rsiLow: number
  rsiHigh: number
  ema20SlopeBars: number
  maxExtensionAtr: number
  maxSpreadPrice: number
  maxDailyLossPct: number
  maxWeeklyLossPct: number
  maxDrawdownPct: number
  maxTradesPerDay: number
  maxOpenTrades: number
  maxLot: number
  minLot: number
  sessions: {
    london: { start: string; end: string }
    nyOverlap: { start: string; end: string }
    nyCont: { start: string; end: string }
  }
}

// === SCHEDULE ===

export interface ScheduleEntry {
  id: string
  session: TradingSession
  dayOfWeek: number // 0=Monday, 6=Sunday
  startTime: string // "HH:MM"
  endTime: string   // "HH:MM"
  enabled: boolean
  autoStart: boolean // auto-start engine for this session
}

// === INVESTOR ===

export interface InvestorAccount {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole
  balance: number
  depositTotal: number
  withdrawalTotal: number
  profitTotal: number
  profitPct: number
  joinedAt: number
  lastActive: number
  subscriptionStatus: "ACTIVE" | "EXPIRED" | "TRIAL"
}

// === PAYMENT ===

export interface Payment {
  id: string
  timestamp: number
  userId: string
  amount: number
  currency: "KES" | "USD"
  type: "DEPOSIT" | "WITHDRAWAL" | "SUBSCRIPTION"
  method: "MPESA" | "BANK" | "CARD"
  status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED"
  mpesaReceiptNumber?: string
  phoneNumber?: string
  reference?: string
}

// === STATS OVERVIEW FOR DASHBOARD ===

export interface DashboardStats {
  engineStatus: EngineStatus
  killSwitch: KillSwitchState
  currentSession: TradingSession
  nextSession: { name: TradingSession; startsIn: string }
  balance: number
  todayPnl: number
  todayPnlPct: number
  weekPnl: number
  weekPnlPct: number
  allTimePnl: number
  allTimePnlPct: number
  tradesToday: number
  maxTradesToday: number
  openPositions: number
  winRate: number
  heartbeatAge: number // seconds since last heartbeat
  serverUptime: number
  currentBid: number
  currentSpread: number
  conditionsMet: number
  conditionsTotal: number
}

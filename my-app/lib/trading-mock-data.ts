// ============================================================
// GOLDSTRIKE TRADING PLATFORM — MOCK DATA GENERATORS
// Produces realistic simulated data for the entire platform
// ============================================================

import type {
  Heartbeat, LiveConditions, Trade, RiskState, RiskRule, InfraNode, InfraService,
  PlatformAlert, TelegramMessage, BacktestResult, ServerCommand, EngineConfig,
  DashboardStats, DailySummary, ConditionCheck, ScheduleEntry, Payment,
  TradingSession, EngineStatus, AlertSeverity, AlertCategory, TradeDirection,
  ConditionStatus, InvestorAccount,
} from "./trading-types"

// ────────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────────

let _id = 0
const uid = () => `gs-${++_id}-${Date.now().toString(36)}`
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const rand = (min: number, max: number) => Math.random() * (max - min) + min
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Simulated gold price centered around 4750-4850
let _goldPrice = 4785 + (Math.random() - 0.5) * 40
const tickGold = () => {
  _goldPrice += (Math.random() - 0.498) * 2.5 // slight upward drift
  _goldPrice = clamp(_goldPrice, 4650, 4950)
  return Math.round(_goldPrice * 1000) / 1000
}

// Time helpers
const nowEAT = () => {
  const d = new Date()
  return new Date(d.getTime() + 3 * 60 * 60 * 1000) // UTC+3
}

const getSession = (): TradingSession => {
  const h = new Date().getHours()
  if (h >= 7 && h < 10) return "LONDON"
  if (h >= 12 && h < 15) return "NY_OVERLAP"
  if (h >= 15 && h < 17) return "NY_CONT"
  return "OFF"
}

const getNextSession = (): { name: TradingSession; startsIn: string } => {
  const h = new Date().getHours()
  if (h < 7) return { name: "LONDON", startsIn: `${7 - h}h ${60 - new Date().getMinutes()}m` }
  if (h < 12) return { name: "NY_OVERLAP", startsIn: `${12 - h}h ${60 - new Date().getMinutes()}m` }
  if (h < 15) return { name: "NY_CONT", startsIn: `${15 - h}h ${60 - new Date().getMinutes()}m` }
  return { name: "LONDON", startsIn: "Tomorrow 10:00 EAT" }
}

// ────────────────────────────────────────────────────
// HEARTBEAT GENERATOR
// ────────────────────────────────────────────────────

let _heartbeatSeq = 0
let _engineStartTime = Date.now() - randInt(3600, 36000) * 1000

export function generateHeartbeat(): Heartbeat {
  _heartbeatSeq++
  return {
    id: uid(),
    timestamp: Date.now(),
    status: Math.random() > 0.02 ? "ONLINE" : "OFFLINE",
    latencyMs: Math.round(rand(12, 85)),
    killSwitch: "OFF",
    uptime: Math.floor((Date.now() - _engineStartTime) / 1000),
    memoryUsageMb: Math.round(rand(180, 420)),
    cpuPercent: Math.round(rand(2, 35) * 10) / 10,
  }
}

// ────────────────────────────────────────────────────
// LIVE CONDITIONS GENERATOR
// ────────────────────────────────────────────────────

let _ema50 = 4776 + (Math.random() - 0.5) * 10
let _ema200 = 4726 + (Math.random() - 0.5) * 10
let _ema20 = 4756 + (Math.random() - 0.5) * 8
let _adx = rand(20, 45)
let _rsi = rand(38, 62)
let _atr = rand(6, 12)

export function generateLiveConditions(): LiveConditions {
  const bid = tickGold()
  const spread = pick([0.280, 0.320, 0.360, 0.400, 0.440])

  // drift indicators
  _ema50 += (Math.random() - 0.5) * 0.5
  _ema200 += (Math.random() - 0.5) * 0.15
  _ema20 += (Math.random() - 0.5) * 0.8
  _adx = clamp(_adx + (Math.random() - 0.5) * 2, 15, 55)
  _rsi = clamp(_rsi + (Math.random() - 0.5) * 3, 25, 75)
  _atr = clamp(_atr + (Math.random() - 0.5) * 0.3, 4, 16)

  const ema20Slope = (Math.random() - 0.5) * 2
  const extensionAtr = Math.abs(bid - _ema50) / _atr

  // Determine trend
  const bullish = bid > _ema50 && _ema50 > _ema200
  const bearish = bid < _ema50 && _ema50 < _ema200
  const trendDir = bullish ? "BULLISH" as const : bearish ? "BEARISH" as const : "MIXED" as const

  const nearEma20 = Math.abs(bid - _ema20) <= _atr
  const rsiNeutral = _rsi >= 40 && _rsi <= 60
  const trendStrong = _adx >= 22
  const slopeOk = trendDir === "BULLISH" ? ema20Slope > 0 : trendDir === "BEARISH" ? ema20Slope < 0 : false
  const notExtended = extensionAtr < 3.5
  const spreadOk = spread <= 0.40
  const engulfing = Math.random() < 0.08
  const momentum = !engulfing && Math.random() < 0.06

  const conditions: ConditionCheck[] = [
    {
      name: "Trend Direction",
      status: (trendDir !== "MIXED" ? "PASS" : "FAIL") as ConditionStatus,
      value: trendDir,
      detail: trendDir === "MIXED"
        ? `Price between EMAs — no clear trend`
        : `${trendDir} (Price ${bullish ? ">" : "<"} EMA50 ${bullish ? ">" : "<"} EMA200)`,
    },
    {
      name: "ADX Strength",
      status: (trendStrong ? "PASS" : "FAIL") as ConditionStatus,
      value: `${_adx.toFixed(1)}`,
      detail: trendStrong ? `> 22 (strong by +${(_adx - 22).toFixed(1)})` : `< 22 (weak by ${(22 - _adx).toFixed(1)})`,
    },
    {
      name: "Pullback Zone",
      status: (nearEma20 ? "PASS" : "FAIL") as ConditionStatus,
      value: `${Math.abs(bid - _ema20).toFixed(3)}`,
      detail: nearEma20 ? `Dist=${Math.abs(bid - _ema20).toFixed(3)} <= ATR ${_atr.toFixed(3)} (IN ZONE)` : `Too far from EMA20`,
    },
    {
      name: "RSI Neutral",
      status: (rsiNeutral ? "PASS" : "FAIL") as ConditionStatus,
      value: `${_rsi.toFixed(1)}`,
      detail: `(range 40-60)`,
    },
    {
      name: "EMA20 Slope",
      status: (slopeOk ? "PASS" : "FAIL") as ConditionStatus,
      value: `${ema20Slope > 0 ? "↑" : "↓"} ${Math.abs(ema20Slope).toFixed(3)}`,
      detail: slopeOk ? `Agrees with trend` : `AGAINST trend — no entry`,
    },
    {
      name: "Extension",
      status: (notExtended ? "PASS" : "FAIL") as ConditionStatus,
      value: `${extensionAtr.toFixed(1)}x ATR`,
      detail: notExtended ? `from EMA50 (safe)` : `OVEREXTENDED from EMA50`,
    },
    {
      name: "Candle Trigger",
      status: (engulfing || momentum ? "PASS" : trendDir === "MIXED" ? "WAIT" : "FAIL") as ConditionStatus,
      value: engulfing ? "ENGULFING" : momentum ? "MOMENTUM" : "NONE",
      detail: engulfing ? "Engulfing pattern detected" : momentum ? "Strong momentum candle" : trendDir === "MIXED" ? "No trend — patterns not evaluated" : "Waiting for trigger",
    },
    {
      name: "Spread",
      status: (spreadOk ? "PASS" : "FAIL") as ConditionStatus,
      value: `$${spread.toFixed(3)}`,
      detail: spreadOk ? `<= $0.40` : `> $0.40 — too wide`,
    },
  ]

  const met = conditions.filter(c => c.status === "PASS").length
  const blocked = conditions.filter(c => c.status === "FAIL").map(c => c.name)
  const hasSignal = met >= 8

  return {
    timestamp: Date.now(),
    session: getSession(),
    bid,
    spread,
    m15: { price: bid, ema50: _ema50, ema200: _ema200, adx: _adx, trendDirection: trendDir },
    m5: { price: bid, ema20: _ema20, atr: _atr, rsi: _rsi, ema20Slope: ema20Slope, extensionAtr: extensionAtr },
    m1: {
      engulfing,
      momentum,
      pattern: engulfing ? (bullish ? "BULL_ENGULF" : "BEAR_ENGULF") : momentum ? (bullish ? "BULL_MOM" : "BEAR_MOM") : "NONE",
    },
    conditions,
    conditionsMet: met,
    conditionsTotal: conditions.length,
    blockedBy: blocked,
    signal: hasSignal ? (bullish ? 1 : -1) : 0,
  }
}

// ────────────────────────────────────────────────────
// TRADE GENERATOR
// ────────────────────────────────────────────────────

let _ticketCounter = 273984100

export function generateTrade(opts?: { open?: boolean }): Trade {
  const dir: TradeDirection = pick(["BUY", "SELL"])
  const entry = 4750 + rand(-50, 100)
  const atr = rand(6, 12)
  const sl = dir === "BUY" ? entry - atr * 1.5 : entry + atr * 1.5
  const tp = dir === "BUY" ? entry + atr * 2.5 : entry - atr * 2.5
  const lot = pick([0.01, 0.02, 0.03, 0.04, 0.05])
  const isOpen = opts?.open ?? Math.random() > 0.7
  const ticket = ++_ticketCounter
  const entryTime = Date.now() - randInt(0, 86400) * 1000

  let exitPrice: number | null = null
  let pnlUsd: number | null = null
  let exitReason: Trade["exitReason"] = null

  if (!isOpen) {
    const won = Math.random() > 0.4 // 60% win rate sim
    if (won) {
      exitPrice = dir === "BUY" ? entry + rand(atr * 0.5, atr * 2.5) : entry - rand(atr * 0.5, atr * 2.5)
      exitReason = pick(["TP", "TP1_PARTIAL", "TRAILING"])
    } else {
      exitPrice = dir === "BUY" ? entry - rand(atr * 0.3, atr * 1.5) : entry + rand(atr * 0.3, atr * 1.5)
      exitReason = pick(["SL", "EXTERNAL"])
    }
    const diff = dir === "BUY" ? exitPrice - entry : entry - exitPrice
    pnlUsd = Math.round(diff * lot * 100 * 100) / 100
  }

  return {
    id: uid(),
    ticket,
    timestamp: entryTime,
    symbol: "XAUUSDc",
    direction: dir,
    entryPrice: Math.round(entry * 1000) / 1000,
    stopLoss: Math.round(sl * 1000) / 1000,
    takeProfit: Math.round(tp * 1000) / 1000,
    lotSize: lot,
    atrAtEntry: Math.round(atr * 1000) / 1000,
    spreadAtEntry: pick([0.28, 0.32, 0.36]),
    exitPrice: exitPrice ? Math.round(exitPrice * 1000) / 1000 : null,
    exitTime: isOpen ? null : entryTime + randInt(300, 7200) * 1000,
    pnlUsd,
    pnlPct: pnlUsd !== null ? Math.round((pnlUsd / 5000) * 10000) / 100 : null,
    exitReason,
    session: pick(["LONDON", "NY_OVERLAP", "NY_CONT"]),
    magicNumber: 202600,
    partialClosed: !isOpen && Math.random() > 0.5,
    partialClosePrice: null,
    partialClosePnl: null,
    status: isOpen ? "OPEN" : "CLOSED",
    breakevenSet: !isOpen || Math.random() > 0.6,
    trailingActive: !isOpen && Math.random() > 0.5,
  }
}

export function generateTradeHistory(count: number): Trade[] {
  const trades: Trade[] = []
  for (let i = 0; i < count; i++) {
    trades.push(generateTrade({ open: i < 2 && Math.random() > 0.5 }))
  }
  return trades.sort((a, b) => b.timestamp - a.timestamp)
}

// ────────────────────────────────────────────────────
// RISK STATE
// ────────────────────────────────────────────────────

export function generateRiskState(): RiskState {
  const balance = rand(4800, 5600)
  const peakBalance = balance + rand(50, 300)
  const dailyPnl = rand(-80, 150)
  const weeklyPnl = rand(-200, 400)

  const rules: RiskRule[] = [
    {
      id: "spread", name: "Max Spread", description: "Spread must be ≤ $0.40",
      currentValue: pick([0.28, 0.32, 0.36, 0.40]), threshold: 0.40, unit: "$",
      status: "OK", enabled: true,
    },
    {
      id: "daily_loss", name: "Daily Loss Limit", description: "Max 4% daily loss",
      currentValue: Math.abs(Math.min(dailyPnl, 0)) / balance * 100, threshold: 4, unit: "%",
      status: Math.abs(Math.min(dailyPnl, 0)) / balance > 0.03 ? "WARNING" : "OK", enabled: true,
    },
    {
      id: "weekly_loss", name: "Weekly Loss Limit", description: "Max 6% weekly loss",
      currentValue: Math.abs(Math.min(weeklyPnl, 0)) / balance * 100, threshold: 6, unit: "%",
      status: "OK", enabled: true,
    },
    {
      id: "max_dd", name: "Max Drawdown", description: "Max 8% drawdown from peak (FTMO)",
      currentValue: ((peakBalance - balance) / peakBalance) * 100, threshold: 8, unit: "%",
      status: ((peakBalance - balance) / peakBalance) > 0.06 ? "WARNING" : "OK", enabled: true,
    },
    {
      id: "max_positions", name: "Max Open Positions", description: "Maximum 2 concurrent positions",
      currentValue: randInt(0, 2), threshold: 2, unit: "positions",
      status: "OK", enabled: true,
    },
    {
      id: "daily_trades", name: "Max Trades/Day", description: "Maximum 5 trades per day",
      currentValue: randInt(0, 4), threshold: 5, unit: "trades",
      status: "OK", enabled: true,
    },
    {
      id: "dup_direction", name: "Duplicate Direction", description: "No duplicate direction trades",
      currentValue: 0, threshold: 1, unit: "duplicates",
      status: "OK", enabled: true,
    },
  ]

  return {
    dailyPnl: Math.round(dailyPnl * 100) / 100,
    dailyPnlPct: Math.round((dailyPnl / balance) * 10000) / 100,
    weeklyPnl: Math.round(weeklyPnl * 100) / 100,
    weeklyPnlPct: Math.round((weeklyPnl / balance) * 10000) / 100,
    maxDrawdownPct: 8,
    currentDrawdownPct: Math.round(((peakBalance - balance) / peakBalance) * 10000) / 100,
    peakBalance: Math.round(peakBalance * 100) / 100,
    currentBalance: Math.round(balance * 100) / 100,
    tradesToday: randInt(0, 4),
    openPositions: randInt(0, 2),
    lastSpread: pick([0.28, 0.32, 0.36]),
    rules,
  }
}

// ────────────────────────────────────────────────────
// INFRASTRUCTURE
// ────────────────────────────────────────────────────

export function generateInfraNodes(): InfraNode[] {
  return [
    {
      id: "linux-vps",
      name: "Linux Control Server",
      type: "LINUX_VPS",
      ip: "45.150.190.19",
      status: Math.random() > 0.05 ? "HEALTHY" : "WARNING",
      uptime: randInt(86400, 2592000),
      cpuPercent: Math.round(rand(5, 45) * 10) / 10,
      memoryPercent: Math.round(rand(30, 75) * 10) / 10,
      diskPercent: Math.round(rand(20, 60) * 10) / 10,
      lastPing: Date.now() - randInt(0, 5000),
      latencyMs: Math.round(rand(15, 120)),
      services: [
        { name: "Flask API", port: 5000, status: "RUNNING", pid: 1234, memoryMb: 85, uptimeSeconds: randInt(3600, 86400) },
        { name: "PostgreSQL", port: 5432, status: "RUNNING", pid: 456, memoryMb: 256, uptimeSeconds: randInt(86400, 604800) },
        { name: "Telegram Bot", port: 0, status: "RUNNING", pid: 789, memoryMb: 45, uptimeSeconds: randInt(3600, 86400) },
        { name: "SSH", port: 22, status: "RUNNING", pid: 1, memoryMb: 5, uptimeSeconds: randInt(86400, 2592000) },
        { name: "Nginx", port: 80, status: "RUNNING", pid: 100, memoryMb: 20, uptimeSeconds: randInt(86400, 604800) },
      ],
    },
    {
      id: "windows-local",
      name: "Windows Trading PC",
      type: "WINDOWS_LOCAL",
      ip: "192.168.1.100",
      status: Math.random() > 0.1 ? "HEALTHY" : "WARNING",
      uptime: randInt(3600, 86400),
      cpuPercent: Math.round(rand(10, 60) * 10) / 10,
      memoryPercent: Math.round(rand(40, 80) * 10) / 10,
      diskPercent: Math.round(rand(30, 70) * 10) / 10,
      lastPing: Date.now() - randInt(0, 2000),
      latencyMs: Math.round(rand(1, 15)),
      services: [
        { name: "GoldStrike Engine", port: 0, status: "RUNNING", pid: 5678, memoryMb: 350, uptimeSeconds: randInt(1800, 43200) },
        { name: "MetaTrader 5", port: 0, status: "RUNNING", pid: 9012, memoryMb: 580, uptimeSeconds: randInt(1800, 43200) },
        { name: "Python 3.11", port: 0, status: "RUNNING", pid: 3456, memoryMb: 120, uptimeSeconds: randInt(1800, 43200) },
      ],
    },
    {
      id: "platform",
      name: "Trading Platform",
      type: "PLATFORM",
      ip: "trade.birgenai.com",
      status: "HEALTHY",
      uptime: randInt(86400, 2592000),
      cpuPercent: Math.round(rand(1, 15) * 10) / 10,
      memoryPercent: Math.round(rand(15, 40) * 10) / 10,
      diskPercent: Math.round(rand(5, 20) * 10) / 10,
      lastPing: Date.now() - randInt(0, 1000),
      latencyMs: Math.round(rand(5, 50)),
      services: [
        { name: "Next.js App", port: 443, status: "RUNNING", memoryMb: 128, uptimeSeconds: randInt(86400, 604800) },
        { name: "Vercel Edge", port: 443, status: "RUNNING", memoryMb: 0, uptimeSeconds: randInt(86400, 2592000) },
      ],
    },
    {
      id: "telegram-bot",
      name: "BirgenAI Trading Bot",
      type: "TELEGRAM_BOT",
      ip: "api.telegram.org",
      status: Math.random() > 0.03 ? "HEALTHY" : "WARNING",
      uptime: randInt(86400, 604800),
      cpuPercent: Math.round(rand(0.5, 8) * 10) / 10,
      memoryPercent: Math.round(rand(5, 25) * 10) / 10,
      diskPercent: 0,
      lastPing: Date.now() - randInt(0, 3000),
      latencyMs: Math.round(rand(50, 200)),
      services: [
        { name: "Bot Polling", port: 0, status: "RUNNING", memoryMb: 45, uptimeSeconds: randInt(3600, 604800) },
      ],
    },
  ]
}

// ────────────────────────────────────────────────────
// ALERTS (Telegram-style)
// ────────────────────────────────────────────────────

const alertTemplates: Array<{ severity: AlertSeverity; category: AlertCategory; title: string; message: string }> = [
  { severity: "SUCCESS", category: "ENGINE", title: "🟢 GOLDSTRIKE ONLINE", message: "Mode: LIVR | Symbol: XAUUSDc | Risk: 1.5% per trade | Scanning for setups..." },
  { severity: "SUCCESS", category: "TRADE", title: "⚡ TRADE EXECUTED", message: "BUY XAUUSDc @ $4,820.75 | SL: $4,812.45 | TP: $4,829.05 | Lot: 0.05 | R:R 1:1.0.| Do you believe in Christ?" },
  { severity: "INFO", category: "TRADE", title: "🛡️ BREAKEVEN SET", message: "Ticket #273984193 (BUY) — SL moved to entry. This trade cannot lose money." },
  { severity: "SUCCESS", category: "TRADE", title: "💰 PARTIAL CLOSE — TP1 HIT", message: "Closed 0.03 lots @ $4,829.05 | P&L: +$18.90 | 60% secured, trailing remainder." },
  { severity: "SUCCESS", category: "TRADE", title: "🎯 TRADE CLOSED — WIN", message: "BUY XAUUSDc closed @ $4,832.10 | P&L: +$28.50 (+0.57%) | Excellent execution!" },
  { severity: "WARNING", category: "TRADE", title: "❌ TRADE CLOSED — LOSS", message: "SELL XAUUSDc closed @ SL | P&L: -$12.80 (-0.26%) | Capital protected. On to next." },
  { severity: "CRITICAL", category: "RISK", title: "🛡️ RISK ALERT", message: "Daily loss approaching 3%. Caution on remaining trades." },
  { severity: "CRITICAL", category: "RISK", title: "🚨 KILL SWITCH ACTIVATED", message: "Server ordered trading halt. No new trades. Open positions still managed." },
  { severity: "SUCCESS", category: "ENGINE", title: "✅ TRADING RESUMED", message: "Kill switch deactivated. Engine will resume on next heartbeat." },
  { severity: "INFO", category: "SESSION", title: "⏸️ SESSION BREAK", message: "NY session closed. Next: London (tomorrow) at 10:00 EAT. Today: 2 trades | P&L: +$42.30" },
  { severity: "INFO", category: "SESSION", title: "🏛️ LONDON SESSION OPEN", message: "London session active. Engine scanning for setups." },
  { severity: "WARNING", category: "HEARTBEAT", title: "⚠️ HEARTBEAT DELAYED", message: "Last heartbeat 45s ago (threshold: 30s). Monitoring..." },
  { severity: "INFO", category: "SYSTEM", title: "☀️ GOOD MORNING", message: "Balance: $5,432.10 | Yesterday: +$85.50 (3 trades) | Risk: 1.5% | London opens at 10:00 EAT" },
]

export function generateAlert(): PlatformAlert {
  const t = pick(alertTemplates)
  return {
    id: uid(),
    timestamp: Date.now(),
    severity: t.severity,
    category: t.category,
    title: t.title,
    message: t.message,
    dismissed: false,
    actionRequired: t.severity === "CRITICAL",
    source: t.category === "ENGINE" ? "Engine" : t.category === "RISK" ? "Risk Checker" : t.category === "TRADE" ? "Position Manager" : "System",
  }
}

export function generateAlertHistory(count: number): PlatformAlert[] {
  const alerts: PlatformAlert[] = []
  for (let i = 0; i < count; i++) {
    const a = generateAlert()
    a.timestamp = Date.now() - i * randInt(60000, 600000)
    if (i > 3) a.dismissed = true
    alerts.push(a)
  }
  return alerts
}

// ────────────────────────────────────────────────────
// TERMINAL LOG LINE (engine output simulation)
// ────────────────────────────────────────────────────

export interface TerminalLine {
  id: string
  timestamp: number
  text: string
  type: "header" | "section" | "pass" | "fail" | "wait" | "info" | "divider" | "summary"
}

export function generateTerminalOutput(conditions: LiveConditions): TerminalLine[] {
  const t = new Date()
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
  const timeStr = `${t.getHours().toString().padStart(2,"0")}:${t.getMinutes().toString().padStart(2,"0")}:${t.getSeconds().toString().padStart(2,"0")}`

  const lines: TerminalLine[] = []
  const add = (text: string, type: TerminalLine["type"]) => lines.push({ id: uid(), timestamp: Date.now(), text, type })

  add("═".repeat(60), "divider")
  add(`  GOLDSTRIKE v2.0 — LIVE CONDITION MONITOR`, "header")
  add("═".repeat(60), "divider")
  add(`  Time: ${timeStr} ${days[t.getDay()]} EAT | Session: ${conditions.session}`, "info")
  add(`  Bid: ${conditions.bid.toFixed(3)} | Spread: $${conditions.spread.toFixed(3)}`, "info")
  add("", "divider")
  add(`  M15 TREND FILTER`, "section")
  add("  " + "─".repeat(56), "divider")
  add(`    Price:  ${conditions.m15.price.toFixed(3)}  |  EMA50: ${conditions.m15.ema50.toFixed(3)}  |  EMA200: ${conditions.m15.ema200.toFixed(3)}`, "info")

  for (const c of conditions.conditions.slice(0, 2)) {
    const tag = c.status === "PASS" ? "[PASS]" : c.status === "FAIL" ? "[FAIL]" : "[WAIT]"
    add(`    ${tag} ${c.name}: ${c.value} ${c.detail}`, c.status === "PASS" ? "pass" : c.status === "FAIL" ? "fail" : "wait")
  }

  add("", "divider")
  add(`  M5 ENTRY ZONE`, "section")
  add("  " + "─".repeat(56), "divider")
  add(`    Price:  ${conditions.m5.price.toFixed(3)}  |  EMA20: ${conditions.m5.ema20.toFixed(3)}  |  ATR: ${conditions.m5.atr.toFixed(3)}`, "info")

  for (const c of conditions.conditions.slice(2, 6)) {
    const tag = c.status === "PASS" ? "[PASS]" : c.status === "FAIL" ? "[FAIL]" : "[WAIT]"
    add(`    ${tag} ${c.name}: ${c.value} ${c.detail}`, c.status === "PASS" ? "pass" : c.status === "FAIL" ? "fail" : "wait")
  }

  add("", "divider")
  add(`  M1 CANDLE TRIGGER`, "section")
  add("  " + "─".repeat(56), "divider")

  const triggerCond = conditions.conditions[6]
  const tag = triggerCond.status === "PASS" ? "[PASS]" : triggerCond.status === "FAIL" ? "[FAIL]" : "[WAIT]"
  add(`    ${tag} ${triggerCond.name}: ${triggerCond.value} ${triggerCond.detail}`, triggerCond.status === "PASS" ? "pass" : triggerCond.status === "FAIL" ? "fail" : "wait")

  add("", "divider")
  add(`  SPREAD`, "section")
  add("  " + "─".repeat(56), "divider")
  const spreadCond = conditions.conditions[7]
  const sTag = spreadCond.status === "PASS" ? "[PASS]" : "[FAIL]"
  add(`    ${sTag} Spread: ${spreadCond.value} ${spreadCond.detail}`, spreadCond.status === "PASS" ? "pass" : "fail")

  add("", "divider")
  add("═".repeat(60), "divider")
  add(`  Conditions: ${conditions.conditionsMet}/${conditions.conditionsTotal} met | Blocked by: ${conditions.blockedBy.join(", ") || "None"}`, "summary")
  add("═".repeat(60), "divider")

  return lines
}

// ────────────────────────────────────────────────────
// DASHBOARD STATS
// ────────────────────────────────────────────────────

export function generateDashboardStats(): DashboardStats {
  const balance = rand(5000, 5600)
  const todayPnl = rand(-60, 120)
  const weekPnl = rand(-100, 350)
  const allTimePnl = rand(200, 1200)
  const condsMet = randInt(4, 8)

  return {
    engineStatus: Math.random() > 0.05 ? "ONLINE" : "OFFLINE",
    killSwitch: "OFF",
    currentSession: getSession(),
    nextSession: getNextSession(),
    balance: Math.round(balance * 100) / 100,
    todayPnl: Math.round(todayPnl * 100) / 100,
    todayPnlPct: Math.round((todayPnl / balance) * 10000) / 100,
    weekPnl: Math.round(weekPnl * 100) / 100,
    weekPnlPct: Math.round((weekPnl / balance) * 10000) / 100,
    allTimePnl: Math.round(allTimePnl * 100) / 100,
    allTimePnlPct: Math.round((allTimePnl / 5000) * 10000) / 100,
    tradesToday: randInt(0, 4),
    maxTradesToday: 5,
    openPositions: randInt(0, 2),
    winRate: Math.round(rand(55, 72) * 10) / 10,
    heartbeatAge: randInt(1, 28),
    serverUptime: randInt(86400, 2592000),
    currentBid: tickGold(),
    currentSpread: pick([0.28, 0.32, 0.36]),
    conditionsMet: condsMet,
    conditionsTotal: 8,
  }
}

// ────────────────────────────────────────────────────
// DAILY SUMMARIES
// ────────────────────────────────────────────────────

export function generateDailySummaries(count: number): DailySummary[] {
  const summaries: DailySummary[] = []
  let balance = 5000
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const trades = randInt(1, 5)
    const wins = randInt(0, trades)
    const losses = trades - wins
    const pnl = rand(-80, 150)
    balance += pnl
    summaries.push({
      date: d.toISOString().slice(0, 10),
      tradesCount: trades,
      wins,
      losses,
      grossPnl: Math.round(pnl * 100) / 100,
      netPnl: Math.round(pnl * 0.95 * 100) / 100,
      maxDrawdownPct: Math.round(rand(0.2, 3) * 100) / 100,
      endingBalance: Math.round(balance * 100) / 100,
      winRate: trades > 0 ? Math.round((wins / trades) * 10000) / 100 : 0,
    })
  }
  return summaries.reverse()
}

// ────────────────────────────────────────────────────
// BACKTEST RESULTS
// ────────────────────────────────────────────────────

export function generateBacktestResult(): BacktestResult {
  const wins = randInt(30, 80)
  const losses = randInt(15, 45)
  return {
    id: uid(),
    timestamp: Date.now() - randInt(0, 604800) * 1000,
    period: "30 days",
    totalTrades: wins + losses,
    wins,
    losses,
    winRate: Math.round((wins / (wins + losses)) * 10000) / 100,
    profitFactor: Math.round(rand(1.2, 2.8) * 100) / 100,
    maxDrawdown: Math.round(rand(2, 7) * 100) / 100,
    netPnl: Math.round(rand(200, 1500) * 100) / 100,
    sharpeRatio: Math.round(rand(0.8, 2.5) * 100) / 100,
    status: "COMPLETED",
  }
}

// ────────────────────────────────────────────────────
// ENGINE CONFIG (default)
// ────────────────────────────────────────────────────

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  symbol: "XAUUSDc",
  magicNumber: 202600,
  tradingMode: "DEMO",
  riskPercent: 1.5,
  atrSlMult: 1.5,
  atrTp1Mult: 1.5,
  atrTp2Mult: 2.5,
  atrTrailMult: 1.0,
  atrBreakevenTrigger: 0.7,
  atrBreakevenMult: 0.5,
  partialClosePct: 60,
  emaFast: 50,
  emaSlow: 200,
  emaPullback: 20,
  rsiPeriod: 14,
  atrPeriod: 14,
  adxPeriod: 14,
  adxMinimum: 22,
  rsiLow: 40,
  rsiHigh: 60,
  ema20SlopeBars: 3,
  maxExtensionAtr: 3.5,
  maxSpreadPrice: 0.40,
  maxDailyLossPct: 4,
  maxWeeklyLossPct: 6,
  maxDrawdownPct: 8,
  maxTradesPerDay: 5,
  maxOpenTrades: 2,
  maxLot: 0.10,
  minLot: 0.01,
  sessions: {
    london: { start: "10:00", end: "13:00" },
    nyOverlap: { start: "15:00", end: "18:00" },
    nyCont: { start: "18:00", end: "20:00" },
  },
}

// ────────────────────────────────────────────────────
// SCHEDULES
// ────────────────────────────────────────────────────

export function generateSchedules(): ScheduleEntry[] {
  const sessions: Array<{ session: TradingSession; start: string; end: string }> = [
    { session: "LONDON", start: "10:00", end: "13:00" },
    { session: "NY_OVERLAP", start: "15:00", end: "18:00" },
    { session: "NY_CONT", start: "18:00", end: "20:00" },
  ]
  const entries: ScheduleEntry[] = []
  for (let day = 0; day < 5; day++) { // Mon-Fri
    for (const s of sessions) {
      entries.push({
        id: uid(),
        session: s.session,
        dayOfWeek: day,
        startTime: s.start,
        endTime: s.end,
        enabled: true,
        autoStart: day < 5,
      })
    }
  }
  return entries
}

// ────────────────────────────────────────────────────
// PAYMENTS
// ────────────────────────────────────────────────────

export function generatePayments(count: number): Payment[] {
  const payments: Payment[] = []
  for (let i = 0; i < count; i++) {
    payments.push({
      id: uid(),
      timestamp: Date.now() - i * randInt(86400, 604800) * 1000,
      userId: `user-${randInt(1, 20)}`,
      amount: pick([500, 1000, 2500, 5000, 10000]),
      currency: pick(["KES", "USD"]),
      type: pick(["DEPOSIT", "SUBSCRIPTION", "WITHDRAWAL"]),
      method: "MPESA",
      status: pick(["COMPLETED", "COMPLETED", "COMPLETED", "PENDING"]),
      mpesaReceiptNumber: `QK${randInt(10000, 99999)}${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}`,
      phoneNumber: `+2547${randInt(10000000, 99999999)}`,
      reference: "BIRGENAI HUB",
    })
  }
  return payments
}

// ────────────────────────────────────────────────────
// INVESTORS
// ────────────────────────────────────────────────────

export function generateInvestors(): InvestorAccount[] {
  const names = ["Emmanuel Chandaria", "Sarah Kimani", "David Ochieng", "Grace Wanjiku", "James Mwangi", "Faith Njeri", "Brian Kipkoech", "Mercy Akinyi"]
  return names.map((name, i) => {
    const deposit = pick([5000, 10000, 25000, 50000, 100000])
    const profitPct = rand(3, 12)
    return {
      id: `inv-${i + 1}`,
      name,
      email: `${name.toLowerCase().replace(" ", ".")}@gmail.com`,
      phone: `+2547${randInt(10000000, 99999999)}`,
      role: i === 0 ? "ADMIN" as const : "INVESTOR" as const,
      balance: Math.round(deposit * (1 + profitPct / 100) * 100) / 100,
      depositTotal: deposit,
      withdrawalTotal: Math.round(rand(0, deposit * 0.1) * 100) / 100,
      profitTotal: Math.round(deposit * profitPct / 100 * 100) / 100,
      profitPct: Math.round(profitPct * 100) / 100,
      joinedAt: Date.now() - randInt(30, 365) * 86400 * 1000,
      lastActive: Date.now() - randInt(0, 7) * 86400 * 1000,
      subscriptionStatus: pick(["ACTIVE", "ACTIVE", "ACTIVE", "TRIAL"]),
    }
  })
}

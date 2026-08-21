"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Bot, Send, User, Terminal } from "lucide-react"

const PRESET_COMMANDS = [
  { cmd: "/status", label: "Engine Status", emoji: "📊" },
  { cmd: "/today", label: "Today's P&L", emoji: "📈" },
  { cmd: "/week", label: "Weekly Stats", emoji: "📅" },
  { cmd: "/alltime", label: "All-time Stats", emoji: "🏆" },
  { cmd: "/trades", label: "Recent Trades", emoji: "📋" },
  { cmd: "/balance", label: "Balance", emoji: "💰" },
  { cmd: "/sessions", label: "Sessions", emoji: "🕐" },
  { cmd: "/kill", label: "Kill Switch", emoji: "🚨" },
  { cmd: "/resume", label: "Resume", emoji: "✅" },
]

interface Message {
  id: string
  direction: "in" | "out"
  text: string
  timestamp: number
}

const MOCK_RESPONSES: Record<string, string> = {
  "/status": `⚡ GOLDSTRIKE STATUS\n━━━━━━━━━━━━━━━━━━━━\n🟢 Engine: ONLINE\n🔓 Kill Switch: OFF\n📊 Session: LONDON\n💰 Balance: $5,432.10\n📈 Today: +$42.30 (2 trades)\n🎯 Win Rate: 65.4%\n━━━━━━━━━━━━━━━━━━━━`,
  "/today": `📈 TODAY'S PERFORMANCE\n━━━━━━━━━━━━━━━━━━━━\nTrades: 2\nWins: 1 | Losses: 1\nGross P&L: +$42.30\nWin Rate: 50%\n━━━━━━━━━━━━━━━━━━━━`,
  "/week": `📅 WEEKLY PERFORMANCE\n━━━━━━━━━━━━━━━━━━━━\nTrades: 8\nWins: 5 | Losses: 3\nGross P&L: +$185.60\nWin Rate: 62.5%\nProfit Factor: 1.85\n━━━━━━━━━━━━━━━━━━━━`,
  "/balance": `💰 ACCOUNT BALANCE\n━━━━━━━━━━━━━━━━━━━━\nBalance: $5,432.10\nEquity: $5,445.80\nFree Margin: $5,120.50\nMargin Level: 2,450%\n━━━━━━━━━━━━━━━━━━━━`,
  "/kill": `🚨 KILL SWITCH ACTIVATED\n━━━━━━━━━━━━━━━━━━━━\nAll trading halted.\nOpen positions still managed.\nUse /resume to deactivate.\n━━━━━━━━━━━━━━━━━━━━`,
  "/resume": `✅ TRADING RESUMED\n━━━━━━━━━━━━━━━━━━━━\nKill switch deactivated.\nEngine scanning for setups.\n━━━━━━━━━━━━━━━━━━━━`,
  "/sessions": `🕐 TRADING SESSIONS (EAT)\n━━━━━━━━━━━━━━━━━━━━\n🏛️ London: 10:00 – 13:00\n🗽 NY Overlap: 15:00 – 18:00\n🌆 NY Cont: 18:00 – 20:00\n━━━━━━━━━━━━━━━━━━━━\nNext: NY Overlap at 15:00`,
}

export default function TelegramPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", direction: "out", text: "⚡ GOLDSTRIKE v2.0 ONLINE\n━━━━━━━━━━━━━━━━━━━━\nMode: DEMO | Symbol: XAUUSDc\nScanning for setups...", timestamp: Date.now() - 60000 },
  ])
  const [input, setInput] = useState("")

  const sendCommand = (cmd: string) => {
    const userMsg: Message = { id: `u-${Date.now()}`, direction: "in", text: cmd, timestamp: Date.now() }
    const botResponse = MOCK_RESPONSES[cmd] || `Unknown command: ${cmd}\nType /help for available commands.`
    const botMsg: Message = { id: `b-${Date.now()}`, direction: "out", text: botResponse, timestamp: Date.now() + 500 }
    setMessages((prev) => [...prev, userMsg, botMsg])
    setInput("")
  }

  const handleSend = () => {
    if (!input.trim()) return
    sendCommand(input.trim())
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
          <Bot className="w-7 h-7 text-blue-500" />
          Telegram Bot Control
        </h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          BirgenAI Trading Bot — Command Interface
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Command Panel */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-500" />
              Quick Commands
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {PRESET_COMMANDS.map((c) => (
              <Button
                key={c.cmd}
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs font-mono gap-2"
                onClick={() => sendCommand(c.cmd)}
              >
                <span>{c.emoji}</span>
                <span className="text-muted-foreground">{c.cmd}</span>
                <span className="ml-auto text-[9px] text-muted-foreground">{c.label}</span>
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* Chat Window */}
        <Card className="lg:col-span-3 bg-card border-border flex flex-col" style={{ height: "600px" }}>
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <div className="text-sm font-mono font-semibold text-foreground">BirgenAI Trading Bot</div>
                <div className="text-[10px] font-mono text-green-500">Online</div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.direction === "in" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] p-3 rounded-lg text-xs font-mono whitespace-pre-wrap ${
                    msg.direction === "in"
                      ? "bg-amber-500/20 text-foreground"
                      : "bg-muted/50 text-foreground"
                  }`}
                >
                  {msg.text}
                  <div className="text-[9px] text-muted-foreground mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </CardContent>
          <div className="p-3 border-t border-border shrink-0">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a command (e.g., /status)..."
                className="text-xs font-mono"
              />
              <Button size="sm" onClick={handleSend} className="gap-1 font-mono text-xs">
                <Send className="w-3.5 h-3.5" /> Send
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

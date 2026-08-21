"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Settings, Server, Bell, Shield, Palette, Save } from "lucide-react"

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground flex items-center gap-3">
            <Settings className="w-7 h-7 text-amber-500" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">Platform configuration</p>
        </div>
        <Button onClick={handleSave} className="bg-amber-500 hover:bg-amber-600 text-black font-mono text-xs gap-2">
          <Save className="w-3.5 h-3.5" />
          {saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      {/* API Connection */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Server className="w-4 h-4 text-amber-500" />
            API Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">Server URL</label>
              <Input defaultValue="http://45.150.190.19:5000" className="font-mono text-xs bg-muted/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">API Key</label>
              <Input defaultValue="BirgenAI-Secret-****" type="password" className="font-mono text-xs bg-muted/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">Database Host</label>
              <Input defaultValue="45.150.190.19" className="font-mono text-xs bg-muted/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground">Database Name</label>
              <Input defaultValue="quantempire" className="font-mono text-xs bg-muted/30" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Badge variant="outline" className="text-[9px] text-green-400 border-green-400/30">CONNECTED</Badge>
            <span className="text-[10px] font-mono text-muted-foreground">Last ping: 42ms</span>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Trade Alerts", desc: "Get notified when trades are opened or closed", default: true },
            { label: "Engine Status Changes", desc: "Kill switch, pause/resume, reconnect events", default: true },
            { label: "Risk Breaches", desc: "Daily loss limit, max DD, or correlation alerts", default: true },
            { label: "Heartbeat Failures", desc: "Alert when heartbeat is missed for >15s", default: true },
            { label: "Investor Activity", desc: "Deposits, withdrawals, and subscription changes", default: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1.5">
              <div>
                <div className="text-xs font-mono text-foreground">{item.label}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{item.desc}</div>
              </div>
              <Switch defaultChecked={item.default} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-500" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="text-xs font-mono text-foreground">Two-Factor Authentication</div>
              <div className="text-[10px] font-mono text-muted-foreground">Require 2FA for kill switch and withdrawals</div>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="text-xs font-mono text-foreground">IP Whitelist</div>
              <div className="text-[10px] font-mono text-muted-foreground">Only allow access from trusted IPs</div>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="text-xs font-mono text-foreground">Session Timeout</div>
              <div className="text-[10px] font-mono text-muted-foreground">Auto-logout after inactivity</div>
            </div>
            <Badge variant="outline" className="text-[9px] text-muted-foreground border-border">30 min</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Palette className="w-4 h-4 text-amber-500" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="text-xs font-mono text-foreground">Dark Mode</div>
              <div className="text-[10px] font-mono text-muted-foreground">Always on — built for dark environments</div>
            </div>
            <Switch defaultChecked disabled />
          </div>
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="text-xs font-mono text-foreground">Compact Mode</div>
              <div className="text-[10px] font-mono text-muted-foreground">Reduce spacing for more data density</div>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="text-xs font-mono text-foreground">Accent Color</div>
              <div className="text-[10px] font-mono text-muted-foreground">Primary highlight color</div>
            </div>
            <div className="w-6 h-6 rounded-full bg-amber-500 border-2 border-border" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

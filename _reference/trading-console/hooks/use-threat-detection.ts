"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { DEFAULT_THREAT_RULES, type ThreatAlert, type ThreatRule } from "@/lib/threat-detection"
import type { PacketHeader } from "@/lib/types"

const DETECTION_INTERVAL = 5000 // Check every 5 seconds
const TIME_WINDOW = 10000 // Look at last 10 seconds

export function useThreatDetection(packets: PacketHeader[]) {
  const [alerts, setAlerts] = useState<ThreatAlert[]>([])
  const [rules, setRules] = useState<ThreatRule[]>(DEFAULT_THREAT_RULES)
  const lastCheckRef = useRef<number>(0)

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      if (now - lastCheckRef.current < DETECTION_INTERVAL) return

      const newAlerts: ThreatAlert[] = []

      rules.forEach((rule) => {
        if (!rule.enabled) return

        const alert = rule.check(packets, TIME_WINDOW)
        if (alert) {
          setAlerts((currentAlerts) => {
            const isDuplicate = currentAlerts.some(
              (existing) => existing.ruleId === alert.ruleId && now - existing.timestamp < 30000,
            )
            if (!isDuplicate) {
              newAlerts.push(alert)
            }
            return currentAlerts
          })
        }
      })

      if (newAlerts.length > 0) {
        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 20))
      }

      lastCheckRef.current = now
    }, 1000)

    return () => clearInterval(interval)
  }, [packets, rules])

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId))
  }, [])

  const clearAllAlerts = useCallback(() => {
    setAlerts([])
  }, [])

  const toggleRule = useCallback((ruleId: string) => {
    setRules((prev) => prev.map((rule) => (rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule)))
  }, [])

  return {
    alerts,
    rules,
    dismissAlert,
    clearAllAlerts,
    toggleRule,
  }
}

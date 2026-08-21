export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

export function formatPacketsPerSecond(pps: number): string {
  return `${pps.toFixed(1)} pkt/s`
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  })
}

export function getProtocolColor(protocol: string): string {
  const colors: Record<string, string> = {
    TCP: "text-blue-400",
    UDP: "text-purple-400",
    HTTP: "text-green-400",
    HTTPS: "text-emerald-400",
    DNS: "text-orange-400",
    ICMP: "text-cyan-400",
    SSH: "text-pink-400",
    FTP: "text-yellow-400",
  }
  return colors[protocol] || "text-gray-400"
}

export function getProtocolBgColor(protocol: string): string {
  const colors: Record<string, string> = {
    TCP: "bg-blue-500/20 border-blue-500/30",
    UDP: "bg-purple-500/20 border-purple-500/30",
    HTTP: "bg-green-500/20 border-green-500/30",
    HTTPS: "bg-emerald-500/20 border-emerald-500/30",
    DNS: "bg-orange-500/20 border-orange-500/30",
    ICMP: "bg-cyan-500/20 border-cyan-500/30",
    SSH: "bg-pink-500/20 border-pink-500/30",
    FTP: "bg-yellow-500/20 border-yellow-500/30",
  }
  return colors[protocol] || "bg-gray-500/20 border-gray-500/30"
}

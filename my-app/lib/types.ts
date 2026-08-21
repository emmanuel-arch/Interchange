export type Protocol = "TCP" | "UDP" | "HTTP" | "HTTPS" | "DNS" | "ICMP" | "SSH" | "FTP"

export type ConnectionState =
  | "ESTABLISHED"
  | "SYN_SENT"
  | "SYN_RECV"
  | "FIN_WAIT"
  | "TIME_WAIT"
  | "CLOSE"
  | "CLOSE_WAIT"
  | "LAST_ACK"
  | "LISTEN"
  | "CLOSING"

export interface Geolocation {
  lat: number
  lng: number
  country: string
}

export interface PacketHeader {
  id: string
  timestamp: number
  sourceIp: string
  destIp: string
  sourcePort: number
  destPort: number
  protocol: Protocol
  size: number
  flags: string[]
  ttl: number
  isSuspicious: boolean
  geolocation: Geolocation
  country: string
  city: string
}

export interface Connection {
  id: string
  sourceIp: string
  destIp: string
  sourcePort: number
  destPort: number
  protocol: Protocol
  state: ConnectionState
  bytesReceived: number
  bytesSent: number
  startTime: number
  lastActivity: number
}

export interface TrafficStats {
  totalPackets: number
  totalBytes: number
  packetsPerSecond: number
  bytesPerSecond: number
  protocolDistribution: Record<Protocol, number>
  suspiciousCount: number
  activeConnections: number
}

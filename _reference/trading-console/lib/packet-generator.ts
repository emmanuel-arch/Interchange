import type { PacketHeader, Protocol, Connection, ConnectionState } from "./types"

const PROTOCOLS: Protocol[] = ["TCP", "UDP", "HTTP", "HTTPS", "DNS", "ICMP", "SSH", "FTP"]

const COMMON_PORTS: Record<Protocol, number[]> = {
  HTTP: [80, 8080, 3000, 5000],
  HTTPS: [443, 8443],
  DNS: [53],
  SSH: [22],
  FTP: [20, 21],
  TCP: [80, 443, 22, 3389, 5432, 3306],
  UDP: [53, 67, 68, 123, 161],
  ICMP: [0],
}

const TCP_FLAGS = ["SYN", "ACK", "FIN", "RST", "PSH", "URG"]

const SAMPLE_IPS = [
  "192.168.1.1",
  "192.168.1.100",
  "10.0.0.1",
  "10.0.0.50",
  "172.16.0.1",
  "8.8.8.8",
  "1.1.1.1",
  "142.250.185.46",
  "151.101.1.140",
  "104.16.132.229",
  "13.107.42.14",
]

const COUNTRIES = ["United States", "United Kingdom", "Germany", "Japan", "Canada", "France", "Singapore", "Australia"]
const CITIES = ["New York", "London", "Berlin", "Tokyo", "Toronto", "Paris", "Singapore", "Sydney"]

const CITY_COORDS: Record<string, { lat: number; lng: number; country: string }> = {
  "New York": { lat: 40.7128, lng: -74.006, country: "United States" },
  London: { lat: 51.5074, lng: -0.1278, country: "United Kingdom" },
  Berlin: { lat: 52.52, lng: 13.405, country: "Germany" },
  Tokyo: { lat: 35.6762, lng: 139.6503, country: "Japan" },
  Toronto: { lat: 43.6532, lng: -79.3832, country: "Canada" },
  Paris: { lat: 48.8566, lng: 2.3522, country: "France" },
  Singapore: { lat: 1.3521, lng: 103.8198, country: "Singapore" },
  Sydney: { lat: -33.8688, lng: 151.2093, country: "Australia" },
}

function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

function randomPort(protocol: Protocol): number {
  const ports = COMMON_PORTS[protocol] || []
  if (ports.length > 0 && Math.random() > 0.3) {
    return randomItem(ports)
  }
  return Math.floor(Math.random() * 65535) + 1
}

function generateRandomIP(): string {
  return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
}

export function generatePacket(): PacketHeader {
  const protocol = randomItem(PROTOCOLS)
  const isSuspicious = Math.random() < 0.05 // 5% suspicious packets

  const sourceIp = Math.random() > 0.3 ? randomItem(SAMPLE_IPS) : generateRandomIP()
  const destIp = Math.random() > 0.3 ? randomItem(SAMPLE_IPS) : generateRandomIP()

  const flags: string[] = []
  if (protocol === "TCP" || protocol === "HTTP" || protocol === "HTTPS" || protocol === "SSH" || protocol === "FTP") {
    const numFlags = Math.floor(Math.random() * 3) + 1
    for (let i = 0; i < numFlags; i++) {
      const flag = randomItem(TCP_FLAGS)
      if (!flags.includes(flag)) flags.push(flag)
    }
  }

  const city = randomItem(CITIES)
  const geolocation = CITY_COORDS[city]

  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    sourceIp,
    destIp,
    sourcePort: randomPort(protocol),
    destPort: randomPort(protocol),
    protocol,
    size: Math.floor(Math.random() * 1500) + 64,
    flags: flags.sort(),
    ttl: Math.floor(Math.random() * 64) + 64,
    isSuspicious,
    geolocation,
    country: geolocation.country,
    city,
  }
}

const CONNECTION_STATES: ConnectionState[] = ["ESTABLISHED", "SYN_SENT", "SYN_RECV", "FIN_WAIT", "TIME_WAIT", "LISTEN"]

export function generateConnection(): Connection {
  const protocol = randomItem(["TCP", "UDP", "HTTP", "HTTPS"] as Protocol[])
  const startTime = Date.now() - Math.floor(Math.random() * 60000)

  return {
    id: Math.random().toString(36).substr(2, 9),
    sourceIp: randomItem(SAMPLE_IPS),
    destIp: randomItem(SAMPLE_IPS),
    sourcePort: randomPort(protocol),
    destPort: randomPort(protocol),
    protocol,
    state: randomItem(CONNECTION_STATES),
    bytesReceived: Math.floor(Math.random() * 100000),
    bytesSent: Math.floor(Math.random() * 50000),
    startTime,
    lastActivity: Date.now(),
  }
}

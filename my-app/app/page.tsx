import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getCookieName, readSuiteSession } from "@/lib/suite-session"
import { TradingScreenLock } from "@/components/screensaver/trading-screenlock"

// Always re-check the session cookie on each request (no static caching).
export const dynamic = "force-dynamic"

export default async function Home() {
  // SSO: if a valid BirgenAI suite session already exists (e.g. signed in at
  // birgenai.com), skip the lock and go straight to the cockpit.
  const cookieStore = await cookies()
  const token = cookieStore.get(getCookieName())?.value
  const session = await readSuiteSession(token)
  if (session) redirect("/dashboard")

  // Otherwise show the screen-lock landing page.
  return <TradingScreenLock mode="gate" />
}

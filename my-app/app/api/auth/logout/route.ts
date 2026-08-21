import { NextResponse } from "next/server";
import { getCookieName, getCookieDomain, isSecureEnv } from "@/lib/suite-session";

export const runtime = "nodejs";

/** Clears the shared suite session cookie. Note: this signs the user out of the
 *  whole *.birgenai.com suite when AUTH_COOKIE_DOMAIN=.birgenai.com is set. */
function clearSession() {
  const res = NextResponse.json({ ok: true });
  const domain = getCookieDomain();
  res.cookies.set(getCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureEnv(),
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });
  return res;
}

export async function POST() {
  return clearSession();
}

export async function GET() {
  return clearSession();
}

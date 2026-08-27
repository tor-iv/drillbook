import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { AUTH_COOKIE } from "./constants";

export { AUTH_COOKIE };
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year — personal device

function secret(): Uint8Array {
  const s = process.env.AUTH_COOKIE_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_COOKIE_SECRET missing or too short");
  return new TextEncoder().encode(s);
}

export function pinMatches(pin: string): boolean {
  const expected = process.env.APP_PIN ?? "";
  if (expected.length === 0) return false;
  const a = Buffer.from(pin);
  const b = Buffer.from(expected);
  // timingSafeEqual demands equal lengths; length differing is itself a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.HTTPS === "true" || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

/** Cookie check for API route handlers (App Router `cookies()`). */
export async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  return token ? verifySessionToken(token) : false;
}

/** Bearer-token check for the iOS Shortcut endpoints. */
export function hasShortcutToken(req: NextRequest): boolean {
  const expected = process.env.SHORTCUT_API_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

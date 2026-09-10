import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
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

// ---- Device tokens (native apps) -------------------------------------------
// A phone or watch can't hold a browser cookie comfortably, and sharing the one
// SHORTCUT_API_TOKEN across devices means one leak revokes everything. Each
// device mints its own token with the PIN; only the hash is stored.

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintDeviceToken(name: string): { id: number; token: string } {
  const token = `tally_${randomBytes(32).toString("base64url")}`;
  const row = db.insert(schema.deviceTokens).values({ name: name.trim().slice(0, 60) || "device", tokenHash: hashToken(token) }).returning().get();
  return { id: row.id, token };
}

export function listDeviceTokens(): { id: number; name: string; createdAt: string; lastSeenAt: string | null }[] {
  return db
    .select({ id: schema.deviceTokens.id, name: schema.deviceTokens.name, createdAt: schema.deviceTokens.createdAt, lastSeenAt: schema.deviceTokens.lastSeenAt })
    .from(schema.deviceTokens)
    .all();
}

export function revokeDeviceToken(id: number): boolean {
  return db.delete(schema.deviceTokens).where(eq(schema.deviceTokens.id, id)).run().changes > 0;
}

function bearer(req: NextRequest): string {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

export function hasDeviceToken(req: NextRequest): boolean {
  const token = bearer(req);
  if (!token.startsWith("tally_")) return false;
  const row = db.select().from(schema.deviceTokens).where(eq(schema.deviceTokens.tokenHash, hashToken(token))).get();
  if (!row) return false;
  db.update(schema.deviceTokens).set({ lastSeenAt: new Date().toISOString() }).where(eq(schema.deviceTokens.id, row.id)).run();
  return true;
}

/** The one auth check for user-facing API routes: browser cookie, minted device token, or the legacy Shortcut token. */
export async function authorized(req: NextRequest): Promise<boolean> {
  if (bearer(req)) return hasDeviceToken(req) || hasShortcutToken(req);
  return isAuthenticated();
}

import { db, schema } from "@/db";
import { addDays } from "@/lib/dates";

// Hand-rolled Google OAuth + Calendar REST — the googleapis package is ~50MB
// of generated clients for what is here two token calls and one events call.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function redirectUri(): string {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/google/callback`;
}

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function consentUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    // Both required to actually receive a refresh_token on (re-)consent.
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode(code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as { refresh_token?: string; error?: string };
  if (!res.ok || !data.refresh_token) {
    throw new Error(`token exchange failed: ${data.error ?? res.status}`);
  }
  db.insert(schema.googleTokens)
    .values({ id: 1, refreshToken: data.refresh_token, connectedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: schema.googleTokens.id,
      set: { refreshToken: data.refresh_token, connectedAt: new Date().toISOString() },
    })
    .run();
}

export function googleConnected(): boolean {
  return !!db.select().from(schema.googleTokens).get();
}

// Access tokens last an hour; the chat router now reads the calendar on every
// turn, so re-exchanging the refresh token per call would be wasteful. One
// persistent Node process → a module-level cache is enough.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  const row = db.select().from(schema.googleTokens).get();
  if (!row) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: row.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    console.error("[google] refresh failed:", data.error ?? res.status);
    return null;
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000 };
  return data.access_token;
}

function calendarBase(): string {
  const row = db.select().from(schema.googleTokens).get();
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(row?.calendarId ?? "primary")}/events`;
}

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD local
  startTime?: string; // HH:MM local; absent for all-day
  endTime?: string;
};

/**
 * Events on [from, from+days) in the app's timezone. The API wants RFC3339
 * bounds, so we over-fetch a day each side in UTC and filter on the local
 * date Google hands back (timeZone= makes dateTime come in local time).
 */
export async function listEvents(from: string, days: number): Promise<CalendarEvent[]> {
  const token = await accessToken();
  if (!token) return [];
  const timeZone = process.env.CRON_TIMEZONE ?? "America/New_York";
  const end = addDays(from, days);
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
    timeZone,
    timeMin: new Date(`${addDays(from, -1)}T00:00:00Z`).toISOString(),
    timeMax: new Date(`${addDays(end, 1)}T00:00:00Z`).toISOString(),
  });
  const res = await fetch(`${calendarBase()}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("[google] listEvents failed:", res.status, await res.text());
    return [];
  }
  const data = (await res.json()) as {
    items?: { id: string; summary?: string; status?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[];
  };
  return (data.items ?? [])
    .filter((it) => it.status !== "cancelled")
    .map((it) => {
      const date = it.start?.date ?? it.start?.dateTime?.slice(0, 10) ?? "";
      return {
        id: it.id,
        title: it.summary ?? "(untitled)",
        date,
        startTime: it.start?.dateTime?.slice(11, 16),
        endTime: it.end?.dateTime?.slice(11, 16),
      };
    })
    .filter((e) => e.date >= from && e.date < end);
}

export async function deleteEvent(id: string): Promise<boolean> {
  const token = await accessToken();
  if (!token) return false;
  const res = await fetch(`${calendarBase()}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok || res.status === 410) return true; // 410 = already gone
  console.error("[google] deleteEvent failed:", res.status, await res.text());
  return false;
}

/**
 * Write/replace the day's summary event. Deterministic event ID (Calendar API
 * IDs allow base32hex-ish lowercase) so a re-run updates instead of duplicating.
 */
export async function upsertDailyEvent(date: string, summary: string): Promise<boolean> {
  const token = await accessToken();
  if (!token) return false;

  const row = db.select().from(schema.googleTokens).get();
  const calendarId = encodeURIComponent(row?.calendarId ?? "primary");
  const eventId = `drillbook${date.replaceAll("-", "")}`;
  const body = JSON.stringify({
    id: eventId,
    summary: `Drillbook: ${summary}`,
    start: { date },
    end: { date },
    transparency: "transparent", // all-day marker, doesn't block the calendar
  });
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Try update first (covers the common re-run case), fall back to insert.
  const put = await fetch(`${base}/${eventId}`, { method: "PUT", headers, body });
  if (put.ok) return true;
  if (put.status === 404) {
    const post = await fetch(base, { method: "POST", headers, body });
    if (post.ok) return true;
    console.error("[google] event insert failed:", post.status, await post.text());
    return false;
  }
  console.error("[google] event update failed:", put.status, await put.text());
  return false;
}

/**
 * Insert a one-off event (Telegram "put climbing on my calendar" requests).
 * Timed when startTime is given (endTime defaults to +1h), all-day otherwise.
 */
export async function createEvent(opts: {
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string | null; // HH:MM, 24h, local
  endTime?: string | null;
}): Promise<boolean> {
  const token = await accessToken();
  if (!token) return false;

  const row = db.select().from(schema.googleTokens).get();
  const calendarId = encodeURIComponent(row?.calendarId ?? "primary");
  const timeZone = process.env.CRON_TIMEZONE ?? "America/New_York";

  let start: object;
  let end: object;
  if (opts.startTime) {
    // Default to +1h, capped at 23:59 so the end never wraps before the start.
    const mins = Math.min(
      Number(opts.startTime.slice(0, 2)) * 60 + Number(opts.startTime.slice(3, 5)) + 60,
      23 * 60 + 59,
    );
    const endTime =
      opts.endTime ??
      `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    start = { dateTime: `${opts.date}T${opts.startTime}:00`, timeZone };
    end = { dateTime: `${opts.date}T${endTime}:00`, timeZone };
  } else {
    start = { date: opts.date };
    end = { date: opts.date };
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ summary: opts.title, start, end }),
    },
  );
  if (!res.ok) console.error("[google] createEvent failed:", res.status, await res.text());
  return res.ok;
}

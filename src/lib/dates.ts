// All "day" logic runs in the user's timezone, not the container's (UTC).
// A rep logged at 11pm ET must land on today's ET date, and streaks/nudges
// must roll over at the user's midnight.
const TZ = process.env.CRON_TIMEZONE ?? "America/New_York";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 'YYYY-MM-DD' for now (or a given instant) in the user's timezone. */
export function localDate(d: Date = new Date()): string {
  return dayFmt.format(d); // en-CA formats as YYYY-MM-DD
}

/** localDate shifted by n days (n may be negative). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`); // noon UTC avoids DST edge cases
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Last n dates ending at `end`, oldest first. */
export function dateRange(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

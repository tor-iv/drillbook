import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// DB-backed "ran today" flag: an in-process scheduler forgets on every
// container restart; this table doesn't.
export function alreadyRanToday(jobKey: string, today: string): boolean {
  const row = db.select().from(schema.cronRuns).where(eq(schema.cronRuns.jobKey, jobKey)).get();
  return row?.lastRunDate === today;
}

export function markRan(jobKey: string, today: string): void {
  db.insert(schema.cronRuns)
    .values({ jobKey, lastRunDate: today })
    .onConflictDoUpdate({ target: schema.cronRuns.jobKey, set: { lastRunDate: today } })
    .run();
}

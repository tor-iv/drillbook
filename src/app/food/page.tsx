import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, localDate } from "@/lib/dates";
import { getDayEnergy } from "@/lib/energy";
import { FoodLog } from "@/components/food-log";

export const dynamic = "force-dynamic";

export default function FoodPage() {
  const today = localDate();
  const rows = db
    .select()
    .from(schema.meals)
    .where(eq(schema.meals.date, today))
    .orderBy(desc(schema.meals.id))
    .all();

  // "Usuals": most-repeated meals from the last 30 days (excluding today) —
  // one tap re-logs the stored macros exactly, no AI.
  const past = db
    .select()
    .from(schema.meals)
    .where(and(gte(schema.meals.date, addDays(today, -30)), lt(schema.meals.date, today)))
    .orderBy(desc(schema.meals.id))
    .all();
  const byName = new Map<string, { count: number; meal: (typeof past)[number] }>();
  for (const m of past) {
    const cur = byName.get(m.name.toLowerCase());
    if (cur) cur.count++;
    else byName.set(m.name.toLowerCase(), { count: 1, meal: m });
  }
  const usuals = [...byName.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(({ meal }) => ({ id: meal.id, name: meal.name, calories: Math.round(meal.calories) }));

  return (
    <main>
      <h1 className="font-display mb-1 text-4xl leading-none">Food</h1>
      <p className="mb-4 text-sm text-pencil">
        Snap it or say it — calories are a coach&apos;s guesstimate, not a lab report.
      </p>
      <FoodLog
        initialMeals={rows.map((m) => ({
          id: m.id,
          name: m.name,
          calories: m.calories,
          protein: m.protein,
          method: m.method,
          itemsJson: m.itemsJson,
        }))}
        usuals={usuals}
        burned={getDayEnergy(today).burned}
        deficitTarget={getDayEnergy(today).deficitTarget}
      />
    </main>
  );
}

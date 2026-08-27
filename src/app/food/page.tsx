import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { localDate } from "@/lib/dates";
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
        }))}
      />
    </main>
  );
}

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/db";
import { seedDefaultActivities } from "./seed-activities";

migrate(db, { migrationsFolder: "./drizzle" });
seedDefaultActivities();
console.log("migrations applied");

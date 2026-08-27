import { desc } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db, schema } from "@/db";
import { isAuthenticated } from "@/lib/auth";
import { localDate } from "@/lib/dates";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/photos";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
]);

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = db.select().from(schema.photos).orderBy(desc(schema.photos.takenAt)).all();
  return NextResponse.json({ photos: rows });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "multipart 'file' required" }, { status: 400 });
  }
  const ext = ALLOWED.get(file.type);
  if (!ext) return NextResponse.json({ error: `unsupported type ${file.type}` }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file too large (15MB max)" }, { status: 413 });

  const takenAt = (form.get("takenAt") as string | null) ?? localDate();
  const caption = (form.get("caption") as string | null) ?? null;

  const name = `${takenAt}-${nanoid(8)}.${ext}`;
  mkdirSync(UPLOAD_DIR, { recursive: true });
  await writeFile(join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));

  db.insert(schema.photos).values({ takenAt, filePath: name, caption }).run();
  return NextResponse.json({ ok: true, filePath: name });
}

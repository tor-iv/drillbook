import { eq } from "drizzle-orm";
import { createReadStream, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { isAuthenticated } from "@/lib/auth";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./data/photos";
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

// Photos are served through this cookie-checked handler, never from public/ —
// that is the entire privacy model for progress pics.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return new NextResponse("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const photo = db.select().from(schema.photos).where(eq(schema.photos.id, Number(id))).get();
  if (!photo) return new NextResponse("not found", { status: 404 });

  // basename() strips any path segments — file_path is DB-controlled, but
  // defense in depth costs one call.
  const path = join(UPLOAD_DIR, basename(photo.filePath));
  if (!existsSync(path)) return new NextResponse("file missing", { status: 404 });

  const ext = path.split(".").pop() ?? "";
  return new NextResponse(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

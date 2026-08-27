import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { PhotoGrid } from "@/components/photo-grid";

export const dynamic = "force-dynamic";

export default function PhotosPage() {
  const photos = db.select().from(schema.photos).orderBy(desc(schema.photos.takenAt)).all();
  return (
    <main>
      <h1 className="font-display mb-1 text-4xl leading-none">Photos</h1>
      <p className="mb-4 text-sm text-pencil">Progress pics. Tap two to compare.</p>
      <PhotoGrid photos={photos.map((p) => ({ id: p.id, takenAt: p.takenAt, caption: p.caption }))} />
    </main>
  );
}

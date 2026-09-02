import Link from "next/link";
import { db, schema } from "@/db";
import { BrainEditor } from "@/components/brain-editor";

export const dynamic = "force-dynamic";

export default function BrainPage() {
  const memories = db.select().from(schema.memories).orderBy(schema.memories.id).all();
  return (
    <main>
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-5xl leading-none">Brain</h1>
          <p className="mt-1 text-sm text-pencil">What Tally keeps in mind. Say things in chat and they land here.</p>
        </div>
        <Link href="/chat" className="btn-paper px-3 py-1 text-sm">
          Chat
        </Link>
      </header>
      <BrainEditor initial={memories} />
    </main>
  );
}

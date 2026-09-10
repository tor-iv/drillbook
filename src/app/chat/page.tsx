import Link from "next/link";
import { listRecent, toWire } from "@/lib/agent/history";
import { Chat } from "@/components/chat";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const initial = listRecent().map(toWire);
  return (
    <main>
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-5xl leading-none">Chat</h1>
          <p className="mt-1 text-sm text-pencil">Log, ask, schedule. Same coach as Telegram.</p>
        </div>
        <Link href="/brain" className="btn-paper px-3 py-1 text-sm">
          Brain
        </Link>
      </header>
      <Chat initialMessages={initial} />
    </main>
  );
}

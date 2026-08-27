export function CoachNote({ content }: { content: string }) {
  return (
    <aside className="marker-box mb-6 p-4">
      <p className="font-display text-sm text-margin">Gus says</p>
      <p className="font-marker mt-1 leading-snug">{content}</p>
    </aside>
  );
}

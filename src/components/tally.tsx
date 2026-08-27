// Hand-drawn tally marks: groups of five (four strokes + diagonal strike),
// one mark per day of streak. Slight per-stroke jitter (deterministic, from
// the stroke index — no Math.random, so server and client render identically).
function jitter(i: number, range: number): number {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * range;
}

const CAP = 40; // beyond 8 groups, show "+n"

export function Tally({ count, className }: { count: number; className?: string }) {
  if (count <= 0) {
    return <span className={`text-pencil text-xs ${className ?? ""}`}>no streak</span>;
  }
  const shown = Math.min(count, CAP);
  const groups: number[] = [];
  for (let left = shown; left > 0; left -= 5) groups.push(Math.min(left, 5));

  const strokeW = 6;
  const groupW = 4 * strokeW + 10;
  const width = groups.length * groupW + 4;

  return (
    <span className={className} title={`${count}-day streak`} aria-label={`${count}-day streak`}>
      <svg width={width} height={26} viewBox={`0 0 ${width} 26`} className="inline-block align-middle">
        {groups.map((n, g) =>
          Array.from({ length: n }, (_, i) => {
            const idx = g * 5 + i;
            if (i === 4) {
              // Diagonal strike across the group
              const x0 = g * groupW - 2;
              return (
                <line
                  key={idx}
                  x1={x0 + jitter(idx, 2)}
                  y1={20 + jitter(idx + 50, 2)}
                  x2={x0 + 4 * strokeW + 2}
                  y2={5 + jitter(idx + 90, 2)}
                  stroke="var(--color-margin)"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              );
            }
            const x = g * groupW + i * strokeW + 2;
            return (
              <line
                key={idx}
                x1={x + jitter(idx, 1.6)}
                y1={3 + jitter(idx + 31, 1.5)}
                x2={x + jitter(idx + 7, 1.6)}
                y2={23 + jitter(idx + 13, 1.5)}
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
              />
            );
          }),
        )}
      </svg>
      {count > CAP && <span className="font-marker ml-1 text-sm">+{count - CAP}</span>}
    </span>
  );
}

import type { Snapshot } from "@/api/queries";

interface DiffLine {
  type: "add" | "remove" | "same";
  line: string;
}

function computeDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;

  // LCS via DP table (capped at 800 lines each to stay O(n²) bounded)
  const A = a.slice(0, 800);
  const B = b.slice(0, 800);
  const M = A.length;
  const N = B.length;

  const dp: number[][] = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));
  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = M, j = N;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) {
      result.push({ type: "same", line: A[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", line: B[j - 1] });
      j--;
    } else {
      result.push({ type: "remove", line: A[i - 1] });
      i--;
    }
  }
  result.reverse();

  // Append truncated lines as-is if inputs were clipped
  if (m > 800 || n > 800) {
    result.push({ type: "same", line: `… (diff truncated — configs exceed 800 lines)` });
  }

  return result;
}

interface SnapshotDiffProps {
  before: Snapshot;
  after: Snapshot;
}

export function SnapshotDiff({ before, after }: SnapshotDiffProps) {
  const diff = computeDiff(before.content, after.content);

  const adds    = diff.filter((l) => l.type === "add").length;
  const removes = diff.filter((l) => l.type === "remove").length;

  return (
    <div className="rounded-lg border border-edge-dim bg-depth/80 overflow-hidden">
      <div className="px-3 py-2 border-b border-edge-dim flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-2xs font-mono">
          <span className="text-ink-muted">diff</span>
          <span className="tag">{before.label}</span>
          <span className="text-ink-muted/50">→</span>
          <span className="tag">{after.label}</span>
        </div>
        <div className="flex items-center gap-2 text-2xs font-mono">
          {adds > 0 && <span className="text-matrix">+{adds}</span>}
          {removes > 0 && <span className="text-crimson">-{removes}</span>}
        </div>
      </div>

      <div className="overflow-y-auto max-h-72 font-mono text-2xs leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {diff.map((entry, i) => (
              <tr
                key={i}
                className={
                  entry.type === "add"
                    ? "bg-matrix/10"
                    : entry.type === "remove"
                      ? "bg-crimson/10"
                      : ""
                }
              >
                <td className="select-none w-8 text-right pr-2 text-ink-muted/50 border-r border-edge-dim/30 py-0.5 px-1.5">
                  {i + 1}
                </td>
                <td className="w-4 text-center py-0.5">
                  {entry.type === "add"
                    ? <span className="text-matrix">+</span>
                    : entry.type === "remove"
                      ? <span className="text-crimson">-</span>
                      : <span className="text-ink-muted/30"> </span>}
                </td>
                <td
                  className={
                    entry.type === "add"
                      ? "text-matrix px-2 py-0.5 whitespace-pre"
                      : entry.type === "remove"
                        ? "text-crimson px-2 py-0.5 whitespace-pre"
                        : "text-ink-muted px-2 py-0.5 whitespace-pre"
                  }
                >
                  {entry.line || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

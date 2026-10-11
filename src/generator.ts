import { TIERS } from "./constants";
import { CASCADE_POOL } from "./cascade-pool";
import { parseBoard } from "./rules";
import { analyze, meetsFloor } from "./solver";
import type { BoardState } from "./game";
const randomInt = (lo: number, hi: number): number =>
  lo + Math.floor(Math.random() * (hi - lo + 1));
/** Mutate a certified seed, accepting only exhaustively certified candidates.
 * The seed provides a bounded fallback, so generating never stalls play. */
export function generate(tier: number): BoardState {
  const t = TIERS[tier - 1];
  if (!t) throw new Error("Unknown Cascade tier");
  const cols = randomInt(t.minCols, t.maxCols),
    rows = randomInt(t.minRows, t.maxRows);
  const pool = CASCADE_POOL.find(
    (p) => p.tier === tier && p.cols === cols && p.rows === rows,
  )!;
  const seed = pool.boards[randomInt(0, pool.boards.length - 1)];
  for (let attempt = 0; attempt < 4; attempt++) {
    let lines: string[] = [...seed];
    if (Math.random() < 0.5) lines.reverse();
    if (Math.random() < 0.5)
      lines = lines.map((r) => [...r].reverse().join(""));
    const cells = lines.map((r) => [...r]);
    for (let k = 0; k < randomInt(1, 3); k++) {
      const x = randomInt(0, cols - 1),
        y = randomInt(0, rows - 1);
      const nx = Math.max(0, Math.min(cols - 1, x + randomInt(-1, 1))),
        ny = Math.max(0, Math.min(rows - 1, y + randomInt(-1, 1)));
      // Exchange neighboring nodes/holes without changing the ladder's counts.
      [cells[y][x], cells[ny][nx]] = [cells[ny][nx], cells[y][x]];
    }
    if (Math.random() < 0.3) {
      const x = randomInt(0, cols - 1),
        y = randomInt(0, rows - 1);
      if (/[123]/.test(cells[y][x]))
        cells[y][x] = String(randomInt(t.minCharges, t.maxCharges));
    }
    const candidate = parseBoard(cells.map((r) => r.join("")));
    const a = analyze(candidate, 100_000);
    if (a && meetsFloor(a, t)) return candidate;
  }
  return parseBoard(seed);
}

import {
  BOARD_CX,
  BOARD_CY,
  CELL_PITCH,
  CHANNELS,
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
} from "./constants";
import type {
  BeamState,
  BoardState,
  Cell,
  Channel,
  RefractState,
} from "./game";

export const same = (a: Cell | undefined, b: Cell | undefined): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const cellX = (col: number, cols: number): number =>
  BOARD_CX - ((cols - 1) * CELL_PITCH) / 2 + col * CELL_PITCH;
export const cellY = (row: number, rows: number): number =>
  BOARD_CY - ((rows - 1) * CELL_PITCH) / 2 + row * CELL_PITCH;
export const spent = (beams: readonly BeamState[], cell: Cell): number =>
  beams.reduce((n, b) => n + b.cells.filter((c) => same(c, cell)).length, 0);
export function parseBoard(lines: readonly string[]): BoardState {
  if (
    !lines.length ||
    lines.length > GRID_MAX_ROWS ||
    !lines[0].length ||
    lines[0].length > GRID_MAX_COLS ||
    lines.some((r) => r.length !== lines[0].length || /[^.TSDtsd123]/.test(r))
  )
    throw new Error("Invalid board notation or dimensions");
  const nodes: BoardState["nodes"][number][] = [];
  lines.forEach((line, row) =>
    [...line].forEach((char, col) => {
      if (char === ".") return;
      const channel =
        (
          { t: "triangle", s: "square", d: "diamond" } as Record<
            string,
            Channel
          >
        )[char.toLowerCase()] ?? null;
      nodes.push({
        col,
        row,
        kind: channel
          ? char === char.toUpperCase()
            ? "emitter"
            : "lens"
          : "crystal",
        channel,
        charges: channel ? null : Number(char),
      });
    }),
  );
  return { cols: lines[0].length, rows: lines.length, nodes };
}
export const emptyBeams = (board: BoardState): BeamState[] =>
  CHANNELS.filter((channel) =>
    board.nodes.some((n) => n.channel === channel),
  ).map((channel) => ({ channel, cells: [] }));
/** Count incident segments, including both ends of a closed partial trail. */
function degree(beams: readonly BeamState[], cell: Cell): number {
  return beams.reduce(
    (total, b) =>
      total +
      b.cells.reduce(
        (n, c, i) =>
          n +
          (i > 0 && same(c, cell) ? 1 : 0) +
          (i < b.cells.length - 1 && same(c, cell) ? 1 : 0),
        0,
      ),
    0,
  );
}
export function complete(board: BoardState, beam: BeamState): boolean {
  const cells = beam.cells;
  if (cells.length < 2) return false;
  const ends = board.nodes.filter(
    (n) => n.kind === "emitter" && n.channel === beam.channel,
  );
  return (
    ends.length === 2 &&
    ends.every(
      (n) =>
        (same(n, cells[0]) || same(n, cells[cells.length - 1])) &&
        degree([beam], n) === 1,
    ) &&
    board.nodes
      .filter((n) => n.kind === "lens" && n.channel === beam.channel)
      .every((n) => degree([beam], n) === 2)
  );
}
export function solved(s: Pick<RefractState, "board" | "beams">): boolean {
  return (
    s.beams.length > 0 &&
    s.beams.every((b) => complete(s.board, b)) &&
    s.board.nodes
      .filter((n) => n.kind === "crystal")
      .every(
        (n) =>
          spent(s.beams, n) === n.charges &&
          s.beams.every(
            (b) =>
              !same(b.cells[0], n) && !same(b.cells[b.cells.length - 1], n),
          ),
      )
  );
}
export function conflicts(a: Cell, b: Cell, c: Cell, d: Cell): boolean {
  if ((same(a, c) && same(b, d)) || (same(a, d) && same(b, c))) return true;
  return (
    a.col !== b.col &&
    a.row !== b.row &&
    c.col !== d.col &&
    c.row !== d.row &&
    a.col + b.col === c.col + d.col &&
    a.row + b.row === c.row + d.row
  );
}
/** Limits only: completion never rejects a legal move. */
export function canExtend(
  board: BoardState,
  beams: readonly BeamState[],
  beam: BeamState,
  to: Cell,
): boolean {
  const from = beam.cells[beam.cells.length - 1];
  if (
    !from ||
    same(from, to) ||
    Math.abs(from.col - to.col) > 1 ||
    Math.abs(from.row - to.row) > 1
  )
    return false;
  const node = board.nodes.find((n) => same(n, to));
  const source = board.nodes.find((n) => same(n, from));
  if (
    !node ||
    (node.channel !== null && node.channel !== beam.channel) ||
    (source?.kind !== "crystal" &&
      degree(beams, from) >= (source?.kind === "emitter" ? 1 : 2))
  )
    return false;
  if (
    node.kind === "crystal"
      ? spent(beams, to) >= node.charges!
      : degree(beams, to) >= (node.kind === "emitter" ? 1 : 2)
  )
    return false;
  return !beams.some((b) =>
    b.cells.some((c, i) => i > 0 && conflicts(from, to, b.cells[i - 1], c)),
  );
}

import {
  CAMPAIGN_LENGTH,
  CHANNELS,
  MAX_TIER,
  NODE_HIT_R,
  TARGET_MIN_H,
  TARGET_MIN_W,
  TIER_ADVANCE,
  TITLE_ITEMS,
  SOLVED_ITEMS,
} from "./constants";
import { CAMPAIGN } from "./campaign";
import { generate } from "./generator";
import {
  canExtend,
  cellX,
  cellY,
  emptyBeams,
  parseBoard,
  same,
  solved,
} from "./rules";
import type {
  BoardState,
  Cell,
  PointerDevice,
  RefractState,
  Screen,
} from "./game";
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export const menuItems = (s: RefractState): readonly string[] =>
  s.screen === "title"
    ? TITLE_ITEMS
    : s.screen === "complete"
      ? ["BOARD SELECT", "MAIN MENU"]
      : s.mode === "cascade"
        ? SOLVED_ITEMS
        : s.boardIndex < CAMPAIGN_LENGTH - 1
          ? ["NEXT BOARD", "REPLAY BOARD", "BOARD SELECT"]
          : ["REPLAY BOARD", "BOARD SELECT"];
export function targets(s: RefractState): Target[] {
  const back = { id: "back", x: 48, y: 620, w: 144, h: TARGET_MIN_H };
  if (s.screen === "playing")
    return [{ id: "clear", x: 1088, y: 620, w: 144, h: TARGET_MIN_H }, back];
  if (s.screen === "howto") return [back];
  if (s.screen === "select")
    return [
      ...Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => ({
        id: `board-${i + 1}`,
        x: 260 + (i % 6) * 145,
        y: 205 + Math.floor(i / 6) * 96,
        w: Math.max(TARGET_MIN_W, 124),
        h: TARGET_MIN_H,
      })),
      back,
    ];
  return menuItems(s).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 100 : 970,
    y: s.screen === "title" ? 345 + i * 84 : 290 + i * 84,
    w: s.screen === "title" ? 360 : 260,
    h: TARGET_MIN_H,
  }));
}
export function initial(muted = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: { cols: 0, rows: 0, nodes: [] },
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted,
  };
}
export const clear = (s: RefractState): RefractState => ({
  ...s,
  beams: emptyBeams(s.board),
  tracing: null,
});
export const screen = (
  s: RefractState,
  next: Screen,
  menuIndex = 0,
): RefractState => ({
  ...s,
  screen: next,
  menuIndex,
  armedTarget: null,
  tracing: null,
});
export function load(s: RefractState, board: BoardState): RefractState {
  return { ...screen(s, "playing"), board, beams: emptyBeams(board) };
}
export function enterCampaign(s: RefractState, index: number): RefractState {
  return {
    ...load(s, parseBoard(CAMPAIGN[index])),
    boardIndex: index,
    selectIndex: index,
  };
}
export function finish(s: RefractState): RefractState {
  if (s.screen !== "playing" || !solved(s)) return s;
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return {
      ...screen(s, "solved"),
      solvedCount,
      tier: Math.min(Math.floor(solvedCount / TIER_ADVANCE) + 1, MAX_TIER),
    };
  }
  const solvedBoards = [...new Set([...s.solvedBoards, s.boardIndex])].sort(
    (a, b) => a - b,
  );
  return {
    ...screen(
      s,
      solvedBoards.length === CAMPAIGN_LENGTH ? "complete" : "solved",
    ),
    solvedBoards,
    selectIndex: s.boardIndex,
    unlockedCount: Math.max(
      s.unlockedCount,
      Math.min(s.boardIndex + 2, CAMPAIGN_LENGTH),
    ),
  };
}
export function action(s: RefractState, key: string): RefractState {
  if (key === "clear") return s.screen === "playing" ? clear(s) : s;
  if (key === "back") {
    if (s.screen === "title") return s;
    if (s.screen === "howto") return screen(s, "title", 2);
    if (s.screen === "select") return screen(s, "title", 0);
    return s.mode === "campaign"
      ? {
          ...screen(s.screen === "playing" ? clear(s) : s, "select"),
          selectIndex: s.boardIndex,
        }
      : screen(s, "title", 1);
  }
  if (s.screen === "select") {
    const c = s.selectIndex % 6,
      r = Math.floor(s.selectIndex / 6);
    if (key === "left" || key === "right")
      return {
        ...s,
        selectIndex: r * 6 + ((c + (key === "left" ? 5 : 1)) % 6),
      };
    if (key === "up" || key === "down")
      return { ...s, selectIndex: ((r + (key === "up" ? 3 : 1)) % 4) * 6 + c };
    return key === "confirm" && s.selectIndex < s.unlockedCount
      ? enterCampaign(s, s.selectIndex)
      : s;
  }
  if (s.screen === "playing" || s.screen === "howto") return s;
  const items = menuItems(s);
  if (key === "up" || key === "down")
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (key === "up" ? items.length - 1 : 1)) % items.length,
    };
  if (key !== "confirm") return s;
  if (s.screen === "title") {
    if (s.menuIndex === 0)
      return screen(
        { ...s, mode: "campaign", selectIndex: s.boardIndex },
        "select",
      );
    if (s.menuIndex === 1)
      return load(
        { ...s, mode: "cascade", solvedCount: 0, tier: 1 },
        generate(1),
      );
    return screen(s, "howto");
  }
  if (s.screen === "complete")
    return screen(s, s.menuIndex === 0 ? "select" : "title");
  if (s.mode === "cascade")
    return load(
      s.menuIndex === 0 ? s : { ...s, solvedCount: 0, tier: 1 },
      generate(s.menuIndex === 0 ? s.tier : 1),
    );
  if (s.boardIndex < CAMPAIGN_LENGTH - 1 && s.menuIndex === 0)
    return enterCampaign(s, s.boardIndex + 1);
  if (s.menuIndex === (s.boardIndex < CAMPAIGN_LENGTH - 1 ? 1 : 0))
    return enterCampaign(s, s.boardIndex);
  return screen(s, "select");
}
function replace(
  s: RefractState,
  channel: (typeof CHANNELS)[number],
  cells: readonly Cell[],
): RefractState {
  return {
    ...s,
    beams: s.beams.map((b) => (b.channel === channel ? { ...b, cells } : b)),
  };
}
function grab(s: RefractState, cell: Cell): RefractState {
  const node = s.board.nodes.find((n) => same(n, cell))!;
  let beam = s.beams.find(
    (b) =>
      b.channel === node.channel &&
      node.kind === "emitter" &&
      b.cells.length < 2,
  );
  if (beam)
    return {
      ...replace(s, beam.channel, [cell]),
      tracing: { channel: beam.channel },
    };
  beam = s.beams.find(
    (b) => same(b.cells[0], cell) || same(b.cells[b.cells.length - 1], cell),
  );
  if (beam)
    return {
      ...replace(
        s,
        beam.channel,
        same(beam.cells[0], cell) ? [...beam.cells].reverse() : beam.cells,
      ),
      tracing: { channel: beam.channel },
    };
  const through = s.beams.filter((b) => b.cells.some((c) => same(c, cell)));
  if (through.length !== 1) return s;
  beam = through[0];
  const last = beam.cells.reduce((v, c, i) => (same(c, cell) ? i : v), -1);
  return {
    ...replace(s, beam.channel, beam.cells.slice(0, last + 1)),
    tracing: { channel: beam.channel },
  };
}
export function pointer(
  s: RefractState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice,
): RefractState {
  s = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target && (type === "down" || (!s.pointer.down && type === "move"))) {
    if (target.id.startsWith("menu-"))
      s = { ...s, menuIndex: Number(target.id.slice(5)) };
    if (target.id.startsWith("board-"))
      s = { ...s, selectIndex: Number(target.id.slice(6)) - 1 };
  }
  if (type === "up") {
    const armed = s.armedTarget;
    s = {
      ...s,
      armedTarget: null,
      tracing: null,
      beams: s.beams.map((b) =>
        b.cells.length === 1 ? { ...b, cells: [] } : b,
      ),
    };
    if (target && target.id === armed)
      return action(
        s,
        target.id.startsWith("menu-") || target.id.startsWith("board-")
          ? "confirm"
          : target.id,
      );
    return s;
  }
  if (type === "down") s = { ...s, armedTarget: target?.id ?? null };
  if ((target && type === "down") || s.screen !== "playing" || s.armedTarget)
    return s;
  const node = s.board.nodes.find(
    (n) =>
      Math.hypot(
        x - cellX(n.col, s.board.cols),
        y - cellY(n.row, s.board.rows),
      ) <= NODE_HIT_R,
  );
  if (!node) return s;
  const cell = { col: node.col, row: node.row };
  if (type === "down") return grab(s, cell);
  if (!s.pointer.down || !s.tracing) return s;
  const beam = s.beams.find((b) => b.channel === s.tracing!.channel)!;
  if (same(beam.cells[beam.cells.length - 2], cell))
    return replace(s, beam.channel, beam.cells.slice(0, -1));
  if (!canExtend(s.board, s.beams, beam, cell)) return s;
  return finish(replace(s, beam.channel, [...beam.cells, cell]));
}

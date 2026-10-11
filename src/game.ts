import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

import {
  ACTIONS,
  BINDINGS,
  CHANNELS,
  CUES,
  GRID_MAX_ROWS,
  REFRACT_DEBUG_VERSION,
} from "./constants";
import { cellX, cellY, complete, parseBoard, solved, spent } from "./rules";
import {
  action,
  clear,
  finish,
  initial,
  load,
  pointer,
  targets,
} from "./interaction";
import { generate } from "./generator";
import { render, BACKGROUND } from "./render";
export { BACKGROUND };

export function snapshot(s: DeepReadonly<RefractState>) {
  return {
    version: REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      nodes: s.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, s.board.cols),
        y: cellY(n.row, s.board.rows),
        spent: n.kind === "crystal" ? spent(s.beams, n) : null,
      })),
    },
    beams: Object.fromEntries(
      s.beams.map((b) => [
        b.channel,
        {
          cells: b.cells.map((c) => ({ ...c })),
          complete: complete(s.board, b),
        },
      ]),
    ),
    solved: solved(s),
    tracing: s.tracing
      ? {
          channel: s.tracing.channel,
          live: {
            ...s.beams
              .find((b) => b.channel === s.tracing!.channel)!
              .cells.slice(-1)[0],
          },
        }
      : null,
    pointer: { ...s.pointer },
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export interface RefractDebugApi {
  readonly version: number;
  reset(state: DeepReadonly<RefractState>): RefractState;
  snapshot(state: DeepReadonly<RefractState>): ReturnType<typeof snapshot>;
  reconcile(state: DeepReadonly<RefractState>): RefractState;
  setMode(state: DeepReadonly<RefractState>, mode: Mode): RefractState;
  setScreen(state: DeepReadonly<RefractState>, screen: Screen): RefractState;
  setMenuIndex(state: DeepReadonly<RefractState>, index: number): RefractState;
  setSolvedCount(
    state: DeepReadonly<RefractState>,
    count: number,
  ): RefractState;
  setTier(state: DeepReadonly<RefractState>, tier: number): RefractState;
  generateBoard(state: DeepReadonly<RefractState>, tier: number): RefractState;
  loadBoard(
    state: DeepReadonly<RefractState>,
    board: readonly string[],
  ): RefractState;
  pointerDown(
    state: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    state: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(
    state: DeepReadonly<RefractState>,
    device?: PointerDevice,
  ): RefractState;
  clear(state: DeepReadonly<RefractState>): RefractState;
}
const debug: RefractDebugApi = {
  version: REFRACT_DEBUG_VERSION,
  reset: (s) => initial(s.muted),
  snapshot,
  reconcile: (s) => ({ ...s }),
  setMode: (s, mode) => ({ ...s, mode }),
  setScreen: (s, screen) => ({ ...s, screen, armedTarget: null }),
  setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
  setSolvedCount: (s, solvedCount) => ({ ...s, solvedCount }),
  setTier: (s, tier) => ({ ...s, tier }),
  generateBoard: (s, tier) => ({
    ...load(s, generate(tier)),
    menuIndex: s.menuIndex,
  }),
  loadBoard: (s, board) => ({
    ...load(s, parseBoard(board)),
    menuIndex: s.menuIndex,
  }),
  clear,
  pointerDown: (s, x, y, device = "mouse") => pointer(s, "down", x, y, device),
  pointerMove: (s, x, y, device = "mouse") => pointer(s, "move", x, y, device),
  pointerUp: (s, device = "mouse") =>
    pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
const segments = (s: RefractState): number =>
  s.beams.reduce((n, b) => n + Math.max(0, b.cells.length - 1), 0);
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api) {
    ACTIONS.forEach((a) => api.input.register(a, { keys: [...BINDINGS[a]] }));
    const sounds = [
      { freq: 460, freqTo: 690, durationMs: 70 },
      { freq: 350, freqTo: 220, durationMs: 65 },
      { freq: 720, freqTo: 1080, durationMs: 180 },
      { freq: 540, freqTo: 1440, durationMs: 400 },
      { freq: 200, freqTo: 90, durationMs: 160 },
    ];
    Object.values(CUES).forEach((cue, i) =>
      api.audio.define(cue, { ...sounds[i], wave: "sine", gain: 0.09 }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("cols", (s) => s.board.cols);
    api.diagnostics.register("rows", (s) => s.board.rows);
    CHANNELS.forEach((ch) =>
      api.diagnostics.register(ch, (s) => {
        const b = s.beams.find((b) => b.channel === ch);
        return b
          ? `${Math.max(0, b.cells.length - 1)} segments / ${complete(s.board, b) ? "complete" : "open"}`
          : "absent";
      }),
    );
    for (let row = 0; row < GRID_MAX_ROWS; row++)
      api.diagnostics.register(
        `crystals row ${row}`,
        (s) =>
          s.board.nodes
            .filter((n) => n.kind === "crystal" && n.row === row)
            .map((n) => `${n.col}: ${spent(s.beams, n)}/${n.charges}`)
            .join(" · ") || "—",
      );
    api.diagnostics.register("solved", solved);
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(1)}, ${s.pointer.y.toFixed(1)} ${s.pointer.device}`,
    );
    return [initial(), debug];
  },
  update(state, api, dt) {
    let s: RefractState = state;
    const cues = new Set<string>();
    function transition(next: RefractState, clearing = false): void {
      const before = segments(s),
        after = segments(next);
      if (s.board === next.board) {
        if (after > before) cues.add(CUES.connect);
        if (after < before) cues.add(clearing ? CUES.clear : CUES.retract);
        next.beams.forEach((b) => {
          if (
            complete(next.board, b) &&
            !complete(
              s.board,
              s.beams.find((old) => old.channel === b.channel)!,
            )
          )
            cues.add(CUES.channelComplete);
        });
        if (
          s.screen === "playing" &&
          (next.screen === "solved" || next.screen === "complete")
        )
          cues.add(CUES.solved);
      }
      s = next;
    }
    for (const a of ACTIONS)
      if (api.input.pressed(a)) {
        if (a === "mute") api.audio.setMuted(!api.audio.muted());
        else transition(action(s, a), a === "clear");
      }
    for (const sample of api.input.pointerSamples()) {
      if (
        !sample.primary ||
        (sample.button !== null && sample.button !== "primary")
      )
        continue;
      const clearing = sample.type === "up" && s.armedTarget === "clear";
      transition(
        pointer(s, sample.type, sample.x, sample.y, sample.device),
        clearing,
      );
    }
    transition(finish(s));
    cues.forEach((cue) => api.audio.play(cue));
    const p = api.input.pointer();
    return {
      ...s,
      simTime: state.simTime + dt,
      muted: api.audio.muted(),
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
    };
  },
  render: (s, api) => render(s, api.ctx),
};

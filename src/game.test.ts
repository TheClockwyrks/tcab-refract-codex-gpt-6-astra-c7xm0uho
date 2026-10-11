import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type RefractDebugApi, type RefractState } from "./game";
import {
  ACTIONS,
  BINDINGS,
  CAMPAIGN_LENGTH,
  CHANNELS,
  STAGE_H,
  STAGE_W,
  TIERS,
} from "./constants";
import { cellX, cellY, parseBoard, canExtend } from "./rules";
import { action, enterCampaign, initial, targets } from "./interaction";
import { CAMPAIGN } from "./campaign";
import { CASCADE_POOL } from "./cascade-pool";
import { analyze, meetsFloor } from "./solver";

type E = Engine<RefractState, RefractDebugApi>;
const engines: E[] = [];
afterEach(() => engines.splice(0).forEach((e) => e.destroy()));
async function setup(lines?: string[]) {
  const events = new EventTarget();
  const e = createEngine({
    canvas: createCanvas(STAGE_W, STAGE_H) as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(e);
  await e.initialize();
  if (lines) e.apply((s) => e.debug.loadBoard(s, lines));
  const key = async (code: string) => {
    events.dispatchEvent(Object.assign(new Event("keydown"), { code }));
    await e.advance(1);
    events.dispatchEvent(Object.assign(new Event("keyup"), { code }));
    await e.advance(1);
  };
  const p = (type: "down" | "move", col: number, row: number) =>
    e.apply((s) =>
      e.debug[type === "down" ? "pointerDown" : "pointerMove"](
        s,
        cellX(col, s.board.cols),
        cellY(row, s.board.rows),
      ),
    );
  const up = () => e.apply((s) => e.debug.pointerUp(s));
  const route = (cells: readonly { col: number; row: number }[]) => {
    cells.forEach((c, i) => p(i ? "move" : "down", c.col, c.row));
    up();
  };
  return { e, p, up, route, key, events };
}

describe("engine and screens", () => {
  it("initializes all state, integrates time independently of rendering, mirrors mute", async () => {
    const { e, key } = await setup();
    expect(e.debug.snapshot(e.state)).toMatchObject({
      version: 2,
      screen: "title",
      mode: "campaign",
      unlockedCount: 1,
      solvedCount: 0,
      tier: 1,
      tracing: null,
    });
    await e.advance(60);
    expect(e.state.simTime).toBeCloseTo(1);
    await key("KeyM");
    expect(e.state.muted).toBe(true);
    e.apply((s) => e.debug.reset(s));
    expect(e.state.simTime).toBe(0);
    expect(e.state.muted).toBe(true);
    expect(e.diagnostics().every((d) => !d.error)).toBe(true);
  });
  it("navigates all title choices and respects locked boards and row wrapping", async () => {
    const { e, key } = await setup();
    await key("ArrowUp");
    expect(e.state.menuIndex).toBe(2);
    await key("Enter");
    expect(e.state.screen).toBe("howto");
    await key("Escape");
    expect(e.state.menuIndex).toBe(2);
    await key("ArrowDown");
    await key("Enter");
    expect(e.state.screen).toBe("select");
    await key("ArrowLeft");
    expect(e.state.selectIndex).toBe(5);
    await key("Enter");
    expect(e.state.screen).toBe("select");
    await key("ArrowDown");
    expect(e.state.selectIndex).toBe(11);
    await key("ArrowUp");
    await key("ArrowRight");
    await key("Enter");
    expect(e.state.board).toEqual(parseBoard(CAMPAIGN[0]));
    await key("Escape");
    await key("Escape");
    expect(e.state.menuIndex).toBe(0);
    await key("ArrowDown");
    await key("Enter");
    expect(e.state.mode).toBe("cascade");
    expect(e.state.screen).toBe("playing");
    await key("Enter");
    expect(e.state.screen).toBe("playing");
    await key("Escape");
    expect(e.state.menuIndex).toBe(1);
  });
  it("all targets are large, separated, inside the stage, and pointer operable", async () => {
    const { e } = await setup();
    for (const mode of ["campaign", "cascade"] as const)
      for (const screen of [
        "title",
        "howto",
        "select",
        "playing",
        "solved",
        "complete",
      ] as const) {
        e.apply((s) => e.debug.setScreen(e.debug.setMode(s, mode), screen));
        const ts = e.debug.snapshot(e.state).targets;
        for (const t of ts) {
          expect(t.w).toBeGreaterThanOrEqual(96);
          expect(t.h).toBeGreaterThanOrEqual(72);
          expect(t.x + t.w).toBeLessThanOrEqual(STAGE_W);
          expect(t.y + t.h).toBeLessThanOrEqual(STAGE_H);
        }
        ts.forEach((a, i) =>
          ts
            .slice(i + 1)
            .forEach((b) =>
              expect(
                a.x + a.w <= b.x ||
                  b.x + b.w <= a.x ||
                  a.y + a.h <= b.y ||
                  b.y + b.h <= a.y,
              ).toBe(true),
            ),
        );
        await e.advance(1);
      }
    e.apply((s) => e.debug.reset(s));
    const t = targets(e.state)[0];
    e.apply((s) => e.debug.pointerDown(s, t.x + 20, t.y + 20, "touch"));
    expect(e.state.armedTarget).toBe("menu-0");
    e.apply((s) => e.debug.pointerUp(s, "touch"));
    expect(e.state.screen).toBe("select");
  });
  it("cancelled target releases do nothing; screen poses disarm targets", async () => {
    const { e } = await setup();
    e.apply((s) => e.debug.pointerDown(s, 130, 370));
    e.apply((s) => e.debug.pointerMove(s, 10, 10));
    e.apply((s) => e.debug.pointerUp(s));
    expect(e.state.screen).toBe("title");
    e.apply((s) => e.debug.pointerDown(s, 130, 370));
    e.apply((s) => e.debug.setScreen(s, "howto"));
    expect(e.state.armedTarget).toBe(null);
  });
  it("poses precisely, reconciles purely and rejects malformed boards", async () => {
    const { e } = await setup();
    e.apply((s) => e.debug.setMenuIndex(s, 19));
    e.apply((s) => e.debug.setTier(s, 5));
    e.apply((s) => e.debug.setSolvedCount(s, 11));
    expect(e.state).toMatchObject({ menuIndex: 19, tier: 5, solvedCount: 11 });
    const before = e.state;
    e.apply((s) => e.debug.reconcile(s));
    expect(e.state).toEqual(before);
    for (const b of [[], ["X"], ["T", "TT"], ["TTTTTTTT"], Array(7).fill("T")])
      expect(() => e.apply((s) => e.debug.loadBoard(s, b))).toThrow();
    e.apply((s) => e.debug.generateBoard(s, 2));
    expect(e.state).toMatchObject({
      mode: "campaign",
      screen: "playing",
      menuIndex: 19,
      tier: 5,
      solvedCount: 11,
    });
    expect(() => e.apply((s) => e.debug.generateBoard(s, 6))).toThrow();
  });
});

describe("tracing transactions", () => {
  it("single node release leaves no beam, and hits use radial distance", async () => {
    const { e, p, up } = await setup(["TtT"]);
    p("down", 0, 0);
    expect(e.state.beams[0].cells).toHaveLength(1);
    up();
    expect(e.state.beams[0].cells).toHaveLength(0);
    e.apply((s) => e.debug.pointerDown(s, cellX(0, 3) + 40, cellY(0, 1) + 40));
    expect(e.state.tracing).toBe(null);
  });
  it("solves on the final move and retains the solved shape on release", async () => {
    const { e, p, up } = await setup(["TtT"]);
    const original = e.state;
    p("down", 0, 0);
    p("move", 1, 0);
    p("move", 2, 0);
    expect(e.state.screen).toBe("solved");
    expect(e.state.tracing).toBe(null);
    expect(e.state.solvedBoards).toEqual([0]);
    expect(e.state.unlockedCount).toBe(2);
    up();
    expect(e.state.beams[0].cells).toHaveLength(3);
    expect(original.beams[0].cells).toHaveLength(0);
    e.apply((s) => e.debug.clear(s));
    expect(e.state.beams[0].cells).toHaveLength(0);
  });
  it("allows early emitter closure without falsely completing coverage", async () => {
    const { e, route } = await setup(["TT", "tt"]);
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(e.state.screen).toBe("playing");
    expect(e.debug.snapshot(e.state).beams.triangle.complete).toBe(false);
  });
  it("retracts, persists, reverses from the first end, and shortens interiors", async () => {
    const { e, p, up } = await setup(["TtttT"]);
    p("down", 0, 0);
    p("move", 1, 0);
    p("move", 2, 0);
    p("move", 1, 0);
    expect(e.state.beams[0].cells).toHaveLength(2);
    p("move", 2, 0);
    p("move", 3, 0);
    up();
    p("down", 0, 0);
    expect(e.state.beams[0].cells.map((c) => c.col)).toEqual([3, 2, 1, 0]);
    up();
    p("down", 2, 0);
    expect(e.state.beams[0].cells.map((c) => c.col)).toEqual([3, 2]);
    up();
  });
  it("rejects jumps and foreign nodes while retaining the live trace", async () => {
    const { e, p } = await setup(["TsT", "S.S"]);
    p("down", 0, 0);
    p("move", 2, 0);
    p("move", 1, 0);
    expect(e.state.beams[0].cells).toHaveLength(1);
    expect(e.state.tracing).toEqual({ channel: "triangle" });
  });
  it("spends on entry, refunds on retraction, and requires leaving a crystal", async () => {
    const { e, p, up } = await setup(["T1T"]);
    p("down", 0, 0);
    p("move", 1, 0);
    expect(e.debug.snapshot(e.state).board.nodes[1].spent).toBe(1);
    expect(e.debug.snapshot(e.state).solved).toBe(false);
    p("move", 0, 0);
    expect(e.debug.snapshot(e.state).board.nodes[1].spent).toBe(0);
    p("move", 1, 0);
    up();
    p("down", 1, 0);
    p("move", 2, 0);
    expect(e.state.screen).toBe("solved");
  });
  it("permits repeated crystal crossings but forbids a third entry", async () => {
    const { e, p, up } = await setup(["Tt.", "t2t", "t.t", "..T"]);
    const seq = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 2],
      [1, 1],
      [2, 1],
      [2, 2],
    ];
    seq.forEach(([x, y], i) => p(i ? "move" : "down", x, y));
    expect(
      e.debug.snapshot(e.state).board.nodes.find((n) => n.kind === "crystal")!
        .spent,
    ).toBe(2);
    p("move", 1, 1);
    expect(e.state.beams[0].cells).toHaveLength(8);
    up();
    p("down", 1, 1);
    expect(e.state.beams[0].cells).toHaveLength(6);
  });
  it("rejects opposing diagonals across different channels", async () => {
    const { e, route, p } = await setup(["TS", "ST"]);
    route([
      { col: 0, row: 0 },
      { col: 1, row: 1 },
    ]);
    p("down", 1, 0);
    p("move", 0, 1);
    expect(e.state.beams[1].cells).toHaveLength(1);
  });
  it("does not grab a shared interior crystal, but can grab an end there", async () => {
    const { e, p, up } = await setup(["T.S", "t2s", "T.S"]);
    e.apply((s) => ({
      ...s,
      beams: [
        {
          channel: "triangle",
          cells: [
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 0, row: 2 },
          ],
        },
        {
          channel: "square",
          cells: [
            { col: 2, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 },
          ],
        },
      ],
    }));
    p("down", 1, 1);
    expect(e.state.tracing).toBe(null);
    up();
    e.apply((s) => ({
      ...s,
      beams: s.beams.map((b) =>
        b.channel === "square" ? { ...b, cells: b.cells.slice(0, 2) } : b,
      ),
    }));
    p("down", 1, 1);
    expect(e.state.tracing?.channel).toBe("square");
  });
  it("checks segment reuse and emitter pass-through directly", () => {
    const board = parseBoard(["T1T"]);
    const b = {
      channel: "triangle" as const,
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
    };
    expect(canExtend(board, [b], b, { col: 0, row: 0 })).toBe(false);
    const closed = { ...b, cells: [...b.cells, { col: 2, row: 0 }] };
    expect(canExtend(board, [closed], closed, { col: 1, row: 0 })).toBe(false);
  });
  it("allows closing a partial lens loop but enforces its full degree", () => {
    const board = parseBoard(["ttT", "t.."]);
    const beam = {
      channel: "triangle" as const,
      cells: [
        { col: 1, row: 0 },
        { col: 0, row: 0 },
        { col: 0, row: 1 },
      ],
    };
    expect(canExtend(board, [beam], beam, { col: 1, row: 0 })).toBe(true);
    const loop = { ...beam, cells: [...beam.cells, { col: 1, row: 0 }] };
    expect(canExtend(board, [loop], loop, { col: 2, row: 0 })).toBe(false);
  });
  it("consumes all primary samples in one frame and emits each cue once", async () => {
    const { e, events } = await setup(["TttT"]);
    const cues: string[] = [];
    e.events.on("cue:played", (ev) => cues.push(ev.cue));
    for (let col = 0; col < 4; col++)
      events.dispatchEvent(
        Object.assign(new Event(col ? "pointermove" : "pointerdown"), {
          clientX: cellX(col, 4),
          clientY: cellY(0, 1),
          pointerId: 1,
          isPrimary: true,
          pointerType: "pen",
          button: col ? -1 : 0,
          buttons: 1,
        }),
      );
    await e.advance(1);
    expect(e.state.screen).toBe("solved");
    expect(e.state.pointer.device).toBe("pen");
    expect(cues).toEqual(["connect", "channel-complete", "solved"]);
  });
});

describe("progression and certification", () => {
  it("replay does not duplicate campaign progress, and final solve completes campaign", async () => {
    const { e, route } = await setup(["TT"]);
    e.apply((s) => ({
      ...s,
      solvedBoards: Array.from({ length: 23 }, (_, i) => i),
      unlockedCount: 24,
      boardIndex: 23,
    }));
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(e.state.screen).toBe("complete");
    expect(e.state.solvedBoards).toHaveLength(CAMPAIGN_LENGTH);
    e.apply((s) => action(s, "confirm"));
    expect(e.state.screen).toBe("select");
    e.apply((s) => e.debug.loadBoard(s, ["TT"]));
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(e.state.solvedBoards).toHaveLength(CAMPAIGN_LENGTH);
  });
  it("Cascade advances tiers, restarts fresh, and preserves campaign fields", async () => {
    const { e, route } = await setup(["TT"]);
    e.apply((s) => ({
      ...s,
      mode: "cascade",
      solvedCount: 4,
      solvedBoards: [0, 1],
      unlockedCount: 3,
    }));
    route([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(e.state).toMatchObject({
      solvedCount: 5,
      tier: 2,
      solvedBoards: [0, 1],
    });
    e.apply((s) => action(s, "confirm"));
    expect(e.state.screen).toBe("playing");
    e.apply((s) => ({ ...s, screen: "solved", menuIndex: 1 }));
    e.apply((s) => action(s, "confirm"));
    expect(e.state).toMatchObject({
      tier: 1,
      solvedCount: 0,
      unlockedCount: 3,
    });
  });
  it("campaign menu choices enter the exact fixed board and leave beams empty", () => {
    let s = enterCampaign(initial(), 22);
    s = { ...s, screen: "solved" };
    s = action(s, "confirm");
    expect(s.board).toEqual(parseBoard(CAMPAIGN[23]));
    s = { ...s, screen: "solved" };
    expect(targets(s)).toHaveLength(2);
    expect(action(s, "confirm").board).toEqual(s.board);
    expect(action({ ...s, menuIndex: 1 }, "confirm").screen).toBe("select");
  });
  it("all certified seeds meet every ladder and difficulty bound", () => {
    for (const p of CASCADE_POOL)
      for (const lines of p.boards) {
        const t = TIERS[p.tier - 1],
          b = parseBoard(lines),
          a = analyze(b);
        expect(a, lines.join("/")).not.toBe(null);
        expect(meetsFloor(a!, t), lines.join("/")).toBe(true);
        const crystals = b.nodes.filter((n) => n.kind === "crystal");
        expect(crystals.length).toBeGreaterThanOrEqual(t.minCrystals);
        expect(crystals.length).toBeLessThanOrEqual(t.maxCrystals);
        expect(b.cols * b.rows - b.nodes.length).toBeLessThanOrEqual(
          t.maxEmptyCells,
        );
        expect(
          CHANNELS.filter((ch) => b.nodes.some((n) => n.channel === ch)),
        ).toHaveLength(t.channels);
      }
  }, 30000);
  it.each(TIERS.map((t) => t.tier))(
    "generated tier %i is solvable through the actual pointer path",
    async (tier) => {
      const { e, route } = await setup();
      e.apply((s) => e.debug.generateBoard(s, tier));
      const a = analyze(e.state.board)!;
      expect(meetsFloor(a, TIERS[tier - 1])).toBe(true);
      const nodes = e.state.board.nodes;
      a.solution.forEach((path) => route(path.map((i) => nodes[i])));
      expect(e.state.screen).toBe("solved");
      await e.advance(2);
    },
  );
  it("actions have bindings and clear is only effective while playing", async () => {
    expect(ACTIONS.every((a) => BINDINGS[a].length > 0)).toBe(true);
    const { e, p, up, key } = await setup(["TttT"]);
    p("down", 0, 0);
    p("move", 1, 0);
    up();
    await key("KeyR");
    expect(e.state.beams[0].cells).toHaveLength(0);
    p("down", 0, 0);
    p("move", 1, 0);
    up();
    e.apply((s) => e.debug.setScreen(s, "solved"));
    await key("KeyR");
    expect(e.state.beams[0].cells).toHaveLength(2);
  });
});

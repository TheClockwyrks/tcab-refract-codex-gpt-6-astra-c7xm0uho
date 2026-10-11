/* global window, document, PointerEvent */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Run against `npm run dev`. The harness owns its engine; production exposes none.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route("**/src/main.ts*", (route) =>
  route.fulfill({ contentType: "application/javascript", body: "" }),
);
await page.goto("http://localhost:5173");
await mkdir("showcase", { recursive: true });
await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const { STAGE_W, STAGE_H } = await import("/src/constants.ts");
  const engine = createEngine({
    canvas: document.querySelector("canvas"),
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 30),
  });
  await engine.initialize();
  window.captureEngine = engine;
  await engine.advance(1);
});
await page.screenshot({ path: "showcase/title.png" });
const recording = await page.evaluate(async () => {
  const e = window.captureEngine;
  const { enterCampaign } = await import("/src/interaction.ts");
  const { analyze } = await import("/src/solver.ts");
  const { cellX, cellY } = await import("/src/rules.ts");
  e.apply((s) => enterCampaign(s, 16));
  const board = e.state.board;
  const solution = analyze(board).solution;
  e.startRecording();
  const send = (type, x, y) =>
    document.querySelector("canvas").dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: x,
        clientY: y,
      }),
    );
  for (const path of solution) {
    for (let i = 0; i < path.length; i++) {
      const n = board.nodes[path[i]],
        x = cellX(n.col, board.cols),
        y = cellY(n.row, board.rows);
      send(i ? "pointermove" : "pointerdown", x, y);
      await e.advance(7);
    }
    const n = board.nodes[path[path.length - 1]];
    send("pointerup", cellX(n.col, board.cols), cellY(n.row, board.rows));
    await e.advance(8);
  }
  await e.advance(24);
  if (e.state.screen !== "solved")
    throw new Error("Showcase trace did not solve");
  return e.stopRecording();
});
await writeFile("showcase/trace.json.gz", gzipSync(JSON.stringify(recording)));
await page.evaluate(async () => {
  await window.captureEngine.advance(1);
});
await page.screenshot({ path: "showcase/spectrum.png" });
await browser.close();

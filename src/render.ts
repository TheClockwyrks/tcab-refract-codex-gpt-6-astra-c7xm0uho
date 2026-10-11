import type { RefractState, Channel } from "./game";
import {
  BACK_LABEL,
  BINDINGS,
  STAGE_CX,
  CAMPAIGN_LENGTH,
  CHANNELS,
  CLEAR_LABEL,
  HUD_SOLVED_LABEL,
  HUD_TIER_LABEL,
  NODE_R,
  SET_LABELS,
  SOLVED_TITLE_TEXT,
  STAGE_H,
  STAGE_W,
  TAGLINE_TEXT,
  TITLE_TEXT,
} from "./constants";
import { cellX, cellY, complete, spent } from "./rules";
import { menuItems, targets, type Target } from "./interaction";

export const BACKGROUND = "#0b1419";
const INK = "#e5ece6",
  QUIET = "#8eaaa9",
  LINE = "#263a40",
  MINT = "#a9e9ce";
export const COLORS: Record<Channel, string> = {
  triangle: "#f7bd70",
  square: "#7de0c4",
  diamond: "#bca0f8",
};
type Ctx = CanvasRenderingContext2D;
function text(
  c: Ctx,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = INK,
  font = "sans-serif",
): void {
  c.fillStyle = color;
  c.font = `${size >= 28 ? "500" : "400"} ${size}px ${font}`;
  c.fillText(value, x, y);
}
function line(
  c: Ctx,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = LINE,
  width = 1,
): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.stroke();
}
function rect(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
): void {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}
function shape(c: Ctx, ch: Channel, x: number, y: number, r: number): void {
  c.beginPath();
  if (ch === "triangle") {
    c.moveTo(x, y - r);
    c.lineTo(x + r * 0.866, y + r * 0.5);
    c.lineTo(x - r * 0.866, y + r * 0.5);
  } else if (ch === "square")
    c.rect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
  else {
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
  }
  c.closePath();
}
function node(
  c: Ctx,
  ch: Channel,
  x: number,
  y: number,
  filled: boolean,
  r = NODE_R * 0.72,
): void {
  c.save();
  c.shadowColor = COLORS[ch];
  c.shadowBlur = filled ? 13 : 7;
  shape(c, ch, x, y, r);
  c.fillStyle = filled ? COLORS[ch] : BACKGROUND;
  c.fill();
  c.strokeStyle = COLORS[ch];
  c.lineWidth = 2;
  c.stroke();
  c.restore();
  if (!filled) {
    c.fillStyle = COLORS[ch];
    c.beginPath();
    c.arc(x, y, 2, 0, Math.PI * 2);
    c.fill();
  }
}
function beam(c: Ctx, points: readonly number[][], color: string): void {
  if (points.length < 2) return;
  c.save();
  c.lineJoin = "round";
  c.lineCap = "round";
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = color;
  c.shadowColor = color;
  c.shadowBlur = 14;
  c.globalAlpha = 0.2;
  c.lineWidth = 12;
  c.stroke();
  c.globalAlpha = 0.85;
  c.lineWidth = 3;
  c.stroke();
  c.shadowBlur = 0;
  c.globalAlpha = 0.7;
  c.lineWidth = 1;
  c.strokeStyle = "#ffffff";
  c.stroke();
  c.restore();
}
function button(
  c: Ctx,
  t: Target,
  label: string,
  selected: boolean,
  index?: number,
): void {
  rect(
    c,
    t.x,
    t.y,
    t.w,
    t.h,
    selected ? "#213b3a" : "#101e24",
    selected ? "#77ad9d" : LINE,
  );
  if (selected) rect(c, t.x, t.y, 3, t.h, MINT);
  text(c, label, t.x + 24, t.y + 42, 16, selected ? INK : QUIET);
  text(
    c,
    selected
      ? "↗"
      : index !== undefined
        ? String(index + 1).padStart(2, "0")
        : "",
    t.x + t.w - 40,
    t.y + 42,
    15,
    selected ? MINT : "#607c7d",
    "monospace",
  );
}
function backdrop(c: Ctx): void {
  rect(c, 0, 0, STAGE_W, STAGE_H, BACKGROUND);
  const g = c.createRadialGradient(760, 320, 20, 760, 320, 650);
  g.addColorStop(0, "#14282b");
  g.addColorStop(1, BACKGROUND);
  c.fillStyle = g;
  c.fillRect(0, 0, STAGE_W, STAGE_H);
  for (let y = 24; y < STAGE_H; y += 24)
    for (let x = 24; x < STAGE_W; x += 24) {
      c.fillStyle = "#1b2c31";
      c.fillRect(x, y, 1, 1);
    }
  line(c, 48, 88, 1232, 88);
  line(c, 48, 602, 1232, 602);
  shape(c, "diamond", 62, 48, 12);
  c.strokeStyle = MINT;
  c.lineWidth = 1.5;
  c.stroke();
  line(c, 48, 48, 77, 48, MINT);
  text(c, TITLE_TEXT, 88, 54, 18, INK);
  text(c, "OPTICAL PUZZLES / 01", 980, 53, 12, QUIET, "monospace");
}
function titleArt(c: Ctx): void {
  const ox = 700,
    oy = 194,
    p = 92;
  c.save();
  c.strokeStyle = LINE;
  c.lineWidth = 1;
  c.beginPath();
  c.arc(895, 360, 222, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(895, 360, 202, 0, Math.PI * 2);
  c.stroke();
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      c.fillStyle = "#344d50";
      c.beginPath();
      c.arc(ox + x * p, oy + y * p, 2, 0, Math.PI * 2);
      c.fill();
    }
  const a = [
    [0, 0],
    [1, 1],
    [0, 2],
    [1, 3],
    [2, 2],
    [2, 1],
    [3, 0],
  ];
  const b = [
    [4, 1],
    [3, 1],
    [3, 2],
    [4, 3],
    [3, 4],
    [2, 4],
  ];
  const d = [
    [0, 4],
    [1, 4],
    [2, 3],
  ];
  ([a, b, d] as number[][][]).forEach((path, i) => {
    const ch = CHANNELS[i];
    beam(
      c,
      path.map(([x, y]) => [ox + x * p, oy + y * p]),
      COLORS[ch],
    );
    path.forEach(([x, y], j) =>
      node(c, ch, ox + x * p, oy + y * p, j !== 0 && j !== path.length - 1, 19),
    );
  });
  text(c, "FIG. 01", 698, 132, 12, QUIET, "monospace");
  text(c, "A STUDY IN CONNECTION", 920, 132, 12, QUIET, "monospace");
  c.restore();
}
function drawBoard(c: Ctx, s: RefractState): void {
  const { board } = s;
  const x0 = cellX(0, board.cols),
    y0 = cellY(0, board.rows),
    x1 = cellX(board.cols - 1, board.cols),
    y1 = cellY(board.rows - 1, board.rows);
  // A restrained lattice helps read the eight neighboring positions.
  for (let row = 0; row < board.rows; row++)
    for (let col = 0; col < board.cols; col++) {
      const x = cellX(col, board.cols),
        y = cellY(row, board.rows);
      c.fillStyle = "#355052";
      c.beginPath();
      c.arc(x, y, 1.5, 0, Math.PI * 2);
      c.fill();
    }
  [
    [x0 - 42, y0 - 42, 1, 1],
    [x1 + 42, y0 - 42, -1, 1],
    [x0 - 42, y1 + 42, 1, -1],
    [x1 + 42, y1 + 42, -1, -1],
  ].forEach(([x, y, dx, dy]) => {
    line(c, x, y, x + dx * 15, y, "#3b5758");
    line(c, x, y, x, y + dy * 15, "#3b5758");
  });
  s.beams.forEach((b) =>
    beam(
      c,
      b.cells.map((n) => [cellX(n.col, board.cols), cellY(n.row, board.rows)]),
      COLORS[b.channel],
    ),
  );
  board.nodes.forEach((n) => {
    const x = cellX(n.col, board.cols),
      y = cellY(n.row, board.rows);
    c.fillStyle = BACKGROUND;
    c.beginPath();
    c.arc(x, y, NODE_R * 0.92, 0, Math.PI * 2);
    c.fill();
    if (n.kind === "crystal") {
      const used = spent(s.beams, n);
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = x + 25 * Math.cos(a),
          py = y + 25 * Math.sin(a);
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      c.fillStyle = "#1a2c32";
      c.fill();
      c.strokeStyle = used === n.charges ? MINT : "#78969e";
      c.lineWidth = 1.5;
      c.stroke();
      c.textAlign = "center";
      text(
        c,
        `${used}/${n.charges}`,
        x,
        y + 4,
        13,
        used === n.charges ? MINT : INK,
        "monospace",
      );
      c.textAlign = "left";
      for (let i = 0; i < n.charges!; i++)
        rect(
          c,
          x - (n.charges! * 7 - 2) / 2 + i * 7,
          y + 12,
          5,
          3,
          i < used ? MINT : "#49616a",
        );
    } else node(c, n.channel!, x, y, n.kind === "lens");
    if (
      s.tracing &&
      s.beams
        .find((b) => b.channel === s.tracing!.channel)
        ?.cells.slice(-1)
        .some((v) => v.col === n.col && v.row === n.row)
    ) {
      c.beginPath();
      c.arc(x, y, NODE_R, 0, Math.PI * 2);
      c.strokeStyle = COLORS[s.tracing.channel];
      c.lineWidth = 1;
      c.stroke();
    }
  });
}
function play(c: Ctx, s: RefractState): void {
  const campaign = s.mode === "campaign";
  text(
    c,
    campaign
      ? `CAMPAIGN / ${SET_LABELS[Math.floor(s.boardIndex / 6)]}`
      : "CASCADE / ENDLESS STUDY",
    48,
    128,
    12,
    QUIET,
    "monospace",
  );
  text(
    c,
    campaign
      ? String(s.boardIndex + 1).padStart(2, "0")
      : String(s.solvedCount + 1).padStart(2, "0"),
    48,
    214,
    76,
    INK,
  );
  text(
    c,
    campaign
      ? `OF ${CAMPAIGN_LENGTH} BOARDS`
      : `${HUD_TIER_LABEL} ${s.tier}  /  ${HUD_SOLVED_LABEL} ${s.solvedCount}`,
    52,
    245,
    12,
    QUIET,
    "monospace",
  );
  line(c, 48, 275, 226, 275);
  text(c, "Find the connection.", 48, 312, 17, INK);
  text(c, "Two ends. Every lens.", 48, 341, 14, QUIET);
  text(c, "One unbroken beam.", 48, 363, 14, QUIET);
  text(c, "PRESS + TRACE", 48, 449, 12, MINT, "monospace");
  text(c, "Release to keep a path.", 48, 478, 13, QUIET);
  text(c, "Trace back to undo.", 48, 500, 13, QUIET);
  text(c, "Grab a path to reshape it.", 48, 522, 13, QUIET);
  drawBoard(c, s);
  if (s.screen === "playing") {
    text(c, "CHANNELS", 1025, 157, 12, QUIET, "monospace");
    s.beams.forEach((b, i) => {
      const y = 208 + i * 80;
      node(c, b.channel, 1040, y, false, 12);
      text(
        c,
        b.channel.toUpperCase(),
        1066,
        y - 3,
        12,
        COLORS[b.channel],
        "monospace",
      );
      text(
        c,
        complete(s.board, b) ? "CONNECTED ✓" : "Awaiting connection",
        1066,
        y + 20,
        12,
        complete(s.board, b) ? MINT : QUIET,
      );
      line(c, 1025, y + 38, 1232, y + 38);
    });
    targets(s).forEach((t) =>
      button(
        c,
        t,
        t.id === "clear"
          ? `${CLEAR_LABEL}  [${BINDINGS.clear[0].replace("Key", "")}]`
          : BACK_LABEL,
        s.armedTarget === t.id,
      ),
    );
    c.textAlign = "center";
    text(
      c,
      "CONNECT THE EMITTERS · THREAD EVERY LENS · SPEND EVERY CHARGE",
      STAGE_CX,
      684,
      11,
      QUIET,
      "monospace",
    );
    c.textAlign = "left";
  } else {
    text(
      c,
      s.screen === "complete" ? "COURSE COMPLETE" : SOLVED_TITLE_TEXT,
      970,
      168,
      21,
      MINT,
    );
    text(
      c,
      s.screen === "complete"
        ? `All ${CAMPAIGN_LENGTH} boards solved.`
        : campaign
          ? `Board ${s.boardIndex + 1} connected.`
          : `${HUD_SOLVED_LABEL} ${s.solvedCount} · ${HUD_TIER_LABEL} ${s.tier}`,
      970,
      203,
      15,
      INK,
    );
    text(c, "Beautifully connected.", 970, 238, 14, QUIET);
    targets(s).forEach((t, i) =>
      button(c, t, menuItems(s)[i], s.menuIndex === i),
    );
    text(c, "A complete picture, made by you.", 48, 665, 16, QUIET);
  }
}
function howto(c: Ctx, s: RefractState): void {
  text(c, "THE ART OF CONNECTION", 80, 157, 13, MINT, "monospace");
  text(c, "Let there be a path.", 80, 209, 42);
  const lessons = [
    [
      "01",
      "DRAW THE LIGHT",
      "Press an outlined emitter and drag between nearby nodes.",
      "Move in any of eight directions, diagonals included.",
      "Release to keep your beam. Empty cells cannot be crossed.",
    ],
    [
      "02",
      "FOLLOW YOUR CHANNEL",
      "Join the two outlined emitters of each shape.",
      "Thread every filled lens of that channel along the way.",
      "Other channels’ emitters and lenses are off limits.",
    ],
    [
      "03",
      "SPEND EVERY CHARGE",
      "Crystals are shared: any beam can pass through them.",
      "Spend every charge exactly once, entering and leaving.",
      "The crystal’s counter shows spent / total charges.",
    ],
    [
      "04",
      "MAKE ROOM FOR LIGHT",
      "Each segment can be used only once, by one beam.",
      "Segments cannot cross, including opposing diagonals.",
      "An invalid move simply stays put. Trace back to undo.",
    ],
  ];
  lessons.forEach(([num, heading, ...body], i) => {
    const x = 80 + (i % 2) * 600,
      y = 285 + Math.floor(i / 2) * 165;
    text(c, num, x, y, 13, MINT, "monospace");
    text(c, heading, x + 40, y, 16);
    body.forEach((t, j) => text(c, t, x + 40, y + 33 + j * 25, 14, QUIET));
  });
  button(c, targets(s)[0], BACK_LABEL, false);
  text(
    c,
    `${BINDINGS.clear[0].replace("Key", "")}  Clear board    /    ${BINDINGS.mute[0].replace("Key", "")}  Sound    /    Esc  Back    /    Arrows + Enter  Menus`,
    255,
    663,
    13,
    QUIET,
    "monospace",
  );
}
export function render(s: RefractState, c: Ctx): void {
  c.save();
  backdrop(c);
  if (s.screen === "title") {
    text(c, "A PUZZLE OF LIGHT & POSSIBILITY", 100, 145, 12, MINT, "monospace");
    text(c, TITLE_TEXT, 94, 249, 88, INK);
    text(c, TAGLINE_TEXT, 100, 291, 17, MINT, "monospace");
    targets(s).forEach((t, i) =>
      button(c, t, menuItems(s)[i], s.menuIndex === i, i),
    );
    titleArt(c);
    text(c, "A quiet challenge. A brilliant connection.", 100, 653, 17, QUIET);
    text(c, "DRAG TO DRAW   /   M SOUND", 955, 655, 12, QUIET, "monospace");
  } else if (s.screen === "howto") howto(c, s);
  else if (s.screen === "select") {
    text(c, "THE CAMPAIGN", 80, 144, 12, MINT, "monospace");
    text(c, "Twenty-four ways to see the light.", 80, 185, 32);
    SET_LABELS.forEach((label, i) => {
      text(c, label, 100, 247 + i * 96, 14, QUIET, "monospace");
      text(
        c,
        ["First light", "Interference", "Full spectrum", "Brilliance"][i],
        100,
        272 + i * 96,
        12,
        QUIET,
      );
    });
    targets(s).forEach((t, i) => {
      if (t.id === "back") {
        button(c, t, BACK_LABEL, false);
        return;
      }
      const done = s.solvedBoards.includes(i),
        locked = i >= s.unlockedCount,
        selected = i === s.selectIndex;
      rect(
        c,
        t.x,
        t.y,
        t.w,
        t.h,
        selected ? "#294340" : locked ? "#101a20" : "#172a2f",
        selected ? MINT : LINE,
      );
      text(
        c,
        String(i + 1).padStart(2, "0"),
        t.x + 17,
        t.y + 32,
        22,
        locked ? "#607276" : INK,
        "monospace",
      );
      text(
        c,
        done ? "SOLVED ✓" : locked ? "LOCKED" : "OPEN ↗",
        t.x + 17,
        t.y + 55,
        10,
        done ? MINT : QUIET,
        "monospace",
      );
    });
    text(
      c,
      `${s.solvedBoards.length} / ${CAMPAIGN_LENGTH} CONNECTED`,
      950,
      663,
      13,
      MINT,
      "monospace",
    );
  } else play(c, s);
  text(c, s.muted ? "SOUND OFF" : "SOUND ON", 1138, 28, 9, QUIET, "monospace");
  c.restore();
}

# Refract

A quiet puzzle about drawing light. Connect each channel’s two outlined emitters,
thread every filled lens of that shape, and spend every crystal charge. Amber
triangles, mint squares, and violet diamonds share a dark optical bench.

Play **Campaign**, a course of 24 hand-built boards, or **Cascade**, an endless
sequence of generated puzzles across five difficulty tiers. Progress lasts for
the current session. Everything runs locally in the browser, with no account,
backend, downloads, or external assets.

## Run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. To produce the static site:

```sh
npm run build
```

Deploy the contents of `dist/` at the root of any static web server. Preview that
build with `npm run preview`.

## Controls

- Mouse, pen, or touch: press an emitter and drag through neighboring nodes.
  Release to keep the path. Grab an end to resume, or an interior node to shorten.
- Trace back one node to undo the last segment.
- **R** clears the current board. **Escape** goes back. **M** toggles sound.
- **Arrow keys / WASD** navigate menus, **Enter / Space** selects.
- Every menu and board control also supports pointer input.
- **Backtick** toggles the engine’s diagnostic overlay.

Diagonal steps are allowed. Segments cannot be shared or cross. Crystals accept
any channel; their counters show spent / total charges. Illegal moves leave the
path unchanged, so there is no penalty for exploring.

## Verify

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests use the Simple 2D engine with a software canvas and a controlled clock.
They cover rules, pointer transactions, menus, audio events, progression, debug
poses, and exhaustive Cascade seed certification. Cascade chooses its dimensions
independently, mutates a randomly selected certified seed, and accepts mutations
only after exhaustive route and solution analysis satisfies its tier’s floor.
A bounded search falls back to the certified seed to keep generation responsive.

The engine owns input, timing, sound, canvas fitting, recording, and diagnostics.
The game keeps its authoritative state in immutable `RefractState` values. Its
version 2 debug API is available through the engine handle, never a page global.

## Showcase

`showcase/` contains screenshots and a recording of a three-channel board being
solved. To regenerate them, start the development server and run:

```sh
node scripts/capture.mjs
```

The capture harness imports the project-local Playwright, launches Chromium with
`--no-sandbox`, and records live engine frames. It does not alter the production
entry point.

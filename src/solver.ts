import { CHANNELS, TIERS, type Tier } from "./constants";
import type { BoardState } from "./game";

export interface Analysis {
  routes: number[];
  solutions: number;
  determinedShare: number;
  branching: number;
  sharedCrystals: number;
  solution: number[][];
}
interface Route {
  path: number[];
  edges: bigint;
  blocked: bigint;
  visits: number[];
}
/** Exhaustive, bounded certification. An exhausted search budget rejects a candidate. */
export function analyze(
  board: BoardState,
  budget = 2_000_000,
): Analysis | null {
  const ns = board.nodes;
  const crystals = ns
    .map((n, i) => (n.kind === "crystal" ? i : -1))
    .filter((i) => i >= 0);
  const edges: [number, number][] = [];
  const adj: { to: number; bit: bigint; blocked: bigint }[][] = ns.map(
    () => [],
  );
  ns.forEach((a, i) =>
    ns.forEach((b, j) => {
      if (
        j > i &&
        Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) === 1
      )
        edges.push([i, j]);
    }),
  );
  edges.forEach(([a, b], i) => {
    let blocked = 1n << BigInt(i);
    edges.forEach(([c, d], j) => {
      if (
        ns[a].col !== ns[b].col &&
        ns[a].row !== ns[b].row &&
        ns[c].col !== ns[d].col &&
        ns[c].row !== ns[d].row &&
        ns[a].col + ns[b].col === ns[c].col + ns[d].col &&
        ns[a].row + ns[b].row === ns[c].row + ns[d].row
      )
        blocked |= 1n << BigInt(j);
    });
    adj[a].push({ to: b, bit: 1n << BigInt(i), blocked });
    adj[b].push({ to: a, bit: 1n << BigInt(i), blocked });
  });
  const channels = CHANNELS.filter((ch) => ns.some((n) => n.channel === ch));
  const maximumSolutions = Math.max(...TIERS.map((t) => t.maxSolutions));
  let work = 0;
  const all: Route[][] = [];
  for (const ch of channels) {
    const ends = ns
      .map((n, i) => (n.channel === ch && n.kind === "emitter" ? i : -1))
      .filter((i) => i >= 0);
    if (ends.length !== 2) return null;
    const lenses = ns
      .map((n, i) => (n.channel === ch && n.kind === "lens" ? i : -1))
      .filter((i) => i >= 0);
    const seen = new Set<bigint>();
    const routes: Route[] = [];
    const visits = ns.map(() => 0);
    visits[ends[0]] = 1;
    const path = [ends[0]];
    function walk(at: number, used: bigint, blocked: bigint): void {
      if (++work > budget) return;
      if (at === ends[1]) {
        if (lenses.every((i) => visits[i]) && !seen.has(used)) {
          seen.add(used);
          routes.push({
            path: [...path],
            edges: used,
            blocked,
            visits: crystals.map((i) => visits[i]),
          });
        }
        return;
      }
      for (const e of adj[at]) {
        const n = ns[e.to];
        if (
          (blocked & e.bit) !== 0n ||
          (n.channel && n.channel !== ch) ||
          visits[e.to] >= (n.charges ?? 1)
        )
          continue;
        visits[e.to]++;
        path.push(e.to);
        walk(e.to, used | e.bit, blocked | e.blocked);
        path.pop();
        visits[e.to]--;
      }
    }
    walk(ends[0], 0n, 0n);
    if (work > budget || !routes.length) return null;
    all.push(routes);
  }
  let solutions = 0,
    sharedCrystals = 0,
    branchSum = 0,
    lengthSum = 0;
  let intersection: bigint[] = [];
  let solution: number[][] = [];
  const chosen: Route[] = [];
  const totals = crystals.map(() => 0);
  function combine(k: number, blocked: bigint): void {
    if (++work > budget || solutions > maximumSolutions) return;
    if (k === all.length) {
      if (!crystals.every((i, j) => totals[j] === ns[i].charges)) return;
      solutions++;
      if (solutions === 1) {
        intersection = chosen.map((r) => r.edges);
        solution = chosen.map((r) => r.path);
      } else intersection = intersection.map((v, i) => v & chosen[i].edges);
      sharedCrystals = Math.max(
        sharedCrystals,
        crystals.filter(
          (_, j) => chosen.filter((r) => r.visits[j] > 0).length > 1,
        ).length,
      );
      // Replay canonical trails, counting legal forward moves (not control retraction).
      let occupied = 0n;
      const visits = ns.map(() => 0);
      chosen.forEach((route, ci) => {
        const local = ns.map(() => 0);
        local[route.path[0]] = 1;
        route.path.slice(0, -1).forEach((at, step) => {
          branchSum += adj[at].filter(
            (e) =>
              !(occupied & e.bit) &&
              (!ns[e.to].channel || ns[e.to].channel === channels[ci]) &&
              (ns[e.to].kind === "crystal"
                ? visits[e.to] < ns[e.to].charges!
                : local[e.to] === 0),
          ).length;
          lengthSum++;
          const to = route.path[step + 1];
          const edge = adj[at].find((e) => e.to === to)!;
          occupied |= edge.blocked;
          visits[to]++;
          local[to]++;
        });
      });
      return;
    }
    for (const r of all[k]) {
      if (
        r.edges & blocked ||
        r.visits.some((v, j) => v + totals[j] > ns[crystals[j]].charges!)
      )
        continue;
      chosen.push(r);
      r.visits.forEach((v, j) => (totals[j] += v));
      combine(k + 1, blocked | r.blocked);
      r.visits.forEach((v, j) => (totals[j] -= v));
      chosen.pop();
    }
  }
  combine(0, 0n);
  if (work > budget || !solutions || solutions > maximumSolutions) return null;
  const fixed = intersection.reduce(
    (n, b) => n + b.toString(2).replace(/0/g, "").length,
    0,
  );
  return {
    routes: all.map((r) => r.length),
    solutions,
    determinedShare: fixed / (lengthSum / solutions),
    branching: branchSum / lengthSum,
    sharedCrystals,
    solution,
  };
}
export function meetsFloor(a: Analysis, t: Tier): boolean {
  return (
    a.routes.every((n) => n >= t.minRoutes) &&
    a.solutions >= t.minSolutions &&
    a.solutions <= t.maxSolutions &&
    a.determinedShare <= t.maxDeterminedShare &&
    a.branching >= t.minBranching &&
    a.sharedCrystals >= t.minSharedCrystals
  );
}

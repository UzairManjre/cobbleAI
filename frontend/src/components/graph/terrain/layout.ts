import type { GraphEdge, GraphNode } from '../../../types/graph';
import { prerequisiteIds } from '../../../utils/concepts';
import { ART_PALETTES, type ArtPalette } from '../../ui/artPalettes';

/** Regions take palettes in this order, the same family as the course covers. */
const REGION_PALETTES: ArtPalette[] = [ART_PALETTES.lagoon, ART_PALETTES.slate, ART_PALETTES.sea, ART_PALETTES.petrol, ART_PALETTES.mist];
export const regionPalette = (region: number) => REGION_PALETTES[region % REGION_PALETTES.length];

/** World size of the terrain, in scene units. x runs from easy (west) to advanced (east). */
export const TERRAIN_W = 220;
export const TERRAIN_D = 130;

export interface Placed {
  id: string;
  x: number;
  z: number;
  /** Index of the region the concept belongs to: concepts linked together share one */
  region: number;
  /** Spread of its hill */
  sigma: number;
}

export interface Trail {
  /** Learn `from` first */
  from: string;
  to: string;
}

const LEVEL = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const level = (n: GraphNode) => LEVEL[n.difficulty ?? 'intermediate'] ?? 1;

/** Small stable pseudo-random number in [0, 1) from a string, so the layout never jumps between visits. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Label propagation: concepts that link to each other end up in the same region. */
function regions(nodes: GraphNode[], edges: GraphEdge[]) {
  const ids = nodes.map(n => n.id);
  const nbrs = new Map(ids.map(id => [id, [] as string[]]));
  edges.forEach(e => {
    if (e.from === e.to || !nbrs.has(e.from) || !nbrs.has(e.to)) return;
    nbrs.get(e.from)!.push(e.to);
    nbrs.get(e.to)!.push(e.from);
  });
  const label = new Map(ids.map((id, i) => [id, i]));
  for (let round = 0; round < 12; round++) {
    let changed = false;
    for (const id of ids) {
      const count = new Map<number, number>();
      count.set(label.get(id)!, 0.5); // a little loyalty to its own region keeps pairs from flip-flopping
      nbrs.get(id)!.forEach(n => count.set(label.get(n)!, (count.get(label.get(n)!) ?? 0) + 1));
      let best = label.get(id)!;
      let bestN = -1;
      count.forEach((c, l) => { if (c > bestN || (c === bestN && l < best)) { best = l; bestN = c; } });
      if (best !== label.get(id)) { label.set(id, best); changed = true; }
    }
    if (!changed) break;
  }
  // Number regions 0..k-1 in node order
  const remap = new Map<number, number>();
  return new Map(ids.map(id => {
    const l = label.get(id)!;
    if (!remap.has(l)) remap.set(l, remap.size);
    return [id, remap.get(l)!];
  }));
}

/** Learning-order trails: one per "learn A before B" link. */
export function trailsFor(nodes: GraphNode[], edges: GraphEdge[]): Trail[] {
  const known = new Set(nodes.map(n => n.id));
  const out: Trail[] = [];
  const seen = new Set<string>();
  nodes.forEach(n => prerequisiteIds(n.id, edges).forEach(p => {
    const key = `${p}>${n.id}`;
    if (known.has(p) && !seen.has(key)) { seen.add(key); out.push({ from: p, to: n.id }); }
  }));
  return out;
}

/**
 * A suggested study order (1, 2, 3…): a concept comes after everything its trails say to learn
 * first; ties go to the easier concept. Loops in the links are broken by taking the easiest
 * remaining concept, so every concept still gets a number.
 */
export function learningOrder(nodes: GraphNode[], trails: Trail[]) {
  const remaining = new Set(nodes.map(n => n.id));
  const before = new Map(nodes.map(n => [n.id, new Set<string>()]));
  trails.forEach(t => before.get(t.to)?.add(t.from));
  const rank = (n: GraphNode) => level(n) * 1000 + nodes.indexOf(n);
  const order = new Map<string, number>();
  while (remaining.size) {
    const pool = nodes.filter(n => remaining.has(n.id));
    const ready = pool.filter(n => [...before.get(n.id)!].every(p => !remaining.has(p)));
    const next = (ready.length ? ready : pool).sort((a, b) => rank(a) - rank(b))[0];
    order.set(next.id, order.size + 1);
    remaining.delete(next.id);
  }
  return order;
}

/**
 * Places concepts on the terrain: x by difficulty, then a small force simulation pulls linked
 * concepts together and pushes every pair apart so hills and labels have room.
 */
export function layoutConcepts(nodes: GraphNode[], edges: GraphEdge[]): Placed[] {
  const n = nodes.length;
  if (n === 0) return [];
  const region = regions(nodes, edges);
  const k = Math.max(1, ...region.values()) + 1;
  const room = Math.sqrt((TERRAIN_W * TERRAIN_D * 0.5) / n);
  const spacing = Math.min(48, room * 1.15);

  const p = nodes.map(node => ({
    id: node.id,
    tx: (level(node) - 1) * TERRAIN_W * 0.3,
    // Regions start in their own lane across the depth, so they read as separate ridges
    x: (level(node) - 1) * TERRAIN_W * 0.3 + (hash(node.id) - 0.5) * 20,
    z: ((region.get(node.id)! + 0.5) / k - 0.5) * TERRAIN_D * 0.6 + (hash(`${node.id}z`) - 0.5) * 16,
  }));
  const index = new Map(p.map((q, i) => [q.id, i]));
  const links = edges.map(e => [index.get(e.from), index.get(e.to)]).filter((l): l is [number, number] => l[0] !== undefined && l[1] !== undefined && l[0] !== l[1]);

  for (let it = 0; it < 420; it++) {
    const cool = 1 - it / 480;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = p[j].x - p[i].x;
      const dz = p[j].z - p[i].z;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d < spacing) {
        const f = ((spacing - d) / d) * 0.25 * cool;
        p[i].x -= dx * f; p[i].z -= dz * f;
        p[j].x += dx * f; p[j].z += dz * f;
      }
    }
    links.forEach(([a, b]) => {
      const dx = p[b].x - p[a].x;
      const dz = p[b].z - p[a].z;
      const d = Math.hypot(dx, dz) || 0.01;
      const f = ((d - spacing * 1.05) / d) * 0.03 * cool;
      p[a].x += dx * f; p[a].z += dz * f;
      p[b].x -= dx * f; p[b].z -= dz * f;
    });
    // A loose pull to the difficulty band lets a crowded band spread sideways too
    p.forEach(q => { q.x += (q.tx - q.x) * 0.015; q.z *= 0.997; });
  }

  // Fit inside the terrain, leaving a margin for the soft edge. Width and depth scale
  // separately: west→east means difficulty, so the full width is always used.
  const xs = p.map(q => q.x);
  const zs = p.map(q => q.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const sx = Math.min(2, (TERRAIN_W * 0.37) / Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 2));
  const sz = Math.min(2, (TERRAIN_D * 0.33) / Math.max(1, (Math.max(...zs) - Math.min(...zs)) / 2));
  const sigma = Math.max(8, Math.min(15, spacing * 0.36));
  return p.map(q => ({ id: q.id, x: (q.x - cx) * sx, z: (q.z - cz) * sz, region: region.get(q.id)!, sigma }));
}

/** Peak heights when height shows difficulty. */
export function difficultyPeaks(nodes: GraphNode[]) {
  return new Map(nodes.map(node => [node.id, [11, 19, 28][level(node)]]));
}

/** Peak heights when height shows how much students struggle (score 0..1). */
export function strugglePeaks(nodes: GraphNode[], score: Map<string, number>) {
  // Stretched so the difference between "fine" and "struggling" reads at a glance
  return new Map(nodes.map(node => [node.id, 3 + 33 * Math.max(0, Math.min(1, score.get(node.id) ?? 0)) ** 1.4]));
}

/** How many concepts build on each one, directly or further down its trails. */
export function dependentCounts(nodes: GraphNode[], edges: GraphEdge[]) {
  const next = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  trailsFor(nodes, edges).forEach(t => next.get(t.from)?.push(t.to));
  return new Map(nodes.map(n => {
    const seen = new Set<string>();
    const stack = [...(next.get(n.id) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || id === n.id) continue;
      seen.add(id);
      stack.push(...(next.get(id) ?? []));
    }
    return [n.id, seen.size];
  }));
}

/** Peak heights when height shows how much of the course rests on a concept: keystones stand tallest. */
export function foundationPeaks(nodes: GraphNode[], edges: GraphEdge[]) {
  const counts = dependentCounts(nodes, edges);
  const max = Math.max(1, ...counts.values());
  return new Map(nodes.map(n => [n.id, 4 + 30 * ((counts.get(n.id) ?? 0) / max) ** 0.8]));
}

/** The colour of the land at a point: a blend of the nearby regions' palettes, so each region is its own patch. */
export function tintAt(x: number, z: number, placed: Placed[], into: [number, number, number]) {
  let r = 0, g = 0, b = 0, w = 0;
  for (const q of placed) {
    const d2 = (x - q.x) ** 2 + (z - q.z) ** 2;
    const k = Math.exp(-d2 / (2 * (q.sigma * 1.6) ** 2));
    const hex = regionPalette(q.region).mid;
    r += k * parseInt(hex.slice(1, 3), 16);
    g += k * parseInt(hex.slice(3, 5), 16);
    b += k * parseInt(hex.slice(5, 7), 16);
    w += k;
  }
  if (w < 1e-4) { into[0] = 0.165; into[1] = 0.435; into[2] = 0.53; return; }
  into[0] = r / w / 255; into[1] = g / w / 255; into[2] = b / w / 255;
}

/** Gentle rolling ground so the low land is never perfectly flat. */
const relief = (x: number, z: number) => 1.6 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.07) + 1.1 * Math.sin(x * 0.1 + z * 0.06);

const SMOOTH = 2.5;

/**
 * Terrain height at a point: a smooth maximum of the nearby hills over the rolling ground.
 * A hard max would leave a sharp crease where two hills meet; this rounds the saddle off.
 * k·log(Σe^(g/k) − (n−1)) equals g exactly for a lone hill and 0 on empty land.
 */
export function heightAt(x: number, z: number, placed: Placed[], peaks: Map<string, number>) {
  let s = 0;
  for (const q of placed) {
    const d2 = (x - q.x) ** 2 + (z - q.z) ** 2;
    const g = (peaks.get(q.id) ?? 0) * Math.exp(-d2 / (2 * q.sigma * q.sigma));
    s += Math.exp(g / SMOOTH) - 1;
  }
  return relief(x, z) + SMOOTH * Math.log(1 + s);
}

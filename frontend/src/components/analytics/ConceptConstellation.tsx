import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Network } from 'lucide-react';
import type { ArtPalette } from '../ui/artPalettes';
import type { ConfusionFlag } from './ConfusionFlagsList';
import { CLAY } from '../ui/glass';

/** /api/analytics/dashboard → content.knowledge_graph: course hubs (group 1) and concepts (group 2, id `${course}:${node}`). */
export interface KGraph {
  nodes: { id: string; name: string; group: number; difficulty?: string }[];
  /** concept → concept links run from the concept that comes first to the one that builds on it */
  links: { source: string; target: string }[];
}
interface Course { id: string; title: string; code: string }

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const LEVEL_NAME = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const levelOf = (d?: string) => Math.max(0, LEVELS.indexOf((d ?? 'intermediate') as typeof LEVELS[number]));

const HEAD = 38, FOOT = 30, PILL_H = 32, ROW_MAX = 52;

/**
 * A course's concepts as a difficulty ladder: Beginner, Intermediate and Advanced columns, with each
 * link drawn from a concept to the one that builds on it. Concepts students are stuck on are marked
 * in clay; hovering one traces everything it builds on, so you can see where the trouble starts.
 */
export default function ConceptConstellation({ graph, courses, palettes, flags = [], course }: {
  graph?: KGraph; courses: Course[]; palettes: Record<string, ArtPalette>; flags?: ConfusionFlag[]; course?: string | null;
}) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 760, h: 420 });
  const ro = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const o = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setBox({ w: Math.round(width), h: Math.round(height) });
    });
    o.observe(el);
    ro.current = o;
  }, []);

  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const hubs = nodes.filter(n => n.group === 1);
  const conceptsOf = useCallback((id: string) => nodes.filter(n => n.group === 2 && n.id.startsWith(`${id}:`)), [nodes]);
  const mapped = hubs.filter(h => conceptsOf(h.id).length);
  const unmapped = hubs.filter(h => !conceptsOf(h.id).length);
  const active = [picked, course].find(id => id && mapped.some(h => h.id === id)) ?? mapped[0]?.id ?? null;
  const codeOf = (id: string) => courses.find(c => c.id === id)?.code ?? hubs.find(h => h.id === id)?.name.slice(0, 8) ?? '';

  const m = useMemo(() => {
    const concepts = active ? conceptsOf(active) : [];
    const ids = new Set(concepts.map(c => c.id));
    const links = (graph?.links ?? []).filter(l => ids.has(l.source) && ids.has(l.target));
    const before: Record<string, string[]> = {}, after: Record<string, string[]> = {};
    for (const l of links) {
      (before[l.target] ??= []).push(l.source);
      (after[l.source] ??= []).push(l.target);
    }
    const flagOf: Record<string, ConfusionFlag> = {};
    for (const f of flags) if (f.course_id === active) flagOf[`${f.course_id}:${f.node_id}`] = f;

    // Columns by difficulty; order each column by where its links land, so fewer lines cross
    const cols: string[][] = [[], [], []];
    for (const c of concepts) cols[levelOf(c.difficulty)].push(c.id);
    const degree = (id: string) => (before[id]?.length ?? 0) + (after[id]?.length ?? 0);
    cols[0].sort((a, b) => degree(b) - degree(a));
    const rank: Record<string, number> = {};
    const setRanks = (col: string[]) => col.forEach((id, i) => { rank[id] = col.length > 1 ? i / (col.length - 1) : 0.5; });
    cols.forEach(setRanks);
    for (let pass = 0; pass < 3; pass++) {
      for (const ci of [1, 2, 0, 1]) {
        const centre = (id: string) => {
          const ns = [...(before[id] ?? []), ...(after[id] ?? [])].filter(n => levelOf(concepts.find(c => c.id === n)?.difficulty) !== ci);
          return ns.length ? ns.reduce((s, n) => s + rank[n], 0) / ns.length : rank[id];
        };
        const keyed = cols[ci].map(id => [id, centre(id)] as const);
        keyed.sort((a, b) => a[1] - b[1]);
        cols[ci] = keyed.map(k => k[0]);
        setRanks(cols[ci]);
      }
    }

    // Geometry
    const W = box.w, H = box.h;
    const colW = W / 3;
    const pw = Math.min(220, colW - 28);
    const pos: Record<string, { x: number; y: number; col: number }> = {};
    cols.forEach((col, ci) => {
      const avail = H - HEAD - FOOT;
      const step = Math.min(ROW_MAX, avail / Math.max(1, col.length));
      const top = HEAD + (avail - step * col.length) / 2;
      col.forEach((id, i) => { pos[id] = { x: ci * colW + (colW - pw) / 2, y: top + step * (i + 0.5), col: ci }; });
    });
    return { concepts, links, before, after, flagOf, cols, pos, pw, colW };
  }, [active, conceptsOf, graph, flags, box]);

  // Hovering traces back through everything the concept builds on, and one step forward
  const lit = useMemo(() => {
    if (!hover) return null;
    const up = new Set<string>([hover]);
    const stack = [hover];
    while (stack.length) for (const s of m.before[stack.pop()!] ?? []) if (!up.has(s)) { up.add(s); stack.push(s); }
    return { up, down: new Set(m.after[hover] ?? []) };
  }, [hover, m]);
  const isLit = (id: string) => !lit || lit.up.has(id) || lit.down.has(id);

  const path = (s: string, t: string) => {
    const a = m.pos[s], b = m.pos[t];
    if (a.col === b.col) {
      const x = a.x + m.pw, bow = 26 + Math.abs(b.y - a.y) * 0.12;
      return `M${x},${a.y} C${x + bow},${a.y} ${x + bow},${b.y} ${x},${b.y}`;
    }
    const [l, r] = a.col < b.col ? [a, b] : [b, a];
    const x1 = l.x + m.pw, x2 = r.x, dx = (x2 - x1) / 2;
    return `M${x1},${l.y} C${x1 + dx},${l.y} ${x2 - dx},${r.y} ${x2},${r.y}`;
  };

  if (!mapped.length) {
    return (
      <div className="h-full grid place-items-center text-center p-6">
        <div>
          <span className="mx-auto grid place-items-center h-12 w-12 rounded-full bg-white text-accent mb-3"><Network size={20} /></span>
          <p className="text-sm text-accent-strong">No concept maps yet</p>
          <p className="text-xs text-ink-3 mt-1">Build a map from a course page and it shows up here.</p>
        </div>
      </div>
    );
  }

  const stuck = m.concepts.filter(c => m.flagOf[c.id]);
  const nameOf = (id: string) => m.concepts.find(c => c.id === id)?.name ?? '';
  const flagNote = (f: ConfusionFlag) => (f.probability !== null ? `${Math.round(f.probability * 100)}%` : null);

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_16rem] gap-3">
      {/* Ladder */}
      <div ref={measure} className="relative min-h-[380px] rounded-2xl bg-[#f1f5f7] overflow-hidden"
        style={{ backgroundImage: 'radial-gradient(#d9e5ea 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
        {/* Column bands and headings */}
        {LEVELS.map((lv, ci) => (
          <div key={lv} className={`absolute top-0 bottom-0 ${ci === 1 ? 'bg-white/45' : ''}`} style={{ left: ci * m.colW, width: m.colW }}>
            <p className="absolute top-3 inset-x-0 text-center text-xs text-ink-3">
              {LEVEL_NAME[lv]} <span className="text-ink-4 tabular">· {m.cols[ci].length}</span>
            </p>
          </div>
        ))}

        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          {m.links.map((l, i) => {
            const on = !!lit && (lit.up.has(l.target) && lit.up.has(l.source) || (l.source === hover && lit.down.has(l.target)));
            return (
              <path key={i} d={path(l.source, l.target)} fill="none" strokeLinecap="round"
                stroke={on ? '#1b566b' : '#8fbccb'} strokeWidth={on ? 2 : 1.25}
                opacity={lit ? (on ? 1 : 0.12) : 0.75} style={{ transition: 'opacity 180ms, stroke 180ms' }} />
            );
          })}
        </svg>

        {m.concepts.map(c => {
          const p = m.pos[c.id];
          const f = m.flagOf[c.id];
          const me = hover === c.id;
          return (
            <button key={c.id} type="button"
              onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.id)} onBlur={() => setHover(null)}
              onClick={() => navigate(`/courses/${active}/map`)}
              className={`absolute flex items-center gap-2 rounded-full px-3 text-[13px] text-left cursor-pointer transition-[opacity,background-color,color] duration-150
                ${me ? 'bg-[#0e3445] text-white' : 'bg-white text-accent-strong hover:bg-[#e6eef2]'}`}
              style={{
                left: p.x, top: p.y - PILL_H / 2, width: m.pw, height: PILL_H,
                opacity: isLit(c.id) ? 1 : 0.35,
                boxShadow: f ? `inset 0 0 0 1.5px ${CLAY.bar}` : lit && lit.up.has(c.id) && !me ? 'inset 0 0 0 1.5px #2a6f87' : undefined,
              }}
              title={f ? `${c.name}: ${f.reasons[0] ?? 'students are stuck here'}` : c.name}>
              <span className="truncate flex-1">{c.name}</span>
              {f && flagNote(f) && (
                <span className="shrink-0 text-[11px] tabular" style={{ color: me ? '#f6eeea' : CLAY.ink }}>{flagNote(f)}</span>
              )}
            </button>
          );
        })}

        <p className="absolute left-3 bottom-2.5 text-[11px] text-ink-4 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${CLAY.bar}` }} aria-hidden />
          Students stuck · hover a concept to trace what it builds on
        </p>
      </div>

      {/* Side: course switch, where students get stuck, unmapped courses */}
      <aside className="flex flex-col gap-3 min-w-0">
        {mapped.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {mapped.map(h => (
              <button key={h.id} type="button" onClick={() => { setPicked(h.id); setHover(null); }}
                className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-xs cursor-pointer transition-colors
                  ${h.id === active ? 'bg-[#0e3445] text-white' : 'bg-[#f1f5f7] text-accent-strong hover:bg-[#e6eef2]'}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: palettes[h.id]?.light ?? '#8fbccb' }} aria-hidden />
                {codeOf(h.id)}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 rounded-2xl bg-[#f1f5f7] p-3.5">
          <p className="text-xs text-ink-3">Where students get stuck{mapped.length > 1 ? ` in ${codeOf(active!)}` : ''}</p>
          {stuck.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">Nothing flagged yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {stuck.map(c => {
                const f = m.flagOf[c.id];
                const base = m.before[c.id] ?? [];
                return (
                  <li key={c.id}>
                    <button type="button" onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(c.id)} onBlur={() => setHover(null)}
                      onClick={() => navigate(`/courses/${active}/insights`)}
                      className={`w-full text-left rounded-xl px-2.5 py-2 cursor-pointer transition-colors ${hover === c.id ? 'bg-white' : 'hover:bg-white/70'}`}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CLAY.bar }} aria-hidden />
                        <span className="text-sm text-accent-strong truncate">{c.name}</span>
                        {flagNote(f) && <span className="ml-auto text-xs tabular" style={{ color: CLAY.ink }}>{flagNote(f)}</span>}
                      </span>
                      <span className="mt-0.5 block pl-4 text-xs text-ink-3 truncate">
                        {base.length ? `Builds on ${base.map(nameOf).join(', ')}` : 'A starting concept'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {unmapped.map(h => (
          <Link key={h.id} to={`/courses/${h.id}`} className="group rounded-2xl border border-dashed border-accent-100 p-3.5 hover:bg-white/70 transition-colors">
            <span className="flex items-center gap-2 text-sm text-accent-strong">
              <span className="h-2 w-2 rounded-full" style={{ background: palettes[h.id]?.mid }} aria-hidden />
              {codeOf(h.id)} has no map yet
            </span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-accent group-hover:underline">Build it <ArrowRight size={12} /></span>
          </Link>
        ))}
      </aside>
    </div>
  );
}

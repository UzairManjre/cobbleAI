import { useId, useMemo } from 'react';
import type { ArtPalette } from './artPalettes';

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const f = (n: number) => n.toFixed(1);

/** A closed, wobbly ring drawn as smooth quadratic curves (one topographic contour). */
function ring(cx: number, cy: number, r: number, ph: number[], amp: number) {
  const pts: [number, number][] = [];
  const N = 32;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const rr = r * (1 + amp * (0.5 * Math.sin(2 * a + ph[0]) + 0.3 * Math.sin(3 * a + ph[1]) + 0.2 * Math.sin(5 * a + ph[2])));
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a) * 0.7]);
  }
  const mid = (p: [number, number], q: [number, number]) => `${f((p[0] + q[0]) / 2)} ${f((p[1] + q[1]) / 2)}`;
  let d = `M${mid(pts[N - 1], pts[0])}`;
  for (let i = 0; i < N; i++) d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${mid(pts[i], pts[(i + 1) % N])}`;
  return d + 'Z';
}

/**
 * Generated cover art: a colour field, topographic contours and a small concept-map
 * constellation. Same seed, same picture.
 */
export default function CourseArt({ seed, palette, nodes = 8, width = 400, height = 200, className = '' }: {
  seed: string; palette: ArtPalette; nodes?: number; width?: number; height?: number; className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const W = width, H = height;

  const art = useMemo(() => {
    const r = seeded(hash(seed));
    const S = Math.min(W, H * 2);
    const blobs = [palette.light, palette.glow, palette.mid].map((fill, i) => ({
      cx: W * (0.45 + r() * 0.55), cy: H * r(), r: S * (0.22 + r() * 0.2) * (i === 1 ? 0.7 : 1), fill, o: i === 1 ? 0.55 : 0.8,
    }));

    const cx = W * (0.55 + r() * 0.3), cy = H * (0.35 + r() * 0.4);
    const ph = [r() * 6, r() * 6, r() * 6];
    const rings = Array.from({ length: 9 }, (_, i) => ring(cx, cy, S * 0.06 + i * S * 0.055, ph, 0.18 + i * 0.012));

    const pts: { x: number; y: number }[] = [];
    const count = Math.max(4, Math.min(nodes, 14));
    for (let tries = 0; pts.length < count && tries < 400; tries++) {
      // Upper right only: the bottom left is where titles sit
      const p = { x: W * (0.4 + r() * 0.55), y: H * (0.12 + r() * 0.5) };
      if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) > S * 0.09)) pts.push(p);
    }
    const edges = new Set<string>();
    pts.forEach((p, i) => {
      const near = pts.map((q, j) => ({ j, d: Math.hypot(q.x - p.x, q.y - p.y) })).filter(o => o.j !== i).sort((a, b) => a.d - b.d);
      near.slice(0, r() > 0.5 ? 2 : 1).forEach(({ j }) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
    });
    return { blobs, rings, pts, edges: [...edges].map(e => e.split('-').map(Number)), hub: Math.floor(r() * pts.length) };
  }, [seed, palette, nodes, W, H]);

  const S = Math.min(W, H * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={palette.deep} />
          <stop offset="1" stopColor={palette.mid} />
        </linearGradient>
        <filter id={`blur${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={S * 0.08} />
        </filter>
        <filter id={`grain${uid}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width={W} height={H} fill={`url(#bg${uid})`} />
      <g filter={`url(#blur${uid})`}>
        {art.blobs.map((b, i) => <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={b.fill} opacity={b.o} />)}
      </g>
      <g fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {art.rings.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g stroke="#fff" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {art.edges.map(([a, b]) => <line key={`${a}-${b}`} x1={art.pts[a].x} y1={art.pts[a].y} x2={art.pts[b].x} y2={art.pts[b].y} />)}
      </g>
      {art.pts.map((p, i) => i === art.hub ? (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={S * 0.03} fill="none" stroke={palette.glow} strokeOpacity="0.6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle cx={p.x} cy={p.y} r={S * 0.013} fill={palette.glow} />
        </g>
      ) : (
        <circle key={i} cx={p.x} cy={p.y} r={S * 0.008} fill={palette.deep} stroke="#fff" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      ))}
      <rect width={W} height={H} filter={`url(#grain${uid})`} opacity="0.22" style={{ mixBlendMode: 'overlay' }} />
    </svg>
  );
}

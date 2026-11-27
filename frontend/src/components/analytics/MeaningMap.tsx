import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export interface MeaningPoint { x: number; y: number; z: number; course: string; text_preview: string }
interface Course { id: string; title: string; code: string }

const SERIES = [
  { mid: '#1f8fa3', light: '#9fd3dc' }, // bright teal
  { mid: '#0e3445', light: '#8ea6c4' }, // deep navy
  { mid: '#5b8fb0', light: '#c3d8e8' }, // steel blue
  { mid: '#2f7d6a', light: '#a9d4c6' }, // sea green
];

const CAM_DIST = 4.1;
const DOT_PX = 12;
const SPREAD = 1.8;     // half-width of the cloud in scene units
const FLOOR_Y = -1.3;
const FLOOR_R = 2.7;

const POINT_VS = /* glsl */ `
  attribute vec3 color;
  attribute float aCourse;
  attribute float aIndex;
  uniform float uFocus, uHover, uSize, uRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = -mv.z;
    float fade = clamp(1.0 - (depth - 3.3) / 2.8, 0.3, 1.0);       // further back, fainter
    float dim = (uFocus >= 0.0 && abs(aCourse - uFocus) > 0.5) ? 0.14 : 1.0;
    float on = abs(aIndex - uHover) < 0.5 ? 1.0 : 0.0;
    vColor = color;
    vAlpha = max(fade * dim, on);
    gl_PointSize = uSize * uRatio * (1.0 + on * 0.7) * (${CAM_DIST.toFixed(1)} / depth);
  }`;
const POINT_FS = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    vec3 c = mix(vColor, vec3(1.0), smoothstep(0.66, 0.74, r));   // white rim, like the flat dots
    gl_FragColor = vec4(c, vAlpha * smoothstep(1.0, 0.9, r));
  }`;
const FLOOR_VS = /* glsl */ `
  uniform float uRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float edge = 1.0 - smoothstep(${(FLOOR_R * 0.5).toFixed(2)}, ${FLOOR_R.toFixed(2)}, length(position.xz));   // round floor, soft rim
    vAlpha = edge * clamp(1.0 - (-mv.z - 3.0) / 4.0, 0.15, 1.0);
    gl_PointSize = 2.4 * uRatio;
  }`;
const FLOOR_FS = /* glsl */ `
  varying float vAlpha;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5) discard;
    gl_FragColor = vec4(0.55, 0.70, 0.76, vAlpha * 0.75);
  }`;

/** Soft round glow, used as each course's cloud */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Passage embeddings as a slowly turning 3D cloud: each dot a passage, each course a soft glow,
 * over a halftone floor. Drag to turn it, double-click to reset, hover a dot to read the passage.
 */
export default function MeaningMap({ points, courses }: { points: MeaningPoint[]; courses: Course[] }) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const uniforms = useRef<{ uFocus: { value: number }; uHover: { value: number } } | null>(null);
  const glows = useRef<THREE.Sprite[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  // Centre the cloud, scale it to about ±SPREAD (flatter in height, to suit the wide box), and summarise each course
  const m = useMemo(() => {
    const n = Math.max(1, points.length);
    const mean = ['x', 'y', 'z'].map(k => points.reduce((s, p) => s + p[k as 'x'], 0) / n);
    const ext = Math.max(1e-6, ...points.flatMap(p => [Math.abs(p.x - mean[0]), Math.abs(p.y - mean[1]), Math.abs(p.z - mean[2])]));
    const k = SPREAD / ext;
    const pos = points.map(p => [(p.x - mean[0]) * k, (p.y - mean[1]) * k * 0.62, (p.z - mean[2]) * k] as const);
    const titles = [...new Set(points.map(p => p.course))];
    const groups = titles.map((course, gi) => {
      const idx = points.map((p, i) => (p.course === course ? i : -1)).filter(i => i >= 0);
      const c = [0, 1, 2].map(a => idx.reduce((s, i) => s + pos[i][a], 0) / idx.length);
      const sd = Math.sqrt(idx.reduce((s, i) => s + (pos[i][0] - c[0]) ** 2 + (pos[i][1] - c[1]) ** 2 + (pos[i][2] - c[2]) ** 2, 0) / idx.length);
      return { course, gi, idx, c, sd, ...SERIES[gi % SERIES.length] };
    });
    return { pos, groups };
  }, [points]);

  const codeOf = (title: string) => courses.find(x => x.title === title)?.code ?? title;

  // Build the scene once per data set
  useEffect(() => {
    const el = host.current;
    if (!el || !points.length) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(ratio);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 0.95, CAM_DIST - 0.1);
    camera.lookAt(0, -0.08, 0);

    const pitchG = new THREE.Group(), yawG = new THREE.Group();
    pitchG.add(yawG);
    scene.add(pitchG);

    // Course glows
    const tex = glowTexture();
    glows.current = m.groups.map(g => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(g.light), transparent: true, opacity: 0.55, depthWrite: false }));
      s.position.set(g.c[0], g.c[1], g.c[2]);
      const size = g.sd * 3.4 + 0.5;
      s.scale.set(size, size, 1);
      s.renderOrder = 0;
      yawG.add(s);
      return s;
    });

    // Halftone floor
    const floor: number[] = [];
    for (let x = -FLOOR_R; x <= FLOOR_R; x += 0.12) for (let z = -FLOOR_R; z <= FLOOR_R; z += 0.12) floor.push(x, FLOOR_Y, z);
    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floor, 3));
    const floorMat = new THREE.ShaderMaterial({ vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, uniforms: { uRatio: { value: ratio } }, transparent: true, depthWrite: false });
    const floorPts = new THREE.Points(floorGeo, floorMat);
    floorPts.renderOrder = 1;
    yawG.add(floorPts);

    // Passages
    const geo = new THREE.BufferGeometry();
    const colours: number[] = [], course: number[] = [], index: number[] = [];
    const groupOf = new Map(m.groups.flatMap(g => g.idx.map(i => [i, g] as const)));
    m.pos.forEach((_, i) => {
      const g = groupOf.get(i)!;
      // The custom shader writes colours as given, so pass them in sRGB (not three's linear)
      const c = new THREE.Color(g.mid).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
      colours.push(c.r, c.g, c.b);
      course.push(g.gi);
      index.push(i);
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.pos.flat(), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geo.setAttribute('aCourse', new THREE.Float32BufferAttribute(course, 1));
    geo.setAttribute('aIndex', new THREE.Float32BufferAttribute(index, 1));
    const u = { uFocus: { value: -1 }, uHover: { value: -1 }, uSize: { value: DOT_PX }, uRatio: { value: ratio } };
    uniforms.current = u;
    const mat = new THREE.ShaderMaterial({ vertexShader: POINT_VS, fragmentShader: POINT_FS, uniforms: u, transparent: true, depthWrite: false });
    const dots = new THREE.Points(geo, mat);
    dots.renderOrder = 2;
    yawG.add(dots);

    // Size
    let W = 1, H = 1;
    const resize = () => {
      W = el.clientWidth; H = el.clientHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Turning: slow auto-spin, drag to orbit with a little inertia, double-click to reset
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let yaw = -0.5, pitch = 0, vYaw = 0, vPitch = 0, drag: { x: number; y: number } | null = null, hovered = -1;
    const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; };
    const onUp = (e: PointerEvent) => { drag = null; if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); el.style.cursor = 'grab'; };
    const v = new THREE.Vector3();
    const onMove = (e: PointerEvent) => {
      if (drag) {
        vYaw = (e.clientX - drag.x) * 0.006;
        vPitch = (e.clientY - drag.y) * 0.004;
        yaw += vYaw; pitch = Math.max(-0.5, Math.min(0.6, pitch + vPitch));
        drag = { x: e.clientX, y: e.clientY };
        return;
      }
      // Nearest dot on screen within ~10px
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = -1, bestD = 12 * 12;
      dots.updateMatrixWorld();
      m.pos.forEach((p, i) => {
        v.set(p[0], p[1], p[2]).applyMatrix4(dots.matrixWorld).project(camera);
        const dx = (v.x * 0.5 + 0.5) * W - mx, dy = (-v.y * 0.5 + 0.5) * H - my;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best !== hovered) {
        hovered = best;
        u.uHover.value = best;
        setHover(best >= 0 ? best : null);
        el.style.cursor = best >= 0 ? 'pointer' : 'grab';
      }
    };
    const onLeave = () => { hovered = -1; u.uHover.value = -1; setHover(null); };
    const onDbl = () => { yaw = -0.5; pitch = 0; vYaw = vPitch = 0; };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('dblclick', onDbl);
    el.style.cursor = 'grab';

    // Only animate while on screen
    let onScreen = true;
    const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; });
    io.observe(el);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!onScreen) return;
      if (!drag) {
        vYaw *= 0.93; vPitch *= 0.93;
        yaw += vYaw;
        pitch = Math.max(-0.5, Math.min(0.6, pitch + vPitch));
        if (!reduced && hovered < 0) yaw += 0.0016;
      }
      yawG.rotation.y = yaw;
      pitchG.rotation.x = pitch;
      scene.updateMatrixWorld();
      renderer.render(scene, camera);

      // Course labels and the hover card follow their points
      const place = (x: number, y: number, z: number) => {
        v.set(x, y, z).applyMatrix4(yawG.matrixWorld).project(camera);
        return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H] as const;
      };
      m.groups.forEach((g, i) => {
        const node = labels.current[i];
        if (!node) return;
        const [sx, sy] = place(g.c[0], g.c[1] + g.sd * 0.9 + 0.12, g.c[2]);
        node.style.transform = `translate(${Math.round(Math.min(W - 60, Math.max(60, sx)))}px, ${Math.round(Math.max(26, sy))}px) translate(-50%, -100%)`;
      });
      if (tip.current && hovered >= 0) {
        const p = m.pos[hovered];
        const [sx, sy] = place(p[0], p[1], p[2]);
        tip.current.style.transform = `translate(${Math.round(Math.min(W - 130, Math.max(130, sx)))}px, ${Math.round(sy)}px) translate(-50%, calc(-100% - 14px))`;
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('dblclick', onDbl);
      geo.dispose(); mat.dispose(); floorGeo.dispose(); floorMat.dispose(); tex.dispose();
      glows.current.forEach(s => s.material.dispose());
      glows.current = [];
      uniforms.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [m, points.length]);

  // Spotlight a course from the side panel
  useEffect(() => {
    const gi = focus ? m.groups.findIndex(g => g.course === focus) : -1;
    if (uniforms.current) uniforms.current.uFocus.value = gi;
    glows.current.forEach((s, i) => { s.material.opacity = gi < 0 ? 0.55 : i === gi ? 0.75 : 0.12; });
  }, [focus, m]);

  if (!points.length) {
    return <div className="h-full grid place-items-center text-sm text-ink-3 p-6">No passages to plot yet.</div>;
  }
  const hp = hover !== null ? points[hover] : null;
  const sdMean = m.groups.reduce((s, g) => s + g.sd, 0) / Math.max(1, m.groups.length);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_17rem] gap-3">
      <div className="relative h-[440px] rounded-2xl overflow-hidden select-none"
        style={{ background: 'radial-gradient(80% 90% at 50% 40%, #f6f9fa 0%, #e6eef2 100%)' }}>
        <div ref={host} className="absolute inset-0 touch-none" role="img"
          aria-label={`${points.length} passages from ${m.groups.length} ${m.groups.length === 1 ? 'course' : 'courses'} in 3D, grouped by meaning`} />

        {/* Course labels, placed every frame */}
        {m.groups.map((g, i) => (
          <span key={g.course} ref={n => { labels.current[i] = n; }}
            className="pointer-events-none absolute left-0 top-0 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] text-accent-strong shadow-sm tabular transition-opacity duration-200"
            style={{ opacity: focus && focus !== g.course ? 0.3 : 1 }}>
            <span className="h-2 w-2 rounded-full" style={{ background: g.mid }} />
            {codeOf(g.course)} · {g.idx.length}
          </span>
        ))}

        {/* Hover card */}
        <div ref={tip} className={`pointer-events-none absolute left-0 top-0 z-10 w-64 rounded-xl bg-accent-strong p-2.5 text-white shadow-lg ${hp ? '' : 'hidden'}`}>
          {hp && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-white/60">{codeOf(hp.course)}</p>
              <p className="mt-0.5 text-xs leading-snug">{hp.text_preview}</p>
            </>
          )}
        </div>

        <p className="pointer-events-none absolute left-3 bottom-2.5 text-[11px] text-ink-4">Drag to turn · double-click to reset · hover a dot to read it</p>
      </div>

      {/* Side: per-course summary and sample passages */}
      <aside className="flex flex-col gap-3 min-w-0">
        {m.groups.map(g => {
          const samples = [...new Set(g.idx.map(i => points[i].text_preview))].slice(0, 2);
          const rel = g.sd / Math.max(1e-6, sdMean); // tight clusters mean focused material
          return (
            <button key={g.course} type="button" onMouseEnter={() => setFocus(g.course)} onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(g.course)} onBlur={() => setFocus(null)}
              className={`flex-1 text-left rounded-2xl p-3.5 transition-colors cursor-default ${focus === g.course ? 'bg-white' : 'bg-[#f1f5f7]'}`}>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.mid }} aria-hidden />
                <span className="text-sm text-accent-strong truncate">{g.course}</span>
              </span>
              <span className="mt-2 grid grid-cols-2 gap-2">
                <span><span className="block font-display text-lg text-accent-strong tabular leading-none">{g.idx.length}</span><span className="text-[11px] text-ink-4">passages</span></span>
                <span><span className="block font-display text-lg text-accent-strong tabular leading-none">{m.groups.length < 2 ? '—' : rel < 0.9 ? 'Focused' : rel > 1.1 ? 'Wide' : 'Average'}</span><span className="text-[11px] text-ink-4">topic range</span></span>
              </span>
              <span className="mt-3 block space-y-1.5">
                {samples.map(s => <span key={s} className="block text-xs text-ink-3 leading-snug line-clamp-2 border-l-2 pl-2" style={{ borderColor: g.light }}>{s.replace(/\s*\S*$/, '')}…</span>)}
              </span>
            </button>
          );
        })}
      </aside>
    </div>
  );
}

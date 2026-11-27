import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { GraphEdge, GraphNode } from '../../../types/graph';
import { ART_PALETTES } from '../../ui/artPalettes';
import { TERRAIN_D, TERRAIN_W, heightAt, layoutConcepts, learningOrder, regionPalette, tintAt, trailsFor, type Placed } from './layout';
import { dotsFragment, dotsVertex, surfaceFragment, surfaceVertex } from './shaders';

const MAX_H = 34;
/** How strong the learning trails are when nothing is focused: present, but quieter than the land */
const TRAIL_REST = 0.42;
const TRAIL_SEGS = 72;
const TRAIL_RADIAL = 5;
const ARC_SEGS = 48;/** The spark on a related arc: fade-out after it arrives (s), one pass along the arc (s), rest between passes (share of a pass) */
const SPARK_SETTLE = 0.4;
const SPARK_PASS = 2.6;
const SPARK_REST = 0.35;
const DIFFICULTY_WORD ={ beginner: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Peak height per concept: what height means is up to the page (difficulty or struggle) */
  peaks: Map<string, number>;
  /** Struggle score per concept (0..1): warms the peaks from teal to orange to red when heatOn */
  heat: Map<string, number>;
  heatOn: boolean;
  /** Show every learn-first trail at rest; when off, only the focused concept's trails appear */
  trailsOn: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Bump to fly the camera back to the starting view */
  resetKey: number;
  /** Shift the selected concept left of centre when a side panel covers the right of the screen */
  panelOpen: boolean;
}

interface Api {
  setPeaks: (p: Map<string, number>) => void;
  setHeat: (h: Map<string, number>) => void;
  setHeatOn: (on: boolean) => void;
  setTrailsOn: (on: boolean) => void;
  select: (id: string | null, panelOpen: boolean) => void;
  reset: () => void;
}

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A white disc with a palette ring and a soft glow: the summit marker. */
function markerTexture(ring: string, glow: string) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const halo = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
  halo.addColorStop(0, `${glow}cc`);
  halo.addColorStop(1, `${glow}00`);
  g.fillStyle = halo;
  g.fillRect(0, 0, s, s);
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.12, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft white spark with a teal halo: travels along a related link. */
function sparkTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const halo = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  halo.addColorStop(0.4, 'rgba(143,188,203,0.55)');
  halo.addColorStop(1, 'rgba(143,188,203,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Courses as a landscape: every concept is a hill, harder (or more troublesome) concepts stand taller. */
export default function KnowledgeTerrain({ nodes, edges, peaks, heat, heatOn, trailsOn, selectedId, onSelect, resetKey, panelOpen }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  // Latest props for the long-lived scene; written in effects, read by the scene
  const live = useRef({ peaks, heat, heatOn, trailsOn, onSelect });
  const webgl = useMemo(supportsWebGL, []);

  useEffect(() => { live.current = { peaks, heat, heatOn, trailsOn, onSelect }; });

  useEffect(() => {
    const host = hostRef.current;
    const bg = bgRef.current;
    if (!host || !bg || !webgl || nodes.length === 0) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    // Width and height are set in CSS pixels on resize, so the canvas and the label layer always
    // share one coordinate space (otherwise display scaling pushes labels off their peaks)
    renderer.domElement.style.cssText = 'position:absolute;left:0;top:0;outline:none;touch-action:none';
    host.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    host.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 3000);
    const controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, {
      enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.55, zoomSpeed: 0.8, panSpeed: 0.7,
      // Free to turn all the way round; never below the ground or straight down
      minDistance: 60, maxDistance: 460, minPolarAngle: 0.18, maxPolarAngle: 1.32, screenSpacePanning: false,
    });

    // ---- Layout and the height field --------------------------------------------------
    const placed = layoutConcepts(nodes, edges);
    const byId = new Map(placed.map(p => [p.id, p]));
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    let peaksFrom = live.current.peaks;
    let peaksTo = live.current.peaks;
    let mix = 1;
    let mixStart = 0;
    const h = (x: number, z: number) => {
      const b = heightAt(x, z, placed, peaksTo);
      return mix >= 1 ? b : THREE.MathUtils.lerp(heightAt(x, z, placed, peaksFrom), b, mix);
    };

    function grid(nx: number, nz: number, withIndex: boolean) {
      const pos = new Float32Array(nx * nz * 3);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = (j * nx + i) * 3;
        pos[k] = (i / (nx - 1) - 0.5) * TERRAIN_W;
        pos[k + 2] = (j / (nz - 1) - 0.5) * TERRAIN_D;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (withIndex) {
        const idx: number[] = [];
        for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i;
          idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
        }
        g.setIndex(idx);
      }
      const fill = (pk: Map<string, number>) => {
        const out = new Float32Array(nx * nz);
        for (let v = 0; v < nx * nz; v++) out[v] = heightAt(pos[v * 3], pos[v * 3 + 2], placed, pk);
        return out;
      };
      const start = fill(peaksTo);
      const tint = new Float32Array(nx * nz * 3);
      const c: [number, number, number] = [0, 0, 0];
      for (let v = 0; v < nx * nz; v++) {
        tintAt(pos[v * 3], pos[v * 3 + 2], placed, c);
        tint.set(c, v * 3);
      }
      g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      g.setAttribute('aH0', new THREE.BufferAttribute(start, 1));
      g.setAttribute('aH1', new THREE.BufferAttribute(start.slice(), 1));
      g.setAttribute('aHeat', new THREE.BufferAttribute(new Float32Array(nx * nz), 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), TERRAIN_W);
      // Struggle heat at each vertex: the strongest nearby concept's score, fading down its hill
      const fillHeat = (scores: Map<string, number>) => {
        const a = g.getAttribute('aHeat') as THREE.BufferAttribute;
        const arr = a.array as Float32Array;
        for (let v = 0; v < nx * nz; v++) {
          let m = 0;
          for (const q of placed) {
            const s = scores.get(q.id) ?? 0;
            if (s <= 0) continue;
            const d2 = (pos[v * 3] - q.x) ** 2 + (pos[v * 3 + 2] - q.z) ** 2;
            m = Math.max(m, s * Math.exp(-d2 / (2 * (q.sigma * 0.95) ** 2)));
          }
          arr[v] = m;
        }
        a.needsUpdate = true;
      };
      return { g, fill, fillHeat };
    }

    const focusUniforms = {
      uFocus: { value: new THREE.Vector2(0, 0) },
      uFocusAmt: { value: 0 },
      uFocusR: { value: 30 },
      uFocusCol: { value: new THREE.Color(ART_PALETTES.lagoon.mid) },
    };
    const shared = {
      uMix: { value: 1 },
      uMaxH: { value: MAX_H },
      uHalf: { value: new THREE.Vector2(TERRAIN_W / 2, TERRAIN_D / 2) },
      uTime: { value: 0 },
      uHeat: { value: 0 },
      ...focusUniforms,
    };
    // Struggle colours fade by the clock (not per frame), so slow machines get there too
    shared.uHeat.value = live.current.heatOn ? 1 : 0;
    let heatFade = { from: shared.uHeat.value, to: shared.uHeat.value, t0: 0 };

    const surface = grid(210, 124, true);
    const surfaceMat = new THREE.ShaderMaterial({
      vertexShader: surfaceVertex, fragmentShader: surfaceFragment, transparent: true, depthWrite: true, side: THREE.FrontSide,
      uniforms: { ...shared, uLow: { value: new THREE.Color('#e4eef2') } },
    });
    scene.add(new THREE.Mesh(surface.g, surfaceMat));

    const dots = grid(104, 62, false);
    const dotsMat = new THREE.ShaderMaterial({
      vertexShader: dotsVertex, fragmentShader: dotsFragment, transparent: true, depthWrite: false,
      uniforms: { ...shared, uSize: { value: 1.25 * renderer.getPixelRatio() } },
    });
    scene.add(new THREE.Points(dots.g, dotsMat));
    surface.fillHeat(live.current.heat);
    dots.fillHeat(live.current.heat);

    // ---- Summits: marker, pin, label, invisible hit target ------------------------------
    let hoverId: string | null = null;
    let selected: string | null = null;
    const textures = new Map<string, THREE.Texture>();
    const tex = (key: string, make: () => THREE.Texture) => {
      if (!textures.has(key)) textures.set(key, make());
      return textures.get(key)!;
    };
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitGeo = new THREE.SphereGeometry(6, 8, 8);

    const trailDefs = trailsFor(nodes, edges);
    const order = learningOrder(nodes, trailDefs);

    const summits = placed.map(p => {
      const node = nodeById.get(p.id)!;
      const pal = regionPalette(p.region);
      const group = new THREE.Group();
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(`m${p.region % 5}`, () => markerTexture(pal.deep, pal.light)), depthTest: false, transparent: true }));
      marker.scale.setScalar(7);
      marker.renderOrder = 10;
      group.add(marker);
      const pin = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(0, 6.2, 0)]),
        new THREE.LineBasicMaterial({ color: pal.deep, transparent: true, opacity: 0.5 }),
      );
      group.add(pin);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.userData.id = p.id;
      group.add(hit);

      const wrap = document.createElement('div');
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pointer-events-auto flex items-center gap-1.5 h-7 pl-1 pr-3 rounded-full bg-white/90 backdrop-blur border border-white text-[12px] leading-none text-[#0e3445] whitespace-nowrap shadow-[0_6px_18px_-10px_rgba(14,52,69,0.55)] cursor-pointer transition-opacity duration-200';
      // Step number in the suggested study order, in the concept's region colour
      const dot = document.createElement('span');
      dot.className = 'grid place-items-center h-5 min-w-5 px-1 rounded-full shrink-0 text-[10px] font-medium text-white tabular-nums';
      dot.style.background = pal.mid;
      dot.textContent = String(order.get(p.id) ?? '');
      const name = document.createElement('span');
      name.textContent = node.label;
      const meta = document.createElement('span');
      meta.className = 'text-[11px] text-[#56676b] hidden';
      meta.textContent = `· ${DIFFICULTY_WORD[node.difficulty ?? 'intermediate'] ?? 'Intermediate'}`;
      el.append(dot, name, meta);
      wrap.appendChild(el);
      const label = new CSS2DObject(wrap);
      label.position.set(0, 8.6, 0);
      group.add(label);
      scene.add(group);

      el.addEventListener('pointerenter', () => { hoverId = p.id; });
      el.addEventListener('pointerleave', () => { if (hoverId === p.id) hoverId = null; });
      el.addEventListener('click', () => live.current.onSelect(p.id));
      // Scrolling over a label still zooms the map
      el.addEventListener('wheel', e => { e.preventDefault(); renderer.domElement.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });

      return { p, node, pal, group, marker, pin, el, dot, name, meta, size: { w: 0, h: 0 }, compact: false };
    });
    const summitY = (p: Placed) => h(p.x, p.z);
    const placeSummits = () => summits.forEach(s => s.group.position.set(s.p.x, summitY(s.p), s.p.z));
    placeSummits();

    // ---- Trails (learn first) on the ground, arcs (related) in the air ------------------
    const trailKeys = new Set(trailDefs.flatMap(t => [`${t.from}|${t.to}`, `${t.to}|${t.from}`]));
    const trailMat = () => new THREE.MeshBasicMaterial({ color: '#0e3445', transparent: true, opacity: TRAIL_REST });
    const beadGeo = new THREE.SphereGeometry(0.32, 8, 8);
    const beadMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const coneGeo = new THREE.ConeGeometry(0.6, 1.7, 10);
    const trails = trailDefs.map((t, i) => {
      const mat = trailMat();
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      const cone = new THREE.Mesh(coneGeo, mat);
      const beads = [0, 0.5].map(() => new THREE.Mesh(beadGeo, beadMat));
      scene.add(mesh, cone, ...beads);
      // grow: how much of the trail is laid, 0..1; it runs toward target like a pipe being laid over the land
      const on = live.current.trailsOn ? 1 : 0;
      return { ...t, mesh, cone, beads, mat, curve: null as THREE.CatmullRomCurve3 | null, phase: (i * 0.37) % 1, grow: on, target: on };
    });
    let trailsOn = live.current.trailsOn;
    // Related links: a hairline arc that keeps its width at any zoom, with a spark travelling
    // away from the focused concept. Only shown for the focused concept.
    const sparkMap = tex('spark', sparkTexture);
    const arcs = edges.filter(e => byId.has(e.from) && byId.has(e.to) && e.from !== e.to && !trailKeys.has(`${e.from}|${e.to}`)).map((e, i) => {
      const mat = new LineMaterial({ color: '#1b566b', linewidth: 1.5, transparent: true, opacity: 0, depthTest: false, worldUnits: false });
      const line = new Line2(new LineGeometry(), mat);
      line.renderOrder = 5;
      line.visible = false;
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkMap, transparent: true, opacity: 0, depthTest: false, sizeAttenuation: false }));
      spark.scale.setScalar(0.022);
      spark.renderOrder = 6;
      spark.visible = false;
      scene.add(line, spark);
      // grow: how much of the arc is drawn, 0..1; rev: it is drawn from the `to` end (the focus was there)
      return { from: e.from, to: e.to, line, mat, spark, curve: null as THREE.QuadraticBezierCurve3 | null, target: 0, phase: (i * 0.29) % 1, grow: 0, rev: false, loop0: -1 };
    });
    type Arc = (typeof arcs)[number];    // Points run from the end the arc grows out of, so drawing the first N segments draws it outward
    const setArcPoints = (a: Arc) => {
      if (!a.curve) return;
      const pts = a.curve.getPoints(ARC_SEGS);
      if (a.rev) pts.reverse();
      a.line.geometry.setPositions(pts.flatMap(v => [v.x, v.y, v.z]));
    };
    // A point a share `s` of the way along the arc, measured from where it grows out of
    const arcAt = (a: Arc, s: number) => a.curve!.getPointAt(a.rev ? 1 - s : s);
    const up = new THREE.Vector3(0, 1, 0);
    const buildPaths = () => {
      trails.forEach(t => {
        const a = byId.get(t.from)!;
        const b = byId.get(t.to)!;
        const pts: THREE.Vector3[] = [];
        for (let s = 0; s <= 48; s++) {
          const f = 0.07 + (s / 48) * 0.86;
          const x = THREE.MathUtils.lerp(a.x, b.x, f);
          const z = THREE.MathUtils.lerp(a.z, b.z, f);
          pts.push(new THREE.Vector3(x, h(x, z) + 0.9, z));
        }
        t.curve = new THREE.CatmullRomCurve3(pts);
        t.mesh.geometry.dispose();
        t.mesh.geometry = new THREE.TubeGeometry(t.curve, TRAIL_SEGS, 0.13, TRAIL_RADIAL, false);
      });
      arcs.forEach(a => {
        const p = byId.get(a.from)!;
        const q = byId.get(a.to)!;
        const A = new THREE.Vector3(p.x, summitY(p) + 3, p.z);
        const B = new THREE.Vector3(q.x, summitY(q) + 3, q.z);
        const C = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, 10 + A.distanceTo(B) * 0.12, 0));
        a.curve = new THREE.QuadraticBezierCurve3(A, C, B);
        setArcPoints(a);
      });
    };
    buildPaths();

    const neighbours = new Map<string, Set<string>>(placed.map(p => [p.id, new Set<string>()]));
    edges.forEach(e => { neighbours.get(e.from)?.add(e.to); neighbours.get(e.to)?.add(e.from); });

    // ---- Background: ambient patches that drift, and a palette wash that follows focus ----
    const layers = Array.from(bg.querySelectorAll<HTMLDivElement>('[data-wash]'));
    const patches = layers.map(l => l.querySelector<HTMLDivElement>('[data-patch]')!);
    const ambient = Array.from(bg.querySelectorAll<HTMLDivElement>('[data-ambient]'));
    let activeLayer = 0;
    let washRegion = -1;
    const patchXY = new THREE.Vector2(-9999, -9999);
    const setWash = (region: number) => {
      if (region === washRegion) return;
      washRegion = region;
      if (region < 0) { layers.forEach(l => { l.style.opacity = '0'; }); return; }
      const pal = regionPalette(region);
      activeLayer = 1 - activeLayer;
      const inLayer = layers[activeLayer];
      inLayer.style.background = `radial-gradient(90% 70% at 100% 100%, ${pal.light}55 0%, transparent 65%), radial-gradient(70% 60% at 0% 0%, ${pal.glow} 0%, transparent 70%)`;
      patches[activeLayer].style.background = `radial-gradient(circle, ${pal.light}aa 0%, ${pal.light}44 35%, transparent 68%)`;
      inLayer.style.opacity = '1';
      layers[1 - activeLayer].style.opacity = '0';
    };

    // ---- Camera ---------------------------------------------------------------------------
    let width = 1;
    let height = 1;
    // Aimed a little behind centre so the land sits below the faded top bar
    const homeTarget = new THREE.Vector3(0, 6, -10);
    // Straight on from the south, looking slightly down: easy concepts left, advanced right
    const homeSpherical = () => new THREE.Spherical(218 * Math.max(1, 1.5 / (width / height)), 0.95, 0);
    const homePos = () => new THREE.Vector3().setFromSpherical(homeSpherical()).add(homeTarget);
    camera.position.copy(homePos());
    controls.target.copy(homeTarget);

    let fly: { t0: number; dur: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;
    const flyTo = (toT: THREE.Vector3, toP: THREE.Vector3) => {
      fly = { t0: performance.now(), dur: reduced ? 1 : 1100, fromP: camera.position.clone(), toP, fromT: controls.target.clone(), toT };
    };
    let lastInteraction = performance.now();
    controls.addEventListener('start', () => { fly = null; lastInteraction = performance.now(); });
    controls.addEventListener('change', () => {
      // Keep the land in view when panning
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -TERRAIN_W * 0.4, TERRAIN_W * 0.4);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -TERRAIN_D * 0.4, TERRAIN_D * 0.4);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 24);
    });

    const resize = () => {
      width = host.clientWidth || 1;
      height = host.clientHeight || 1;
      renderer.setSize(width, height);
      labels.setSize(width, height);
      arcs.forEach(a => a.mat.resolution.set(width, height));      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    camera.position.copy(homePos());

    // ---- Hover and click on the canvas ----------------------------------------------------
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hits = summits.map(s => s.group.children.find(c => c.userData.id)!);
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return (ray.intersectObjects(hits, false)[0]?.object.userData.id as string | undefined) ?? null;
    };
    let down: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return;
      const id = pick(e);
      hoverId = id;
      renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; renderer.domElement.style.cursor = 'grabbing'; };
    const onUp = (e: PointerEvent) => {
      renderer.domElement.style.cursor = 'grab';
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) live.current.onSelect(pick(e));
      down = null;
    };
    const onLeave = () => { hoverId = null; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') live.current.onSelect(null); };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    renderer.domElement.style.cursor = 'grab';

    // ---- What the page can ask of the scene -------------------------------------------------
    apiRef.current = {
      setPeaks: next => {
        if (next === peaksTo) return;
        // Start from wherever the land is now, even mid-change
        const cur = (attr: THREE.BufferAttribute, other: THREE.BufferAttribute) => {
          const a = attr.array as Float32Array;
          const b = other.array as Float32Array;
          const m = shared.uMix.value;
          for (let i = 0; i < a.length; i++) a[i] = a[i] + (b[i] - a[i]) * m;
          attr.needsUpdate = true;
        };
        [surface, dots].forEach(({ g, fill }) => {
          cur(g.getAttribute('aH0') as THREE.BufferAttribute, g.getAttribute('aH1') as THREE.BufferAttribute);
          (g.getAttribute('aH1') as THREE.BufferAttribute).copyArray(fill(next)).needsUpdate = true;
        });
        // JS side mirrors it with the two peak maps (close enough mid-flight)
        peaksFrom = mix >= 1 ? peaksTo : peaksFrom;
        peaksTo = next;
        mix = 0;
        shared.uMix.value = 0;
        mixStart = performance.now();
      },
      setHeat: scores => { surface.fillHeat(scores); dots.fillHeat(scores); },
      setHeatOn: on => { heatFade = { from: shared.uHeat.value, to: on ? 1 : 0, t0: performance.now() }; },
      setTrailsOn: on => { trailsOn = on; lastFocus = undefined; },
      select: (id, panel) => {
        selected = id;
        if (!id) return;
        const p = byId.get(id);
        if (!p) return;
        const target = new THREE.Vector3(p.x, summitY(p) * 0.55, p.z);
        const offset = camera.position.clone().sub(controls.target).setLength(135);
        const sph = new THREE.Spherical().setFromVector3(offset);
        sph.phi = THREE.MathUtils.clamp(sph.phi, 0.6, 1.1);
        offset.setFromSpherical(sph);
        if (panel && width > 768) {
          // Nudge the view so the concept sits left of the side panel
          const right = new THREE.Vector3().crossVectors(offset, up).normalize().multiplyScalar(-22);
          target.add(right);
        } else if (panel) {
          // Phones: the panel is a bottom sheet, so look past the concept toward the viewer and it rises into the top half
          const toward = new THREE.Vector3(offset.x, 0, offset.z).normalize().multiplyScalar(34);
          target.add(toward);
        }
        flyTo(target, target.clone().add(offset));
      },
      reset: () => { selected = null; flyTo(homeTarget.clone(), homePos()); },
    };

    // ---- Frame loop -------------------------------------------------------------------------
    const focusCol = new THREE.Color(ART_PALETTES.lagoon.mid);
    const tmp = new THREE.Vector3();
    let frame = 0;
    let raf = 0;
    let lastFocus: string | null | undefined;
    const started = performance.now();
    let last = started;
    const placedRects: { x: number; y: number; w: number; h: number }[] = [];

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - started) / 1000;
      shared.uTime.value = reduced ? 0 : t;
      frame++;

      // Land reshaping between height meanings
      if (mix < 1) {
        const p = Math.min(1, (now - mixStart) / (reduced ? 1 : 900));
        mix = ease(p);
        shared.uMix.value = mix;
        placeSummits();
        buildPaths();
        if (p >= 1) { mix = 1; peaksFrom = peaksTo; }
      }

      // Struggle colours fade in and out with the mode
      const hp = Math.min(1, (now - heatFade.t0) / (reduced ? 1 : 800));
      shared.uHeat.value = THREE.MathUtils.lerp(heatFade.from, heatFade.to, ease(hp));

      // Camera flight, else a slow idle turn all the way round
      if (fly) {
        const p = Math.min(1, (now - fly.t0) / fly.dur);
        const e = ease(p);
        camera.position.lerpVectors(fly.fromP, fly.toP, e);
        controls.target.lerpVectors(fly.fromT, fly.toT, e);
        if (p >= 1) { fly = null; lastInteraction = now; }
        controls.autoRotate = false;
      } else if (!reduced && !selected && !hoverId && now - lastInteraction > 8000) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.25;
      } else {
        controls.autoRotate = false;
      }
      controls.update(dt);

      // Focus: the hovered concept, else the selected one
      const focus = hoverId ?? selected;
      const fp = focus ? byId.get(focus) : undefined;
      focusUniforms.uFocusAmt.value += ((fp ? 1 : 0) - focusUniforms.uFocusAmt.value) * Math.min(1, dt * 5);
      if (fp) {
        focusUniforms.uFocus.value.lerp(new THREE.Vector2(fp.x, fp.z), focusUniforms.uFocusAmt.value < 0.05 ? 1 : Math.min(1, dt * 7));
        focusCol.lerp(new THREE.Color(regionPalette(fp.region).mid), Math.min(1, dt * 5));
        focusUniforms.uFocusCol.value.copy(focusCol);
      }
      setWash(fp ? fp.region : -1);

      if (focus !== lastFocus) {
        lastFocus = focus;
        const near = focus ? neighbours.get(focus) : undefined;
        summits.forEach(s => {
          const on = s.p.id === focus;
          const linked = !!near?.has(s.p.id);
          s.meta.classList.toggle('hidden', !on);
          s.el.style.background = on ? '#0e3445' : '';
          s.el.style.color = on ? '#ffffff' : '';
          s.meta.style.color = on ? 'rgba(255,255,255,0.7)' : '';
          // Linked concepts get a ring in their colour so they stand out from the rest
          s.el.style.boxShadow = linked ? `0 0 0 2px ${s.pal.mid}, 0 6px 18px -10px rgba(14,52,69,0.55)` : '';
          s.marker.scale.setScalar(on ? 9.5 : linked ? 8.4 : 7);
          (s.marker.material as THREE.SpriteMaterial).opacity = !focus || on || linked ? 1 : 0.3;
          (s.pin.material as THREE.LineBasicMaterial).opacity = !focus || on || linked ? 0.5 : 0.1;
        });
        // At rest the toggle decides; on focus only that concept's trails show (whatever the toggle),
        // and unrelated ones step away entirely, since faint ones read as pale streaks over the hills
        trails.forEach(tr => {
          const mine = tr.from === focus || tr.to === focus;
          tr.target = focus ? (mine ? 1 : 0) : trailsOn ? 1 : 0;
          if (tr.target) tr.mat.opacity = focus ? 0.95 : TRAIL_REST;
        });
        // Related arcs only appear for the focused concept, so the resting map shows just the learning trails
        arcs.forEach(a => {
          const mine = !!focus && (a.from === focus || a.to === focus);
          a.target = mine ? 1 : 0;
          // Grow out of the focused concept; an arc still pulling back keeps its old direction
          if (mine && a.rev !== (a.to === focus)) {
            a.rev = a.to === focus;
            a.grow = 0;
            setArcPoints(a);
          }
        });
      }

      // Related arcs draw themselves out from the focused concept with the spark riding the tip,
      // then the spark keeps travelling along; they pull back the same way
      arcs.forEach(a => {
        if (!a.curve) return;
        const step = reduced ? 1 : dt / (a.target > a.grow ? 0.6 : 0.3);
        a.grow = a.target > a.grow ? Math.min(1, a.grow + step) : Math.max(0, a.grow - step);
        const g = ease(a.grow);
        const on = g > 0.002;
        a.line.visible = a.spark.visible = on;
        if (!on) return;
        a.mat.opacity = 0.9;
        a.line.geometry.instanceCount = Math.max(1, Math.ceil(g * ARC_SEGS));
        const sm = a.spark.material as THREE.SpriteMaterial;
        if (a.grow < 1 || a.target === 0) {
          // Drawing or pulling back: the spark rides the tip
          a.spark.position.copy(arcAt(a, g));
          sm.opacity = 0.95;
          a.loop0 = -1;
        } else if (reduced) {
          a.spark.position.copy(arcAt(a, 0.5));
          sm.opacity = 0.9;
        } else {
          // Its own clock from the moment the arc is complete, so nothing jumps
          if (a.loop0 < 0) a.loop0 = t;
          const k = t - a.loop0;
          if (k < SPARK_SETTLE) {
            // Arrived: fade out where it is
            a.spark.position.copy(arcAt(a, 1));
            sm.opacity = 0.95 * (1 - k / SPARK_SETTLE);
          } else {
            // Then slow passes out from the focused concept, a soft swell, and a rest between passes
            const cyc = ((k - SPARK_SETTLE) / SPARK_PASS) % (1 + SPARK_REST);
            const u = Math.min(cyc, 1);
            a.spark.position.copy(arcAt(a, u));
            sm.opacity = cyc > 1 ? 0 : 0.85 * Math.sin(u * Math.PI) ** 0.7;
          }
        }
      });

      // Trails lay themselves from the earlier concept toward the later one, arrowhead leading,
      // and pull back the same way. Beads flow once a trail is fully laid.
      trails.forEach(tr => {
        if (!tr.curve) return;
        const step = reduced ? 1 : dt / (tr.target > tr.grow ? 0.7 : 0.35);
        tr.grow = tr.target > tr.grow ? Math.min(tr.target, tr.grow + step) : Math.max(tr.target, tr.grow - step);
        const g = ease(tr.grow);
        const shown = g > 0.002;
        tr.mesh.visible = tr.cone.visible = shown;
        if (shown) {
          // Tube indices run along the path, so a draw range lays it from the start
          const per = TRAIL_RADIAL * 6;
          tr.mesh.geometry.setDrawRange(0, Math.ceil(g * TRAIL_SEGS) * per);
          const head = Math.min(0.9, Math.max(0.02, g * 0.97));
          tr.cone.position.copy(tr.curve.getPointAt(head));
          tr.cone.quaternion.setFromUnitVectors(up, tr.curve.getTangentAt(head));
        }
        tr.beads.forEach((b, i) => {
          const u = reduced ? 0.3 + i * 0.4 : (t * 0.12 + tr.phase + i * 0.5) % 1;
          b.position.copy(tr.curve!.getPointAt(0.04 + u * 0.82));
          b.visible = tr.grow >= 1 && tr.mat.opacity > 0.3;
        });
      });

      // Labels: nearer and more important ones win when two would overlap
      if (frame % 4 === 0) {
        const near = focus ? neighbours.get(focus) : undefined;
        const ranked = summits.map(s => {
          tmp.set(s.p.x, s.group.position.y + 8.6, s.p.z).project(camera);
          if (!s.size.w && !s.compact) s.size = { w: s.el.offsetWidth, h: s.el.offsetHeight };
          const rank = s.p.id === focus ? 0 : near?.has(s.p.id) ? 1 : 2;
          return { s, x: (tmp.x * 0.5 + 0.5) * width, y: (-tmp.y * 0.5 + 0.5) * height, z: tmp.z, rank };
        }).sort((a, b) => a.rank - b.rank || a.z - b.z);
        placedRects.length = 0;
        const hitsAny = (r: { x: number; y: number; w: number; h: number }) =>
          placedRects.some(q => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
        ranked.forEach(o => {
          const full = { x: o.x - o.s.size.w / 2 - 3, y: o.y - o.s.size.h / 2 - 2, w: o.s.size.w + 6, h: o.s.size.h + 4 };
          // A crowded label shrinks to its step number; hovering it shows the name again
          const compact = o.rank === 2 && hitsAny(full);
          placedRects.push(compact ? { x: o.x - 13, y: o.y - 14, w: 26, h: 28 } : full);
          if (compact !== o.s.compact) {
            o.s.compact = compact;
            o.s.name.classList.toggle('hidden', compact);
            o.s.el.classList.toggle('!pr-1', compact);
          }
          o.s.el.style.opacity = String(focus && o.rank === 2 ? 0.35 : 1);
        });
      }

      // Background: ambient drift and the focus patch under the hovered summit
      if (!reduced) {
        ambient[0].style.transform = `translate(${Math.sin(t * 0.05) * 6}%, ${Math.cos(t * 0.04) * 5}%)`;
        ambient[1].style.transform = `translate(${Math.cos(t * 0.045) * 7}%, ${Math.sin(t * 0.06) * 4}%)`;
      }
      if (fp) {
        tmp.set(fp.x, summitY(fp), fp.z).project(camera);
        const tx = (tmp.x * 0.5 + 0.5) * width;
        const ty = (-tmp.y * 0.5 + 0.5) * height;
        if (patchXY.x < -9000) patchXY.set(tx, ty);
        patchXY.lerp(new THREE.Vector2(tx, ty), Math.min(1, dt * 6));
        patches.forEach(p => { p.style.transform = `translate(${patchXY.x}px, ${patchXY.y}px) translate(-50%, -50%)`; });
      }

      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      window.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach(mt => mt.dispose());
      });
      textures.forEach(t => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
      apiRef.current = null;
    };
  }, [nodes, edges, webgl]);

  useEffect(() => { apiRef.current?.setPeaks(peaks); }, [peaks]);
  useEffect(() => { apiRef.current?.setHeat(heat); }, [heat]);
  useEffect(() => { apiRef.current?.setHeatOn(heatOn); }, [heatOn]);
  useEffect(() => { apiRef.current?.setTrailsOn(trailsOn); }, [trailsOn]);
  useEffect(() => { apiRef.current?.select(selectedId, panelOpen); }, [selectedId, panelOpen]);
  const firstReset = useRef(resetKey);
  useEffect(() => { if (resetKey !== firstReset.current) apiRef.current?.reset(); }, [resetKey]);

  if (!webgl) {
    return (
      <div className="absolute inset-0 grid place-items-center text-sm text-ink-3 px-6 text-center">
        This browser can't draw the 3D map. Try a recent Chrome, Edge or Firefox.
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      {/* Background: base gradient, two drifting ambient patches, and a palette wash that follows focus */}
      <div ref={bgRef} aria-hidden className="absolute inset-0 overflow-hidden"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #eef4f6 45%, #d3e3e9 100%)' }}>
        <div data-ambient className="absolute -left-[15%] -top-[20%] h-[75vmax] w-[75vmax] rounded-full"
          style={{ background: `radial-gradient(circle, ${ART_PALETTES.lagoon.glow} 0%, transparent 65%)` }} />
        <div data-ambient className="absolute -right-[20%] -bottom-[30%] h-[80vmax] w-[80vmax] rounded-full"
          style={{ background: `radial-gradient(circle, ${ART_PALETTES.mist.light}66 0%, transparent 62%)` }} />
        {[0, 1].map(i => (
          <div key={i} data-wash className="absolute inset-0 opacity-0 transition-opacity duration-700 ease-out">
            <div data-patch className="absolute left-0 top-0 h-[70vmin] w-[70vmin] rounded-full" />
          </div>
        ))}
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(#c9dbe2 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      </div>
      <div ref={hostRef} className="absolute inset-0" />
    </div>
  );
}

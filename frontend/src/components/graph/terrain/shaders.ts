/**
 * GLSL for the knowledge terrain. Heights live in two attributes (before / after a change of
 * what height means) and uMix blends them, so switching Difficulty ↔ Struggle reshapes the
 * land smoothly on the GPU.
 */

const focusFns = /* glsl */ `
  uniform vec2 uFocus;
  uniform float uFocusAmt;
  uniform float uFocusR;
  float focusAt(vec2 p) {
    vec2 d = p - uFocus;
    return uFocusAmt * exp(-dot(d, d) / (2.0 * uFocusR * uFocusR));
  }
`;

const heatFns = /* glsl */ `
  // Orange for some struggle, deep clay-red for a lot
  vec3 warmRamp(float k) {
    return mix(vec3(0.89, 0.58, 0.36), vec3(0.69, 0.25, 0.19), smoothstep(0.45, 0.95, k));
  }
  // Only the upper part of a hill warms, so the valleys stay teal
  float heatAmount(float heat, float t) {
    return uHeat * smoothstep(0.12, 0.55, heat) * smoothstep(0.2, 0.75, t);
  }
`;

export const surfaceVertex = /* glsl */ `
  attribute float aH0;
  attribute float aH1;
  attribute vec3 aTint;
  attribute float aHeat;
  uniform float uMix;
  varying vec3 vPos;
  varying float vH;
  varying vec3 vTint;
  varying float vHeat;
  void main() {
    float h = mix(aH0, aH1, uMix);
    vec3 p = vec3(position.x, h, position.z);
    vPos = p;
    vH = h;
    vTint = aTint;
    vHeat = aHeat;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const surfaceFragment = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uFocusCol;
  uniform float uMaxH;
  uniform vec2 uHalf;
  varying vec3 vPos;
  varying float vH;
  varying vec3 vTint;
  varying float vHeat;
  uniform float uHeat;
  ${focusFns}
  ${heatFns}
  void main() {
    // Flat shading from screen-space derivatives: light from the north-west, like the course art
    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
    float shade = clamp(dot(n, normalize(vec3(-0.45, 1.0, -0.35))), 0.0, 1.0);
    float t = clamp(vH / uMaxH, 0.0, 1.0);
    float f = focusAt(vPos.xz);

    // Each region's hills take its own palette; the summits deepen toward petrol
    vec3 high = mix(vTint, vec3(0.055, 0.204, 0.271), smoothstep(0.55, 1.0, t) * 0.55);
    // Struggle mode: the upper slopes of troubled concepts warm from teal to orange to red
    float hk = heatAmount(vHeat, t);
    high = mix(high, warmRamp(vHeat), hk);
    vec3 col = mix(uLow, high, smoothstep(0.02, 0.9, t));
    col = mix(col, uFocusCol, f * 0.6);
    col *= 0.72 + 0.34 * shade;

    // Contour lines every 2.2 units of height, drawn 1px wide at any zoom
    float c = vH / 2.2;
    float line = 1.0 - min(abs(fract(c - 0.5) - 0.5) / fwidth(c), 1.0);
    vec3 lineCol = mix(col * 0.62, mix(uFocusCol, vec3(1.0), 0.35), f);
    col = mix(col, lineCol, line * (0.36 + 0.45 * t + 0.35 * f));

    // Soft oval edge: the land fades into the page instead of ending in a rectangle
    vec2 e = vPos.xz / uHalf;
    float edge = 1.0 - smoothstep(0.72, 1.0, length(e));
    float alpha = edge * (0.66 + 0.34 * smoothstep(0.0, 0.3, t) + 0.25 * f);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;

export const dotsVertex = /* glsl */ `
  attribute float aH0;
  attribute float aH1;
  attribute float aHeat;
  uniform float uMix;
  uniform float uSize;
  uniform float uTime;
  uniform float uMaxH;
  varying float vT;
  varying float vF;
  varying vec2 vXZ;
  varying float vHeat;
  ${focusFns}
  void main() {
    float h = mix(aH0, aH1, uMix);
    vec3 p = vec3(position.x, h + 0.25, position.z);
    vT = clamp(h / uMaxH, 0.0, 1.0);
    vHeat = aHeat;
    vF = focusAt(p.xz);
    vXZ = p.xz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // A faint shimmer travels across the dots so the land never looks frozen
    float shimmer = 0.85 + 0.15 * sin(uTime * 0.9 + p.x * 0.08 + p.z * 0.05);
    gl_PointSize = uSize * shimmer * (1.0 + 0.9 * vF) * (260.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

export const dotsFragment = /* glsl */ `
  uniform vec3 uFocusCol;
  uniform vec2 uHalf;
  uniform float uHeat;
  varying float vT;
  varying float vF;
  varying vec2 vXZ;
  varying float vHeat;
  ${heatFns}
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    // Teal dots on the low land, white dots on the hills: the dot-matrix look of the course covers
    vec3 col = mix(vec3(0.106, 0.337, 0.42), vec3(1.0), smoothstep(0.25, 0.6, vT));
    col = mix(col, mix(warmRamp(vHeat), vec3(1.0), 0.55), heatAmount(vHeat, vT));
    col = mix(col, mix(uFocusCol, vec3(1.0), 0.55), vF);
    float edge = 1.0 - smoothstep(0.65, 0.97, length(vXZ / uHalf));
    float alpha = edge * (0.3 + 0.5 * smoothstep(0.2, 0.7, vT) + 0.45 * vF);
    gl_FragColor = vec4(col, alpha);
  }
`;

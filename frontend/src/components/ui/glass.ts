/** Shared class strings for the gradient (Lumio-style) pages. */

/** Frosted white panel that sits on the teal gradient. */
export const panel = 'rounded-[22px] bg-white/80 backdrop-blur-xl border border-white/70 shadow-[0_1px_2px_rgba(14,52,69,0.04),0_12px_32px_-18px_rgba(14,52,69,0.25)]';
/** Dark teal pill button. */
export const pillDark = 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-[#0e3445] text-white text-[13px] font-medium hover:bg-[#2a6f87] transition-colors cursor-pointer disabled:opacity-60';
/** Outlined pill button on white. */
export const pillLine = 'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full border border-[#c3d8e0] bg-white text-[13px] font-medium text-[#0e3445] hover:border-[#2a6f87] transition-colors cursor-pointer';
/** Buttons on the dark gradient header. */
export const heroGhost = 'inline-flex items-center gap-2 h-11 px-5 rounded-full border border-white/50 text-white text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer';
export const heroSolid = 'inline-flex items-center gap-2 h-11 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors cursor-pointer';
/**
 * A radial glow whose alpha falls off along a smooth curve over many stops. Two or three linear
 * stops leave visible rings; this fades the way a light falls off.
 */
function glow(shape: string, rgb: string, peak: number, reach = 100) {
  const stops = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    const a = peak * (1 - t) ** 2.2;
    return `rgba(${rgb},${a.toFixed(3)}) ${(t * reach).toFixed(1)}%`;
  });
  return `radial-gradient(${shape}, ${stops.join(', ')})`;
}

/** Very fine grain, so wide gradients do not band on 8-bit screens. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** The dark feature card ("3 things are waiting on you"): lighter teal top left, deep petrol body, a soft pale glow in the far corner. */
export const featureBg = [
  GRAIN,
  glow('85% 75% at 100% 105%', '196,222,229', 0.7),
  glow('95% 85% at 0% 0%', '84,146,164', 0.75),
  'linear-gradient(160deg, #23667b 0%, #164f63 35%, #0f4457 65%, #124a5e 100%)',
].join(', ');

export const rise = (i: number) => ({ animation: 'rise 900ms var(--ease-out-expo) both', animationDelay: `${i * 60}ms` });

/** The one warm signal colour (problems, declines, wrong answers): a muted clay instead of amber. */
export const CLAY = { ink: '#8f5646', wash: '#f6eeea', bar: '#c9957f' };

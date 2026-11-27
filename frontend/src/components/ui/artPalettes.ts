/** Gradient sets for generated course covers, all in the cool teal family of the professor home. */
export const ART_PALETTES = {
  lagoon: { deep: '#06303a', mid: '#1f7a8c', light: '#7cc6cf', glow: '#d6f3f0' },
  petrol: { deep: '#0a2733', mid: '#2b5d73', light: '#8fb8c9', glow: '#e3eef2' },
  sea: { deep: '#05332b', mid: '#1d7a66', light: '#83d1bd', glow: '#e6f7ee' },
  slate: { deep: '#141f33', mid: '#3d5a80', light: '#98b3d1', glow: '#e6edf6' },
  mist: { deep: '#16343a', mid: '#4a8790', light: '#b5d8da', glow: '#f0f7f7' },
} as const;
export type ArtPalette = (typeof ART_PALETTES)[keyof typeof ART_PALETTES];

const ORDER: ArtPalette[] = [ART_PALETTES.lagoon, ART_PALETTES.slate, ART_PALETTES.sea, ART_PALETTES.petrol, ART_PALETTES.mist];
/** Courses take colours in list order, so neighbours never share one. */
export const paletteAt = (i: number) => ORDER[i % ORDER.length];

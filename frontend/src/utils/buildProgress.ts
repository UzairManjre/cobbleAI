// Labels and formatting for course setup: file processing stages and concept-map builds

/** DocumentModel.stage while a file is processing (documents and lecture recordings). */
export const STAGE_LABELS: Record<string, string> = {
  downloading: 'Preparing',
  extracting: 'Reading text',
  chunking: 'Splitting into passages',
  transcribing: 'Transcribing audio',
  frames: 'Reading slides',
  chapters: 'Writing chapters',
  indexing: 'Indexing for search',
};

/** The generator's six steps (GraphBuild.step 1..6). */
export const BUILD_STEPS = [
  'Reading the processed materials',
  'Preparing passages',
  'Finding concepts with the AI model',
  'Merging duplicate concepts',
  'Connecting topics',
  'Checking every concept against its source',
];

export const isActiveBuild = (build?: { status: string } | null): boolean =>
  !!build && (build.status === 'queued' || build.status === 'running');

/** 42 -> "42s", 300 -> "5 min", 3900 -> "1 h 5 min" */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s}s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.round(s / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "14:32" for an event in the build log */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

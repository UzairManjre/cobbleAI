/** 754 -> "12:34", 3725 -> "1:02:05" */
export function formatTimestamp(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Human-readable location of a source: "p. 4", "slides 3-5", "12:04-12:51". */
export function sourceLocation(source: {
  location?: string; page_start?: number; page_end?: number; slide_start?: number; slide_end?: number; t_start?: number; t_end?: number;
}): string {
  if (source.location) return source.location;
  if (source.t_start !== undefined && source.t_start !== null) {
    return `${formatTimestamp(source.t_start)}-${formatTimestamp(source.t_end ?? source.t_start)}`;
  }
  const span = (a?: number, b?: number, one = '', many = '') =>
    a === undefined || a === null ? '' : b === undefined || b === null || b === a ? `${one} ${a}` : `${many} ${a}-${b}`;
  return span(source.slide_start, source.slide_end, 'slide', 'slides') || span(source.page_start, source.page_end, 'p.', 'pp.');
}

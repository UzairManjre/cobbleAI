/** The server's `detail` message from a failed API call, or a fallback. Always a string, so it is safe to render. */
export function apiErrorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  // FastAPI validation errors (422) arrive as a list of {msg, loc, ...}; rendering that object crashes React
  if (Array.isArray(detail)) {
    const msgs = detail.map(d => (d as { msg?: unknown })?.msg).filter(m => typeof m === 'string');
    if (msgs.length) return msgs.join('; ');
  }
  return fallback;
}

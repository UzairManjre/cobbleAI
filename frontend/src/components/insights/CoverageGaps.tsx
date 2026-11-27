import { useEffect, useState } from 'react';
import { insightsApi } from '../../api/insights';
import type { CoverageReport, SearchedSource } from '../../api/insights';
import { CLAY, panel } from '../ui/glass';

const where = (s: SearchedSource) =>
  s.page_start ? `p. ${s.page_start}` : s.slide_start ? `slide ${s.slide_start}` : s.location || '';

/** Where the notes and lectures are thin: declined or weakly supported questions, and "not in my notes" reports. */
export default function CoverageGaps({ courseId, days }: { courseId: string; days: number }) {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    insightsApi.coverageGaps(courseId, days)
      .then(res => { if (!cancelled) { setReport(res.data); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [courseId, days]);

  const rate = report?.gap_rate !== null && report?.gap_rate !== undefined ? Math.round(report.gap_rate * 100) : null;

  return (
    <section className={`${panel} p-5 h-full flex flex-col`}>
      <h2 className="text-[15px] text-accent-strong">Gaps in your material</h2>
      <p className="text-xs text-ink-3 mt-0.5">Questions the notes couldn't answer well</p>

      {report && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Tile value={rate !== null ? `${rate}%` : '—'} label="answered poorly" />
          <Tile value={report.n_gaps} label="questions" />
          <Tile value={report.not_in_notes} label={'"not in notes"'} />
        </div>
      )}

      {error ? (
        <p className="mt-4 text-xs text-clay">Could not load the coverage report.</p>
      ) : !report ? null : report.groups.length === 0 ? (
        <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No gaps in this period.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[#e2eaeb]">
          {report.groups.map(g => {
            const match = g.mean_top_support !== null ? Math.round(g.mean_top_support * 100) : null;
            const best = g.searched[0];
            return (
              <li key={g.key} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-accent-strong truncate">{g.label}{!g.node_id && <span className="text-ink-4"> (unlinked)</span>}</p>
                  <span className="shrink-0 text-xs text-ink-3 tabular">{g.declined + g.weak_support} weak</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-[#dbe7ec] overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${match ?? 0}%`, background: match !== null && match < 35 ? CLAY.bar : '#1b566b' }} />
                  </span>
                  <span className="text-[11px] text-ink-3 tabular w-[5.5rem] text-right">{match !== null ? `best match ${match}%` : 'no match'}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-3 truncate">
                  {best ? <>Closest: <span className="text-ink-2">{best.filename}</span>{where(best) && ` · ${where(best)}`}</> : 'Nothing relevant in the course material'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const Tile = ({ value, label }: { value: string | number; label: string }) => (
  <div className="rounded-2xl px-3 py-2.5 min-w-0 bg-[#f1f5f7]">
    <span className="block font-display text-xl leading-none tabular text-accent-strong">{value}</span>
    <span className="block mt-1 text-[11px] text-ink-3 truncate">{label}</span>
  </div>
);

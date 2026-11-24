import { useEffect, useState } from 'react';
import { SearchX } from 'lucide-react';
import { insightsApi } from '../../api/insights';
import type { CoverageReport } from '../../api/insights';
import CitationList from '../tutor/CitationList';

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

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-medium text-ink flex items-center gap-2"><SearchX className="w-4 h-4 text-amber-700" /> Coverage gaps</h2>
        <p className="text-[11px] text-ink-3 mt-1">
          {report
            ? `${report.n_gaps} of ${report.n_questions} questions in the last ${days} days were declined or answered from weak support` +
              (report.gap_rate !== null ? ` (${Math.round(report.gap_rate * 100)}%)` : '') +
              `; ${report.not_in_notes} answers were marked "not in my notes".`
            : 'Questions the course materials could not answer well.'}
        </p>
      </div>
      {error ? (
        <p className="text-xs text-red-600">Could not load the coverage report.</p>
      ) : !report ? null : report.groups.length === 0 ? (
        <p className="text-xs text-ink-4">No gaps in this period.</p>
      ) : (
        <ul className="space-y-3">
          {report.groups.map(g => (
            <li key={g.key} className="border border-line rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-ink">{g.label}{!g.node_id && <span className="text-[10px] text-ink-4"> · grouped by wording</span>}</p>
                <span className="text-[11px] text-ink-3">
                  {g.declined} declined · {g.weak_support} weak · {g.not_in_notes} not in notes
                  {g.mean_top_support !== null && ` · best match ${Math.round(g.mean_top_support * 100)}%`}
                </span>
              </div>
              {g.searched.length > 0 ? (
                <CitationList courseId={courseId} title="Closest material found"
                  sources={g.searched.map(s => ({ ...s, relevance_score: s.best_support }))} />
              ) : g.total > 0 ? (
                <p className="text-[11px] text-ink-4">Nothing relevant was found in the course materials.</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

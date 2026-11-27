import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { insightsApi } from '../../api/insights';
import type { QuestionInsight } from '../../api/insights';
import { useToastStore } from '../../store/toastStore';
import { CLAY, panel, pillLine } from '../ui/glass';

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Weekly digest: what students asked the tutor about, clustered and named by the LLM. */
export default function QuestionClusters({ courseId, days }: { courseId: string; days: number }) {
  const [insight, setInsight] = useState<QuestionInsight | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    let cancelled = false;
    insightsApi.latestQuestions(courseId)
      .then(res => { if (!cancelled) setInsight(res.data.insight); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [courseId]);

  const generate = async () => {
    setBusy(true);
    try {
      setInsight((await insightsApi.generateQuestions(courseId, days)).data.insight);
    } catch {
      addToast('Could not build the question digest', 'error');
    } finally {
      setBusy(false);
    }
  };

  const clusters = [...(insight?.clusters ?? [])].sort((a, b) => b.size - a.size);
  const max = Math.max(1, ...clusters.map(c => c.size));

  return (
    <section className={`${panel} p-5 h-full flex flex-col`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] text-accent-strong">What students asked</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            {insight
              ? `${insight.n_questions} questions from ${insight.n_students} ${insight.n_students === 1 ? 'student' : 'students'}, ${day(insight.period_start)} to ${day(insight.period_end)} · paraphrased`
              : 'Similar questions, grouped by topic.'}
          </p>
        </div>
        <button type="button" onClick={generate} disabled={busy} className={pillLine}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {insight ? 'Refresh' : 'Build digest'}
        </button>
      </div>

      {!loaded ? null : !insight ? (
        <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No digest yet. One is built every week, or build one now.</p>
      ) : clusters.length === 0 ? (
        <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No student questions in this period.</p>
      ) : (
        <ol className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-1">
          {clusters.map(c => {
            const ok = Math.max(0, c.size - c.declined - c.weak_support);
            return (
              <li key={c.cluster_id} className="rounded-2xl bg-[#f1f5f7] p-4 flex flex-col"
                title={c.labelled_by === 'keywords' ? 'Named from keywords (the model was unavailable)' : undefined}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] text-accent-strong truncate">{c.topic}</p>
                  <span className="shrink-0 text-xs text-ink-3 tabular"><span className="font-display text-xl text-accent-strong">{c.size}</span> asked</span>
                </div>
                {/* How the tutor coped: answered well / weak support / declined. Bar length is relative to the biggest topic. */}
                <div className="mt-2.5 h-2 rounded-full bg-[#dbe7ec] overflow-hidden flex" style={{ width: `${Math.max(30, (c.size / max) * 100)}%` }}
                  aria-label={`${ok} answered well, ${c.weak_support} weakly supported, ${c.declined} declined`}>
                  <span className="h-full bg-accent" style={{ width: `${(ok / c.size) * 100}%` }} />
                  <span className="h-full bg-accent-200" style={{ width: `${(c.weak_support / c.size) * 100}%` }} />
                  <span className="h-full" style={{ width: `${(c.declined / c.size) * 100}%`, background: CLAY.bar }} />
                </div>
                {c.representative_question && <p className="mt-3 text-sm text-ink-2 leading-snug">“{c.representative_question}”</p>}
                {c.misconception && (
                  <p className="mt-2 text-xs text-ink-3 leading-snug border-l-2 pl-2.5" style={{ borderColor: CLAY.bar }}>Mix-up: {c.misconception}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {clusters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />Answered from notes</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent-200" />Weak support</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CLAY.bar }} />Declined</span>
        </div>
      )}
    </section>
  );
}

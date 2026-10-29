import { useEffect, useState } from 'react';
import { Loader2, MessagesSquare, RefreshCw } from 'lucide-react';
import { insightsApi } from '../../api/insights';
import type { QuestionInsight } from '../../api/insights';
import { useToastStore } from '../../store/toastStore';

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

  return (
    <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-white flex items-center gap-2"><MessagesSquare className="w-4 h-4 text-emerald-400" /> What students asked</h2>
          <p className="text-[11px] text-[#888888] mt-1">
            {insight
              ? `${insight.n_questions} questions from ${insight.n_students} students, ${day(insight.period_start)} to ${day(insight.period_end)}. Topics and example questions are paraphrased; no student wording is shown.`
              : 'Similar tutor questions are grouped, and each group is named with its likely misconception.'}
          </p>
        </div>
        <button onClick={generate} disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs border border-[#333333] text-white flex items-center gap-1.5 hover:border-[#666666] disabled:opacity-40">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {insight ? `Rebuild for last ${days} days` : `Build for last ${days} days`}
        </button>
      </div>

      {!loaded ? null : !insight ? (
        <p className="text-xs text-[#666666]">No digest yet. One is built every week, or build one now.</p>
      ) : insight.clusters.length === 0 ? (
        <p className="text-xs text-[#666666]">No student questions in this period.</p>
      ) : (
        <ol className="space-y-3">
          {insight.clusters.map(c => (
            <li key={c.cluster_id} className="border border-[#1A1A1A] rounded-xl p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-white">{c.topic}</p>
                <span className="text-[11px] text-[#888888]">
                  {c.size} question{c.size === 1 ? '' : 's'}
                  {c.declined > 0 && <span className="text-amber-400"> · {c.declined} declined</span>}
                  {c.weak_support > 0 && <span className="text-amber-300/80"> · {c.weak_support} weak support</span>}
                </span>
              </div>
              {c.representative_question && <p className="text-xs text-[#BBBBBB] mt-1.5">“{c.representative_question}”</p>}
              {c.misconception && <p className="text-xs text-[#888888] mt-1.5"><span className="text-[#AAAAAA]">Likely misconception:</span> {c.misconception}</p>}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {c.node_labels.map(label => (
                  <span key={label} className="text-[10px] px-2 py-0.5 rounded-full border border-[#222222] text-[#AAAAAA]">{label}</span>
                ))}
                {c.labelled_by === 'keywords' && <span className="text-[10px] text-[#666666]">labelled by keywords (model unavailable)</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

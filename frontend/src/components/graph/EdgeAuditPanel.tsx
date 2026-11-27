import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { graphsApi } from '../../api/graphs';
import { useToastStore } from '../../store/toastStore';
import type { AuditItem, AuditReport } from '../../types/graph';
import { evidenceToSource } from '../../types/graph';
import CitationList from '../tutor/CitationList';
import { CLAY, pillDark } from '../ui/glass';

/** Instructor audit of map links: judge a sample, report how many links are right. */
export default function EdgeAuditPanel({ graphId, courseId }: { graphId: string; courseId: string }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  const refreshReport = useCallback(() => {
    graphsApi.auditReport(graphId).then(res => setReport(res.data)).catch(() => setReport(null));
  }, [graphId]);

  useEffect(() => { refreshReport(); }, [refreshReport]);

  const loadSample = async () => {
    setLoading(true);
    try {
      setItems((await graphsApi.auditSample(graphId, 30)).data.items);
      refreshReport();
    } catch {
      addToast('Could not load an audit sample', 'error');
    } finally {
      setLoading(false);
    }
  };

  const judge = async (item: AuditItem, status: 'correct' | 'incorrect') => {
    try {
      const res = await graphsApi.judgeEdge(graphId, item.id, status);
      setItems(prev => prev.map(i => (i.id === item.id ? res.data : i)));
      refreshReport();
    } catch {
      addToast('Could not save the verdict', 'error');
    }
  };

  const p = report?.precision_estimate ?? report?.precision;
  const judged = items.filter(i => i.audit && i.audit.status !== 'unreviewed').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className={`rounded-2xl px-3.5 py-3 min-w-0 ${p?.n ? 'bg-accent-strong text-white' : 'bg-[#f1f5f7] text-accent-strong'}`}>
          <span className="block font-display text-2xl leading-none tabular">{p && p.n ? `${Math.round(p.value * 100)}%` : '—'}</span>
          <span className={`block mt-1.5 text-[11px] truncate ${p?.n ? 'text-white/70' : 'text-ink-3'}`}>links correct</span>
          {p && p.n > 0 && <span className="block text-[10px] text-white/50 tabular truncate">±{Math.round(((p.ci_high - p.ci_low) / 2) * 100)} pts</span>}
        </div>
        <div className="rounded-2xl bg-[#f1f5f7] px-3.5 py-3 min-w-0">
          <span className="block font-display text-2xl leading-none tabular text-accent-strong">{p?.n ?? 0}</span>
          <span className="block mt-1.5 text-[11px] text-ink-3 truncate">links checked</span>
        </div>
        <div className="rounded-2xl bg-[#f1f5f7] px-3.5 py-3 min-w-0">
          <span className="block font-display text-2xl leading-none tabular text-accent-strong">{report ? report.edges_unsupported : '—'}</span>
          <span className="block mt-1.5 text-[11px] text-ink-3 truncate">{report ? `of ${report.edges_total} unsourced` : 'unsourced'}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3">{items.length ? `${judged} of ${items.length} judged` : 'Check 30 random links against their sources.'}</p>
        <button type="button" onClick={loadSample} disabled={loading} className={pillDark}>
          {loading && <Loader2 size={14} className="animate-spin" />} {items.length ? 'New sample' : 'Start'}
        </button>
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map(item => {
            const v = item.audit?.status;
            return (
              <li key={item.id} className="rounded-2xl bg-[#f1f5f7] p-3.5">
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="px-2.5 h-7 inline-flex items-center rounded-full bg-white text-accent-strong">{item.from_label}</span>
                    <span className="text-[11px] text-ink-4">{item.relation.replace(/_/g, ' ')} →</span>
                    <span className="px-2.5 h-7 inline-flex items-center rounded-full bg-white text-accent-strong">{item.to_label}</span>
                  </p>
                  <span className="inline-flex p-0.5 rounded-full bg-white shrink-0">
                    <button type="button" onClick={() => judge(item, 'correct')} aria-pressed={v === 'correct'} title="Correct"
                      className={`h-7 w-7 grid place-items-center rounded-full cursor-pointer ${v === 'correct' ? 'bg-accent-strong text-white' : 'text-ink-3 hover:text-accent-strong'}`}>
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => judge(item, 'incorrect')} aria-pressed={v === 'incorrect'} title="Wrong"
                      className="h-7 w-7 grid place-items-center rounded-full cursor-pointer text-ink-3"
                      style={v === 'incorrect' ? { background: CLAY.wash, color: CLAY.ink } : undefined}>
                      <X size={14} />
                    </button>
                  </span>
                </div>
                <div className="mt-2.5">
                  {item.provenance && item.provenance.length > 0
                    ? <CitationList courseId={courseId} sources={item.provenance.map(evidenceToSource)} title="Source" />
                    : <p className="text-[11px]" style={{ color: CLAY.ink }}>No source passage</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

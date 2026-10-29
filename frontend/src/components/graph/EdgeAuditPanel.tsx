import { useCallback, useEffect, useState } from 'react';
import { Check, ShieldQuestion, X } from 'lucide-react';
import { graphsApi } from '../../api/graphs';
import { useToastStore } from '../../store/toastStore';
import type { AuditItem, AuditReport, Proportion } from '../../types/graph';
import { evidenceToSource } from '../../types/graph';
import CitationList from '../tutor/CitationList';

function pct(p?: Proportion) {
  if (!p || !p.n) return '—';
  return `${Math.round(p.value * 100)}% (95% CI ${Math.round(p.ci_low * 100)}–${Math.round(p.ci_high * 100)}%, n=${p.n})`;
}

/** Instructor audit of graph relations: judge a stratified sample, report edge precision. */
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
      const res = await graphsApi.auditSample(graphId, 30);
      setItems(res.data.items);
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

  const remaining = items.filter(i => !i.audit || i.audit.status === 'unreviewed').length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#888888]">Edge precision (whole graph)</p>
          <p className="text-sm text-white mt-1">{pct(report?.precision_estimate ?? report?.precision)}</p>
          {report?.precision_estimate && (
            <p className="text-[10px] text-[#666666] mt-1">
              Judged sample: {pct(report.precision)}
              {report.precision_estimate.coverage !== undefined && report.precision_estimate.coverage < 1
                ? ` · strata covered: ${Math.round(report.precision_estimate.coverage * 100)}% of edges` : ''}
            </p>
          )}
        </div>
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#888888]">Supported edges</p>
          <p className="text-sm text-white mt-1">{pct(report?.precision_supported)}</p>
        </div>
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-[#888888]">Unsupported (flagged)</p>
          <p className="text-sm text-white mt-1">
            {report ? `${report.edges_unsupported} of ${report.edges_total} edges` : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[#888888]">
          {items.length ? `${remaining} of ${items.length} sampled relations left to judge` : 'Judge a random sample of relations to measure how accurate the graph is.'}
        </p>
        <button onClick={loadSample} disabled={loading} className="px-3 py-1.5 rounded-lg text-xs bg-white text-black font-medium disabled:opacity-50">
          {items.length ? 'Reload sample' : 'Start audit'}
        </button>
      </div>

      <ul className="space-y-3">
        {items.map(item => (
          <li key={item.id} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-white">
                <span className="font-medium">{item.from_label}</span>
                <span className="text-[#888888] mx-2">— {item.relation.replace(/_/g, ' ')} →</span>
                <span className="font-medium">{item.to_label}</span>
                {item.supported === false && <span className="ml-2 text-[10px] text-amber-400">no supporting passage</span>}
              </p>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => judge(item, 'correct')}
                  aria-pressed={item.audit?.status === 'correct'}
                  className={`p-1.5 rounded-lg border ${item.audit?.status === 'correct' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-[#1A1A1A] text-[#888888] hover:text-white'}`}
                  title="Correct relation"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => judge(item, 'incorrect')}
                  aria-pressed={item.audit?.status === 'incorrect'}
                  className={`p-1.5 rounded-lg border ${item.audit?.status === 'incorrect' ? 'border-red-500 text-red-400 bg-red-500/10' : 'border-[#1A1A1A] text-[#888888] hover:text-white'}`}
                  title="Incorrect relation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {item.provenance && item.provenance.length > 0 ? (
              <CitationList courseId={courseId} sources={item.provenance.map(evidenceToSource)} title="Evidence" />
            ) : (
              <p className="text-xs text-[#666666] flex items-center gap-1.5"><ShieldQuestion className="w-3.5 h-3.5" /> The model proposed this relation without a passage.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

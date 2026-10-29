import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, FlaskConical } from 'lucide-react';
import { learnerApi } from '../../api/learner';
import type { ConceptFlags, PRF } from '../../api/learner';
import { useToastStore } from '../../store/toastStore';

function prf(m?: PRF) {
  return m ? `P ${m.precision.toFixed(2)} · R ${m.recall.toFixed(2)} · F1 ${m.f1.toFixed(2)}` : '—';
}

/** Concepts students struggle with, the signals behind each flag, and the instructor labels that calibrate the model. */
export default function ConceptFlagsPanel({ courseId }: { courseId: string }) {
  const [data, setData] = useState<ConceptFlags | null>(null);
  const [fitting, setFitting] = useState(false);
  // A second rater labels a subset independently; agreement (Cohen's kappa) is reported after calibrating
  const [rater, setRater] = useState<'primary' | 'secondary'>('primary');
  const addToast = useToastStore(s => s.addToast);

  const load = useCallback(() => {
    learnerApi.conceptFlags(courseId).then(res => setData(res.data)).catch(() => setData(null));
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const label = async (nodeId: string, struggling: boolean | null) => {
    try {
      if (struggling === null) await learnerApi.clearLabel(courseId, nodeId, rater);
      else await learnerApi.setLabel(courseId, nodeId, { struggling, rater_slot: rater });
      load();
    } catch {
      addToast('Could not save the label', 'error');
    }
  };

  const fit = async () => {
    setFitting(true);
    try {
      await learnerApi.fit(courseId);
      addToast('Model calibrated on your labels', 'success');
      load();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      addToast(detail || 'Could not fit the model', 'error');
    } finally {
      setFitting(false);
    }
  };

  const mine = (c: ConceptFlags['concepts'][number]) => (rater === 'primary' ? c.instructor_label : c.second_rater_label ?? null);

  if (!data) return <p className="text-xs text-[#888888]">Loading…</p>;
  const metrics = data.model_metrics;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-white">
            {data.method === 'calibrated' ? 'Calibrated on your labels' : 'Using the v1 heuristic (not yet calibrated)'}
          </p>
          <p className="text-[11px] text-[#888888] mt-0.5">
            Mark whether students struggle with each concept, then calibrate. {data.labelled} labelled so far; at least 6 with both kinds are needed.
          </p>
        </div>
        <div className="flex items-center gap-1 text-[11px]" role="group" aria-label="Who is labelling">
          {(['primary', 'secondary'] as const).map(slot => (
            <button key={slot} onClick={() => setRater(slot)} aria-pressed={rater === slot}
              className={`px-2 py-1 rounded-lg border ${rater === slot ? 'border-white text-white' : 'border-[#1A1A1A] text-[#888888] hover:text-white'}`}>
              {slot === 'primary' ? 'Rater 1' : 'Rater 2'}
            </button>
          ))}
        </div>
        <button onClick={fit} disabled={fitting} className="px-3 py-1.5 rounded-lg text-xs bg-white text-black font-medium disabled:opacity-50 flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5" /> {fitting ? 'Calibrating…' : 'Calibrate on labels'}
        </button>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#888888]">Calibrated (cross-validated)</p>
            <p className="text-white mt-1">{prf(metrics.calibrated_cv)}</p>
          </div>
          <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#888888]">v1 heuristic, same labels</p>
            <p className="text-white mt-1">{prf(metrics.heuristic_v1)}</p>
          </div>
          <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-widest text-[#888888]">Without video signals</p>
            <p className="text-white mt-1">{prf(metrics.calibrated_cv_without_video)}</p>
          </div>
          {metrics.inter_rater && (
            <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest text-[#888888]">Rater agreement</p>
              <p className="text-white mt-1">
                {metrics.inter_rater.cohen_kappa === null ? 'κ —' : `κ ${metrics.inter_rater.cohen_kappa.toFixed(2)}`} on {metrics.inter_rater.n} concepts
              </p>
            </div>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {data.concepts.map(c => (
          <li key={c.node_id} className={`rounded-xl border p-4 ${c.flagged ? 'border-orange-500/30 bg-orange-500/5' : 'border-[#1A1A1A] bg-[#0A0A0A]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-white flex items-center gap-2">
                  {c.flagged && <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                  <span className="truncate">{c.label}</span>
                  <span className="text-[10px] text-[#888888] font-mono">
                    {c.probability !== null ? `p=${c.probability.toFixed(2)}` : `CS=${c.heuristic_v1.toFixed(2)}`}
                  </span>
                </p>
                {c.flagged && (
                  <p className="text-[11px] text-[#AAAAAA] mt-1">
                    Why: {c.signals.filter(s => s.contribution > 0).slice(0, 3).map(s => s.label).join(' · ') || 'combined signals'}
                  </p>
                )}
                <p className="text-[10px] text-[#666666] mt-1">
                  {c.counts.students} students · {c.counts.questions} questions · {c.counts.video_replays} lecture replays
                  {c.mean_mastery !== null ? ` · mastery ${Math.round(c.mean_mastery * 100)}%` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label={`Do students struggle with ${c.label}?`}>
                <span className="text-[10px] text-[#888888] mr-1">Students struggle?</span>
                <button
                  onClick={() => label(c.node_id, mine(c) === true ? null : true)}
                  aria-pressed={mine(c) === true}
                  className={`px-2 py-1 rounded-lg text-[11px] border ${mine(c) === true ? 'border-orange-500 text-orange-300 bg-orange-500/10' : 'border-[#1A1A1A] text-[#888888] hover:text-white'}`}
                >
                  Yes
                </button>
                <button
                  onClick={() => label(c.node_id, mine(c) === false ? null : false)}
                  aria-pressed={mine(c) === false}
                  className={`px-2 py-1 rounded-lg text-[11px] border flex items-center gap-1 ${mine(c) === false ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10' : 'border-[#1A1A1A] text-[#888888] hover:text-white'}`}
                >
                  <Check className="w-3 h-3" /> No
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

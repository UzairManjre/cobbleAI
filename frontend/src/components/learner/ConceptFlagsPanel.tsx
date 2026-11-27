import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { learnerApi } from '../../api/learner';
import type { ConceptFlags, PRF } from '../../api/learner';
import { useToastStore } from '../../store/toastStore';
import { CLAY, panel, pillDark } from '../ui/glass';

const NEEDED = 6;
const f1 = (m?: PRF) => (m ? m.f1.toFixed(2) : '—');

/** Ten dots, filled to the struggle score: the page's dot-matrix motif. */
function ScoreDots({ score, flagged }: { score: number; flagged: boolean }) {
  const n = Math.round(Math.max(0, Math.min(1, score)) * 10);
  return (
    <span className="grid grid-cols-5 gap-[3px] w-[38px] shrink-0" aria-label={`Struggle score ${score.toFixed(2)}`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="h-[5px] w-[5px] rounded-full"
          style={{ background: i < n ? (flagged ? CLAY.bar : '#2a6f87') : '#dbe7ec' }} />
      ))}
    </span>
  );
}

/** Concepts students struggle with, and the instructor labels that calibrate the model. */
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

  if (!data) return <section className={`${panel} p-5 min-h-[240px]`} aria-busy="true" />;
  const metrics = data.model_metrics;
  const calibrated = data.method === 'calibrated';
  const concepts = [...data.concepts].sort((a, b) => (b.probability ?? b.heuristic_v1) - (a.probability ?? a.heuristic_v1));
  const flagged = concepts.filter(c => c.flagged).length;

  return (
    <div className="grid gap-4 xl:grid-cols-3 items-start [&>*]:min-w-0">
      {/* Ranked concepts */}
      <section className={`${panel} p-5 xl:col-span-2`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] text-accent-strong">Struggling concepts</h2>
          <span className="text-xs text-ink-3">{flagged} of {concepts.length} flagged</span>
        </div>

        <div className="mt-3 hidden sm:grid grid-cols-[38px_minmax(0,1fr)_4.5rem_4.5rem_8.5rem] gap-4 px-3 text-[11px] text-ink-4">
          <span>Score</span><span>Concept</span><span className="text-right">Questions</span><span className="text-right">Mastery</span><span className="text-right">Struggling?</span>
        </div>
        <ul className="mt-1 space-y-1">
          {concepts.map(c => {
            const score = c.probability ?? c.heuristic_v1;
            // The reason line skips signals the Questions column already shows
            const why = c.signals.filter(s => s.contribution > 0 && !/question/i.test(s.label))[0]?.label;
            const v = mine(c);
            return (
              <li key={c.node_id} className="grid grid-cols-[38px_minmax(0,1fr)_auto] sm:grid-cols-[38px_minmax(0,1fr)_4.5rem_4.5rem_8.5rem] items-center gap-x-4 gap-y-2 rounded-2xl px-3 py-3 hover:bg-[#f1f5f7] transition-colors">
                <ScoreDots score={score} flagged={c.flagged} />
                <span className="min-w-0">
                  <span className="block text-sm text-accent-strong truncate">{c.label}</span>
                  {c.flagged && why && <span className="block text-[11px] text-ink-3 truncate" title={c.signals.map(s => s.label).join(' · ')}>{why}</span>}
                </span>
                <span className="hidden sm:block text-right text-sm text-ink-2 tabular">{c.counts.questions}</span>
                <span className="hidden sm:block text-right text-sm text-ink-2 tabular">{c.mean_mastery !== null ? `${Math.round(c.mean_mastery * 100)}%` : '—'}</span>
                <span className="justify-self-end inline-flex p-0.5 rounded-full bg-[#f1f5f7]" role="group" aria-label={`Do students struggle with ${c.label}?`}>
                  {([true, false] as const).map(yes => (
                    <button key={String(yes)} type="button" aria-pressed={v === yes} onClick={() => label(c.node_id, v === yes ? null : yes)}
                      className="h-7 px-3 rounded-full text-xs transition-colors cursor-pointer"
                      style={v === yes ? (yes ? { background: CLAY.wash, color: CLAY.ink } : { background: '#0e3445', color: '#fff' }) : { color: '#56676b' }}>
                      {yes ? 'Yes' : 'No'}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Calibration */}
      <section className={`${panel} p-5 xl:sticky xl:top-4`}>
        <h2 className="text-[15px] text-accent-strong">Calibration</h2>
        <p className="mt-1 text-xs text-ink-3">{calibrated ? 'Scores come from a model fitted to your labels.' : 'Scores use a simple rule until you label a few concepts.'}</p>

        <div className="mt-4 rounded-2xl bg-[#f1f5f7] p-3.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-accent-strong">Labelled</span>
            <span className="tabular text-ink-2">{data.labelled} / {NEEDED}</span>
          </div>
          <span className="mt-2 flex gap-1" aria-hidden>
            {Array.from({ length: NEEDED }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < data.labelled ? 'bg-accent' : 'bg-[#dbe7ec]'}`} />)}
          </span>
          <p className="mt-2 text-[11px] text-ink-4">Needs both Yes and No answers.</p>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-ink-3">Labelling as</span>
          <span className="inline-flex p-0.5 rounded-full bg-[#f1f5f7]">
            {(['primary', 'secondary'] as const).map(slot => (
              <button key={slot} type="button" onClick={() => setRater(slot)} aria-pressed={rater === slot}
                className={`h-7 px-3 rounded-full text-xs cursor-pointer ${rater === slot ? 'bg-accent-strong text-white' : 'text-ink-3 hover:text-accent-strong'}`}>
                {slot === 'primary' ? 'Rater 1' : 'Rater 2'}
              </button>
            ))}
          </span>
        </div>

        <button type="button" onClick={fit} disabled={fitting} className={`${pillDark} w-full mt-4`}>
          {fitting && <Loader2 size={14} className="animate-spin" />} {fitting ? 'Calibrating…' : 'Calibrate'}
        </button>

        {metrics && (
          <dl className="mt-4 divide-y divide-[#e2eaeb] text-sm">
            <Row k="Calibrated F1" v={f1(metrics.calibrated_cv)} />
            <Row k="Simple rule F1" v={f1(metrics.heuristic_v1)} />
            <Row k="Without video" v={f1(metrics.calibrated_cv_without_video)} />
            {metrics.inter_rater && <Row k={`Rater agreement (${metrics.inter_rater.n})`} v={metrics.inter_rater.cohen_kappa === null ? '—' : `κ ${metrics.inter_rater.cohen_kappa.toFixed(2)}`} />}
          </dl>
        )}
      </section>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between py-2"><dt className="text-ink-3 text-xs">{k}</dt><dd className="text-accent-strong tabular">{v}</dd></div>
);

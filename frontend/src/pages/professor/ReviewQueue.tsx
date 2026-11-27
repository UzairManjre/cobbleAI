import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, ClipboardCheck, Download, Pencil, Quote } from 'lucide-react';
import { reviewQueueApi } from '../../api/reviewQueue';
import type { AgreementReport, AgreementStats, ReviewItem } from '../../api/reviewQueue';
import CitationList from '../../components/tutor/CitationList';
import { useToastStore } from '../../store/toastStore';
import { saveBlob } from '../../utils/download';
import { panel, pillDark, pillLine, rise } from '../../components/ui/glass';

type Filter = 'needs_review' | 'reviewed' | 'all';

function fmt(v: number | null | undefined, digits = 2) {
  return v === null || v === undefined ? '—' : v.toFixed(digits);
}

const field = 'w-full rounded-xl bg-white border border-[#dbe7ec] px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent-300';

/** How closely the AI grader matches the professor, overall and per cognitive level. */
function AgreementCard({ report }: { report: AgreementReport | null }) {
  if (!report) return <section className={`${panel} p-5 min-h-[200px]`} aria-busy="true" />;
  const o = report.overall;
  const rows: [string, AgreementStats][] = [['Overall', o], ...Object.entries(report.by_cognitive_level)];
  return (
    <section className={`${panel} p-5`}>
      <h2 className="text-[15px] text-accent-strong">Grader agreement with you</h2>
      <p className="text-[11px] text-ink-3 mt-1 leading-snug">
        On answers you reviewed. {report.auto_accepted} auto-accepted answers are not counted.
      </p>
      {o.n === 0 ? (
        <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-xs text-ink-3">Review a few answers to see how often you and the AI agree.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Tile label="Exact" value={o.exact_agreement === undefined ? '—' : `${Math.round(o.exact_agreement * 100)}%`} />
            <Tile label="Kappa" value={fmt(o.qwk)} />
            <Tile label="Avg. gap (marks)" value={o.mae_marks === null || o.mae_marks === undefined ? '—' : `${fmt(o.mae_marks, 1)}m`} />
          </div>
          <table className="mt-4 w-full text-xs">
            <thead>
              <tr className="text-[11px] text-ink-3 text-left">
                <th className="pb-1.5 font-normal">Level</th><th className="pb-1.5 font-normal">n</th><th className="pb-1.5 font-normal cursor-help" title="Quadratic weighted kappa. Blank until scores vary.">Kappa</th><th className="pb-1.5 font-normal text-right">Exact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, s]) => (
                <tr key={label} className="border-t border-[#e2eaeb]">
                  <td className="py-2 pr-2 text-accent-strong capitalize">{label}</td>
                  <td className="py-2 pr-2 tabular text-ink-3">{s.n}</td>
                  <td className="py-2 pr-2 tabular text-ink-2" title={s.qwk_ci ? `95% CI ${fmt(s.qwk_ci.ci_low)} to ${fmt(s.qwk_ci.ci_high)}` : undefined}>{fmt(s.qwk)}</td>
                  <td className="py-2 tabular text-right text-ink-2">{s.exact_agreement === undefined ? '—' : `${Math.round(s.exact_agreement * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

/** Where every AI grade ended up: auto-accepted, checked by you, or still waiting. */
function WorkloadCard({ report, pending }: { report: AgreementReport | null; pending: number }) {
  const auto = report?.auto_accepted ?? 0;
  const reviewed = report?.overall.n ?? 0;
  const total = auto + reviewed + pending;
  const parts = [
    { label: 'Auto-accepted', n: auto, cls: 'bg-accent-200' },
    { label: 'You reviewed', n: reviewed, cls: 'bg-accent-strong' },
    { label: 'Waiting', n: pending, cls: 'bg-clay-bar' },
  ];
  return (
    <section className={`${panel} p-5 flex-1 flex flex-col`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] text-accent-strong">Grading so far</h2>
        <span className="text-xs text-ink-3 tabular">{total} answers</span>
      </div>
      <div className="mt-4 h-2.5 rounded-full bg-[#dbe7ec] overflow-hidden flex gap-[2px]" aria-hidden>
        {total > 0 && parts.map(p => p.n > 0 && <span key={p.label} className={`h-full ${p.cls}`} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {parts.map(p => (
          <li key={p.label} className="min-w-0">
            <span className="block font-display text-lg leading-none tabular text-accent-strong">{p.n}</span>
            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3"><span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.cls}`} /><span className="truncate">{p.label}</span></span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">
        <p className="rounded-2xl bg-[#f1f5f7] px-3.5 py-3 text-xs text-ink-3 leading-relaxed">
          Grades under <span className="text-accent-strong">70% sure</span> wait for you. The rest are accepted automatically.
        </p>
      </div>
    </section>
  );
}

const Tile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-[#f1f5f7] px-3 py-2.5 min-w-0">
    <span className="block font-display text-lg tracking-[-0.02em] text-accent-strong tabular truncate">{value}</span>
    <span className="text-[11px] text-ink-3">{label}</span>
  </div>
);

function ReviewCard({ item, courseId, onDone }: { item: ReviewItem; courseId: string; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(String(item.ai_score ?? ''));
  const [feedback, setFeedback] = useState(item.feedback || '');
  const [busy, setBusy] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  const submit = async (action: 'approve' | 'override') => {
    setBusy(true);
    try {
      await reviewQueueApi.review(item.attempt_id, item.question_id, action, action === 'override' ? Number(score) : undefined,
        feedback !== (item.feedback || '') ? feedback : undefined);
      addToast(action === 'approve' ? 'Grade approved' : 'Grade overridden', 'success');
      onDone();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      addToast(detail || 'Could not save the review', 'error');
    } finally {
      setBusy(false);
    }
  };

  const spans = item.evidence.filter(e => e.kind === 'student_answer');
  const sources = item.evidence.filter(e => e.kind === 'course_source').map(e => ({
    doc_id: e.doc_id || '', filename: e.filename || 'Course material', relevance_score: 0, sid: e.sid,
    location: e.location, snippet: e.snippet, t_start: e.t_start, page_start: e.page_start, slide_start: e.slide_start,
  }));
  const confidencePct = item.confidence === null ? null : Math.round(item.confidence * 100);
  const unsure = confidencePct !== null && confidencePct < 70;

  return (
    <li className={`${panel} p-5 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-accent-wash text-accent">{item.student.name}</span>
            <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-[#f1f5f7] text-ink-3">{item.test_title}</span>
            {item.cognitive_level && <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-[#f1f5f7] text-ink-3 capitalize">{item.cognitive_level}</span>}
          </div>
          <p className="mt-2.5 text-[15px] text-accent-strong leading-snug">{item.question}</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-[#f1f5f7] px-4 py-3 text-right min-w-[8.5rem]">
          <p className="font-display text-2xl tracking-[-0.03em] text-accent-strong tabular leading-none">
            {fmt(item.ai_score, 1)}<span className="text-sm text-ink-3"> / {item.max_marks}</span>
          </p>
          {confidencePct !== null && (
            <>
              <div className="mt-2 h-1.5 bg-[#dbe7ec] rounded-full overflow-hidden" aria-label={`Grader confidence ${confidencePct}%`}>
                <div className={`h-full rounded-full ${unsure ? 'bg-clay-bar' : 'bg-accent'}`} style={{ width: `${confidencePct}%` }} />
              </div>
              <p className={`text-[11px] mt-1 ${unsure ? 'text-clay' : 'text-ink-3'}`}>{confidencePct}% sure</p>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-[#f1f5f7] p-4">
        <p className="text-[11px] text-ink-3 mb-1">Student answer</p>
        <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{item.answer || '—'}</p>
      </div>

      {spans.length > 0 && (
        <ul className="space-y-1.5">
          {spans.map((s, i) => (
            <li key={i} className="text-xs flex gap-2">
              <Quote className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${s.met ? 'text-accent' : 'text-ink-4'}`} />
              <span className="text-ink-3"><span className="text-accent-strong">{s.point}</span> · “{s.quote}”</span>
            </li>
          ))}
        </ul>
      )}
      {item.ai_rationale && <p className="text-xs text-ink-3 leading-relaxed"><span className="text-accent-strong">Grader's reasoning:</span> {item.ai_rationale}</p>}
      {sources.length > 0 && <CitationList courseId={courseId} sources={sources} title="Course material used" />}

      {item.review_status === 'needs_review' || editing ? (
        <div className="pt-4 border-t border-[#e2eaeb] space-y-3">
          {editing && (
            <label className="flex items-center gap-2 text-xs text-ink-3">Score
              <input type="number" min={0} max={item.max_marks} step={0.5} value={score} onChange={e => setScore(e.target.value)}
                className={`${field} !w-24`} />
              <span className="text-ink-4">of {item.max_marks}</span>
            </label>
          )}
          <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} placeholder="Feedback for the student (optional)" className={`${field} text-xs`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => submit('approve')} disabled={busy || item.ai_score === null} className={pillDark}>
              <Check size={14} /> Approve AI grade
            </button>
            {editing ? (
              <button type="button" onClick={() => submit('override')} disabled={busy || score === ''} className={pillLine}>Save new score</button>
            ) : (
              <button type="button" onClick={() => setEditing(true)} disabled={busy} className={pillLine}><Pencil size={14} /> Change score</button>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-3 border-t border-[#e2eaeb] flex items-center justify-between text-xs">
          <span className="text-ink-3">
            {item.review_status === 'auto' ? 'Auto-accepted' : item.review_status === 'approved' ? 'You approved' : 'You changed it'} · final {fmt(item.final_score, 1)}
          </span>
          <button type="button" onClick={() => setEditing(true)} className="text-accent hover:underline flex items-center gap-1 cursor-pointer"><Pencil className="w-3 h-3" /> Change</button>
        </div>
      )}
    </li>
  );
}

/** Grader v2 review queue: least-confident answers first, with the evidence behind each grade. */
export default function ReviewQueue() {
  const { courseId } = useParams();

  const [filter, setFilter] = useState<Filter>('needs_review');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [pending, setPending] = useState(0);
  const [report, setReport] = useState<AgreementReport | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    reviewQueueApi.queue(courseId, filter).then(res => {
      if (cancelled) return;
      setItems(res.data.items);
      setPending(res.data.counts.needs_review);
    }).catch(() => { if (!cancelled) setItems([]); });
    reviewQueueApi.agreement(courseId).then(res => { if (!cancelled) setReport(res.data); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId, filter, reloadKey]);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const exportCsv = async () => {
    if (!courseId) return;
    try {
      const res = await reviewQueueApi.exportCsv(courseId);
      saveBlob(res.data, 'grades.csv');
    } catch {
      addToast('Could not export grades', 'error');
    }
  };

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'needs_review', label: 'Needs review', count: pending },
    { id: 'reviewed', label: 'Reviewed' },
    { id: 'all', label: 'All AI-graded' },
  ];

  return (
    <div className="mt-8 sm:mt-10 space-y-4 text-ink">
      <section style={rise(1)} className={`${panel} p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid place-items-center h-10 w-10 shrink-0 rounded-xl bg-accent-wash text-accent"><ClipboardCheck size={18} /></span>
          <div className="min-w-0">
            <h2 className="font-display text-[1.35rem] tracking-[-0.02em] text-accent-strong">AI grades to review</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              {pending ? `${pending} ${pending === 1 ? 'answer the grader was unsure about' : 'answers the grader was unsure about'}, least confident first.` : 'The grader is confident about everything so far.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-full bg-[#f1f5f7]" role="tablist">
            {filters.map(f => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                className={`h-8 px-4 rounded-full text-xs transition-colors cursor-pointer ${filter === f.id ? 'bg-accent-strong text-white' : 'text-ink-3 hover:text-accent-strong'}`}>
                {f.label}{f.count !== undefined && <span className={filter === f.id ? 'text-white/60' : 'text-ink-4'}> {f.count}</span>}
              </button>
            ))}
          </div>
          <button type="button" onClick={exportCsv} className={pillLine}><Download size={14} /> Export CSV</button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3 items-stretch [&>*]:min-w-0">
        <div className="xl:col-span-2" style={rise(2)}>
          {items.length === 0 ? (
            <div className={`${panel} p-10 text-center`}>
              <span className="grid place-items-center h-12 w-12 rounded-full bg-accent-wash text-accent mx-auto"><Check size={20} /></span>
              <p className="mt-3 text-sm text-accent-strong">{filter === 'needs_review' ? 'Nothing to review' : 'No AI-graded answers yet'}</p>
              <p className="text-xs text-ink-3 mt-1">{filter === 'needs_review' ? 'Answers the grader is unsure about will appear here.' : 'They appear once students submit tests.'}</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {items.map(item => (
                <ReviewCard key={`${item.attempt_id}-${item.question_id}-${reloadKey}`} item={item} courseId={courseId || ''} onDone={reload} />
              ))}
            </ul>
          )}
        </div>
        {/* Stretches to the queue's height so the column ends where the queue does; sticky once the queue is long */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start xl:min-h-full" style={rise(3)}>
          <AgreementCard report={report} />
          <WorkloadCard report={report} pending={pending} />
        </div>
      </div>
    </div>
  );
}

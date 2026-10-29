import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, Pencil, Quote } from 'lucide-react';
import { reviewQueueApi } from '../../api/reviewQueue';
import type { AgreementReport, AgreementStats, ReviewItem } from '../../api/reviewQueue';
import CitationList from '../../components/tutor/CitationList';
import { useToastStore } from '../../store/toastStore';
import { saveBlob } from '../../utils/download';

type Filter = 'needs_review' | 'reviewed' | 'all';

function fmt(v: number | null | undefined, digits = 2) {
  return v === null || v === undefined ? '—' : v.toFixed(digits);
}

function AgreementCard({ report }: { report: AgreementReport | null }) {
  const row = (label: string, s: AgreementStats) => (
    <tr key={label} className="border-t border-[#1A1A1A]">
      <td className="py-1.5 pr-3 text-[#CCCCCC] capitalize">{label}</td>
      <td className="py-1.5 pr-3 font-mono">{s.n}</td>
      <td className="py-1.5 pr-3 font-mono">{fmt(s.qwk)}{s.qwk_ci ? <span className="text-[#666666]"> [{fmt(s.qwk_ci.ci_low)}, {fmt(s.qwk_ci.ci_high)}]</span> : null}</td>
      <td className="py-1.5 pr-3 font-mono">{fmt(s.mae_marks)}</td>
      <td className="py-1.5 font-mono">{s.exact_agreement === undefined ? '—' : `${Math.round(s.exact_agreement * 100)}%`}</td>
    </tr>
  );
  if (!report) return null;
  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5">
      <h3 className="text-sm font-medium text-white">Grader agreement with you</h3>
      <p className="text-[11px] text-[#888888] mt-1 mb-3">
        On answers you reviewed. Quadratic weighted kappa (95% CI), mean absolute error in marks, exact agreement in half-marks.
        Kappa shows — until both you and the AI have given different scores (it is undefined when every score is the same).
        {` ${report.auto_accepted} answers were auto-accepted and are not counted.`}
      </p>
      {report.overall.n === 0 ? (
        <p className="text-xs text-[#666666]">Review some answers to see agreement.</p>
      ) : (
        <table className="w-full text-xs text-white">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-[#888888] text-left">
              <th className="pb-1.5">Level</th><th className="pb-1.5">n</th><th className="pb-1.5">QWK</th><th className="pb-1.5">MAE</th><th className="pb-1.5">Exact</th>
            </tr>
          </thead>
          <tbody>
            {row('overall', report.overall)}
            {Object.entries(report.by_cognitive_level).map(([level, s]) => row(level, s))}
          </tbody>
        </table>
      )}
    </div>
  );
}

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

  return (
    <li className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-[#888888]">
            {item.test_title} · {item.student.name}{item.cognitive_level ? ` · ${item.cognitive_level}` : ''}
          </p>
          <p className="text-sm text-white mt-1">{item.question}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg text-white font-light">{fmt(item.ai_score, 1)} <span className="text-xs text-[#888888]">/ {item.max_marks}</span></p>
          {confidencePct !== null && (
            <div className="mt-1 w-28 ml-auto">
              <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden" aria-label={`Grader confidence ${confidencePct}%`}>
                <div className={`h-full ${confidencePct < 70 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${confidencePct}%` }} />
              </div>
              <p className="text-[10px] text-[#888888] mt-0.5">confidence {confidencePct}%</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-[#888888] mb-1">Student answer</p>
        <p className="text-sm text-[#DDDDDD] whitespace-pre-wrap">{item.answer || '—'}</p>
      </div>

      {spans.length > 0 && (
        <ul className="space-y-1.5">
          {spans.map((s, i) => (
            <li key={i} className="text-xs flex gap-2">
              <Quote className={`w-3.5 h-3.5 shrink-0 ${s.met ? 'text-emerald-400' : 'text-[#666666]'}`} />
              <span className="text-[#AAAAAA]"><span className="text-white">{s.point}</span> — “{s.quote}”</span>
            </li>
          ))}
        </ul>
      )}
      {item.ai_rationale && <p className="text-xs text-[#888888]"><span className="text-[#AAAAAA]">Grader's reasoning:</span> {item.ai_rationale}</p>}
      {sources.length > 0 && <CitationList courseId={courseId} sources={sources} title="Course material used" />}

      {item.review_status === 'needs_review' || editing ? (
        <div className="space-y-3">
          {editing && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-[#888888]">Score
                <input type="number" min={0} max={item.max_marks} step={0.5} value={score} onChange={e => setScore(e.target.value)}
                  className="ml-2 w-20 bg-[#111111] border border-[#1A1A1A] rounded-lg px-2 py-1 text-sm text-white" />
              </label>
              <span className="text-xs text-[#666666]">of {item.max_marks}</span>
            </div>
          )}
          <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} placeholder="Feedback for the student"
            className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg px-3 py-2 text-xs text-white" />
          <div className="flex gap-2">
            <button onClick={() => submit('approve')} disabled={busy || item.ai_score === null}
              className="px-3 py-1.5 rounded-lg text-xs bg-white text-black font-medium flex items-center gap-1.5 disabled:opacity-40">
              <Check className="w-3.5 h-3.5" /> Approve AI grade
            </button>
            {editing ? (
              <button onClick={() => submit('override')} disabled={busy || score === ''}
                className="px-3 py-1.5 rounded-lg text-xs border border-[#333333] text-white disabled:opacity-40">Save override</button>
            ) : (
              <button onClick={() => setEditing(true)} disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs border border-[#333333] text-white flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Change score
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#888888]">
            {item.review_status === 'auto' ? 'Auto-accepted' : item.review_status === 'approved' ? 'You approved' : 'You changed it'} · final {fmt(item.final_score, 1)}
          </span>
          <button onClick={() => setEditing(true)} className="text-[#AAAAAA] hover:text-white flex items-center gap-1"><Pencil className="w-3 h-3" /> Change</button>
        </div>
      )}
    </li>
  );
}

/** Grader v2 review queue: least-confident answers first, with the evidence behind each grade. */
export default function ReviewQueue() {
  const { courseId } = useParams();
  const navigate = useNavigate();
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

  const filters: { id: Filter; label: string }[] = [
    { id: 'needs_review', label: `Needs review (${pending})` },
    { id: 'reviewed', label: 'Reviewed' },
    { id: 'all', label: 'All AI-graded' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 text-white">
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => navigate(`/professor/courses/${courseId}`)} className="p-2 rounded-xl border border-[#1A1A1A] text-[#888888] hover:text-white" aria-label="Back to course">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888888]">Grading</p>
          <h1 className="text-xl font-light">Review queue</h1>
        </div>
        <button onClick={exportCsv} className="ml-auto px-3 py-1.5 rounded-lg text-xs border border-[#333333] flex items-center gap-1.5 hover:border-[#666666]">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <AgreementCard report={report} />

      <div className="flex gap-2" role="tablist">
        {filters.map(f => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${filter === f.id ? 'bg-white text-black border-white' : 'border-[#1A1A1A] text-[#AAAAAA] hover:border-[#333333]'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[#888888] py-12 text-center">
          {filter === 'needs_review' ? 'Nothing to review. Answers the grader is unsure about will appear here.' : 'No AI-graded answers yet.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map(item => (
            <ReviewCard key={`${item.attempt_id}-${item.question_id}-${reloadKey}`} item={item} courseId={courseId || ''} onDone={reload} />
          ))}
        </ul>
      )}
    </div>
  );
}

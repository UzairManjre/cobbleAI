import { apiErrorDetail } from '../../utils/apiError';
import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { gradingApi } from '../../api/grading';
import type { GradingOverviewResponse, SubmissionReviewResponse } from '../../api/grading';
import { testsApi } from '../../api/tests';
import { Loader2, ArrowLeft, AlertTriangle, PenLine, Send, Check, Sparkles, ClipboardList } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import RubricEditor from '../../components/grading/RubricEditor';
import { panel, pillDark, pillLine, rise, CLAY } from '../../components/ui/glass';

interface TestQuestion { id: string; question_text?: string; options?: { id: string; text: string }[] }
interface TestInfo { title?: string; questions?: TestQuestion[] }
interface AnswerRow { question_id: string; answer_text?: string; selected_options?: string[]; selected_option_id?: string }

// Choice answers are stored as option ids; show the option's text
function answerText(ans: AnswerRow, q?: TestQuestion): string | undefined {
  if (ans.answer_text) return ans.answer_text;
  const ids = ans.selected_options?.length ? ans.selected_options : ans.selected_option_id ? [ans.selected_option_id] : [];
  if (!ids.length) return undefined;
  return ids.map(id => q?.options?.find(o => o.id === id)?.text ?? (id === 'true' ? 'True' : id === 'false' ? 'False' : id)).join(', ');
}

const field = 'w-full rounded-xl bg-white border border-[#dbe7ec] px-3 py-2 text-sm text-ink focus:outline-none focus:border-[#2a6f87] transition-colors';
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function GradingDashboard() {
  const { courseId, testId } = useParams();
  const { token } = useAuthStore();

  const [overview, setOverview] = useState<GradingOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'needs_review' | 'anomaly_flagged' | 'approved'>('needs_review');
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const addToast = useToastStore(state => state.addToast);

  // Review Mode state
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<SubmissionReviewResponse | null>(null);
  const [testData, setTestData] = useState<TestInfo | null>(null); // For questions text and the title
  const [loadingReview, setLoadingReview] = useState(false);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [editingRubric, setEditingRubric] = useState(false);

  // Local edits for frictionless overriding
  const [localOverrides, setLocalOverrides] = useState<Record<string, { score: number, feedback: string }>>({});

  useEffect(() => {
    if (token && testId && !reviewSubmissionId) {
      loadOverview();
    }
  }, [token, testId, reviewSubmissionId]);

  useEffect(() => {
    if (token && testId && reviewSubmissionId) {
      loadReviewData(reviewSubmissionId);
    }
  }, [reviewSubmissionId]);

  // The test itself, for its title
  useEffect(() => {
    if (!token || !testId) return;
    testsApi.get(testId).then(res => setTestData(res.data?.test || res.data)).catch(() => undefined);
  }, [token, testId]);

  const loadOverview = async () => {
    try {
      setLoading(true);
      const res = await gradingApi.getGradingOverview(testId!);
      setOverview(res);
    } catch (err) {
      console.error('Error loading grading overview', err);
    } finally {
      setLoading(false);
    }
  };

  const loadReviewData = async (attemptId: string) => {
    try {
      setLoadingReview(true);
      setLocalOverrides({}); // Reset edits
      const [reviewRes, testRes] = await Promise.all([
        gradingApi.getSubmissionReview(testId!, attemptId),
        testsApi.get(testId!)
      ]);
      setReviewData(reviewRes);
      setTestData(testRes.data?.test || testRes.data);
    } catch (err) {
      console.error('Error loading review data', err);
    } finally {
      setLoadingReview(false);
    }
  };

  // The AI drafts against the rubric from the submission's answers, each under its question
  const generateDraft = async () => {
    if (!reviewData || !reviewSubmissionId) return;
    const text = ((reviewData.attempt.answers || []) as AnswerRow[]).map((ans, i) => {
      const question = testData?.questions?.find(q => q.id === ans.question_id);
      const answer = answerText(ans, question) || '(no answer)';
      return `Question ${i + 1}: ${question?.question_text || ''}\nAnswer: ${answer}`;
    }).join('\n\n');
    setDrafting(true);
    try {
      await gradingApi.triggerDraft(reviewSubmissionId, text);
      await loadReviewData(reviewSubmissionId);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not generate the AI draft'), 'error');
    } finally {
      setDrafting(false);
    }
  };

  // Publishing is two clicks (no blocking browser dialogs): the first arms it, the second publishes
  const handlePublish = async () => {
    if (!testId) return;
    if (!confirmPublish) {
      setConfirmPublish(true);
      setTimeout(() => setConfirmPublish(false), 5000);
      return;
    }
    setConfirmPublish(false);
    try {
      setPublishing(true);
      const res = await gradingApi.publishAssignmentDrafts(testId);
      addToast(`Published ${res.published_count} grades.`, 'success');
      loadOverview();
    } catch (err) {
      console.error(err);
      addToast('Failed to publish grades', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleApprove = async () => {
    if (!reviewData?.draft?.id) return;
    try {
      await saveLocalOverrides(); // Ensure any pending edits are saved
      await gradingApi.approveDraft(reviewData.draft.id);
      setReviewSubmissionId(null); // Go back to list
      loadOverview();
    } catch (err) {
      console.error(err);
      addToast('Failed to approve draft', 'error');
    }
  };

  const handleLocalEdit = (criterionId: string, field: 'score' | 'feedback', value: number | string) => {
    setLocalOverrides(prev => {
      const current = prev[criterionId] || {
        score: reviewData?.draft?.criteria_evaluations.find(c => c.criterion_id === criterionId)?.override_score ?? reviewData?.draft?.criteria_evaluations.find(c => c.criterion_id === criterionId)?.suggested_score ?? 0,
        feedback: reviewData?.draft?.criteria_evaluations.find(c => c.criterion_id === criterionId)?.override_feedback ?? reviewData?.draft?.criteria_evaluations.find(c => c.criterion_id === criterionId)?.suggested_feedback ?? ''
      };
      return {
        ...prev,
        [criterionId]: { ...current, [field]: value }
      };
    });
  };

  const saveLocalOverrides = async () => {
    const keys = Object.keys(localOverrides);
    if (keys.length === 0 || !reviewData?.draft?.id) return;

    setSavingOverrides(true);
    try {
      const overridesList = keys.map(k => ({
        criterion_id: k,
        override_score: localOverrides[k].score,
        override_feedback: localOverrides[k].feedback
      }));
      const updatedDraft = await gradingApi.overrideDraft(reviewData.draft.id, overridesList);
      setReviewData({ ...reviewData, draft: updatedDraft });
      setLocalOverrides({});
    } catch (err) {
      console.error(err);
    } finally {
      setSavingOverrides(false);
    }
  };

  const spinner = (
    <div className="mt-8 sm:mt-10 grid place-items-center py-24" aria-busy="true">
      <Loader2 className="h-7 w-7 animate-spin text-ink-3" />
    </div>
  );

  if (loading) return spinner;

  // --- REVIEW MODE ---
  if (reviewSubmissionId) {
    if (loadingReview || !reviewData) return spinner;

    const draft = reviewData.draft;
    const isAnomaly = draft?.status === 'anomaly_flagged';
    const maxTotal = reviewData.rubric?.criteria.reduce((s, c) => s + c.max_points, 0) ?? 0;
    const edits = Object.keys(localOverrides).length;

    return (
      <div className="mt-8 sm:mt-10 space-y-4 text-ink">
        {/* Toolbar: who, total, actions */}
        <section style={rise(1)} className={`${panel} p-5 flex flex-wrap items-center gap-4`}>
          <button type="button" onClick={() => { saveLocalOverrides(); setReviewSubmissionId(null); }} aria-label="Back to all submissions"
            className="grid place-items-center h-10 w-10 rounded-full bg-[#f1f5f7] text-accent-strong hover:bg-[#e6eef2] transition-colors cursor-pointer">
            <ArrowLeft size={17} />
          </button>
          <span className="grid place-items-center h-11 w-11 rounded-full bg-[#0e3445] text-white text-sm font-semibold" aria-hidden>{initials(reviewData.student.name)}</span>
          <div className="min-w-0 mr-auto">
            <h2 className="font-display text-[1.35rem] tracking-[-0.02em] text-accent-strong truncate">{reviewData.student.name}</h2>
            <p className="text-xs text-ink-3 truncate">{reviewData.student.email}{testData?.title ? ` · ${testData.title}` : ''}</p>
          </div>
          <div className="text-right pr-2">
            <p className="font-display text-[1.9rem] leading-none tracking-[-0.03em] text-accent-strong tabular">
              {draft?.total_score ?? 0}<span className="text-base text-ink-4">{maxTotal ? ` / ${maxTotal}` : ' pts'}</span>
            </p>
            <p className="mt-1 text-[11px] text-ink-3">Total</p>
          </div>
          <button type="button" onClick={saveLocalOverrides} disabled={edits === 0 || savingOverrides} className={`${pillLine} disabled:opacity-50 disabled:cursor-not-allowed`}>
            {savingOverrides ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />} {savingOverrides ? 'Saving' : edits ? `Save ${edits} ${edits === 1 ? 'edit' : 'edits'}` : 'No edits'}
          </button>
          <button type="button" onClick={handleApprove} disabled={!draft} className={pillDark}>
            <Check size={15} /> Approve
          </button>
        </section>

        {isAnomaly && (
          <div style={{ ...rise(2), background: CLAY.wash, color: CLAY.ink }} className="rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Flagged for a closer look</p>
              <p className="text-sm opacity-85 mt-0.5">{draft.anomaly_reason}</p>
            </div>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0 items-start">
          {/* Their answers */}
          <section style={rise(2)} className={`${panel} p-5`}>
            <h3 className="text-[15px] text-accent-strong">Their answers</h3>
            <div className="mt-4 space-y-3">
              {(reviewData.attempt.answers as AnswerRow[] | undefined)?.map((ans, idx) => {
                const question = testData?.questions?.find(q => q.id === ans.question_id);
                const answer = answerText(ans, question);
                return (
                  <div key={idx} className="rounded-2xl bg-[#f1f5f7] p-4">
                    <p className="text-xs text-ink-3">Question {idx + 1}</p>
                    <p className="mt-1 text-[15px] text-accent-strong leading-snug">{question?.question_text || 'Question text not found'}</p>
                    <div className="mt-3 rounded-xl bg-white px-3.5 py-3">
                      <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{answer || <span className="text-ink-4">No answer</span>}</p>
                    </div>
                  </div>
                );
              })}
              {(!reviewData.attempt.answers || reviewData.attempt.answers.length === 0) && (
                <p className="rounded-2xl bg-[#f1f5f7] p-4 text-sm text-ink-3">No answers in this submission.</p>
              )}
            </div>
          </section>

          {/* Your grade */}
          <section style={rise(3)} className={`${panel} p-5`}>
            <h3 className="text-[15px] text-accent-strong">Grade</h3>
            <p className="text-xs text-ink-3 mt-0.5">The AI's draft per criterion. Change anything before you approve.</p>

            {!reviewData.rubric && (
              <p className="mt-4 rounded-2xl bg-[#f1f5f7] p-4 text-sm text-ink-3">This test has no rubric yet. Add one from the list of submissions.</p>
            )}

            {!draft && reviewData.rubric && (
              <div className="mt-4 rounded-2xl bg-[#f1f5f7] p-4 flex items-center justify-between gap-4">
                <span className="text-sm text-ink-3">No AI draft for this submission yet.</span>
                <button type="button" onClick={generateDraft} disabled={drafting} className={pillDark}>
                  {drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {drafting ? 'Drafting' : 'Draft a grade'}
                </button>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {reviewData.rubric?.criteria.map(crit => {
                const evalData = draft?.criteria_evaluations.find(e => e.criterion_id === crit.id);

                // Fallbacks
                const displayScore = localOverrides[crit.id!]?.score ?? evalData?.override_score ?? evalData?.suggested_score ?? 0;
                const displayFeedback = localOverrides[crit.id!]?.feedback ?? evalData?.override_feedback ?? evalData?.suggested_feedback ?? '';
                // The API sends null for "no override"
                const hasOverride = evalData?.override_score != null || evalData?.override_feedback != null || localOverrides[crit.id!] !== undefined;

                return (
                  <div key={crit.id} className={`rounded-2xl p-4 transition-shadow ${hasOverride ? 'bg-white shadow-[inset_0_0_0_1.5px_#2a6f87]' : 'bg-[#f1f5f7]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] text-accent-strong">{crit.name}</p>
                        {crit.description && <p className="text-xs text-ink-3 mt-0.5">{crit.description}</p>}
                      </div>
                      {evalData && (
                        <span className={`shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] ${hasOverride ? 'bg-[#0e3445] text-white' : 'bg-white text-ink-3'}`}>
                          {hasOverride ? <PenLine size={11} /> : <Sparkles size={11} />} {hasOverride ? 'You edited' : 'AI draft'}
                        </span>
                      )}
                    </div>

                    {evalData && (
                      <div className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                        <label className="block">
                          <span className="block text-[11px] text-ink-3 mb-1">Score / {crit.max_points}</span>
                          <input type="number" min="0" max={crit.max_points} step="0.5" value={displayScore}
                            onChange={(e) => handleLocalEdit(crit.id!, 'score', parseFloat(e.target.value) || 0)}
                            className={`${field} tabular`} />
                        </label>
                        <label className="block">
                          <span className="block text-[11px] text-ink-3 mb-1">Feedback the student sees</span>
                          <textarea value={displayFeedback} rows={2}
                            onChange={(e) => handleLocalEdit(crit.id!, 'feedback', e.target.value)}
                            className={`${field} resize-y leading-snug`} />
                        </label>
                        {evalData.ai_reasoning && (
                          <p className="col-span-2 text-xs text-ink-3 leading-relaxed border-l-2 border-[#c3d8e0] pl-2.5">
                            <span className="text-ink-2">Why the AI gave this: </span>{evalData.ai_reasoning}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    );
  }

  // --- LIST MODE ---
  // Only finished attempts can be graded
  const submissions = (overview?.submissions || []).filter(s => s.attempt?.status !== 'in_progress');

  const needsReview = submissions.filter(s => s.draft?.status === 'drafting' || s.draft?.status === 'needs_review' || !s.draft);
  const flagged = submissions.filter(s => s.draft?.status === 'anomaly_flagged');
  const approved = submissions.filter(s => s.draft?.status === 'approved' || s.draft?.status === 'published');
  const toPublish = approved.filter(s => s.draft?.status === 'approved').length;

  const activeList = activeTab === 'needs_review' ? needsReview : activeTab === 'anomaly_flagged' ? flagged : approved;
  const tabs = [
    { k: 'needs_review' as const, label: 'To review', n: needsReview.length },
    { k: 'anomaly_flagged' as const, label: 'Flagged', n: flagged.length },
    { k: 'approved' as const, label: 'Approved', n: approved.length },
  ];
  const showRubric = (!overview?.rubric || editingRubric) && testId;

  return (
    <div className="mt-8 sm:mt-10 space-y-4 text-ink">
      {/* Toolbar: what this is, the three piles, publish */}
      <section style={rise(1)} className={`${panel} p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/courses/${courseId}/tests`} aria-label="Back to tests"
            className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-[#f1f5f7] text-accent-strong hover:bg-[#e6eef2] transition-colors">
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0">
            <h2 className="font-display text-[1.35rem] tracking-[-0.02em] text-accent-strong truncate">{testData?.title ? `Grading · ${testData.title}` : 'Grading'}</h2>
            <p className="text-xs text-ink-3 mt-0.5">The AI drafts each grade from your rubric. Students see nothing until you publish.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-full bg-[#f1f5f7]" role="tablist" aria-label="Submissions">
            {tabs.map(t => (
              <button key={t.k} type="button" role="tab" aria-selected={activeTab === t.k} onClick={() => setActiveTab(t.k)}
                className={`h-8 px-3.5 inline-flex items-center gap-1.5 rounded-full text-xs transition-colors cursor-pointer ${activeTab === t.k ? 'bg-accent-strong text-white' : 'text-ink-3 hover:text-accent-strong'}`}>
                {t.label}
                <span className="tabular" style={t.k === 'anomaly_flagged' && t.n > 0 && activeTab !== t.k ? { color: CLAY.ink } : undefined}>{t.n}</span>
              </button>
            ))}
          </div>
          {overview?.rubric && !editingRubric && (
            <button type="button" onClick={() => setEditingRubric(true)} className={pillLine}>
              <ClipboardList size={14} /> Rubric · {overview.rubric.criteria.length}
            </button>
          )}
          {toPublish > 0 && (
            <button type="button" onClick={handlePublish} disabled={publishing} className={pillDark}>
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {publishing ? 'Publishing' : confirmPublish ? 'Click again to publish' : `Publish ${toPublish}`}
            </button>
          )}
        </div>
      </section>

      {showRubric && (
        <div style={rise(2)}>
          <RubricEditor
            assignmentId={testId!}
            rubric={overview?.rubric ?? null}
            onSaved={() => { setEditingRubric(false); loadOverview(); }}
            onCancel={overview?.rubric ? () => setEditingRubric(false) : undefined}
          />
        </div>
      )}

      {/* Submissions */}
      <section style={rise(3)} className={`${panel} p-5`}>
        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_8rem_6rem_7rem_7rem] gap-4 px-4 pb-2 text-xs text-ink-3">
          <span>Student</span><span>Status</span><span>Score</span><span>Handed in</span><span />
        </div>
        <ul className="space-y-2">
          {activeList.map((sub) => {
            const st = sub.draft?.status;
            const chip = st === 'anomaly_flagged' ? { t: 'Flagged', bg: CLAY.wash, fg: CLAY.ink }
              : st === 'approved' ? { t: 'Approved', bg: '#dbe7ec', fg: '#1b566b' }
              : st === 'published' ? { t: 'Published', bg: '#0e3445', fg: '#ffffff' }
              : { t: sub.draft ? 'AI draft ready' : 'Not drafted', bg: '#ffffff', fg: '#56676b' };
            return (
              <li key={sub.attempt.id}>
                <button type="button" onClick={() => setReviewSubmissionId(sub.attempt.id)}
                  className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_8rem_6rem_7rem_7rem] items-center gap-4 rounded-2xl bg-[#f1f5f7] hover:bg-[#e6eef2] px-4 py-3 transition-colors cursor-pointer">
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-[#0e3445] text-white text-xs font-semibold" aria-hidden>{initials(sub.student.name)}</span>
                    <span className="min-w-0">
                      <span className="block text-[15px] text-accent-strong truncate">{sub.student.name}</span>
                      <span className="block text-xs text-ink-3 truncate">{sub.student.email}</span>
                    </span>
                  </span>
                  <span className="hidden md:inline-flex">
                    <span className="h-6 px-2.5 inline-flex items-center rounded-full text-[11px]" style={{ background: chip.bg, color: chip.fg }}>{chip.t}</span>
                  </span>
                  <span className="hidden md:block font-display text-lg text-accent-strong tabular">{sub.draft?.total_score ?? '–'}</span>
                  <span className="hidden md:block text-sm text-ink-3 tabular">
                    {new Date(sub.attempt.submitted_at || sub.attempt.started_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="justify-self-end inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white text-xs text-accent-strong">
                    <PenLine size={13} /> Review
                  </span>
                </button>
              </li>
            );
          })}
          {activeList.length === 0 && (
            <li className="rounded-2xl bg-[#f1f5f7] py-10 text-center text-sm text-ink-3">
              {activeTab === 'needs_review' ? 'Nothing waiting. Every submission has been reviewed.' : activeTab === 'anomaly_flagged' ? 'No flagged submissions.' : 'Nothing approved yet.'}
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

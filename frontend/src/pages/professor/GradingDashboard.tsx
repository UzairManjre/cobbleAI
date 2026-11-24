import { apiErrorDetail } from '../../utils/apiError';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { gradingApi } from '../../api/grading';
import type { GradingOverviewResponse, SubmissionReviewResponse } from '../../api/grading';
import { testsApi } from '../../api/tests';
import { Loader2, ArrowLeft, CheckCircle, AlertTriangle, Clock, Edit2 } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import RubricEditor from '../../components/grading/RubricEditor';

export default function GradingDashboard() {
  const { courseId, testId } = useParams();
  const navigate = useNavigate();
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
  const [testData, setTestData] = useState<any | null>(null); // For questions text
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
    type AnswerRow = { question_id: string; answer_text?: string; selected_options?: string[]; selected_option_id?: string };
    const text = ((reviewData.attempt.answers || []) as AnswerRow[]).map((ans, i) => {
      const question = (testData?.questions as { id: string; question_text?: string }[] | undefined)?.find(q => q.id === ans.question_id);
      const answer = ans.answer_text || (ans.selected_options?.length ? ans.selected_options.join(', ') : ans.selected_option_id) || '(no answer)';
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

  const handleLocalEdit = (criterionId: string, field: 'score' | 'feedback', value: any) => {
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

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center bg-surface">
        <Loader2 className="h-8 w-8 animate-spin text-ink-3" />
      </div>
    );
  }

  // --- REVIEW MODE ---
  if (reviewSubmissionId) {
    if (loadingReview || !reviewData) {
      return (
         <div className="flex h-[calc(100vh-80px)] items-center justify-center bg-surface">
          <Loader2 className="h-8 w-8 animate-spin text-ink-3" />
        </div>
      );
    }
    
    const draft = reviewData.draft;
    const isAnomaly = draft?.status === 'anomaly_flagged';
    
    return (
      <div className="flex flex-col h-[calc(100vh-80px)] bg-surface text-ink">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-line">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { saveLocalOverrides(); setReviewSubmissionId(null); }}
              className="p-2 hover:bg-sunken-2 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-ink-3" />
            </button>
            <div>
              <h1 className="text-xl font-medium">{reviewData.student.name}'s Submission</h1>
              <p className="text-sm text-ink-3">{reviewData.student.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right mr-4">
              <div className="text-2xl font-bold">{draft?.total_score ?? 0} <span className="text-ink-3 text-sm font-normal">pts</span></div>
              <div className="text-xs text-ink-3">Total Score</div>
            </div>
            <button 
              onClick={saveLocalOverrides}
              disabled={Object.keys(localOverrides).length === 0 || savingOverrides}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-colors border border-line ${Object.keys(localOverrides).length > 0 ? 'bg-accent text-white hover:bg-accent-strong' : 'text-ink-3 cursor-not-allowed'}`}
            >
              {savingOverrides ? 'Saving...' : 'Save Edits'}
            </button>
            <button 
              onClick={handleApprove}
              className="px-4 py-2 rounded-md font-medium text-sm transition-colors bg-accent text-white hover:bg-accent-strong"
            >
              Approve & Next
            </button>
          </div>
        </div>
        
        {isAnomaly && (
          <div className="bg-red-950/30 border-b border-red-900/50 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-600 font-medium text-sm mb-1">Anomaly Flagged: Manual Review Required</h3>
              <p className="text-red-600/80 text-sm">{draft.anomaly_reason}</p>
            </div>
          </div>
        )}

        {/* 2-Column Split */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Column: Submission */}
          <div className="w-1/2 overflow-y-auto border-r border-line p-8">
            <h2 className="text-sm font-medium text-ink-3 uppercase tracking-wider mb-6">Student Submission</h2>
            
            <div className="space-y-8">
              {reviewData.attempt.answers?.map((ans: any, idx: number) => {
                const question = testData?.questions?.find((q: any) => q.id === ans.question_id);
                return (
                  <div key={idx} className="bg-sunken border border-line p-6 rounded-lg">
                    <h3 className="text-sm text-ink-3 mb-3">Question {idx + 1}</h3>
                    <p className="text-ink mb-6 leading-relaxed">{question?.question_text || 'Question text not found'}</p>
                    
                    <div className="bg-surface p-4 border border-line rounded-md">
                      <h4 className="text-xs text-ink-3 uppercase mb-2">Answer</h4>
                      <div className="text-ink whitespace-pre-wrap font-mono text-sm">
                        {ans.answer_text || JSON.stringify(ans.selected_options) || 'No answer provided'}
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!reviewData.attempt.answers || reviewData.attempt.answers.length === 0) && (
                <div className="text-ink-3 italic">No answers found in this submission.</div>
              )}
            </div>
          </div>
          
          {/* Right Column: Rubric & Scoring */}
          <div className="w-1/2 overflow-y-auto p-8 bg-surface">
             <h2 className="text-sm font-medium text-ink-3 uppercase tracking-wider mb-6">Evaluation</h2>
             
             {!reviewData.rubric && (
               <div className="p-4 border border-line text-ink-3 rounded-md">No rubric found.</div>
             )}
             
             {!draft && reviewData.rubric && (
               <div className="p-4 border border-line text-ink-3 rounded-md flex items-center justify-between gap-4">
                 <span>No AI draft generated for this submission yet.</span>
                 <button
                   onClick={generateDraft}
                   disabled={drafting}
                   className="px-4 py-2 rounded-md font-medium text-sm bg-accent text-white hover:bg-accent-strong disabled:opacity-50 shrink-0"
                 >
                   {drafting ? 'Drafting...' : 'Generate AI draft'}
                 </button>
               </div>
             )}
             
             <div className="space-y-6">
               {reviewData.rubric?.criteria.map(crit => {
                 const evalData = draft?.criteria_evaluations.find(e => e.criterion_id === crit.id);
                 
                 // Fallbacks
                 const displayScore = localOverrides[crit.id!]?.score ?? evalData?.override_score ?? evalData?.suggested_score ?? 0;
                 const displayFeedback = localOverrides[crit.id!]?.feedback ?? evalData?.override_feedback ?? evalData?.suggested_feedback ?? '';
                 // The API sends null for "no override"
                 const hasOverride = evalData?.override_score != null || evalData?.override_feedback != null || localOverrides[crit.id!] !== undefined;
                 
                 return (
                   <div key={crit.id} className={`p-5 rounded-lg border ${hasOverride ? 'border-blue-900/50 bg-blue-950/10' : 'border-line bg-sunken'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-ink">{crit.name}</h3>
                        
                        {/* Provenance Badge */}
                        {evalData && (
                           <div className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${hasOverride ? 'bg-blue-900/30 text-accent' : 'bg-sunken-2 text-ink-3'}`}>
                             <div className={`w-1.5 h-1.5 rounded-full ${hasOverride ? 'bg-accent' : 'bg-ink-4'}`}></div>
                             {hasOverride ? 'Professor Edited' : 'AI Drafted'}
                           </div>
                        )}
                      </div>
                      <p className="text-xs text-ink-3 mb-4">{crit.description}</p>
                      
                      {evalData && (
                        <div className="space-y-4">
                          <div className="flex gap-4 items-center">
                            <div className="w-24">
                              <label className="text-xs text-ink-3 uppercase block mb-1">Score (/{crit.max_points})</label>
                              <input 
                                type="number" 
                                min="0" 
                                max={crit.max_points}
                                step="0.5"
                                value={displayScore}
                                onChange={(e) => handleLocalEdit(crit.id!, 'score', parseFloat(e.target.value) || 0)}
                                className="w-full bg-surface border border-line rounded p-2 text-ink focus:outline-none focus:border-accent transition-colors"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-xs text-ink-3 uppercase block mb-1">Feedback to Student</label>
                              <textarea 
                                value={displayFeedback}
                                onChange={(e) => handleLocalEdit(crit.id!, 'feedback', e.target.value)}
                                className="w-full bg-surface border border-line rounded p-2 text-ink focus:outline-none focus:border-accent transition-colors h-10 resize-y min-h-[40px] leading-tight"
                              />
                            </div>
                          </div>
                          
                          <div className="bg-surface border border-line p-3 rounded text-xs">
                            <div className="text-ink-3 font-medium mb-1">AI Reasoning (Professor Only):</div>
                            <div className="text-ink-3">{evalData.ai_reasoning}</div>
                          </div>
                        </div>
                      )}
                   </div>
                 );
               })}
             </div>
          </div>
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
  
  const activeList = activeTab === 'needs_review' ? needsReview : activeTab === 'anomaly_flagged' ? flagged : approved;

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-[calc(100vh-80px)] text-ink">
      <div className="flex justify-between items-center mb-8">
        <div>
          <button 
            onClick={() => navigate(`/courses/${courseId}/tests`)}
            className="flex items-center text-sm text-ink-3 hover:text-ink mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Assignments
          </button>
          <h1 className="text-2xl font-medium tracking-tight">Review Dashboard</h1>
          <p className="text-ink-3 mt-1">Review AI-drafted grades before publishing.</p>
        </div>
        
        {approved.length > 0 && approved.some(s => s.draft?.status === 'approved') && (
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="bg-accent text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-accent-strong transition-colors disabled:opacity-50"
          >
            {publishing ? 'Publishing...' : confirmPublish ? 'Click again to publish' : `Publish ${approved.filter(s => s.draft?.status === 'approved').length} Approved`}
          </button>
        )}
      </div>

      {(!overview?.rubric || editingRubric) && testId ? (
        <div className="mb-8">
          <RubricEditor
            assignmentId={testId}
            rubric={overview?.rubric ?? null}
            onSaved={() => { setEditingRubric(false); loadOverview(); }}
          />
        </div>
      ) : (
        <button onClick={() => setEditingRubric(true)} className="mb-6 flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
          <Edit2 className="w-3.5 h-3.5" /> Edit rubric ({overview?.rubric?.criteria.length} criteria)
        </button>
      )}

      {/* Tabs */}
      <div className="flex gap-6 border-b border-line mb-6">
        <button
          onClick={() => setActiveTab('needs_review')}
          className={`pb-4 text-sm font-medium transition-colors relative ${activeTab === 'needs_review' ? 'text-ink' : 'text-ink-3 hover:text-ink-3'}`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Needs Review
            <span className="bg-sunken-2 text-ink-3 px-2 py-0.5 rounded-full text-xs">{needsReview.length}</span>
          </div>
          {activeTab === 'needs_review' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"></div>}
        </button>
        
        <button
          onClick={() => setActiveTab('anomaly_flagged')}
          className={`pb-4 text-sm font-medium transition-colors relative ${activeTab === 'anomaly_flagged' ? 'text-ink' : 'text-ink-3 hover:text-ink-3'}`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${flagged.length > 0 ? 'text-red-600' : ''}`} />
            Flagged
            <span className={`${flagged.length > 0 ? 'bg-red-900/30 text-red-600' : 'bg-sunken-2 text-ink-3'} px-2 py-0.5 rounded-full text-xs`}>{flagged.length}</span>
          </div>
          {activeTab === 'anomaly_flagged' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"></div>}
        </button>

        <button
          onClick={() => setActiveTab('approved')}
          className={`pb-4 text-sm font-medium transition-colors relative ${activeTab === 'approved' ? 'text-ink' : 'text-ink-3 hover:text-ink-3'}`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Approved
            <span className="bg-sunken-2 text-ink-3 px-2 py-0.5 rounded-full text-xs">{approved.length}</span>
          </div>
          {activeTab === 'approved' && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent"></div>}
        </button>
      </div>

      {/* Submissions List */}
      <div className="bg-sunken border border-line rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className="py-4 px-6 text-xs font-medium text-ink-3 uppercase tracking-wider">Student</th>
              <th className="py-4 px-6 text-xs font-medium text-ink-3 uppercase tracking-wider">Status</th>
              <th className="py-4 px-6 text-xs font-medium text-ink-3 uppercase tracking-wider">Score</th>
              <th className="py-4 px-6 text-xs font-medium text-ink-3 uppercase tracking-wider">Submitted</th>
              <th className="py-4 px-6 text-xs font-medium text-ink-3 uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {activeList.map((sub) => (
              <tr key={sub.attempt.id} className="border-b border-line hover:bg-sunken-2/50 transition-colors">
                <td className="py-4 px-6">
                  <div className="font-medium text-sm text-ink">{sub.student.name}</div>
                  <div className="text-xs text-ink-3">{sub.student.email}</div>
                </td>
                <td className="py-4 px-6">
                  {sub.draft?.status === 'anomaly_flagged' ? (
                    <span className="text-xs font-medium text-red-600 bg-red-900/30 px-2 py-1 rounded-full border border-red-900/50">Flagged</span>
                  ) : sub.draft?.status === 'approved' ? (
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-900/30 px-2 py-1 rounded-full border border-emerald-900/50">Approved</span>
                  ) : sub.draft?.status === 'published' ? (
                    <span className="text-xs font-medium text-accent bg-blue-900/30 px-2 py-1 rounded-full border border-blue-900/50">Published</span>
                  ) : (
                    <span className="text-xs font-medium text-ink-3 bg-sunken px-2 py-1 rounded-full border border-line">Drafting</span>
                  )}
                </td>
                <td className="py-4 px-6">
                  <div className="text-sm font-medium text-ink">{sub.draft?.total_score ?? '-'} pts</div>
                </td>
                <td className="py-4 px-6 text-sm text-ink-3">
                  {new Date(sub.attempt.submitted_at || sub.attempt.started_at).toLocaleDateString()}
                </td>
                <td className="py-4 px-6 text-right">
                  <button 
                    onClick={() => setReviewSubmissionId(sub.attempt.id)}
                    className="text-sm font-medium text-ink hover:text-ink-3 flex items-center gap-2 justify-end w-full"
                  >
                    <Edit2 className="w-4 h-4" />
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {activeList.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-ink-3 text-sm">
                  No submissions found in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

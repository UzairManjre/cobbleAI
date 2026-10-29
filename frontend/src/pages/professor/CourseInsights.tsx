import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { graphsApi } from '../../api/graphs';
import { insightsApi } from '../../api/insights';
import type { ReportFile } from '../../api/insights';
import { lecturesApi } from '../../api/lectures';
import type { LectureSummary } from '../../api/lectures';
import CoverageGaps from '../../components/insights/CoverageGaps';
import FAQEditor from '../../components/insights/FAQEditor';
import FeedbackReviewList from '../../components/insights/FeedbackReviewList';
import QuestionClusters from '../../components/insights/QuestionClusters';
import SourceCounts from '../../components/insights/SourceCounts';
import EdgeAuditPanel from '../../components/graph/EdgeAuditPanel';
import ConceptFlagsPanel from '../../components/learner/ConceptFlagsPanel';
import ConfusionTimeline from '../../components/learner/ConfusionTimeline';
import { useToastStore } from '../../store/toastStore';
import { saveBlob } from '../../utils/download';

type Tab = 'questions' | 'concepts' | 'lectures' | 'faq' | 'quality';

const TABS: { id: Tab; label: string }[] = [
  { id: 'questions', label: 'Questions & gaps' },
  { id: 'concepts', label: 'Struggling concepts' },
  { id: 'lectures', label: 'Lecture confusion' },
  { id: 'faq', label: 'FAQ' },
  { id: 'quality', label: 'Answer & graph quality' },
];

const REPORTS: { file: ReportFile; label: string }[] = [
  { file: 'weekly.pdf', label: 'Weekly PDF' },
  { file: 'weekly.csv', label: 'Weekly CSV' },
  { file: 'term.pdf', label: 'Term PDF' },
  { file: 'term.csv', label: 'Term CSV' },
];

/** Professor insights for one course. Aggregates and paraphrases only: no student names or raw chats. */
export default function CourseInsights() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('questions');
  const [days, setDays] = useState(30);
  const [graphId, setGraphId] = useState<string | null>(null);
  const [lectures, setLectures] = useState<LectureSummary[]>([]);
  const [lectureId, setLectureId] = useState('');
  const [downloading, setDownloading] = useState<ReportFile | null>(null);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    let cancelled = false;
    graphsApi.getByCourse(courseId)
      .then(res => { if (!cancelled && Array.isArray(res.data) && res.data[0]) setGraphId(res.data[0].id); })
      .catch(() => undefined);
    lecturesApi.listByCourse(courseId)
      .then(res => { if (!cancelled) setLectures(res.data.filter(l => l.status === 'ready')); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId]);

  const selectedLecture = lectureId || lectures[0]?.id || '';

  const download = async (file: ReportFile) => {
    setDownloading(file);
    try {
      const res = await insightsApi.report(courseId, file);
      saveBlob(res.data, `course-report-${file.replace('.', '-')}-${new Date().toISOString().slice(0, 10)}.${file.split('.')[1]}`);
    } catch {
      addToast('Could not build the report', 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 text-white">
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => navigate(`/professor/courses/${courseId}`)} aria-label="Back to course"
          className="p-2 rounded-xl border border-[#1A1A1A] text-[#888888] hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#888888]">Course</p>
          <h1 className="text-xl font-light">Insights</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-xs text-[#888888]">Period
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="ml-2 bg-[#111111] border border-[#1A1A1A] rounded-lg px-2 py-1 text-xs text-white">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={120}>Last 120 days</option>
            </select>
          </label>
          {REPORTS.map(r => (
            <button key={r.file} onClick={() => download(r.file)} disabled={downloading !== null}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-[#333333] flex items-center gap-1.5 hover:border-[#666666] disabled:opacity-40">
              {downloading === r.file ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${tab === t.id ? 'bg-white text-black border-white' : 'border-[#1A1A1A] text-[#AAAAAA] hover:border-[#333333]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'questions' && (
        <div className="space-y-6">
          <QuestionClusters courseId={courseId} days={Math.min(days, 30)} />
          <CoverageGaps courseId={courseId} days={days} />
          <SourceCounts courseId={courseId} days={days} />
        </div>
      )}

      {tab === 'concepts' && <ConceptFlagsPanel courseId={courseId} />}

      {tab === 'lectures' && (
        <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 space-y-4">
          {lectures.length === 0 ? (
            <p className="text-xs text-[#666666]">No processed lecture recordings in this course yet.</p>
          ) : (
            <>
              <label className="text-xs text-[#888888]">Lecture
                <select value={selectedLecture} onChange={e => setLectureId(e.target.value)}
                  className="ml-2 bg-[#111111] border border-[#1A1A1A] rounded-lg px-2 py-1 text-xs text-white">
                  {lectures.map(l => <option key={l.id} value={l.id}>{l.filename}</option>)}
                </select>
              </label>
              <ConfusionTimeline key={selectedLecture} lectureId={selectedLecture}
                onSeek={t => navigate(`/professor/courses/${courseId}/lectures/${selectedLecture}?t=${Math.floor(t)}`)} />
            </>
          )}
        </section>
      )}

      {tab === 'faq' && <FAQEditor courseId={courseId} />}

      {tab === 'quality' && (
        <div className="space-y-6">
          <FeedbackReviewList courseId={courseId} />
          {graphId ? <EdgeAuditPanel graphId={graphId} courseId={courseId} /> : (
            <p className="text-xs text-[#666666]">Generate the course knowledge graph to audit its relationships.</p>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { panel, pillLine, rise } from '../../components/ui/glass';
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
  { id: 'quality', label: 'Quality checks' },
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
  const [reportsOpen, setReportsOpen] = useState(false);
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
    <div className="mt-8 sm:mt-10 space-y-4 text-ink">
      {/* Toolbar: section switcher, period and report downloads */}
      {/* z-20: the Reports menu opens over the panels below */}
      <section style={rise(1)} className={`${panel} relative z-20 p-5 space-y-4`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[1.35rem] tracking-[-0.02em] text-accent-strong">Insights</h2>
            <p className="text-xs text-ink-3 mt-0.5">Anonymous totals and paraphrases</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 rounded-full bg-[#f1f5f7]" role="radiogroup" aria-label="Period">
              {[7, 30, 120].map(d => (
                <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}
                  className={`h-8 px-3.5 rounded-full text-xs transition-colors cursor-pointer ${days === d ? 'bg-accent-strong text-white' : 'text-ink-3 hover:text-accent-strong'}`}>
                  {d} days
                </button>
              ))}
            </div>
            <div className="relative">
              <button type="button" onClick={() => setReportsOpen(o => !o)} aria-expanded={reportsOpen} className={pillLine}>
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Reports
              </button>
              {reportsOpen && (
                <div className="absolute right-0 top-full mt-2 z-20 w-44 rounded-2xl bg-white border border-[#dbe7ec] shadow-lg p-1.5">
                  {REPORTS.map(r => (
                    <button key={r.file} type="button" disabled={downloading !== null}
                      onClick={() => { setReportsOpen(false); download(r.file); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-sm text-accent-strong hover:bg-[#f1f5f7] disabled:opacity-40 cursor-pointer">{r.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist">
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`h-9 px-4 rounded-full text-sm border transition-colors cursor-pointer ${tab === t.id ? 'bg-accent-strong text-white border-accent-strong' : 'bg-[#f1f5f7] border-transparent text-ink-3 hover:text-accent-strong'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <div style={rise(2)}>
        {tab === 'questions' && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
              <div className="xl:col-span-2"><QuestionClusters courseId={courseId} days={Math.min(days, 30)} /></div>
              <CoverageGaps courseId={courseId} days={days} />
            </div>
            <SourceCounts courseId={courseId} days={days} />
          </div>
        )}

        {tab === 'concepts' && (
          <ConceptFlagsPanel courseId={courseId} />
        )}

        {tab === 'lectures' && (
          <section className={`${panel} p-5 space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] text-accent-strong">Where lectures lose students</h2>
              {lectures.length > 1 && (
                <select value={selectedLecture} onChange={e => setLectureId(e.target.value)}
                  className="h-9 rounded-full bg-[#f1f5f7] px-4 text-sm text-accent-strong border-0 cursor-pointer">
                  {lectures.map(l => <option key={l.id} value={l.id}>{l.filename}</option>)}
                </select>
              )}
            </div>
            {lectures.length === 0 ? (
              <p className="p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No processed lecture recordings in this course yet.</p>
            ) : (
              <ConfusionTimeline key={selectedLecture} lectureId={selectedLecture}
                onSeek={t => navigate(`/courses/${courseId}/lectures/${selectedLecture}?t=${Math.floor(t)}`)} />
            )}
          </section>
        )}

        {tab === 'faq' && <FAQEditor courseId={courseId} />}

        {tab === 'quality' && (
          <div className="grid gap-4 xl:grid-cols-2 items-start [&>*]:min-w-0">
            <FeedbackReviewList courseId={courseId} />
            <section className={`${panel} p-5`}>
              <h2 className="text-[15px] text-accent-strong mb-4">Map accuracy</h2>
              {graphId ? <EdgeAuditPanel graphId={graphId} courseId={courseId} /> : (
                <p className="p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">Build the concept map to audit its links.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
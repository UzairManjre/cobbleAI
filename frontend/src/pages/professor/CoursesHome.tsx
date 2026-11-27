import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, ClipboardCheck, Copy, FileText, FilePen, Flag, Map as MapIcon,
  Network, Plus, Upload, UserPlus, Users, X, Loader2,
} from 'lucide-react';
import { coursesApi, documentsApi, graphsApi, testsApi, tutorApi } from '../../api';
import CourseArt from '../../components/ui/CourseArt';
import GradientPage from '../../components/layout/GradientPage';
import { panel, pillDark, pillLine, heroGhost, heroSolid, featureBg, rise } from '../../components/ui/glass';
import { ART_PALETTES, paletteAt } from '../../components/ui/artPalettes';
import type { ArtPalette } from '../../components/ui/artPalettes';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';
import type { CourseGraphStatus } from '../../types/graph';
import type { TestSummary } from '../../types/tests';

interface Course { id: string; title: string; code: string; description?: string | null; schedule?: string | null; docs_count?: number }
interface Doc { id: string; filename: string; status: string; created_at: string }
interface CourseStats {
  graph: CourseGraphStatus | null;
  tests: TestSummary[];
  flagged: number;
  docs: Doc[];
}
interface Task {
  key: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  detail: string;
  course: Course;
  cta: string;
  urgent?: boolean;
  onClick: () => void;
}

// Teal scale: 900 #0e3445 · 700 #1b566b · 600 #2a6f87 · 200 #c3d8e0 · 100 #dbe7ec · 50 #ecf3f6

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ago = (iso: string) => {
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  const d = Math.round(mins / 60 / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** The professor's home: what needs doing today, then every course at a glance. */
export default function CoursesHome() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const addToast = useToastStore(s => s.addToast);

  const [courses, setCourses] = useState<Course[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [uniqueStudents, setUniqueStudents] = useState(0);
  const [stats, setStats] = useState<Record<string, CourseStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [invite, setInvite] = useState<{ courseId: string; code: string } | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const loadStats = useCallback(async (list: Course[]) => {
    const entries = await Promise.all(list.map(async c => {
      const [graph, tests, feedback, docs] = await Promise.allSettled([
        graphsApi.getStatus(c.id),
        testsApi.getByCourse(c.id),
        tutorApi.listFeedback(c.id, 'open'),
        documentsApi.list(c.id),
      ]);
      const value: CourseStats = {
        graph: graph.status === 'fulfilled' ? graph.value.data : null,
        tests: tests.status === 'fulfilled' ? tests.value.data || [] : [],
        flagged: feedback.status === 'fulfilled' ? feedback.value.data.items.length : 0,
        docs: docs.status === 'fulfilled' ? docs.value.data || [] : [],
      };
      return [c.id, value] as const;
    }));
    setStats(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [coursesRes, studentsRes] = await Promise.all([
        coursesApi.list(),
        coursesApi.getProfessorStudents().catch(() => ({ data: [] })),
      ]);
      const list: Course[] = coursesRes.data || [];
      const counts: Record<string, number> = {};
      const people = new Set<string>();
      // Each row is one enrolment; its id is `${student_id}_${course_id}`
      for (const s of studentsRes.data as { id: string; course_id: string }[]) {
        counts[s.course_id] = (counts[s.course_id] || 0) + 1;
        people.add(String(s.id).split('_')[0]);
      }
      setCourses(list);
      setStudentCounts(counts);
      setUniqueStudents(people.size);
      await loadStats(list);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not load your courses'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast, loadStats]);

  useEffect(() => { load(); }, [load]);

  // While a map builds or files process, keep the cards current
  const busy = Object.values(stats).some(s => s.graph?.status === 'building' || s.graph?.status === 'processing');
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => loadStats(courses), 3000);
    return () => clearTimeout(t);
  }, [busy, stats, courses, loadStats]);

  const buildMap = async (course: Course) => {
    setBuilding(course.id);
    try {
      await graphsApi.startBuild(course.id);
      addToast(`Building the concept map for ${course.code}`, 'success');
      await loadStats(courses);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not start the build'), 'error');
    } finally {
      setBuilding(null);
    }
  };

  const showInvite = async (course: Course) => {
    try {
      const res = await coursesApi.createInvite(course.id);
      setInvite({ courseId: course.id, code: res.data.code });
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not create an invite code'), 'error');
    }
  };

  const palettes = useMemo(() => Object.fromEntries(courses.map((c, i) => [c.id, paletteAt(i)])), [courses]);

  // One row per thing the professor should act on, most urgent first
  const tasks = useMemo<Task[]>(() => {
    const out: Task[] = [];
    for (const c of courses) {
      const s = stats[c.id];
      if (!s) continue;
      const toReview = s.tests.reduce((n, t) => n + (t.answers_to_review || 0), 0);
      if (toReview) out.push({ key: `review-${c.id}`, icon: <ClipboardCheck size={17} />, course: c, cta: 'Review', urgent: true, onClick: () => navigate(`/courses/${c.id}/review`),
        title: `${plural(toReview, 'AI grade')} to review`, detail: 'Students see results once you approve' });
      if (s.flagged) out.push({ key: `flag-${c.id}`, icon: <Flag size={17} />, course: c, cta: 'Open', urgent: true, onClick: () => navigate(`/courses/${c.id}/insights`),
        title: `${plural(s.flagged, 'tutor answer')} flagged`, detail: 'Students marked these as wrong or unclear' });
      const status = s.graph?.status;
      if (!s.docs.length) out.push({ key: `docs-${c.id}`, icon: <Upload size={17} />, course: c, cta: 'Add files', onClick: () => navigate(`/courses/${c.id}`),
        title: 'No materials yet', detail: `Upload slides or notes for ${c.title}` });
      else if (status === 'no_documents') out.push({ key: `map-${c.id}`, icon: <Network size={17} />, course: c, cta: building === c.id ? 'Starting…' : 'Build map', onClick: () => buildMap(c),
        title: 'No concept map', detail: `Students cannot study ${c.title} until it is built` });
      for (const t of s.tests.filter(t => t.status === 'draft')) out.push({ key: `draft-${t.id}`, icon: <FilePen size={17} />, course: c, cta: 'Edit', onClick: () => navigate(`/courses/${c.id}/tests`),
        title: `${t.title} is a draft`, detail: 'Publish it when the questions are final' });
      if (!studentCounts[c.id] && s.docs.length) out.push({ key: `invite-${c.id}`, icon: <UserPlus size={17} />, course: c, cta: 'Invite', onClick: () => showInvite(c),
        title: 'No students yet', detail: `Share an invite code for ${c.title}` });
    }
    return out;
    // buildMap and showInvite only read state that is listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, stats, studentCounts, building, navigate]);

  const recentFiles = useMemo(() => courses
    .flatMap(c => (stats[c.id]?.docs || []).map(d => ({ ...d, course: c })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5), [courses, stats]);

  // Headline figures
  const all = Object.values(stats);
  const liveTests = all.reduce((n, s) => n + s.tests.filter(t => t.status === 'published').length, 0);
  const draftTests = all.reduce((n, s) => n + s.tests.filter(t => t.status === 'draft').length, 0);
  const concepts = all.reduce((n, s) => n + (s.graph?.status === 'ready' ? s.graph.nodes_count ?? 0 : 0), 0);
  const toReview = all.reduce((n, s) => n + s.tests.reduce((m, t) => m + (t.answers_to_review || 0), 0), 0);
  const flagged = all.reduce((n, s) => n + s.flagged, 0);
  const reviewCourse = courses.find(c => stats[c.id]?.tests.some(t => t.answers_to_review));
  const enrolments = Object.values(studentCounts).reduce((a, b) => a + b, 0);
  // The day's checklist: one line per kind of job, ticked off when nothing is left
  const firstWhere = (fn: (s: CourseStats, c: Course) => boolean) => courses.find(c => stats[c.id] && fn(stats[c.id], c));
  const noMap = courses.filter(c => stats[c.id]?.docs.length && !stats[c.id]?.graph?.status?.match(/ready|building|processing/)).length;
  const noStudents = courses.filter(c => stats[c.id]?.docs.length && !studentCounts[c.id]).length;
  const checklist: { key: string; label: string; n: number; go?: () => void }[] = [
    { key: 'grades', label: 'Check AI grades', n: toReview, go: reviewCourse && (() => navigate(`/courses/${reviewCourse.id}/review`)) },
    { key: 'flags', label: 'Look at flagged tutor answers', n: flagged, go: (() => { const c = firstWhere(s => s.flagged > 0); return c && (() => navigate(`/courses/${c.id}/insights`)); })() },
    { key: 'drafts', label: 'Publish draft tests', n: draftTests, go: (() => { const c = firstWhere(s => s.tests.some(t => t.status === 'draft')); return c && (() => navigate(`/courses/${c.id}/tests`)); })() },
    { key: 'maps', label: 'Build concept maps', n: noMap, go: (() => { const c = firstWhere(s => s.docs.length > 0 && !/ready|building|processing/.test(s.graph?.status || '')); return c && (() => navigate(`/courses/${c.id}`)); })() },
    { key: 'invite', label: 'Invite students', n: noStudents, go: (() => { const c = firstWhere((s, co) => s.docs.length > 0 && !studentCounts[co.id]); return c && (() => showInvite(c)); })() },
  ];
  const done = checklist.filter(i => i.n === 0).length;

  const name = (user?.full_name || '').split(' ')[0];

  return (
    <>
      <GradientPage>
          {/* Greeting */}
          <header className="mt-6 sm:mt-10 flex flex-col md:flex-row md:items-end justify-between gap-6 text-white" style={rise(0)}>
            <div className="max-w-xl">
              <h1 className="font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">
                {greeting()}{name ? `, ${name}` : ''}.
              </h1>
              <p className="mt-3 text-white/75 text-[15px] leading-relaxed" aria-live="polite">
                {isLoading ? 'Loading your courses…'
                  : `Here is where your ${plural(courses.length, 'course')} stand today: who has joined, what is mapped, and what is waiting on you.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {reviewCourse && (
                <Link to={`/courses/${reviewCourse.id}/review`} className={heroGhost}>
                  Review grades
                </Link>
              )}
              <button type="button" onClick={() => setShowNew(true)} className={heroSolid}>
                <Plus size={16} /> New course
              </button>
            </div>
          </header>

          {/* Row 1: students, concept coverage, what is waiting */}
          <div className="mt-8 sm:mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <section style={rise(1)} className={`${panel} p-5 flex flex-col`}>
              <div className="flex items-center gap-3">
                <span className="grid place-items-center h-10 w-10 rounded-xl bg-[#ecf3f6] text-[#1b566b]"><Users size={18} /></span>
                <h2 className="text-[15px] text-[#0e3445]">Students</h2>
              </div>
              <div className="mt-5 flex items-end justify-between gap-4">
                <p className="font-display text-[2.75rem] leading-none tracking-[-0.04em] text-[#0e3445] tabular">{isLoading ? '–' : uniqueStudents}</p>
                <p className="text-xs text-ink-3 pb-1">{plural(enrolments, 'enrolment')}</p>
              </div>
              <ul className="mt-auto pt-5 space-y-3">
                {courses.map(c => <SegmentRow key={c.id} label={c.code} value={studentCounts[c.id] || 0} total={Math.max(enrolments, 1)} />)}
              </ul>
            </section>

            <section style={rise(2)} className={`${panel} p-5 flex flex-col`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xs text-ink-3">Concepts mapped</h2>
                  <p className="mt-1 font-display text-[1.75rem] leading-none tracking-[-0.03em] text-[#0e3445] tabular">{isLoading ? '–' : concepts}</p>
                </div>
                <span className="h-8 px-3 inline-flex items-center rounded-full bg-[#ecf3f6] text-xs text-[#1b566b] tabular">{plural(liveTests, 'test')} live{draftTests ? ` · ${draftTests} draft` : ''}</span>
              </div>
              <div className="mt-auto pt-5 space-y-5">
                {courses.map(c => <ConceptDots key={c.id} code={c.code} stats={stats[c.id]} />)}
              </div>
            </section>

            <section style={{ ...rise(3), background: featureBg }}
              aria-labelledby="checklist-heading"
              className="relative overflow-hidden rounded-[22px] p-5 text-white flex flex-col min-h-[230px] md:col-span-2 xl:col-span-1">
              <div className="flex items-end justify-between gap-3">
                <h2 id="checklist-heading" className="font-display font-medium text-[1.45rem] leading-none tracking-[-0.03em]">Today</h2>
                <span className="text-xs text-white/70 tabular">{isLoading ? '…' : `${done} of ${checklist.length} done`}</span>
              </div>
              {/* Progress, one segment per item */}
              <div className="mt-3 flex gap-1" aria-hidden>
                {checklist.map((item, k) => <span key={item.key} className={`h-1 flex-1 rounded-full ${!isLoading && k < done ? 'bg-white' : 'bg-white/20'}`} />)}
              </div>
              <ul className="mt-3 -mx-2 flex-1 flex flex-col justify-between">
                {[...checklist].sort((a, b) => Number(a.n === 0) - Number(b.n === 0)).map(item => {
                  const open = !isLoading && item.n > 0;
                  return (
                    <li key={item.key}>
                      <button type="button" onClick={item.go} disabled={!open || !item.go}
                        className="group w-full flex items-center gap-3 px-2 py-1.5 rounded-xl text-left enabled:hover:bg-white/10 enabled:cursor-pointer transition-colors">
                        <span className={`grid place-items-center h-5 w-5 shrink-0 rounded-full ${open ? 'border-[1.5px] border-white/60' : 'bg-white/90 text-[#0e3445]'}`} aria-hidden>
                          {!open && !isLoading && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className={`flex-1 text-sm truncate ${open ? 'text-white' : 'text-white/50 line-through decoration-white/30'}`}>{item.label}</span>
                        {open && <span className="text-xs tabular text-white/80">{item.n}</span>}
                        {open && item.go && <ArrowRight size={14} className="text-white/50 group-hover:text-white transition-colors" />}
                        <span className="sr-only">{open ? `${item.n} left` : 'done'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* Row 2: needs attention, recent files */}
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <section aria-labelledby="attention-heading" style={rise(4)} className={`${panel} p-5 xl:col-span-2`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 id="attention-heading" className="text-[15px] text-[#0e3445]">Needs your attention</h2>
                  <p className="text-xs text-ink-3 mt-0.5">Sorted by what blocks students first</p>
                </div>
                {!isLoading && <span className="h-8 px-3 inline-flex items-center rounded-full bg-[#ecf3f6] text-xs text-[#1b566b] tabular">{plural(tasks.length, 'item')}</span>}
              </div>
              {isLoading ? (
                <div className="mt-4 space-y-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-[#ecf3f6] animate-pulse" />)}</div>
              ) : tasks.length === 0 ? (
                <p className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">
                  <span className="grid place-items-center h-9 w-9 rounded-full bg-white text-[#2a6f87]"><Check size={16} /></span>
                  You are all caught up.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {tasks.map(task => (
                    <li key={task.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4 p-3 rounded-2xl bg-[#f1f5f7]">
                      <span className={`grid place-items-center h-10 w-10 rounded-full ${task.urgent ? 'bg-[#0e3445] text-white' : 'bg-white text-[#1b566b]'}`} aria-hidden>{task.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-[15px] text-[#0e3445] truncate">{task.title}</span>
                        <span className="block text-xs text-ink-3 truncate">{task.course.code} · {task.detail}</span>
                      </span>
                      <button type="button" onClick={task.onClick} className={task.urgent ? pillDark : pillLine}>{task.cta}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside aria-labelledby="recent-heading" style={rise(5)} className={`${panel} p-5`}>
              <div className="flex items-center justify-between">
                <h2 id="recent-heading" className="text-[15px] text-[#0e3445]">Recent files</h2>
                <span className="text-xs text-ink-3">Across courses</span>
              </div>
              {!isLoading && recentFiles.length === 0 ? (
                <p className="text-sm text-ink-3 mt-4 p-4 rounded-2xl bg-[#f1f5f7]">No files yet. Open a course to add slides, notes or recordings.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {recentFiles.map(doc => {
                    const p = palettes[doc.course.id];
                    return (
                      <li key={doc.id}>
                        <Link to={`/courses/${doc.course.id}`} className="group flex items-center gap-3 p-2.5 rounded-2xl bg-[#f1f5f7] hover:bg-[#e6eef2] transition-colors">
                          <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full text-white" style={{ background: `linear-gradient(135deg, ${p?.deep}, ${p?.mid})` }}>
                            <FileText size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-[#0e3445] truncate">{doc.filename}</span>
                            <span className="block text-xs text-ink-4 tabular">{doc.course.code} · {doc.status === 'ready' ? ago(doc.created_at) : 'Processing'}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          </div>

          {/* Row 3: every course */}
          <section aria-labelledby="courses-heading" className="mt-10">
            <div className="flex items-end justify-between gap-4 px-1" style={rise(6)}>
              <div>
                <h2 id="courses-heading" className="font-display font-medium text-[1.75rem] tracking-[-0.035em] leading-none text-[#0e3445]">Your courses</h2>
                <p className="mt-1.5 text-sm text-ink-3">{!isLoading && `${plural(courses.length, 'course')} · ${plural(liveTests, 'test')} live`}</p>
              </div>
              <button type="button" onClick={() => setShowNew(true)} className={pillLine}><Plus size={14} /> New course</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {isLoading
                ? [0, 1, 2].map(i => <div key={i} className={`h-[400px] ${panel} animate-pulse`} />)
                : courses.map((c, i) => (
                  <CourseCard
                    key={c.id}
                    course={c}
                    palette={palettes[c.id]}
                    stats={stats[c.id]}
                    students={studentCounts[c.id] || 0}
                    index={i}
                    invite={invite?.courseId === c.id ? invite.code : null}
                    isBuilding={building === c.id}
                    onBuild={() => buildMap(c)}
                    onInvite={() => showInvite(c)}
                    onCloseInvite={() => setInvite(null)}
                  />
                ))}
              {!isLoading && (
                <button
                  type="button"
                  onClick={() => setShowNew(true)}
                  style={rise(courses.length + 7)}
                  className="group min-h-[400px] rounded-[22px] border border-dashed border-[#a3bfcb] bg-white/40 hover:bg-white/80 transition-colors flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer"
                >
                  <span className="grid place-items-center h-12 w-12 rounded-full bg-[#0e3445] text-white group-hover:bg-[#2a6f87] transition-colors"><Plus size={20} /></span>
                  <span className="font-display font-medium text-lg tracking-[-0.02em] text-[#0e3445]">Start a new course</span>
                  <span className="text-sm text-ink-3 max-w-[16rem]">Upload materials, build the concept map, then invite students.</span>
                </button>
              )}
            </div>
          </section>
      </GradientPage>

      {showNew && <NewCourseDialog onClose={() => setShowNew(false)} onCreated={id => navigate(`/courses/${id}`)} />}
    </>
  );
}

// ---- Small data marks -------------------------------------------------------------

/** A label, a 14-segment bar and a share, like a budget row. */
function SegmentRow({ label, value, total }: { label: string; value: number; total: number }) {
  const SEG = 14;
  const filled = Math.round((value / total) * SEG);
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
      <span className="text-xs text-ink-3 tabular">{label}</span>
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: SEG }, (_, k) => <span key={k} className={`h-3.5 flex-1 rounded-[3px] ${k < filled ? 'bg-[#1b566b]' : 'bg-[#dbe7ec]'}`} />)}
      </span>
      <span className="text-xs text-[#0e3445] tabular text-right">{value}</span>
    </li>
  );
}

/** One dot per concept in a course's map; hollow dots when the map is not built. */
function ConceptDots({ code, stats }: { code: string; stats?: CourseStats }) {
  const SLOTS = 120;
  const status = stats?.graph?.status;
  const ready = status === 'ready';
  const n = ready ? Math.min(stats?.graph?.nodes_count ?? 0, SLOTS) : 0;
  const pct = status === 'building' ? stats?.graph?.build?.percent ?? 0 : null;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-3 tabular">{code}</span>
        <span className="text-[#0e3445] tabular">{ready ? plural(stats?.graph?.nodes_count ?? 0, 'concept') : pct !== null ? `Building · ${pct}%` : 'No map yet'}</span>
      </div>
      {/* Two full rows of dots, however wide the card is */}
      <div className="mt-2.5 grid gap-1 h-[18px] overflow-hidden" style={{ gridTemplateColumns: 'repeat(auto-fill, 7px)', justifyContent: 'space-between' }} aria-hidden>
        {Array.from({ length: SLOTS }, (_, k) => {
          const on = k < n || (pct !== null && k < Math.round((pct / 100) * SLOTS));
          return <span key={k} className={`h-[7px] w-[7px] rounded-full ${on ? (k % 5 === 2 ? 'bg-[#8fbccb]' : 'bg-[#1b566b]') : 'bg-[#c7d7de]'}`} />;
        })}
      </div>
    </div>
  );
}

// ---- Course card ------------------------------------------------------------------

function statusOf(s: CourseStats | undefined, docs: number) {
  const status = s?.graph?.status;
  if (status === 'ready') return { label: 'Map ready', dot: 'bg-accent-200' };
  if (status === 'building') return { label: `Building · ${s?.graph?.build?.percent ?? 0}%`, dot: 'bg-white animate-pulse' };
  if (status === 'processing') return { label: 'Processing files', dot: 'bg-white animate-pulse' };
  if (docs > 0) return { label: 'Needs a map', dot: 'bg-clay-bar' };
  return { label: 'Add materials', dot: 'bg-white/60' };
}

function CourseCard({ course, palette, stats, students, index, invite, isBuilding, onBuild, onInvite, onCloseInvite }: {
  course: Course; palette: ArtPalette; stats?: CourseStats; students: number; index: number; invite: string | null; isBuilding: boolean;
  onBuild: () => void; onInvite: () => void; onCloseInvite: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const docs = stats?.docs.length ?? course.docs_count ?? 0;
  const st = statusOf(stats, docs);
  const ready = stats?.graph?.status === 'ready';
  const building = stats?.graph?.status === 'building';
  const busy = building || stats?.graph?.status === 'processing';
  const tests = stats?.tests.length ?? 0;
  const toReview = stats?.tests.reduce((n, t) => n + (t.answers_to_review || 0), 0) ?? 0;
  const nodes = ready ? stats?.graph?.nodes_count ?? 8 : 5;
  const base = `/courses/${course.id}`;

  const copy = async () => {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the code stays visible */ }
  };

  const figures: [string, React.ReactNode][] = [
    ['Students', students],
    ['Files', docs],
    ['Concepts', ready ? stats?.graph?.nodes_count ?? 0 : '—'],
    ['Tests', tests],
  ];

  return (
    <article style={rise(index + 7)} className={`group relative flex flex-col p-2 ${panel} transition-transform duration-300 hover:-translate-y-0.5`}>
      {/* Cover: generated art, inset in the card, with the title on it */}
      <div className="relative h-44 overflow-hidden rounded-[16px] text-white">
        <CourseArt seed={course.id} palette={palette} nodes={nodes} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" aria-hidden />
        <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2">
          <span className="h-7 px-3 inline-flex items-center rounded-full bg-white/15 border border-white/25 backdrop-blur-md text-xs tabular">{course.code}</span>
          <span className="h-7 px-3 inline-flex items-center gap-2 rounded-full bg-black/20 border border-white/15 backdrop-blur-md text-xs">
            <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />{st.label}
          </span>
        </div>
        <h3 className="absolute bottom-4 inset-x-4 font-display font-medium text-[1.45rem] leading-[1.05] tracking-[-0.03em]">
          {/* The title link covers the card; the buttons below sit above it */}
          <Link to={base} className="after:absolute after:-inset-2 after:content-[''] focus:outline-none">{course.title}</Link>
        </h3>
        {building && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
            <div className="h-full bg-white transition-[width] duration-700" style={{ width: `${stats?.graph?.build?.percent ?? 0}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3 pt-4 pb-3">
        <p className="text-sm text-ink-3 line-clamp-2 min-h-[2.5rem]">{course.description || 'No description yet.'}</p>
        {course.schedule && <p className="mt-1.5 text-xs text-ink-4">{course.schedule}</p>}

        <dl className="mt-4 grid grid-cols-4 divide-x divide-[#dbe7ec] rounded-2xl bg-[#f1f5f7] py-2.5">
          {figures.map(([label, value]) => (
            <div key={label} className="px-3">
              <dd className="font-display text-lg leading-tight tracking-[-0.02em] tabular text-[#0e3445]">{value}</dd>
              <dt className="text-[11px] text-ink-4">{label}</dt>
            </div>
          ))}
        </dl>

        {toReview > 0 && (
          <Link to={`${base}/review`} className="relative z-10 mt-2 flex items-center gap-2 rounded-2xl bg-[#e2edf2] px-3 py-2 text-xs text-[#1b566b] hover:bg-[#d4e4eb] transition-colors">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2a6f87]" aria-hidden />
            {plural(toReview, 'grade')} to review
            <ArrowRight size={13} className="ml-auto" />
          </Link>
        )}

        <div className="relative z-10 mt-auto pt-4">
          {invite ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[#f1f5f7] p-1.5 pl-3">
              <span className="text-xs text-ink-3">Code</span>
              <span className="flex-1 font-display text-lg tracking-[0.12em] tabular text-[#0e3445] select-all">{invite}</span>
              <button type="button" onClick={copy} className={pillLine}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button>
              <button type="button" onClick={onCloseInvite} aria-label="Hide invite code" className="grid place-items-center h-8 w-8 rounded-full text-ink-4 hover:text-ink hover:bg-white cursor-pointer"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {ready ? (
                <Link to={`${base}/map`} className={pillDark}><MapIcon size={14} /> Open map</Link>
              ) : docs > 0 && !busy ? (
                <button type="button" onClick={onBuild} disabled={isBuilding} className={pillDark}>
                  {isBuilding ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />} Build map
                </button>
              ) : !docs ? (
                <Link to={base} className={pillDark}><Upload size={14} /> Add files</Link>
              ) : null}
              <Link to={`${base}/tests`} className={pillLine}>Tests</Link>
              <button type="button" onClick={onInvite} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] text-ink-3 hover:text-[#0e3445] hover:bg-[#f1f5f7] transition-colors cursor-pointer">
                <UserPlus size={14} /> Invite
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ---- New course dialog ------------------------------------------------------------------

function NewCourseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const addToast = useToastStore(s => s.addToast);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const field = 'w-full h-12 px-4 bg-white border border-[#c3d8e0] rounded-xl text-[15px] text-ink focus:outline-none focus:border-[#2a6f87] focus:ring-2 focus:ring-[#dbe7ec] placeholder:text-ink-4';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await coursesApi.create({ title, code, description: description || undefined });
      onCreated(res.data.id);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not create the course'), 'error');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0e3445]/40 backdrop-blur-[3px] flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="new-course-title" className="bg-white rounded-[24px] p-2 max-w-md w-full shadow-[0_24px_60px_-20px_rgba(14,52,69,0.45)]" onClick={e => e.stopPropagation()}>
        <div className="relative h-28 overflow-hidden rounded-[18px]">
          <CourseArt seed={title || 'new-course'} palette={ART_PALETTES.lagoon} nodes={6} className="absolute inset-0 h-full w-full" />
          <h2 id="new-course-title" className="absolute bottom-4 left-5 font-display font-medium text-2xl tracking-[-0.03em] text-white">New course</h2>
        </div>
        <form onSubmit={submit} className="space-y-5 px-5 pt-5 pb-4">
          <div className="space-y-1.5">
            <label htmlFor="course-title" className="block text-sm text-ink-2">Course title</label>
            <input id="course-title" autoFocus className={field} placeholder="e.g. Intro to ML" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="course-code" className="block text-sm text-ink-2">Course code</label>
            <input id="course-code" className={field} placeholder="e.g. CS-101" value={code} onChange={e => setCode(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="course-desc" className="block text-sm text-ink-2">Description <span className="text-ink-4">(optional)</span></label>
            <textarea id="course-desc" className={`${field} h-24 py-3 resize-none`} placeholder="Brief overview…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={`${pillLine} flex-1 h-11`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${pillDark} flex-1 h-11`}>{saving && <Loader2 size={14} className="animate-spin" />} Create course</button>
          </div>
        </form>
      </div>
    </div>
  );
}

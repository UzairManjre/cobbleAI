import { apiErrorDetail } from '../../utils/apiError';
import type React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  ArrowRight,
  Loader2,
  FileText
} from 'lucide-react';
import { coursesApi } from '../../api/courses';
import { documentsApi, graphsApi } from '../../api';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';

import CalibrationChart from '../../components/tests/CalibrationChart';

export default function Dashboard() {
  const { token, role } = useAuthStore();
  const addToast = useToastStore(state => state.addToast);
  const navigate = useNavigate();

  // Data State
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [courseGraphStatuses, setCourseGraphStatuses] = useState<Record<string, string>>({});
  const [recentDocuments, setRecentDocuments] = useState<any[]>([]);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [calibrationCourseId, setCalibrationCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseDesc, setCourseDesc] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, [token, role]);

  const loadDashboardData = async () => {
    if (!token) return;
    setIsLoading(true);

    let activeCourses: any[] = [];
    try {
      const coursesRes = await coursesApi.list();
      activeCourses = coursesRes.data || [];
      setCourses(activeCourses);
    } catch (err) {
      console.error('Error loading courses:', err);
      setCourses([]);
    }

    if (role === 'professor') {
      try {
        const studentsRes = await coursesApi.getProfessorStudents();
        setStudents(studentsRes.data || []);
      } catch (err) {
        console.error('Error loading students:', err);
        setStudents([]);
      }
    }

    if (activeCourses.length > 0) {
      try {
        const statusPromises = activeCourses.map(async (c: any) => {
          try {
            const statusRes = await graphsApi.getStatus(c.id);
            return { id: c.id, status: statusRes.data.status };
          } catch {
            return { id: c.id, status: 'no_documents' };
          }
        });
        const statuses = await Promise.all(statusPromises);
        const statusMap = statuses.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.status }), {});
        setCourseGraphStatuses(statusMap);
      } catch (err) {
        console.error('Error fetching graph statuses:', err);
      }

      if (role === 'professor') {
        try {
          const docPromises = activeCourses.map(async (c: any) => {
            try {
              const docsRes = await documentsApi.list(c.id);
              return (docsRes.data || []).map((d: any) => ({
                ...d,
                courseTitle: c.title,
                courseCode: c.code,
                courseId: c.id
              }));
            } catch {
              return [];
            }
          });
          const docsResults = await Promise.all(docPromises);
          const mergedDocs = docsResults.flat();
          mergedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setRecentDocuments(mergedDocs.slice(0, 5));
        } catch (err) {
          console.error('Error fetching documents:', err);
        }
      }
    } else {
      setCourseGraphStatuses({});
      setRecentDocuments([]);
    }

    setIsLoading(false);
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (role === 'student') {
        await coursesApi.join(courseCode);
      } else {
        await coursesApi.create({ title: courseTitle, code: courseCode, description: courseDesc });
      }
      setShowModal(false);
      setCourseTitle('');
      setCourseCode('');
      setCourseDesc('');
      loadDashboardData();
    } catch (err: any) {
      addToast(apiErrorDetail(err, 'Failed to create/join class'), 'error');
    }
  };

  const isProfessor = role === 'professor';

  const statusOf = (c: any) => {
    const status = courseGraphStatuses[c.id] || 'no_documents';
    if (status === 'ready') return { label: 'Ready', dot: 'bg-emerald-500' };
    if (status === 'processing') return { label: 'Building', dot: 'bg-accent animate-pulse' };
    if (c.docs_count > 0) return { label: 'Needs a map', dot: 'bg-amber-500' };
    return { label: isProfessor ? 'Add materials' : 'Being prepared', dot: 'bg-ink-4' };
  };

  const fieldClass = 'w-full h-12 px-4 bg-surface border border-line-strong rounded-xl text-[15px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-50 placeholder:text-ink-4';

  return (
    <div className="w-full px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto pt-10 md:pt-14 pb-24">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <h1 className="font-display font-medium text-[clamp(3rem,7vw,5.5rem)] leading-[0.9] tracking-[-0.04em]">
              {isProfessor ? 'your courses' : 'your classes'}
            </h1>
          </div>
          <Button variant="primary" size="lg" onClick={() => setShowModal(true)} leftIcon={<Plus size={18} />}>
            {isProfessor ? 'New course' : 'Join a class'}
          </Button>
        </header>

        <div className={`mt-12 grid gap-12 ${isProfessor ? 'lg:grid-cols-[1fr_20rem]' : ''}`}>
          {/* Course list: editorial rows */}
          <section aria-label="Courses">
            {isLoading ? (
              <div className="border-t border-line">
                {[0, 1].map(i => <div key={i} className="h-24 border-b border-line animate-pulse bg-gradient-to-r from-transparent via-sunken to-transparent" />)}
              </div>
            ) : courses.length === 0 ? (
              <div className="border-y border-line py-14 grid md:grid-cols-[1fr_auto] gap-6 items-end">
                <div>
                  <h2 className="font-display text-3xl tracking-[-0.03em]">{isProfessor ? 'Create your first course' : 'You are not in a class yet'}</h2>
                  <p className="text-ink-3 mt-3 max-w-md">
                    {isProfessor
                      ? 'Then upload your slides or lecture recordings, build the concept map, and share the invite code.'
                      : 'Ask your professor for the class invite code, then join with it.'}
                  </p>
                </div>
                <Button variant="outline" onClick={() => setShowModal(true)} leftIcon={<Plus size={16} />}>{isProfessor ? 'New course' : 'Join a class'}</Button>
              </div>
            ) : (
              <ul className="border-t border-ink">
                {courses.map(c => {
                  const st = statusOf(c);
                  const enrolled = students.filter(s => s.course_id === c.id).length;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/courses/${c.id}`)}
                        className="group w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[7rem_1fr_auto_auto] items-center gap-x-6 gap-y-2 py-6 border-b border-line hover:bg-surface transition-colors cursor-pointer px-1"
                      >
                        <span className="annot text-ink-3 tabular md:order-none order-1 col-span-2 md:col-span-1">{c.code}</span>
                        <span className="font-display text-2xl md:text-[1.75rem] tracking-[-0.03em] leading-tight group-hover:text-accent transition-colors order-2">{c.title}</span>
                        <span className="hidden md:flex items-center gap-4 text-sm text-ink-3 order-3">
                          {isProfessor && <span className="tabular">{enrolled} enrolled</span>}
                          {isProfessor && <span className="tabular">{c.docs_count || 0} files</span>}
                          <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${st.dot}`} />{st.label}</span>
                        </span>
                        <ArrowRight size={20} className="text-ink-4 group-hover:text-accent group-hover:translate-x-1 transition-all order-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Professor: latest uploads across courses */}
          {isProfessor && (
            <aside aria-label="Recent files">
              <h2 className="annot text-ink-3 pb-3 border-b border-ink">Recent files</h2>
              {recentDocuments.length === 0 ? (
                <p className="text-sm text-ink-3 py-6">No files uploaded yet. Open a course to add slides, notes or recordings.</p>
              ) : (
                <ul>
                  {recentDocuments.map((doc, index) => (
                    <li key={doc.id || doc._id || index}>
                      <button type="button" onClick={() => navigate(`/courses/${doc.courseId}`)} className="w-full text-left flex items-start gap-3 py-3.5 border-b border-line hover:text-accent cursor-pointer">
                        <FileText size={16} className="mt-0.5 shrink-0 text-ink-4" />
                        <span className="min-w-0">
                          <span className="block text-sm truncate">{doc.filename}</span>
                          <span className="annot text-ink-3">{doc.courseCode}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}
        </div>

        {/* Student: confidence check-ins over time, how sure versus how right */}
        {!isProfessor && !isLoading && courses.length > 0 && (
          <section className="mt-20 max-w-3xl">
            <div className="flex items-end justify-between gap-4 pb-3 border-b border-ink">
              <h2 className="font-display text-2xl tracking-[-0.03em]">how sure vs. how right</h2>
              {courses.length > 1 && (
                <select
                  value={calibrationCourseId ?? courses[0].id}
                  onChange={e => setCalibrationCourseId(e.target.value)}
                  className="bg-surface border border-line-strong rounded-full px-3 h-8 text-sm text-ink"
                  aria-label="Course"
                >
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              )}
            </div>
            <div className="mt-6"><CalibrationChart courseId={calibrationCourseId ?? courses[0].id} /></div>
          </section>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="course-dialog-title" className="bg-surface rounded-2xl p-8 max-w-md w-full shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]" onClick={e => e.stopPropagation()}>
            <h2 id="course-dialog-title" className="font-display text-3xl tracking-[-0.03em]">{isProfessor ? 'New course' : 'Join a class'}</h2>
            <form onSubmit={handleCreateCourse} className="space-y-5 mt-6">
              {isProfessor ? (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="course-title" className="block text-sm text-ink-2">Course title</label>
                    <input id="course-title" autoFocus className={fieldClass} placeholder="e.g. Intro to ML" value={courseTitle} onChange={e => setCourseTitle(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="course-code" className="block text-sm text-ink-2">Course code</label>
                    <input id="course-code" className={fieldClass} placeholder="e.g. CS-101" value={courseCode} onChange={e => setCourseCode(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="course-desc" className="block text-sm text-ink-2">Description <span className="text-ink-4">(optional)</span></label>
                    <textarea id="course-desc" className={`${fieldClass} h-24 py-3 resize-none`} placeholder="Brief overview..." value={courseDesc} onChange={e => setCourseDesc(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="invite-code" className="block text-sm text-ink-2">Invite code</label>
                  <input id="invite-code" autoFocus className={`${fieldClass} font-display tracking-[0.12em] uppercase`} placeholder="e.g. ABCDEF" value={courseCode} onChange={e => setCourseCode(e.target.value)} required />
                  <p className="text-xs text-ink-3">Your professor shares this code from the course page.</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" variant="primary" className="flex-1">{isProfessor ? 'Create Class' : 'Join Class'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

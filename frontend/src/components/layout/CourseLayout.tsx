import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { coursesApi } from '../../api';
import { useAuthStore } from '../../store/authStore';

interface CourseSummary { id: string; title: string; code: string }

const TABS = {
  student: [
    { to: '', label: 'Overview' },
    { to: 'learn', label: 'Learn' },
    { to: 'plan', label: 'Plan' },
    { to: 'tests', label: 'Tests' },
    { to: 'ask', label: 'Ask' },
  ],
  professor: [
    { to: '', label: 'Overview' },
    // Professors check the map rather than study it; the study view stays reachable as a preview from Overview
    { to: 'map', label: 'Map' },
    { to: 'tests', label: 'Tests' },
    { to: 'review', label: 'Review' },
    { to: 'insights', label: 'Insights' },
  ],
};

/** Shared header for every page inside a course: way back, title, and one row of tabs. */
export default function CourseLayout() {
  const { courseId } = useParams();
  const role = useAuthStore(s => s.role) ?? 'student';
  // The lookup result is tagged with the course it was for, so switching courses shows the placeholder again
  const [loaded, setLoaded] = useState<{ id?: string; course: CourseSummary | null }>({ course: null });

  useEffect(() => {
    coursesApi.list()
      .then(res => setLoaded({ id: courseId, course: (res.data || []).find((c: CourseSummary) => c.id === courseId) ?? null }))
      .catch(() => setLoaded({ id: courseId, course: null }));
  }, [courseId]);

  if (loaded.id !== courseId) {
    return (
      <div className="w-full max-w-6xl mx-auto px-5 md:px-8 pt-10" aria-busy="true">
        <div className="h-3 w-24 rounded bg-sunken-2 animate-pulse" />
        <div className="h-12 w-2/3 max-w-xl rounded-lg bg-sunken-2 animate-pulse mt-5" />
        <div className="h-px bg-line mt-10" />
      </div>
    );
  }

  const course = loaded.course;
  if (!course) {
    return (
      <div className="w-full max-w-6xl mx-auto px-5 md:px-8 py-24">
        <h1 className="font-display text-5xl font-medium tracking-[-0.035em]">Course not found</h1>
        <p className="text-ink-3 mt-4 max-w-md">It may have been removed, or you are not enrolled in it.</p>
        <Link to="/courses" className="inline-flex items-center gap-2 mt-8 font-display text-accent hover:underline">
          <ArrowLeft size={16} /> Back to courses
        </Link>
      </div>
    );
  }

  const base = `/courses/${course.id}`;

  return (
    <div className="w-full">
      <div className="px-5 md:px-8 lg:px-12"><div className="w-full max-w-6xl mx-auto pt-8 md:pt-10">
        <div className="flex items-center justify-between gap-6">
          <Link to="/courses" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors">
            <ArrowLeft size={14} /> All courses
          </Link>
          <span className="annot text-ink-3 tabular">{course.code}</span>
        </div>
        <h1 className="font-display font-medium text-ink tracking-[-0.035em] leading-[0.98] text-[clamp(2.25rem,5vw,4rem)] mt-6 max-w-4xl">
          {course.title}
        </h1>
        <nav aria-label="Course sections" className="flex gap-7 mt-8 border-b border-line overflow-x-auto">
          {TABS[role].map(t => (
            <NavLink
              key={t.label}
              to={t.to ? `${base}/${t.to}` : base}
              end={!t.to}
              className={({ isActive }) =>
                `relative pb-3.5 font-display text-[15px] tracking-[-0.01em] whitespace-nowrap transition-colors ${isActive ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}
            >
              {({ isActive }) => (
                <>
                  {t.label}
                  {isActive && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div></div>
      <Outlet />
    </div>
  );
}

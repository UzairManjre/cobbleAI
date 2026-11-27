import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { coursesApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import GradientPage from './GradientPage';
import { embedsTopbar } from './gradientPages';
import { paletteAt, type ArtPalette } from '../ui/artPalettes';
import { rise } from '../ui/glass';

interface CourseSummary { id: string; title: string; code: string; description?: string; schedule?: string }

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
  const { pathname } = useLocation();
  const [loaded, setLoaded] = useState<{ id?: string; course: CourseSummary | null; palette?: ArtPalette }>({ course: null });

  useEffect(() => {
    coursesApi.list()
      .then(res => {
        const list: CourseSummary[] = res.data || [];
        const i = list.findIndex(c => c.id === courseId);
        // Same colour as the course's card on the home page
        setLoaded({ id: courseId, course: list[i] ?? null, palette: i >= 0 ? paletteAt(i) : undefined });
      })
      .catch(() => setLoaded({ id: courseId, course: null }));
  }, [courseId]);

  const embedded = embedsTopbar(role, pathname);

  if (embedded && (loaded.id !== courseId || !loaded.course)) {
    return (
      <GradientPage height={600}>
        {loaded.id !== courseId ? (
          <div className="mt-10" aria-busy="true">
            <div className="h-3 w-24 rounded bg-white/20 animate-pulse" />
            <div className="h-12 w-2/3 max-w-xl rounded-lg bg-white/20 animate-pulse mt-6" />
          </div>
        ) : (
          <div className="mt-12 text-white">
            <h1 className="font-display text-4xl font-medium tracking-[-0.035em]">Course not found</h1>
            <p className="text-white/75 mt-3 max-w-md">It may have been removed, or you are not enrolled in it.</p>
            <Link to="/courses" className="inline-flex items-center gap-2 mt-6 text-white hover:underline"><ArrowLeft size={16} /> Back to courses</Link>
          </div>
        )}
      </GradientPage>
    );
  }

  // The other course views (Learn, the full-screen map) draw their own chrome
  if (!embedded || !loaded.course) return <Outlet />;

  const course = loaded.course;
  const base = `/courses/${course.id}`;

  return (
      <GradientPage height={600}>
        <header className="mt-6 sm:mt-8 flex flex-col lg:flex-row lg:items-end justify-between gap-5 text-white" style={rise(0)}>
          <div className="min-w-0 max-w-3xl">
            <Link to="/courses" className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors">
              <ArrowLeft size={14} /> All courses
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-white/10 border border-white/20 tabular">
                <span className="h-2 w-2 rounded-full" style={{ background: loaded.palette?.light }} aria-hidden />{course.code}
              </span>
              {course.schedule && <span className="inline-flex items-center h-7 px-3 rounded-full bg-white/[0.06] border border-white/15 text-white/80">{course.schedule}</span>}
            </div>
            <h1 className="mt-3 font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">{course.title}</h1>
            {course.description && <p className="mt-2.5 text-white/75 text-[15px] leading-relaxed">{course.description}</p>}
          </div>
          <nav aria-label="Course sections" className="flex flex-wrap gap-2">
            {TABS[role].map(t => (
              <NavLink key={t.label} to={t.to ? `${base}/${t.to}` : base} end={!t.to}
                className={({ isActive }) => `inline-flex items-center h-10 px-4 rounded-full text-sm border transition-colors ${
                  isActive ? 'bg-white text-accent-strong border-white' : 'bg-white/[0.06] border-white/20 text-white/80 hover:bg-white/10 hover:text-white'}`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <Outlet />
      </GradientPage>
  );
}

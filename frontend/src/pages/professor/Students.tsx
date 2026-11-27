import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, Copy, Download, Search, UserPlus, Users, X } from 'lucide-react';
import { coursesApi } from '../../api';
import GradientPage from '../../components/layout/GradientPage';
import { paletteAt } from '../../components/ui/artPalettes';
import type { ArtPalette } from '../../components/ui/artPalettes';
import { panel, pillLine, heroGhost, heroSolid, featureBg, rise } from '../../components/ui/glass';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';

interface StudentRow {
  id: string;           // `${student_id}_${course_id}`: one row per enrolment
  course_id: string;
  name: string;
  email: string;
  cls: string;          // course title
  progress: number;
  status: string;       // 'Learning' | 'Inactive' | 'Not Started'
  enrolled_at?: string;
  last_active_at?: string;
  tests_taken?: number;
}
interface Course { id: string; title: string; code: string }
type Filter = 'all' | 'on_track' | 'nudge' | 'not_started';
type SortKey = 'name' | 'course' | 'progress' | 'active';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const daysSince = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);
const ago = (iso?: string) => {
  if (!iso) return '—';
  const d = daysSince(iso);
  if (d < 1 / 24) return 'Just now';
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const initials = (s: string) => s.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
/** Inactive, not started, or not seen for a week. */
const needsNudge = (s: StudentRow) => s.status !== 'Learning' || daysSince(s.last_active_at) > 7;
const label = (s: StudentRow) => s.name || s.email || 'Unknown student';

/** Everyone enrolled in the professor's courses, with who needs a nudge up front. */
export default function Students() {
  const addToast = useToastStore(s => s.addToast);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'progress', dir: -1 });
  const rosterRef = useRef<HTMLElement>(null);

  useEffect(() => {
    Promise.all([
      coursesApi.getProfessorStudents().then(r => r.data || []).catch(() => []),
      coursesApi.list().then(r => r.data || []).catch(() => []),
    ]).then(([s, c]) => { setRows(s); setCourses(c); })
      .catch(err => addToast(apiErrorDetail(err, 'Could not load your students'), 'error'))
      .finally(() => setIsLoading(false));
  }, [addToast]);

  // Same colour per course as on the home page (list order)
  const palettes = useMemo(() => Object.fromEntries(courses.map((c, i) => [c.id, paletteAt(i)])), [courses]);
  const codeOf = (id: string) => courses.find(c => c.id === id)?.code ?? '';

  const unique = useMemo(() => new Set(rows.map(r => r.id.split('_')[0])).size, [rows]);
  const avg = rows.length ? Math.round(rows.reduce((n, r) => n + r.progress, 0) / rows.length) : 0;
  const nudge = useMemo(() => rows.filter(needsNudge).sort((a, b) => daysSince(b.last_active_at) - daysSince(a.last_active_at)), [rows]);
  // The feature card talks about people, not enrolments
  const nudgePeople = useMemo(() => [...new Map(nudge.map(r => [r.id.split('_')[0], r])).values()], [nudge]);
  const names = nudgePeople.slice(0, 2).map(r => label(r).split(' ')[0]);
  const counts: Record<Filter, number> = {
    all: rows.length,
    on_track: rows.filter(r => !needsNudge(r)).length,
    nudge: nudge.length,
    not_started: rows.filter(r => r.status === 'Not Started').length,
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(r =>
      (courseFilter === 'all' || r.course_id === courseFilter) &&
      (filter === 'all' || (filter === 'on_track' ? !needsNudge(r) : filter === 'nudge' ? needsNudge(r) : r.status === 'Not Started')) &&
      (!q || [r.name, r.email, r.cls].some(v => (v || '').toLowerCase().includes(q))));
    const val = (r: StudentRow): string | number =>
      sort.key === 'name' ? label(r).toLowerCase() : sort.key === 'course' ? r.cls : sort.key === 'progress' ? r.progress : -daysSince(r.last_active_at);
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [rows, query, filter, courseFilter, sort]);

  const showNudge = () => {
    setFilter('nudge');
    setCourseFilter('all');
    rosterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Name', 'Email', 'Course', 'Progress %', 'Status', 'Last active', 'Tests taken'].map(esc).join(',')]
      .concat(shown.map(r => [label(r), r.email, r.cls, r.progress, r.status, r.last_active_at ?? '', r.tests_taken ?? ''].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'students.csv' });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <GradientPage>
      {/* Header */}
      {/* z-20: the invite menu opens over the cards below (each rise() card is its own layer) */}
      <header className="relative z-20 mt-6 sm:mt-10 flex flex-col md:flex-row md:items-end justify-between gap-6 text-white" style={rise(0)}>
        <div className="max-w-xl">
          <h1 className="font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">Students</h1>
          <p className="mt-3 text-white/75 text-[15px] leading-relaxed">
            {isLoading ? 'Loading your students…' : `${plural(unique, 'student')} across ${plural(courses.length, 'course')}. See who is moving, who has stalled, and who has not started.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={exportCsv} disabled={!shown.length} className={`${heroGhost} disabled:opacity-50`}><Download size={16} /> Export CSV</button>
          <InviteMenu courses={courses} />
        </div>
      </header>

      {/* Row 1: who is enrolled, how far along, who needs a nudge */}
      <div className="mt-8 sm:mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section style={rise(1)} className={`${panel} p-5 flex flex-col`}>
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-accent-wash text-accent"><Users size={18} /></span>
            <h2 className="text-[15px] text-accent-strong">Enrolled</h2>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <p className="font-display text-[2.75rem] leading-none tracking-[-0.04em] text-accent-strong tabular">{isLoading ? '–' : unique}</p>
            <p className="text-xs text-ink-3 pb-1">{plural(rows.length, 'enrolment')}</p>
          </div>
          <ul className="mt-auto pt-5 space-y-3">
            {courses.map(c => {
              const n = rows.filter(r => r.course_id === c.id).length;
              return <SegmentRow key={c.id} label={c.code} value={n} total={Math.max(rows.length, 1)} />;
            })}
          </ul>
        </section>

        <section style={rise(2)} className={`${panel} p-5 flex flex-col`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xs text-ink-3">Average progress</h2>
              <p className="mt-1 font-display text-[1.75rem] leading-none tracking-[-0.03em] text-accent-strong tabular">{isLoading ? '–' : `${avg}%`}</p>
            </div>
            <span className="h-8 px-3 inline-flex items-center rounded-full bg-accent-wash text-xs text-accent tabular">{plural(counts.on_track, 'on track', 'on track')}</span>
          </div>
          <ProgressSpread values={rows.map(r => r.progress)} />
        </section>

        <section style={{ ...rise(3), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[230px] md:col-span-2 xl:col-span-1">
          <h2 className="font-display font-medium text-[1.6rem] leading-[1.1] tracking-[-0.03em] max-w-xs">
            {isLoading ? 'Checking in on everyone…' : nudgePeople.length ? `${plural(nudgePeople.length, 'student needs', 'students need')} a nudge.` : 'Everyone is moving.'}
          </h2>
          <p className="mt-3 text-sm text-white/75 max-w-sm leading-relaxed">
            {nudgePeople.length === 0 ? 'Every student has been active in the last week.'
              : `${nudgePeople.length > 2 ? `${names.join(', ')} and ${plural(nudgePeople.length - 2, 'other')}` : names.join(' and ')} ${nudgePeople.length === 1 ? 'has' : 'have'} not started or not been active for over a week.`}
          </p>
          {nudgePeople.length > 0 && (
            <>
              <div className="mt-5 flex -space-x-2">
                {nudgePeople.slice(0, 5).map(r => (
                  <span key={r.id} title={label(r)} className="grid place-items-center h-9 w-9 rounded-full ring-2 ring-[#114257] bg-white/90 text-[11px] font-semibold text-accent-strong">{initials(label(r))}</span>
                ))}
                {nudgePeople.length > 5 && <span className="grid place-items-center h-9 w-9 rounded-full ring-2 ring-[#114257] bg-white/20 text-[11px] font-semibold">+{nudgePeople.length - 5}</span>}
              </div>
              <button type="button" onClick={showNudge} className="mt-auto pt-6 self-start cursor-pointer">
                <span className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-accent-strong text-sm font-medium hover:bg-accent-wash transition-colors">Show them</span>
              </button>
            </>
          )}
        </section>
      </div>

      {/* Roster */}
      <section ref={rosterRef} aria-labelledby="roster-heading" style={rise(4)} className={`${panel} mt-4 p-5 scroll-mt-4`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 id="roster-heading" className="text-[15px] text-accent-strong">Roster</h2>
            <p className="text-xs text-ink-3 mt-0.5">One row per student per course</p>
          </div>
          <label className="relative w-full lg:w-80">
            <span className="sr-only">Search students</span>
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="search"
              placeholder="Search by name, email or course"
              className="w-full h-10 pl-10 pr-4 rounded-full bg-[#f1f5f7] border border-transparent text-sm text-ink focus:outline-none focus:border-accent-100 focus:bg-white placeholder:text-ink-4"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {([['all', 'All'], ['on_track', 'On track'], ['nudge', 'Needs a nudge'], ['not_started', 'Not started']] as [Filter, string][]).map(([key, text]) => (
            <Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
              {text} <span className={`tabular ${filter === key ? 'text-white/70' : 'text-ink-4'}`}>{counts[key]}</span>
            </Chip>
          ))}
          <span className="hidden sm:block w-px h-6 bg-line mx-1" aria-hidden />
          <Chip active={courseFilter === 'all'} onClick={() => setCourseFilter('all')}>All courses</Chip>
          {courses.map(c => (
            <Chip key={c.id} active={courseFilter === c.id} onClick={() => setCourseFilter(c.id)}>
              <span className="h-2 w-2 rounded-full" style={{ background: palettes[c.id]?.mid }} aria-hidden />{c.code}
            </Chip>
          ))}
        </div>

        {/* Column heads (sortable) */}
        <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] gap-4 px-3 mt-5 pb-2 text-xs text-ink-3">
          <SortHead k="name" sort={sort} setSort={setSort}>Student</SortHead>
          <SortHead k="course" sort={sort} setSort={setSort}>Course</SortHead>
          <SortHead k="progress" sort={sort} setSort={setSort}>Progress</SortHead>
          <SortHead k="active" sort={sort} setSort={setSort}>Last active</SortHead>
          <span>Tests</span>
          <span>Status</span>
        </div>

        {isLoading ? (
          <div className="mt-3 space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-2xl bg-[#f1f5f7] animate-pulse" />)}</div>
        ) : shown.length === 0 ? (
          <div className="mt-4 py-16 rounded-2xl bg-[#f1f5f7] flex flex-col items-center justify-center text-center">
            <span className="grid place-items-center h-12 w-12 rounded-full bg-white text-accent mb-3"><Users size={20} /></span>
            <p className="text-sm text-accent-strong">{rows.length ? 'No students match' : 'No students yet'}</p>
            <p className="text-xs text-ink-3 mt-1">{rows.length ? 'Try another search or filter.' : 'Share a course invite code to get students in.'}</p>
          </div>
        ) : (
          <ul className="mt-2 md:mt-0 space-y-2">
            {shown.map(r => <Row key={r.id} r={r} code={codeOf(r.course_id)} palette={palettes[r.course_id]} />)}
          </ul>
        )}
        {!isLoading && shown.length > 0 && (
          <p className="mt-4 px-1 text-xs text-ink-4 tabular">Showing {shown.length} of {rows.length}</p>
        )}
      </section>
    </GradientPage>
  );
}

// ---- Rows & small parts -------------------------------------------------------------

function Row({ r, code, palette }: { r: StudentRow; code: string; palette?: ArtPalette }) {
  const name = label(r);
  const stale = daysSince(r.last_active_at) > 7;
  const status = r.status === 'Learning' ? { text: 'Learning', cls: 'bg-[#e2edf2] text-accent' }
    : r.status === 'Inactive' ? { text: 'Inactive', cls: 'bg-clay-wash text-clay' }
    : { text: 'Not started', cls: 'bg-sunken-2 text-ink-3' };
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] items-center gap-x-4 gap-y-2 p-3 rounded-2xl bg-[#f1f5f7] hover:bg-[#e6eef2] transition-colors">
      <span className="flex items-center gap-3 min-w-0">
        <span className="grid place-items-center h-10 w-10 shrink-0 rounded-full text-white text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${palette?.deep ?? '#0e3445'}, ${palette?.mid ?? '#1b566b'})` }} aria-hidden>
          {initials(name)}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] text-accent-strong truncate">{name}</span>
          <span className="block text-xs text-ink-3 truncate">{r.email}</span>
        </span>
      </span>
      <span className="md:hidden justify-self-end"><StatusPill {...status} /></span>

      <Link to={`/courses/${r.course_id}`} className="hidden md:flex items-center gap-2 min-w-0 text-sm text-ink-2 hover:text-accent transition-colors">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: palette?.mid }} aria-hidden />
        <span className="truncate"><span className="tabular text-ink-3">{code}</span> {r.cls}</span>
      </Link>

      <span className="col-span-2 md:col-span-1 flex items-center gap-3">
        <span className="flex flex-1 gap-[3px] max-w-[11rem]" aria-hidden>
          {Array.from({ length: 12 }, (_, k) => <span key={k} className={`h-3 flex-1 rounded-[3px] ${k < Math.round(r.progress / (100 / 12)) ? 'bg-accent' : 'bg-[#d4e1e7]'}`} />)}
        </span>
        <span className="text-xs text-accent-strong tabular w-9 text-right">{r.progress}%</span>
      </span>

      <span className={`hidden md:block text-sm tabular ${stale ? 'text-clay' : 'text-ink-2'}`}>{ago(r.last_active_at)}</span>
      <span className="hidden md:block text-sm text-ink-2 tabular">{r.tests_taken ?? '—'}</span>
      <span className="hidden md:block"><StatusPill {...status} /></span>
    </li>
  );
}

const StatusPill = ({ text, cls }: { text: string; cls: string }) => (
  <span className={`inline-flex items-center h-7 px-3 rounded-full text-xs whitespace-nowrap ${cls}`}>{text}</span>
);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] border transition-colors cursor-pointer ${
        active ? 'bg-accent-strong border-accent-strong text-white' : 'bg-white border-accent-100 text-accent-strong hover:border-accent-400'}`}>
      {children}
    </button>
  );
}

function SortHead({ k, sort, setSort, children }: {
  k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; setSort: (s: { key: SortKey; dir: 1 | -1 }) => void; children: React.ReactNode;
}) {
  const on = sort.key === k;
  return (
    <button type="button" onClick={() => setSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : k === 'name' || k === 'course' ? 1 : -1 })}
      className={`inline-flex items-center gap-1 text-left cursor-pointer hover:text-accent-strong ${on ? 'text-accent-strong' : ''}`}>
      {children}
      {on && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );
}

/** A label, a 14-segment bar and a count, like a budget row. */
function SegmentRow({ label: text, value, total }: { label: string; value: number; total: number }) {
  const SEG = 14;
  const filled = Math.round((value / total) * SEG);
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
      <span className="text-xs text-ink-3 tabular">{text}</span>
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: SEG }, (_, k) => <span key={k} className={`h-3.5 flex-1 rounded-[3px] ${k < filled ? 'bg-accent' : 'bg-accent-50'}`} />)}
      </span>
      <span className="text-xs text-accent-strong tabular text-right">{value}</span>
    </li>
  );
}

/** Dot-column histogram of progress in 10% buckets, like Lumio's forecast chart. */
function ProgressSpread({ values }: { values: number[] }) {
  const buckets = Array.from({ length: 10 }, (_, i) => values.filter(v => Math.min(9, Math.floor(v / 10)) === i).length);
  const rows = Math.max(9, ...buckets);
  return (
    <div className="mt-auto pt-5">
      <div className="grid grid-cols-10 gap-1" role="img" aria-label={`Progress spread: ${buckets.map((n, i) => `${i * 10}–${i * 10 + 9}%: ${n}`).join(', ')}`}>
        {buckets.map((n, i) => (
          <div key={i} className="flex flex-col-reverse items-center gap-[4px]">
            {Array.from({ length: rows }, (_, k) => (
              <span key={k} className={`h-2 w-2 rounded-full ${k < n ? (k === n - 1 ? 'bg-accent-strong' : 'bg-accent-300') : 'bg-accent-50'}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-10 text-[10px] text-ink-4 tabular">
        {['0%', '', '', '', '50%', '', '', '', '', '100%'].map((t, i) => <span key={i} className={i === 9 ? 'text-right' : i === 0 ? '' : 'text-center'}>{t}</span>)}
      </div>
    </div>
  );
}

/** Pick a course, get its invite code to share. */
function InviteMenu({ courses }: { courses: Course[] }) {
  const addToast = useToastStore(s => s.addToast);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<{ course: Course; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = async (course: Course) => {
    try {
      const res = await coursesApi.createInvite(course.id);
      setCode({ course, code: res.data.code });
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not create an invite code'), 'error');
    }
  };
  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the code stays visible */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen(o => !o); setCode(null); }} aria-expanded={open} className={heroSolid}>
        <UserPlus size={16} /> Invite students
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white p-2 shadow-[0_18px_48px_-16px_rgba(14,52,69,0.45)] z-50 text-ink">
          {code ? (
            <div className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-3">Invite code for {code.course.code}</span>
                <button type="button" onClick={() => setCode(null)} aria-label="Back to courses" className="grid place-items-center h-7 w-7 rounded-full text-ink-4 hover:bg-sunken cursor-pointer"><X size={14} /></button>
              </div>
              <p className="mt-2 font-display text-2xl tracking-[0.14em] tabular text-accent-strong select-all">{code.code}</p>
              <p className="mt-1 text-xs text-ink-3">Students enter this after signing in.</p>
              <button type="button" onClick={copy} className={`${pillLine} mt-3 w-full`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy code'}</button>
            </div>
          ) : (
            <>
              <p className="px-3 pt-2 pb-1 text-xs text-ink-3">Which course?</p>
              {courses.map(c => (
                <button key={c.id} type="button" onClick={() => pick(c)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-[#f1f5f7] cursor-pointer">
                  <span className="text-xs text-ink-3 tabular w-14 shrink-0">{c.code}</span>
                  <span className="text-sm text-accent-strong truncate">{c.title}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

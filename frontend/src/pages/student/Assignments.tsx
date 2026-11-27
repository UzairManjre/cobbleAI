import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Clock, FileText, ListChecks, PenLine } from 'lucide-react';
import { coursesApi, testsApi } from '../../api';
import GradientPage from '../../components/layout/GradientPage';
import ScoreRing from '../../components/student/ScoreRing';
import { panel, pillDark, pillLine, featureBg, rise, CLAY } from '../../components/ui/glass';
import { paletteAt } from '../../components/ui/artPalettes';
import { plural } from '../../utils/mastery';

interface Course { id: string; title: string; code: string }
interface Test {
  id: string; title: string; description?: string; test_type: string; status: string;
  duration_minutes: number; passing_percentage: number; question_count?: number; available_until?: string | null;
}
interface Attempt { id: string; test_id: string; status: string; percentage: number | null; submitted_at?: string }

type State = 'todo' | 'in_progress' | 'missed' | 'waiting' | 'passed' | 'below';
interface Row { t: Test; course: Course; color: string; a?: Attempt; state: State; due: Date | null }

const DAY = 864e5;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const kind = (t: Test) => (t.test_type === 'assignment' ? 'Assignment' : t.test_type === 'exam' ? 'Exam' : 'Quiz');
const shortDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const daysUntil = (d: Date) => Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / DAY);
const dueText = (d: Date | null) => {
  if (!d) return 'No due date';
  const n = daysUntil(d);
  return n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due in ${n} days`;
};
const isOpen = (s: State) => s === 'todo' || s === 'in_progress';

/** Every test and assignment across the student's classes, by deadline. */
export default function Assignments() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [tests, setTests] = useState<(Test & { course_id: string })[] | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [filter, setFilter] = useState<string>('all');
  // Fixed when the page opens, so deadlines don't shift between renders
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, a] = await Promise.allSettled([coursesApi.list(), testsApi.getMyAttempts()]);
      const list: Course[] = c.status === 'fulfilled' ? c.value.data || [] : [];
      const per = await Promise.allSettled(list.map(x => testsApi.getByCourse(x.id)));
      if (cancelled) return;
      setCourses(list);
      setAttempts(a.status === 'fulfilled' ? a.value.data?.attempts || [] : []);
      setTests(per.flatMap((r, i) => r.status === 'fulfilled'
        ? (r.value.data || []).filter((t: Test) => t.status === 'published').map((t: Test) => ({ ...t, course_id: list[i].id }))
        : []));
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo<Row[]>(() => {
    const latest = new Map<string, Attempt>();
    for (const a of attempts) latest.set(a.test_id, a);
    return (tests || []).flatMap(t => {
      const i = courses.findIndex(c => c.id === t.course_id);
      if (i < 0) return [];
      const a = latest.get(t.id);
      const due = t.available_until ? new Date(t.available_until) : null;
      const state: State = !a ? (due && due.getTime() < now ? 'missed' : 'todo')
        : a.status === 'in_progress' ? (due && due.getTime() < now ? 'missed' : 'in_progress')
          : a.status !== 'graded' || a.percentage == null ? 'waiting'
            : a.percentage >= t.passing_percentage ? 'passed' : 'below';
      return [{ t, course: courses[i], color: paletteAt(i).mid, a, state, due }];
    });
  }, [tests, attempts, courses, now]);

  const shown = filter === 'all' ? rows : rows.filter(r => r.course.id === filter);
  const byDue = (x: Row, y: Row) => (x.due?.getTime() ?? Infinity) - (y.due?.getTime() ?? Infinity);
  const todo = shown.filter(r => isOpen(r.state) || r.state === 'missed')
    .sort((x, y) => Number(x.state === 'missed') - Number(y.state === 'missed') || byDue(x, y));
  const done = shown.filter(r => !isOpen(r.state) && r.state !== 'missed')
    .sort((x, y) => (y.a?.submitted_at ?? '').localeCompare(x.a?.submitted_at ?? ''));
  const next = todo.find(r => isOpen(r.state)) ?? null;
  const graded = done.filter(r => r.state === 'passed' || r.state === 'below');
  const avg = graded.length ? Math.round(graded.reduce((n, r) => n + (r.a!.percentage ?? 0), 0) / graded.length) : null;
  const thisWeek = todo.filter(r => isOpen(r.state) && r.due && daysUntil(r.due) <= 6).length;
  const loading = tests === null;

  const filterPill = (active: boolean) => `inline-flex items-center h-9 px-4 rounded-full text-sm transition-colors cursor-pointer ${active ? 'bg-white text-[#0e3445]' : 'border border-white/30 text-white/85 hover:bg-white/10'}`;

  return (
    <GradientPage>
      <header className="mt-6 sm:mt-10 flex flex-col md:flex-row md:items-end justify-between gap-6 text-white" style={rise(0)}>
        <div>
          <h1 className="font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">Assignments</h1>
          <p className="mt-3 text-white/75 text-[15px] tabular" aria-live="polite">
            {loading ? 'Loading your work…' : `${plural(todo.filter(r => isOpen(r.state)).length, 'thing')} to do · ${thisWeek} due this week · ${plural(graded.length, 'graded result')}`}
          </p>
        </div>
        {courses.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by class">
            <button type="button" onClick={() => setFilter('all')} className={filterPill(filter === 'all')} aria-pressed={filter === 'all'}>All classes</button>
            {courses.map((c, i) => (
              <button key={c.id} type="button" onClick={() => setFilter(c.id)} className={`${filterPill(filter === c.id)} gap-2`} aria-pressed={filter === c.id}>
                <span className="h-2 w-2 rounded-full" style={{ background: paletteAt(i).light }} />{c.code}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Row 1: the next deadline, and the next two weeks at a glance */}
      <div className="mt-8 sm:mt-10 grid gap-4 xl:grid-cols-3">
        <section style={{ ...rise(1), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[250px]">
          <p className="text-xs text-white/70">{next ? `Due next · ${next.course.code} · ${kind(next.t)}` : 'Due next'}</p>
          <h2 className="mt-2 font-display font-medium text-[1.9rem] leading-[1.05] tracking-[-0.03em]">
            {loading ? 'Loading…' : next ? next.t.title : 'All caught up.'}
          </h2>
          <p className="mt-2 text-sm text-white/75 line-clamp-2">{next ? next.t.description : 'New work from your professors shows up here.'}</p>
          {next && (
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80 tabular">
              <span className="inline-flex items-center gap-1.5"><CalendarClock size={12} />{dueText(next.due)}</span>
              <span className="inline-flex items-center gap-1.5"><Clock size={12} />{next.t.duration_minutes} min</span>
              {next.t.question_count != null && <span className="inline-flex items-center gap-1.5"><ListChecks size={12} />{plural(next.t.question_count, 'question')}</span>}
            </p>
          )}
          {next && (
            <div className="mt-auto pt-5">
              <Link to={`/tests/${next.t.id}`} className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors">
                {next.state === 'in_progress' ? 'Continue' : 'Start'} <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </section>

        <TwoWeeks style={rise(2)} rows={todo.filter(r => isOpen(r.state))} />
      </div>

      {/* Row 2: what is left, and what is handed in */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="todo-heading" style={rise(3)} className={`${panel} p-5 xl:col-span-2`}>
          <div className="flex items-center justify-between">
            <h2 id="todo-heading" className="text-[15px] text-[#0e3445]">To do</h2>
            <span className="text-xs text-ink-3">Soonest first</span>
          </div>
          {loading ? (
            <div className="mt-4 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-[#ecf3f6] animate-pulse" />)}</div>
          ) : todo.length === 0 ? (
            <p className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3"><FileText size={16} /> Nothing to do right now.</p>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {todo.map(r => <TodoRow key={r.t.id} r={r} />)}
            </ul>
          )}
        </section>

        <section aria-labelledby="done-heading" style={rise(4)} className={`${panel} p-5 flex flex-col`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="done-heading" className="text-[15px] text-[#0e3445]">Handed in</h2>
            {avg !== null && <span className="text-xs text-ink-3 tabular">Average <span className="text-[#0e3445]">{avg}%</span></span>}
          </div>
          {loading ? (
            <div className="mt-4 space-y-2">{[0, 1].map(i => <div key={i} className="h-14 rounded-2xl bg-[#ecf3f6] animate-pulse" />)}</div>
          ) : done.length === 0 ? (
            <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">Finished work and scores land here.</p>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {done.map(({ t, a, state, course }) => (
                <li key={t.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#f1f5f7]">
                  <ScoreRing value={a?.percentage != null && state !== 'waiting' ? a.percentage / 100 : null} color={state === 'below' ? CLAY.bar : '#1b566b'} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[#0e3445] truncate">{t.title}</span>
                    <span className="block text-xs truncate" style={{ color: state === 'below' ? CLAY.ink : undefined }}>
                      <span className={state === 'below' ? '' : 'text-ink-3'}>{course.code} · {state === 'waiting' ? 'waiting for a grade' : state === 'passed' ? 'passed' : 'below the pass mark'}</span>
                    </span>
                  </span>
                  {state !== 'waiting' && a && <Link to={`/tests/${t.id}/result/${a.id}`} className={`${pillLine} h-8 px-3`}>Result</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </GradientPage>
  );
}

function TodoRow({ r }: { r: Row }) {
  const { t, course, color, state, due } = r;
  const missed = state === 'missed';
  const soon = !missed && due && daysUntil(due) <= 2;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-4 px-2.5 py-2 rounded-2xl bg-[#f1f5f7]">
      <span className="grid place-items-center h-10 w-10 rounded-full text-white" style={{ background: missed ? CLAY.bar : color }}>
        {t.test_type === 'assignment' ? <PenLine size={15} /> : <ListChecks size={15} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] text-[#0e3445] truncate">{t.title}</span>
        <span className="block text-xs text-ink-3 truncate tabular">
          {course.code} · {kind(t)} · {t.duration_minutes} min · pass at {t.passing_percentage}%{state === 'in_progress' ? ' · started' : ''}
        </span>
      </span>
      <span className="text-right text-xs tabular whitespace-nowrap">
        <span className="block" style={{ color: missed ? CLAY.ink : soon ? '#0e3445' : undefined }}>
          {missed ? 'Closed' : dueText(due)}
        </span>
        {due && <span className="block text-ink-4">{shortDate(due)}</span>}
      </span>
      <span className="w-[6.5rem] flex justify-end">
        {missed
          ? <span className="text-xs text-ink-4">Missed</span>
          : <Link to={`/tests/${t.id}`} className={pillDark}>{state === 'in_progress' ? 'Continue' : 'Start'} <ArrowRight size={13} /></Link>}
      </span>
    </li>
  );
}

const SPAN = 21;

/** A soft vertical fill for a due day: one class fades from its colour, several blend into each other. */
function dayFill(colors: string[]) {
  const unique = [...new Set(colors)];
  if (unique.length === 1) return `linear-gradient(180deg, ${unique[0]} 0%, ${unique[0]}d9 55%, ${unique[0]}80 100%)`;
  const stops = unique.map((c, i) => `${c} ${Math.round((i / (unique.length - 1)) * 100)}%`).join(', ');
  return `linear-gradient(180deg, ${stops})`;
}

/** Three weeks from today, with each open item placed on its due day. */
function TwoWeeks({ rows, style }: { rows: Row[]; style?: CSSProperties }) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: SPAN }, (_, i) => new Date(today.getTime() + i * DAY));
  const inRange = rows.filter(r => r.due && daysUntil(r.due) < SPAN).sort((x, y) => x.due!.getTime() - y.due!.getTime());
  const later = rows.length - inRange.length;

  return (
    <section aria-labelledby="weeks-heading" style={style} className={`${panel} p-5 xl:col-span-2 flex flex-col`}>
      <div className="flex items-center justify-between">
        <h2 id="weeks-heading" className="text-[15px] text-[#0e3445]">Next three weeks</h2>
        <span className="text-xs text-ink-3 tabular">{later > 0 ? `${later} later` : ''}</span>
      </div>
      {/* One column per day; a due day fills with its class colour (several classes blend top to bottom) */}
      <ol className="mt-4 flex-1 grid gap-1.5 min-h-[140px]" style={{ gridTemplateColumns: `repeat(${SPAN}, minmax(0, 1fr))` }}>
        {days.map((d, i) => {
          const items = inRange.filter(r => Math.max(0, daysUntil(r.due!)) === i);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const label = items.map(r => `${r.t.title} · ${r.course.code}`).join('\n');
          const head = (
            <>
              <span className={`block text-[11px] ${items.length ? 'text-white/80' : i === 0 ? 'text-[#1b566b]' : 'text-ink-4'}`}>{i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className={`mx-auto mt-0.5 grid place-items-center h-7 w-7 rounded-full text-[14px] tabular ${i === 0 && !items.length ? 'bg-[#0e3445] text-white' : items.length ? 'text-white' : 'text-[#0e3445]'}`}>{d.getDate()}</span>
              {items.length > 1 && <span className="mx-auto mt-auto mb-1 grid place-items-center h-5 min-w-5 px-1 rounded-full bg-white/25 text-[10px] text-white tabular">{items.length}</span>}
            </>
          );
          const cls = 'flex flex-col pt-1.5 text-center rounded-2xl transition';
          if (!items.length) {
            return <li key={i} className={`${cls} ${i === 0 ? 'bg-[#dbe7ec]' : weekend ? 'bg-[#f1f5f7]/55' : 'bg-[#f1f5f7]'}`}>{head}</li>;
          }
          return (
            <li key={i} className="flex">
              <Link to={items.length === 1 ? `/tests/${items[0].t.id}` : '#due-list'} title={label} aria-label={`Due ${shortDate(d)}: ${label}`}
                className={`${cls} flex-1 hover:brightness-110 shadow-[0_10px_24px_-14px_rgba(14,52,69,0.6)]`} style={{ background: dayFill(items.map(r => r.color)) }}>
                {head}
              </Link>
            </li>
          );
        })}
      </ol>

      {/* What the coloured days are */}
      <ul id="due-list" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {inRange.length === 0
          ? <li className="text-ink-3">Nothing due in the next three weeks.</li>
          : inRange.map(r => (
            <li key={r.t.id}>
              <Link to={`/tests/${r.t.id}`} className="inline-flex items-center gap-2 text-[#0e3445] hover:underline underline-offset-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                {r.t.title}<span className="text-ink-4 tabular">{r.course.code} · {shortDate(r.due!)}</span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}

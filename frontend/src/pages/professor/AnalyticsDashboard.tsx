import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MessageCircle, Clock, Gauge } from 'lucide-react';
import { analyticsApi, coursesApi } from '../../api';
import GradientPage from '../../components/layout/GradientPage';
import ConceptConstellation, { type KGraph } from '../../components/analytics/ConceptConstellation';
import MeaningMap, { type MeaningPoint } from '../../components/analytics/MeaningMap';
import type { ConfusionFlag } from '../../components/analytics/ConfusionFlagsList';
import { paletteAt } from '../../components/ui/artPalettes';
import { panel, heroGhost, featureBg, rise } from '../../components/ui/glass';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';

// Shape of /api/analytics/dashboard (only the parts this page reads)
interface Dashboard {
  telemetry?: {
    llm_streaming?: { time: string; tokens_sec: number }[];
    retrieval_latency?: { time: string; latency_ms: number; confidence: number }[];
  };
  engagement?: {
    intent_radar?: { intent: string; count: number }[];
    study_heatmap?: { id: string; data: { x: string; y: number }[] }[];
    confusion_flags?: ConfusionFlag[];
  };
  content?: {
    treemap?: { name: string; children?: { name: string; children?: { name: string; size: number }[] }[] };
    total_docs?: number;
    total_chunks?: number;
    sankey_flow?: { nodes: { id: string }[]; links: { source: string; target: string; value: number }[] };
    vector_space_3d?: MeaningPoint[];
    knowledge_graph?: KGraph;
  };
}
interface Course { id: string; title: string; code: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** What students do with the tutor, and how well the course material answers them. */
export default function AnalyticsDashboard() {
  const addToast = useToastStore(s => s.addToast);
  const [data, setData] = useState<Dashboard | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coursesApi.list().then(r => setCourses(r.data || [])).catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    let live = true;
    analyticsApi.getDashboardData(selected || undefined)
      .then(r => { if (live) setData(r.data); })
      .catch(err => addToast(apiErrorDetail(err, 'Could not load analytics'), 'error'))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selected, addToast]);

  const palettes = useMemo(() => Object.fromEntries(courses.map((c, i) => [c.id, paletteAt(i)])), [courses]);

  // ---- Derived figures ----
  const heat = data?.engagement?.study_heatmap ?? [];
  const byDay = heat.map(d => ({ day: d.id, total: d.data.reduce((s, p) => s + p.y, 0) }));
  const weekTotal = byDay.reduce((s, d) => s + d.total, 0);
  const hours = heat[0]?.data.map(p => p.x) ?? [];
  const byHour = hours.map((h, i) => ({ hour: h, total: heat.reduce((s, d) => s + (d.data[i]?.y ?? 0), 0) }));
  const peakHour = byHour.reduce((best, h) => (h.total > best.total ? h : best), { hour: '—', total: -1 });
  const peakDay = byDay.reduce((best, d) => (d.total > best.total ? d : best), { day: '—', total: -1 });

  const links = data?.content?.sankey_flow?.links ?? [];
  const flow = (target: string) => links.find(l => l.target === target)?.value ?? 0;
  const asked = links.filter(l => l.source === 'Questions').reduce((s, l) => s + l.value, 0);
  const answered = flow('Answered');
  const outcomes = [
    { label: 'Strong support', note: 'Answer quotes the course material', value: flow('Strong support') },
    { label: 'Weak support', note: 'Material only partly backs it', value: flow('Weak support') },
    { label: 'No support', note: 'Answered without a source', value: flow('No support') },
    { label: 'Declined', note: 'Off topic or outside the material', value: flow('Declined') },
  ];

  const intents = (data?.engagement?.intent_radar ?? []).map(i => ({ label: i.intent.replace(' (RAG)', ''), value: i.count }));
  const flags = data?.engagement?.confusion_flags ?? [];
  const latency = data?.telemetry?.retrieval_latency ?? [];
  const tokens = data?.telemetry?.llm_streaming ?? [];
  const materials = data?.content?.treemap?.children ?? [];
  const topFlag = flags[0];

  const courseName = selected ? courses.find(c => c.id === selected)?.title : null;

  return (
    <GradientPage>
      {/* Header with course switcher */}
      <header className="mt-6 sm:mt-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6 text-white" style={rise(0)}>
        <div className="max-w-xl">
          <h1 className="font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">Analytics</h1>
          <p className="mt-3 text-white/75 text-[15px] leading-relaxed">
            What students do with the tutor{courseName ? ` in ${courseName}` : ''}, when they study, and how well your material answers them.
          </p>
        </div>
        <div className="flex flex-col items-start lg:items-end gap-3">
          <div role="tablist" aria-label="Course" className="flex flex-wrap gap-2">
            {[{ id: '', code: 'All courses' }, ...courses].map(c => (
              <button key={c.id || 'all'} type="button" role="tab" aria-selected={selected === c.id} onClick={() => { if (c.id !== selected) { setLoading(true); setSelected(c.id); } }}
                className={`inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm border transition-colors cursor-pointer ${
                  selected === c.id ? 'bg-white text-accent-strong border-white' : 'bg-white/[0.06] border-white/20 text-white/80 hover:bg-white/10 hover:text-white'}`}>
                {c.id && <span className="h-2 w-2 rounded-full" style={{ background: palettes[c.id]?.light }} aria-hidden />}
                {c.code}
              </button>
            ))}
          </div>
          {selected && (
            <Link to={`/courses/${selected}/insights`} className={heroGhost}>Question insights <ArrowUpRight size={15} /></Link>
          )}
        </div>
      </header>

      <div className={`transition-opacity duration-300 ${loading && data ? 'opacity-60' : ''}`} aria-busy={loading}>
        {/* Row 1: the week, the hours, the headline */}
        <div className="mt-8 sm:mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          <section style={rise(1)} className={`${panel} p-5 flex flex-col min-h-[230px] overflow-hidden`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center h-10 w-10 rounded-xl bg-accent-wash text-accent"><MessageCircle size={18} /></span>
                <h2 className="text-[15px] text-accent-strong">Study activity</h2>
              </div>
              <div className="text-right">
                <p className="font-display text-[2.4rem] leading-none tracking-[-0.04em] text-accent-strong tabular">{data ? weekTotal : '–'}</p>
                <p className="mt-1.5 text-xs text-ink-3">sessions this week · busiest {peakDay.day}</p>
              </div>
            </div>
            {/* Bleeds to the card's edges */}
            <div className="mt-auto -mx-5 -mb-5 pt-3">
              <WeekCurve values={byDay.map(d => d.total)} labels={byDay.map(d => d.day[0])} />
            </div>
          </section>

          <section style={rise(2)} className={`${panel} p-5 flex flex-col min-h-[230px]`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xs text-ink-3">When students study</h2>
                <p className="mt-1 font-display text-[1.75rem] leading-none tracking-[-0.03em] text-accent-strong tabular">{data ? `Peak ${peakHour.hour}` : '–'}</p>
              </div>
              <span className="h-8 px-3 inline-flex items-center rounded-full bg-accent-wash text-xs text-accent">All week</span>
            </div>
            <HourDots values={byHour.map(h => h.total)} labels={byHour.map(h => h.hour)} />
          </section>

          <section style={{ ...rise(3), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[230px] md:col-span-2 xl:col-span-1">
            <h2 className="font-display font-medium text-[1.6rem] leading-[1.1] tracking-[-0.03em] max-w-sm">
              {!data ? 'Reading the signals…' : topFlag ? `Students are stuck on ${topFlag.label.toLowerCase()}.` : 'No concept is causing trouble.'}
            </h2>
            <p className="mt-3 text-sm text-white/75 max-w-sm leading-relaxed">
              {topFlag
                ? `${plural(flags.length, 'concept')} flagged${selected ? '' : ' across your courses'}. The top one is driven by ${topFlag.reasons.join(', ').toLowerCase() || 'several signals'}.`
                : 'Flags appear once students study, ask questions and take quizzes.'}
            </p>
            {topFlag && (
              <Link to={`/courses/${topFlag.course_id}/insights`} className="mt-auto pt-6 self-start">
                <span className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-accent-strong text-sm font-medium hover:bg-accent-wash transition-colors">See why <ArrowRight size={14} /></span>
              </Link>
            )}
          </section>
        </div>

        {/* Row 2: how the tutor answered, struggling concepts, what was asked */}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          <section style={rise(4)} className={`${panel} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] text-accent-strong">How the tutor answered</h2>
                <p className="text-xs text-ink-3 mt-0.5">{plural(asked, 'question')} · {pct(answered, asked)}% answered</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {outcomes.map(o => (
                <li key={o.label} className="grid grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center gap-3 p-3 rounded-2xl bg-[#f1f5f7]">
                  <span className="min-w-0">
                    <span className="block text-[15px] text-accent-strong">{o.label}</span>
                    <span className="block text-xs text-ink-3 truncate">{o.note} · {o.value}</span>
                  </span>
                  <Segments value={pct(o.value, asked)} />
                  <span className="text-xs text-accent-strong tabular text-right">{pct(o.value, asked)}%</span>
                </li>
              ))}
            </ul>
          </section>

          <section style={rise(5)} className={`${panel} p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] text-accent-strong">Concepts students struggle with</h2>
              {selected && <Link to={`/courses/${selected}/insights`} className="text-xs text-ink-3 hover:text-accent-strong">View all</Link>}
            </div>
            {flags.length === 0 ? (
              <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No concepts flagged yet.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {flags.slice(0, 5).map(f => (
                  <li key={`${f.course_id}-${f.node_id}`}>
                    <Link to={`/courses/${f.course_id}/insights`} className="flex items-center gap-3 p-3 rounded-2xl bg-[#f1f5f7] hover:bg-[#e6eef2] transition-colors">
                      <span className="grid place-items-center h-10 w-10 shrink-0 rounded-full text-white text-xs font-semibold"
                        style={{ background: `linear-gradient(135deg, ${palettes[f.course_id]?.deep ?? '#0e3445'}, ${palettes[f.course_id]?.mid ?? '#1b566b'})` }} aria-hidden>
                        {f.label.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] text-accent-strong truncate">{f.label}</span>
                        <span className="block text-xs text-ink-3 truncate">{courses.find(c => c.id === f.course_id)?.code ?? f.course} · {f.reasons.join(', ').toLowerCase() || 'several signals'}</span>
                      </span>
                      <span className={`text-sm tabular shrink-0 ${f.probability !== null ? 'text-clay' : 'text-ink-3'}`}>
                        {f.probability !== null ? `${Math.round(f.probability * 100)}%` : 'Heuristic'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={rise(6)} className={`${panel} p-5 flex flex-col md:col-span-2 xl:col-span-1`}>
            <h2 className="text-[15px] text-accent-strong">What students asked for</h2>
            <p className="text-xs text-ink-3 mt-0.5">{plural(intents.reduce((s, i) => s + i.value, 0), 'tutor event')} by kind</p>
            <IntentBars items={intents} />
          </section>
        </div>

        {/* Row 3: concept map, with material and system stacked beside it */}
        <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
          <section style={rise(7)} className={`${panel} p-5 xl:col-span-2 flex flex-col min-h-[420px]`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] text-accent-strong">Concept map</h2>
                <p className="text-xs text-ink-3 mt-0.5">Concepts by difficulty, each linked to what it builds on.</p>
              </div>
              <span className="h-8 px-3 shrink-0 inline-flex items-center rounded-full bg-accent-wash text-xs text-accent tabular">
                {plural((data?.content?.knowledge_graph?.nodes ?? []).filter(n => n.group === 2).length, 'concept')}
              </span>
            </div>
            <div className="mt-4 flex-1 min-h-0">
              {data && <ConceptConstellation graph={data.content?.knowledge_graph as KGraph | undefined} courses={courses} palettes={palettes} flags={flags} course={selected} />}
            </div>
          </section>

          <div className="flex flex-col gap-4 [&>*]:min-w-0">
            <section style={rise(8)} className={`${panel} p-5`}>
              <h2 className="text-[15px] text-accent-strong">Material by course</h2>
              <p className="text-xs text-ink-3 mt-0.5">{plural(data?.content?.total_docs ?? 0, 'file')} · {plural(data?.content?.total_chunks ?? 0, 'passage')} the tutor can quote</p>
              <div className="mt-3 space-y-4">
                {materials.map(m => {
                  const course = courses.find(c => c.title === m.name);
                  const files = [...(m.children ?? [])].sort((a, b) => b.size - a.size);
                  const max = Math.max(1, ...files.map(f => f.size));
                  const p = course ? palettes[course.id] : undefined;
                  return (
                    <div key={m.name}>
                      <p className="flex items-center gap-2 text-xs text-ink-3">
                        <span className="h-2 w-2 rounded-full" style={{ background: p?.mid }} aria-hidden />{course?.code ?? m.name}
                        <span className="ml-auto tabular">{files.reduce((s, f) => s + f.size, 0)} passages</span>
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {files.map(f => (
                          <li key={f.name} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-3 text-sm">
                            <span className="truncate text-ink-2">{f.name}</span>
                            <span className="h-2 rounded-full bg-accent-50 overflow-hidden" aria-hidden>
                              <span className="block h-full rounded-full" style={{ width: `${(f.size / max) * 100}%`, background: p?.mid ?? '#1b566b' }} />
                            </span>
                            <span className="text-xs text-ink-3 tabular text-right">{f.size}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {data && materials.length === 0 && <p className="p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No processed files yet.</p>}
              </div>
            </section>

            <section style={rise(9)} className={`${panel} p-5 flex-1 flex flex-col`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] text-accent-strong">System</h2>
                <span className="text-xs text-ink-3">Last 6 hours</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat icon={<Clock size={14} />} label="Retrieval" value={`${Math.round(avg(latency.map(l => l.latency_ms)))}ms`} />
                <Stat icon={<Gauge size={14} />} label="Speed" value={`${Math.round(avg(tokens.map(t => t.tokens_sec)))}t/s`} />
                <Stat icon={<MessageCircle size={14} />} label="Match" value={`${Math.round(avg(latency.map(l => l.confidence)) * 100)}%`} />
              </div>
              <p className="mt-4 text-xs text-ink-3">Retrieval latency</p>
              <div className="flex-1 min-h-20 flex flex-col"><MiniBars values={latency.map(l => l.latency_ms)} labels={latency.map(l => l.time)} unit="ms" /></div>
            </section>
          </div>
        </div>

        {/* Row 4: passages in meaning space, full width */}
        <section style={rise(10)} className={`${panel} mt-4 p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] text-accent-strong">Passages in meaning space</h2>
              <p className="text-xs text-ink-3 mt-0.5">Each dot is a passage from your material. Dots close together say similar things.</p>
            </div>
          </div>
          <div className="mt-4">
            {data && <MeaningMap points={data.content?.vector_space_3d ?? []} courses={courses} />}
          </div>
        </section>

      </div>
    </GradientPage>
  );
}

// ---- Charts ---------------------------------------------------------------------------

/** Smooth curve of the week with a glowing dot on the busiest day (Lumio's "Net cash flow"). */
/** Edge-to-edge curve: one point per day at the centre of its column, flat out to both edges. */
function WeekCurve({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 700, H = 100, top = 14, bottom = 6;
  if (values.length < 2) return <div className="h-28" />;
  const max = Math.max(1, ...values);
  const n = values.length;
  const xOf = (i: number) => ((i + 0.5) / n) * W;
  const yOf = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  // Pad each end with a point on the card edge, level with the first and last day
  const pts = [[0, yOf(values[0])], ...values.map((v, i) => [xOf(i), yOf(v)]), [W, yOf(values[n - 1])]] as [number, number][];
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  const peak = values.indexOf(max);
  return (
    <div>
      <div className="relative h-28">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" role="img" aria-label={`Sessions per day: ${values.join(', ')}`}>
          <defs>
            <linearGradient id="week-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a6f87" stopOpacity="0.22" />
              <stop offset="1" stopColor="#2a6f87" stopOpacity="0" />
            </linearGradient>
          </defs>
          {values.map((_, i) => <line key={i} x1={xOf(i)} x2={xOf(i)} y1={top} y2={H} stroke="#dbe7ec" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#week-fill)" />
          <path d={d} fill="none" stroke="#1b566b" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Peak marker in HTML so it stays round while the chart stretches */}
        <span className="absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2a6f87]/20 grid place-items-center"
          style={{ left: `${(xOf(peak) / W) * 100}%`, top: `${(yOf(values[peak]) / H) * 100}%` }} aria-hidden>
          <span className="h-[9px] w-[9px] rounded-full bg-[#1b566b] ring-2 ring-white" />
        </span>
      </div>
      <div className="grid pt-1 pb-3 text-[10px] text-ink-4 text-center" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

/** One dot column per hour; filled height is how busy that hour is (Lumio's forecast matrix). */
function HourDots({ values, labels }: { values: number[]; labels: string[] }) {
  const ROWS = 9;
  const max = Math.max(1, ...values);
  return (
    <div className="mt-auto pt-5">
      <div className="flex justify-between" role="img" aria-label={`Activity by hour: ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}`}>
        {values.map((v, i) => {
          const n = Math.max(1, Math.round((v / max) * ROWS));
          return (
            <div key={i} className="flex flex-col-reverse items-center gap-[4px]">
              {Array.from({ length: ROWS }, (_, k) => (
                <span key={k} className={`h-2 w-2 rounded-full ${k < n ? (k === n - 1 ? 'bg-accent-strong' : 'bg-accent-300') : 'bg-accent-50'}`} />
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-4 tabular">
        {labels.map((l, i) => <span key={i} className="w-2 flex justify-center">{i % 4 === 0 ? l.replace(':00', '') : ''}</span>)}
      </div>
    </div>
  );
}

/** Vertical bars with the largest one hatched and labelled (Lumio's "Financial performance"). */
function IntentBars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map(i => i.value));
  const top = items.findIndex(i => i.value === max);
  const ticks = [max, Math.round(max * 0.66), Math.round(max * 0.33), 0];
  // Bars share the column height minus room for the badge (top) and the label (bottom)
  return (
    <div className="mt-4 flex-1 grid grid-cols-[2rem_minmax(0,1fr)] gap-2 min-h-[240px]">
      <div className="flex flex-col justify-between pt-8 pb-7 text-[10px] text-ink-4 tabular">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
      <div className="flex items-end justify-between gap-2">
        {items.map((it, i) => (
          <div key={it.label} className="relative flex-1 h-full flex flex-col justify-end items-center">
            {i === top && (
              <span className="mb-1.5 whitespace-nowrap rounded-lg bg-accent-strong px-2 py-1 text-[10px] text-white tabular">
                {it.label.split(' ')[0]} · {it.value}
              </span>
            )}
            <div className="w-full max-w-12 rounded-xl"
              style={{
                height: `calc((100% - 60px) * ${it.value / max})`,
                minHeight: 6,
                background: i === top
                  ? 'repeating-linear-gradient(135deg, #1b566b 0 3px, #2a6f87 3px 6px)'
                  : it.value >= max * 0.6 ? '#b9d3dd' : '#dbe7ec',
              }} />
            <span className="mt-2 h-5 text-[10px] text-ink-4 text-center leading-tight line-clamp-2 w-full" title={it.label}>{it.label.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 12 rounded segments filled to a share, like Lumio's spend rows. */
function Segments({ value }: { value: number }) {
  const n = Math.round(value / (100 / 12));
  return (
    <span className="flex gap-[3px] w-24 sm:w-28" aria-hidden>
      {Array.from({ length: 12 }, (_, k) => <span key={k} className={`h-3.5 flex-1 rounded-[3px] ${k < n ? 'bg-accent' : 'bg-[#d4e1e7]'}`} />)}
    </span>
  );
}

function MiniBars({ values, labels, unit }: { values: number[]; labels: string[]; unit: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mt-2 flex-1 min-h-20 flex items-end gap-[3px]" role="img" aria-label={`Latency over time, ${Math.min(...values)} to ${max} ${unit}`}>
      {values.map((v, i) => (
        <span key={i} title={`${labels[i]} · ${v} ${unit}`} className={`flex-1 rounded-[3px] ${v === max ? 'bg-accent-strong' : 'bg-accent-100'}`} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </div>
  );
}

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-2xl bg-[#f1f5f7] p-3">
    <span className="flex items-center gap-1.5 text-xs text-ink-3">{icon}{label}</span>
    <span className="mt-1 block font-display text-xl tracking-[-0.02em] text-accent-strong tabular">{value}</span>
  </div>
);

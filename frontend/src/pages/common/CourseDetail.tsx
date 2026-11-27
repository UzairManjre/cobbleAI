import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, FileText, Map as MapIcon, MessageCircle, Play, Sparkles } from 'lucide-react';
import { coursesApi, documentsApi, lecturesApi, testsApi } from '../../api';
import { faqApi, type FAQEntry } from '../../api/insights';
import ScoreRing from '../../components/student/ScoreRing';
import FaqCard from '../../components/student/FaqCard';
import { panel, pillDark, pillLine, featureBg, rise } from '../../components/ui/glass';
import { paletteAt, type ArtPalette } from '../../components/ui/artPalettes';
import { useGraphStore } from '../../store/graphStore';
import { useToastStore } from '../../store/toastStore';
import { openInNewTab } from '../../utils/download';
import { LEVEL_BG, levelOf, loadStudyPath, nextStep, pct, plural, type StudyConcept } from '../../utils/mastery';

interface Doc { id: string; filename: string; media_type: 'document' | 'lecture'; file_type: string; status: string; created_at: string; duration_sec?: number }
interface Test { id: string; title: string; test_type: string; duration_minutes: number; status: string }
interface Attempt { id: string; test_id: string; status: string; percentage: number | null }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const stem = (name: string) => name.replace(/\.[a-z0-9]+$/i, '');

/** A student's class page: where they are on the study path, then the lectures, notes and tests. */
export default function CourseDetail() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const addToast = useToastStore(s => s.addToast);

  const [path, setPath] = useState<StudyConcept[] | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [faq, setFaq] = useState<FAQEntry[]>([]);
  const [palette, setPalette] = useState<ArtPalette>(paletteAt(0));

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      loadStudyPath(courseId),
      documentsApi.list(courseId),
      testsApi.getByCourse(courseId),
      testsApi.getMyAttempts(),
      faqApi.list(courseId),
      coursesApi.list(),
    ]).then(([p, d, t, a, f, c]) => {
      if (cancelled) return;
      setPath(p.status === 'fulfilled' ? p.value : []);
      setDocs(d.status === 'fulfilled' ? (d.value.data || []).filter((x: Doc) => x.status === 'ready') : []);
      setTests(t.status === 'fulfilled' ? (t.value.data || []).filter((x: Test) => x.status === 'published') : []);
      setAttempts(a.status === 'fulfilled' ? a.value.data?.attempts || [] : []);
      setFaq(f.status === 'fulfilled' ? f.value.data.entries.filter(e => e.status === 'published') : []);
      if (c.status === 'fulfilled') setPalette(paletteAt(Math.max(0, (c.value.data || []).findIndex((x: { id: string }) => x.id === courseId))));
    });
    return () => { cancelled = true; };
  }, [courseId]);

  const study = (nodeId?: string) => {
    if (nodeId) useGraphStore.setState({ currentNodeId: nodeId });
    navigate(`/courses/${courseId}/learn`);
  };

  const step = useMemo(() => nextStep(path || []), [path]);
  const loading = path === null;
  const ready = !!path?.length;
  const lectures = docs.filter(d => d.media_type === 'lecture');
  const notes = docs.filter(d => d.media_type !== 'lecture');
  const attemptOf = new Map(attempts.map(a => [a.test_id, a]));

  const openFile = async (doc: Doc) => {
    const ok = await openInNewTab(async () => (await lecturesApi.fileUrl(doc.id)).data.url);
    if (!ok) addToast('Could not open the file', 'error');
  };

  return (
    <>
      {/* Row 1: next step, study path */}
      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <section style={{ ...rise(1), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[240px]">
          <p className="text-xs text-white/70">{step ? `Next up · step ${step.next.step} of ${path?.length}` : 'Next up'}</p>
          <h2 className="mt-2 font-display font-medium text-[1.9rem] leading-[1.05] tracking-[-0.03em]">
            {loading ? 'Finding your next step…' : !ready ? 'Not ready to study yet' : step ? step.next.label : 'You know every concept.'}
          </h2>
          <p className="mt-2 text-sm text-white/75 line-clamp-2">
            {!ready ? 'Your professor is still building the concept map. The lectures and notes below are open already.'
              : step ? (step.before ? `Builds on ${step.before.label}, which you know.` : step.next.description)
                : 'Keep them fresh with a test, or ask the tutor anything.'}
          </p>
          {step && (
            <div className="mt-4 flex items-center gap-3 text-xs text-white/80">
              <span className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden"><span className="block h-full rounded-full bg-white" style={{ width: pct(step.next.mastery) }} /></span>
              <span className="tabular">{pct(step.next.mastery)} known</span>
            </div>
          )}
          <div className="mt-auto pt-5 flex flex-wrap gap-2">
            {ready && (
              <button type="button" onClick={() => study(step?.next.id)} className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors cursor-pointer">
                <Sparkles size={14} /> {step ? 'Study it' : 'Review'}
              </button>
            )}
            <Link to={`/courses/${courseId}/ask`} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/40 text-sm hover:bg-white/10 transition-colors">
              <MessageCircle size={14} /> Ask the tutor
            </Link>
          </div>
        </section>

        <section aria-labelledby="path-heading" style={rise(2)} className={`${panel} p-5 xl:col-span-2 flex flex-col`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="path-heading" className="text-[15px] text-[#0e3445]">Study path</h2>
              <p className="text-xs text-ink-3 mt-0.5">{ready ? 'In the order to learn them · click a step to study it' : 'Appears once the concept map is built'}</p>
            </div>
            <div className="flex items-center gap-4">
              <ul className="hidden lg:flex items-center gap-3 text-[11px] text-ink-3">
                {([['Known', LEVEL_BG.known], ['Learning', LEVEL_BG.learning], ['Not yet', LEVEL_BG.new]] as const).map(([l, c]) => (
                  <li key={l} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{l}</li>
                ))}
              </ul>
              {ready && <Link to={`/courses/${courseId}/map`} className={pillLine}><MapIcon size={14} /> Map</Link>}
            </div>
          </div>
          {ready && <ProgressBar path={path!} />}
          <div className="mt-auto pt-6">
            {loading ? <div className="h-24 rounded-2xl bg-[#ecf3f6] animate-pulse" />
              : ready ? <PathStrip path={path!} current={step?.next.id} onPick={study} />
                : <div className="h-24 rounded-2xl border border-dashed border-[#b9cdd5]" />}
          </div>
        </section>
      </div>

      {/* Row 2: lectures and notes, tests and FAQ */}
      {/* Panels stretch to the row's height so the two columns always end level */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="materials-heading" style={rise(3)} className={`${panel} p-5 xl:col-span-2`}>
          <div className="flex items-center justify-between">
            <h2 id="materials-heading" className="text-[15px] text-[#0e3445]">Lectures and notes</h2>
            <span className="text-xs text-ink-3">{plural(lectures.length, 'lecture')} · {plural(notes.length, 'file')}</span>
          </div>
          {docs.length === 0 ? (
            <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">{loading ? 'Loading…' : 'Nothing shared yet.'}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {lectures.map(d => (
                <li key={d.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-3 rounded-2xl bg-[#f1f5f7]">
                  <span className="grid place-items-center h-10 w-10 rounded-full text-white" style={{ background: `linear-gradient(135deg, ${palette.deep}, ${palette.mid})` }}><Play size={15} className="ml-0.5" /></span>
                  <span className="min-w-0">
                    <span className="block text-[15px] text-[#0e3445] truncate">{stem(d.filename)}</span>
                    <span className="block text-xs text-ink-3">Recording{d.duration_sec ? ` · ${Math.round(d.duration_sec / 60)} min` : ''} · transcript and chapters</span>
                  </span>
                  <Link to={`/courses/${courseId}/lectures/${d.id}`} className={pillDark}>Watch</Link>
                </li>
              ))}
              {notes.map(d => (
                <li key={d.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-3 rounded-2xl bg-[#f1f5f7]">
                  <span className="grid place-items-center h-10 w-10 rounded-full bg-white text-[#1b566b]"><FileText size={16} /></span>
                  <span className="min-w-0">
                    <span className="block text-[15px] text-[#0e3445] truncate">{stem(d.filename)}</span>
                    <span className="block text-xs text-ink-3">{d.file_type.toUpperCase()} · added {day(d.created_at)}</span>
                  </span>
                  <button type="button" onClick={() => openFile(d)} className={pillLine}>Open</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section aria-labelledby="tests-heading" style={rise(4)} className={`${panel} p-5 ${faq.length > 0 ? '' : 'flex-1'}`}>
            <div className="flex items-center justify-between">
              <h2 id="tests-heading" className="text-[15px] text-[#0e3445]">Tests</h2>
              <Link to={`/courses/${courseId}/tests`} className="text-xs text-ink-3 hover:text-[#0e3445]">All</Link>
            </div>
            {tests.length === 0 ? (
              <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">{loading ? 'Loading…' : 'No tests yet.'}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {tests.map(t => {
                  const a = attemptOf.get(t.id);
                  const done = a && a.status !== 'in_progress';
                  return (
                    <li key={t.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#f1f5f7]">
                      <ScoreRing value={done && a?.percentage != null ? a.percentage / 100 : null} color={palette.mid} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-[#0e3445] truncate">{t.title}</span>
                        <span className="block text-xs text-ink-3">{t.test_type === 'assignment' ? 'Assignment' : 'Quiz'} · {t.duration_minutes} min</span>
                      </span>
                      {done
                        ? a?.status === 'graded'
                          ? <Link to={`/tests/${t.id}/result/${a.id}`} className={`${pillLine} h-8 px-3`}>Result</Link>
                          : <span className="text-xs text-ink-4 px-2">Submitted</span>
                        : <Link to={`/tests/${t.id}`} className={`${pillDark} h-8 px-3`}>{a ? 'Continue' : 'Start'} <ArrowRight size={12} /></Link>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {faq.length > 0 && <FaqCard style={rise(5)} className="flex-1" courseId={courseId} entries={faq} />}
        </div>
      </div>
    </>
  );
}

/** Known / learning / to go across the whole class, as one segmented bar. */
function ProgressBar({ path }: { path: StudyConcept[] }) {
  const count = (l: string) => path.filter(k => levelOf(k.mastery) === l).length;
  const parts = [['known', count('known'), 'known'], ['learning', count('learning'), 'learning'], ['new', count('new'), 'to go']] as const;
  return (
    <div className="mt-5">
      <div className="flex h-2.5 gap-[3px]" aria-hidden>
        {parts.map(([l, n]) => n > 0 && <span key={l} className={`rounded-full ${LEVEL_BG[l]}`} style={{ flex: n }} />)}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-ink-3 tabular">
        {parts.map(([l, n, word]) => <span key={l}><span className="text-[#0e3445]">{n}</span> {word}</span>)}
      </p>
    </div>
  );
}

/** The study order as a row of numbered beads on one line, shaded by how well each is known. */
function PathStrip({ path, current, onPick }: { path: StudyConcept[]; current?: string; onPick: (id: string) => void }) {
  const cols = Math.min(path.length, 12);
  return (
    <ol className="grid gap-y-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {path.map((k, i) => {
        const level = levelOf(k.mastery);
        const isCurrent = k.id === current;
        return (
          <li key={k.id} className="relative">
            {/* The line to the previous step, in the same row */}
            {i % cols !== 0 && <span aria-hidden className={`absolute top-[22px] right-1/2 w-full h-0.5 ${level === 'new' ? 'bg-[#dbe7ec]' : 'bg-[#8fbccb]'}`} />}
            <button type="button" onClick={() => onPick(k.id)} title={`${k.label} · ${pct(k.mastery)} known`}
              className="group relative z-10 w-full flex flex-col items-center gap-2.5 cursor-pointer">
              {/* White backing so the connecting line never shows through a light bead */}
              <span className={`rounded-full bg-white p-[3px] transition-transform group-hover:scale-110 ${isCurrent ? 'ring-4 ring-[#2a6f87]/20' : ''}`}>
                <span className={`grid place-items-center h-10 w-10 rounded-full text-sm font-medium tabular ${LEVEL_BG[level]} ${level === 'known' ? 'text-white' : 'text-[#0e3445]'}`}>
                  {level === 'known' ? <Check size={16} /> : k.step}
                </span>
              </span>
              <span className={`px-1 text-center text-xs leading-tight line-clamp-2 h-[2.5em] ${isCurrent ? 'text-[#0e3445] font-medium' : 'text-ink-3 group-hover:text-[#0e3445]'}`}>{k.label}</span>
              <span className="text-[11px] tabular text-ink-4">{pct(k.mastery)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

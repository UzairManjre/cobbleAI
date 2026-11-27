import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BookOpen, Check, Copy, FileText, Film, Loader2, Map as MapIcon, PlayCircle,
  RefreshCw, Trash2, Upload, Users, XCircle,
} from 'lucide-react';
import { coursesApi, documentsApi, graphsApi } from '../../api';
import { useGraphStore } from '../../store/graphStore';
import { useToastStore } from '../../store/toastStore';
import { useCourseSetup } from '../../hooks/useCourseSetup';
import { STAGE_LABELS, isActiveBuild, timeAgo } from '../../utils/buildProgress';
import { apiErrorDetail } from '../../utils/apiError';
import CourseSetupPanel from '../../components/course/CourseSetupPanel';
import TutorPolicyCard from '../../components/tutor/TutorPolicyCard';
import CourseArt from '../../components/ui/CourseArt';
import { paletteAt, type ArtPalette } from '../../components/ui/artPalettes';
import { panel, pillDark, pillLine, featureBg, rise } from '../../components/ui/glass';

interface Doc {
  id: string; _id?: string; filename: string; status: 'ready' | 'processing' | 'pending' | 'failed';
  media_type?: string; created_at: string; stage?: string; progress?: number; error_message?: string;
}
interface Student {
  id: string; name?: string; email?: string; status: string; progress: number;
  last_active_at?: string; tests_taken?: number; enrolled_at?: string;
}

const STUDENTS_SHOWN = 6;
const initials = (s: Student) => (s.name || s.email || '?').split(/[\s@.]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const daysSince = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);

/** Professor's course overview: map health, invite, materials, tutor policy and the class at a glance. */
export default function CourseOverview() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const addToast = useToastStore(s => s.addToast);
  const fileInput = useRef<HTMLInputElement>(null);
  const { nodes, edges, fetchCourseGraph } = useGraphStore();

  const [palette, setPalette] = useState<ArtPalette>(paletteAt(0));
  const [docs, setDocs] = useState<Doc[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [uploading, setUploading] = useState<number | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { setup, refresh } = useCourseSetup(courseId, true, build => {
    if (build.status === 'complete') {
      fetchCourseGraph(courseId);
      addToast(`Concept map ready: ${build.nodes_count} concepts, ${build.edges_count} connections`, 'success');
    } else if (build.status === 'failed') {
      addToast('The concept map build failed. The details are on this page.', 'error');
    }
  });
  const building = isActiveBuild(setup?.build);

  const loadDocs = () => documentsApi.list(courseId).then(r => setDocs(r.data || [])).catch(() => setDocs([]));

  useEffect(() => {
    if (!courseId) return;
    fetchCourseGraph(courseId);
    loadDocs();
    coursesApi.list().then(r => {
      const i = (r.data || []).findIndex((c: { id: string }) => c.id === courseId);
      setPalette(paletteAt(Math.max(0, i)));
    }).catch(() => {});
    coursesApi.getProfessorStudents()
      .then(r => setStudents((r.data || []).filter((s: Student & { course_id: string }) => s.course_id === courseId)))
      .catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Keep polling while files are still being processed
  useEffect(() => {
    if (!docs.some(d => d.status === 'pending' || d.status === 'processing')) return;
    const t = setInterval(loadDocs, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(0);
    try {
      await documentsApi.upload(courseId, files, setUploading);
      loadDocs();
      refresh();
    } catch (err) {
      addToast(apiErrorDetail(err, err instanceof Error ? err.message : 'Upload failed'), 'error');
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (doc: Doc) => {
    if (!confirm(`Delete ${doc.filename}?`)) return;
    try {
      await documentsApi.delete(doc.id || doc._id!);
      loadDocs();
      refresh();
    } catch {
      addToast('Could not delete the file', 'error');
    }
  };

  const removeDuplicates = async () => {
    if (!confirm('Remove files that were uploaded more than once?')) return;
    try {
      const r = await documentsApi.cleanupDuplicates(courseId);
      addToast(r.data.message, 'success');
      loadDocs();
    } catch {
      addToast('Could not remove duplicates', 'error');
    }
  };

  const build = async () => {
    setStarting(true);
    try {
      const r = await graphsApi.startBuild(courseId);
      addToast(r.data.created ? 'Map build started. Progress shows on this page.' : 'A map build is already running.', 'success');
      refresh();
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not start the map build'), 'error');
    } finally {
      setStarting(false);
    }
  };

  const cancel = async (id: string) => {
    setCancelling(true);
    try { await graphsApi.cancelBuild(id); refresh(); }
    catch (err) { addToast(apiErrorDetail(err, 'Could not cancel the build'), 'error'); }
    finally { setCancelling(false); }
  };

  const makeInvite = async () => {
    try {
      const r = await coursesApi.createInvite(courseId);
      setInvite(r.data.code);
    } catch {
      addToast('Could not create an invite code', 'error');
    }
  };
  const copyInvite = () => {
    if (!invite) return;
    navigator.clipboard?.writeText(invite).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
  };

  const sorted = useMemo(() => [...students].sort((a, b) => daysSince(b.last_active_at) - daysSince(a.last_active_at)), [students]);
  const nudge = students.filter(s => s.status !== 'Learning' || daysSince(s.last_active_at) > 7);
  const avgProgress = students.length ? Math.round(students.reduce((s, x) => s + (x.progress || 0), 0) / students.length) : 0;

  const graph = setup?.graph;
  const changed = setup?.materials_changed ?? [];
  const failed = setup?.build?.status === 'failed';
  const mapHealthy = !!graph && !building && !failed && changed.length === 0;
  // A course that is set up gets the compact map card; one still being set up keeps the step-by-step checklist
  const showChecklist = setup && (!graph || building);

  return (
    <div className="mt-8 sm:mt-10 space-y-4">
      <input ref={fileInput} type="file" className="hidden" multiple onChange={upload}
        accept=".pdf,.docx,.pptx,.mp4,.webm,.mov,.mp3,.m4a,.wav" />

      {/* Left two thirds: map, materials, class list. Right third: class headline, tutor policy. */}
      <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
        <div className="xl:col-span-2 flex flex-col gap-4 [&>*]:min-w-0">
        {showChecklist ? (
          <div style={rise(1)}>
            <CourseSetupPanel setup={setup} starting={starting} cancelling={cancelling} onBuild={build} onCancel={cancel}
              onViewMap={() => navigate(`/courses/${courseId}/map`)} onUpload={() => fileInput.current?.click()} />
          </div>
        ) : (
          <section style={rise(1)} className={`${panel} p-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_15rem]`}>
            <div className="min-w-0 flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] text-accent-strong">Concept map</h2>
                <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] ${
                  mapHealthy ? 'bg-accent-wash text-accent' : failed ? 'bg-clay-wash text-clay' : 'bg-clay-wash text-clay'}`}>
                  {mapHealthy ? <Check size={12} /> : failed ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                  {mapHealthy ? 'Up to date' : failed ? 'Last build failed' : 'Out of date'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Tile label="Concepts" value={graph?.nodes_count ?? nodes.length} />
                <Tile label="Connections" value={graph?.edges_count ?? edges.length} />
                <Tile label="Files ready" value={`${setup?.documents.ready ?? 0}/${setup?.documents.total ?? docs.length}`} />
                <Tile label="Built" value={graph ? timeAgo(graph.created_at) : '–'} />
              </div>

              {failed && (
                <p className="mt-3 text-xs text-clay bg-clay-wash rounded-xl p-3">
                  {setup?.build?.error || 'The last build stopped with an error.'} Students still see the previous map.
                </p>
              )}
              {!failed && changed.length > 0 && (
                <p className="mt-3 text-xs text-clay bg-clay-wash rounded-xl p-3">
                  {changed.length === 1 ? '1 file was' : `${changed.length} files were`} added after this map was built
                  ({changed.slice(0, 3).join(', ')}{changed.length > 3 ? `, +${changed.length - 3} more` : ''}). Rebuild to include {changed.length === 1 ? 'it' : 'them'}.
                </p>
              )}

              <div className="mt-auto pt-4 flex flex-wrap gap-2">
                <button type="button" onClick={build} disabled={starting} className={pillDark}>
                  {starting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Rebuild map
                </button>
                <Link to={`/courses/${courseId}/map`} className={pillLine}><MapIcon size={14} /> Open map</Link>
                <Link to={`/courses/${courseId}/learn`} className={pillLine}><BookOpen size={14} /> Preview as student</Link>
              </div>
            </div>

            <Link to={`/courses/${courseId}/map`} className="group relative hidden md:block rounded-2xl overflow-hidden min-h-[180px]" aria-label="Open the concept map">
              <CourseArt seed={courseId} palette={palette} nodes={Math.min(12, Math.max(5, graph?.nodes_count ?? 8))}
                className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.04]" />
              <span className="absolute left-3 bottom-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/90 text-xs text-accent-strong">
                Open map <ArrowRight size={12} />
              </span>
            </Link>
          </section>
        )}

        <section style={rise(3)} className={`${panel} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] text-accent-strong">Learning materials</h2>
              <p className="text-xs text-ink-3 mt-0.5">{docs.length} {docs.length === 1 ? 'file' : 'files'} the tutor can quote</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={removeDuplicates} className={pillLine}>Remove duplicates</button>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading !== null} className={pillDark}>
                {uploading !== null ? <><Loader2 size={14} className="animate-spin" /> {Math.round(uploading * 100)}%</> : <><Upload size={14} /> Upload</>}
              </button>
            </div>
          </div>

          {docs.length === 0 ? (
            <button type="button" onClick={() => fileInput.current?.click()}
              className="mt-4 w-full rounded-2xl border border-dashed border-accent-100 p-8 text-center hover:bg-white/70 transition-colors cursor-pointer">
              <FileText size={22} className="mx-auto text-accent" />
              <span className="block mt-2 text-sm text-accent-strong">Upload slides, notes or lecture recordings</span>
              <span className="block text-xs text-ink-3">The concept map is built from these.</span>
            </button>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {docs.map(d => <DocRow key={d.id || d._id} doc={d} courseId={courseId} onDelete={() => remove(d)} />)}
            </ul>
          )}
        </section>

      {/* The class */}
      <section style={rise(5)} className={`${panel} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] text-accent-strong">Students</h2>
            <p className="text-xs text-ink-3 mt-0.5">
              {students.length} enrolled{nudge.length ? ` · ${nudge.length} could use a nudge` : ''} · most recently active first
            </p>
          </div>
          <Link to="/students" className={pillLine}>Full roster <ArrowRight size={14} /></Link>
        </div>

        {students.length === 0 ? (
          <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No one has joined yet. Share an invite code from the Class card.</p>
        ) : (
          <>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(showAll ? sorted : sorted.slice(0, STUDENTS_SHOWN)).map(s => <StudentTile key={s.id} s={s} palette={palette} />)}
            </ul>
            {students.length > STUDENTS_SHOWN && (
              <button type="button" onClick={() => setShowAll(v => !v)} className="mt-3 text-xs text-accent hover:underline cursor-pointer">
                {showAll ? 'Show fewer' : `Show all ${students.length}`}
              </button>
            )}
          </>
        )}
      </section>
        </div>

        <div className="flex flex-col gap-4 [&>*]:min-w-0">
        {/* Invite / class headline */}
        <section style={{ ...rise(2), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[240px]">
          <p className="text-xs text-white/70">Class</p>
          <h2 className="mt-1 font-display font-medium text-[1.6rem] leading-[1.1] tracking-[-0.03em]">
            {students.length ? `${students.length} students, ${avgProgress}% through on average.` : 'No students yet.'}
          </h2>
          {students.length > 0 && (
            <div className="mt-4 flex items-center">
              {sorted.slice(0, 6).map((s, i) => (
                <span key={s.id} className="grid place-items-center h-10 w-10 rounded-full border-2 border-[#114257] bg-white text-[11px] font-semibold text-accent-strong"
                  style={{ marginLeft: i ? -8 : 0 }} title={s.name}>{initials(s)}</span>
              ))}
              {students.length > 6 && <span className="ml-2 text-xs text-white/75">+{students.length - 6}</span>}
            </div>
          )}
          <div className="mt-auto pt-5">
            {invite ? (
              <button type="button" onClick={copyInvite}
                className="w-full flex items-center justify-between gap-3 h-12 px-4 rounded-2xl bg-white/15 border border-white/25 hover:bg-white/20 transition-colors cursor-pointer">
                <span className="font-display text-xl tracking-[0.2em] tabular">{invite}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-white/80">{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</span>
              </button>
            ) : (
              <button type="button" onClick={makeInvite}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-accent-strong text-sm font-medium hover:bg-accent-wash transition-colors cursor-pointer">
                <Users size={14} /> Get an invite code
              </button>
            )}
          </div>
        </section>

          <div style={rise(4)} className="flex-1"><TutorPolicyCard courseId={courseId} /></div>
        </div>
      </div>
    </div>
  );
}

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-2xl bg-[#f1f5f7] px-3 py-2.5">
    <span className="block font-display text-xl tracking-[-0.02em] text-accent-strong tabular truncate">{value}</span>
    <span className="text-[11px] text-ink-3">{label}</span>
  </div>
);

function DocRow({ doc, courseId, onDelete }: { doc: Doc; courseId: string; onDelete: () => void }) {
  const ext = doc.filename.split('.').pop()?.toUpperCase() ?? 'DOC';
  const lecture = doc.media_type === 'lecture';
  const Icon = lecture ? Film : FileText;
  const status = doc.status === 'ready' ? null
    : doc.status === 'failed' ? <span className="text-clay">Failed</span>
      : doc.status === 'pending' ? <span className="text-clay">Waiting in queue</span>
        : <span className="text-accent">{(doc.stage && STAGE_LABELS[doc.stage]) || 'Processing'}{doc.progress ? ` ${Math.round(doc.progress * 100)}%` : ''}</span>;
  return (
    <li className="group flex items-center gap-3 p-3 rounded-2xl bg-[#f1f5f7] hover:bg-[#e6eef2] transition-colors" title={doc.error_message || undefined}>
      <span className={`grid place-items-center h-10 w-10 shrink-0 rounded-xl ${lecture ? 'bg-accent-strong text-white' : 'bg-white text-accent'}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-accent-strong truncate">{doc.filename}</span>
        <span className="block text-[11px] text-ink-3 truncate">
          {ext} · added {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{status && <> · {status}</>}
        </span>
      </span>
      {lecture && (
        <Link to={`/courses/${courseId}/lectures/${doc.id || doc._id}`} className="grid place-items-center h-8 w-8 rounded-full text-accent hover:bg-white" title="Open lecture">
          <PlayCircle size={16} />
        </Link>
      )}
      <button type="button" onClick={onDelete} title="Delete file" aria-label={`Delete ${doc.filename}`}
        className="grid place-items-center h-8 w-8 rounded-full text-ink-4 hover:text-clay hover:bg-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer">
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function StudentTile({ s, palette }: { s: Student; palette: ArtPalette }) {
  const days = daysSince(s.last_active_at);
  const stale = days > 7;
  const n = Math.round((s.progress || 0) / (100 / 12));
  const pill = s.status === 'Learning' ? 'bg-accent-wash text-accent' : s.status === 'Inactive' ? 'bg-clay-wash text-clay' : 'bg-[#e6eef2] text-ink-3';
  return (
    <li className="p-3 rounded-2xl bg-[#f1f5f7]">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full text-white text-[11px] font-semibold"
          style={{ background: `linear-gradient(135deg, ${palette.deep}, ${palette.mid})` }} aria-hidden>{initials(s)}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-accent-strong truncate">{s.name || s.email}</span>
          <span className={`block text-[11px] truncate ${stale ? 'text-clay' : 'text-ink-3'}`}>
            {Number.isFinite(days) ? (days < 1 ? 'Active today' : `Active ${Math.floor(days)}d ago`) : 'Not active yet'}
            {s.tests_taken ? ` · ${s.tests_taken} ${s.tests_taken === 1 ? 'test' : 'tests'}` : ''}
          </span>
        </span>
        <span className={`h-6 px-2 inline-flex items-center rounded-full text-[11px] ${pill}`}>{s.status}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex flex-1 gap-[3px]" aria-hidden>
          {Array.from({ length: 12 }, (_, k) => <span key={k} className={`h-2 flex-1 rounded-[2px] ${k < n ? 'bg-accent' : 'bg-[#d4e1e7]'}`} />)}
        </span>
        <span className="text-[11px] text-accent-strong tabular w-8 text-right">{s.progress}%</span>
      </div>
    </li>
  );
}

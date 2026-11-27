import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Circle, FileText, Film, Loader2, Map, RefreshCw, Upload, XCircle } from 'lucide-react';
import { panel, pillDark, pillLine, CLAY } from '../ui/glass';
import MapBuildProgress from './MapBuildProgress';
import type { CourseSetup, SetupDocument, SetupPhase } from '../../types/graph';
import { STAGE_LABELS, formatDuration, isActiveBuild, timeAgo } from '../../utils/buildProgress';

type StepState = 'done' | 'active' | 'todo' | 'warn' | 'error';

interface Props {
  setup: CourseSetup;
  starting: boolean;
  cancelling: boolean;
  onBuild: () => void;
  onCancel: (buildId: string) => void;
  onViewMap: () => void;
  onUpload: () => void;
}

const PHASE_TEXT: Record<SetupPhase, string> = {
  no_materials: 'Upload course materials to get started.',
  processing: 'Your files are being processed. You can leave this page; progress is saved.',
  building: 'The concept map is being built in the background. You can leave this page; progress is saved.',
  ready_to_build: 'Your files are ready. Build the concept map so students can start studying.',
  build_failed: 'The concept map build failed. The details are below.',
  materials_failed: 'None of the files could be processed. The errors are below.',
  ready: 'Students can study this course.',
};

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') return <CheckCircle2 className="w-5 h-5 text-[#1b566b]" />;
  if (state === 'active') return <Loader2 className="w-5 h-5 text-[#2a6f87] animate-spin" />;
  if (state === 'warn') return <AlertTriangle className="w-5 h-5" style={{ color: CLAY.bar }} />;
  if (state === 'error') return <XCircle className="w-5 h-5" style={{ color: CLAY.ink }} />;
  return <Circle className="w-5 h-5 text-[#c3d8e0]" />;
}

function Step({ state, title, summary, last, children }: { state: StepState; title: string; summary: string; last?: boolean; children?: ReactNode }) {
  return (
    <li className="relative flex gap-4">
      {!last && <span className="absolute left-[9px] top-7 bottom-0 w-px bg-[#dbe7ec]" aria-hidden />}
      <div className="shrink-0 pt-0.5"><StepIcon state={state} /></div>
      <div className="flex-1 min-w-0 pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h4 className={`text-sm ${state === 'todo' ? 'text-ink-3' : 'text-accent-strong'}`}>{title}</h4>
          <span className="text-xs text-ink-3">{summary}</span>
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

function FileRow({ doc }: { doc: SetupDocument }) {
  const Icon = doc.media_type === 'lecture' ? Film : FileText;
  const stage = doc.stage ? STAGE_LABELS[doc.stage] || doc.stage : 'Starting';
  return (
    <div className="p-3 rounded-xl bg-[#f1f5f7]">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-ink-4 shrink-0" />
        <span className="text-xs text-accent-strong truncate flex-1">{doc.filename}</span>
        <span className={`text-[11px] whitespace-nowrap ${doc.status === 'processing' ? 'text-[#1b566b]' : ''}`}
          style={doc.status === 'failed' ? { color: CLAY.ink } : doc.status === 'pending' ? { color: CLAY.bar } : doc.status === 'processing' ? undefined : { color: '#1b566b' }}>
          {doc.status === 'failed' ? 'Failed' : doc.status === 'pending' ? 'Waiting in queue' : `${stage}${doc.progress ? ` · ${Math.round(doc.progress * 100)}%` : ''}`}
        </span>
      </div>
      {doc.status === 'processing' && (
        <div className="h-1 bg-[#dbe7ec] rounded-full overflow-hidden mt-2">
          <div className="h-full bg-[#2a6f87] rounded-full transition-all duration-500" style={{ width: `${Math.max(Math.round((doc.progress || 0) * 100), 4)}%` }} />
        </div>
      )}
      {doc.status === 'failed' && doc.error_message && (
        <p className="text-[11px] mt-2 line-clamp-3" style={{ color: CLAY.ink }}>{doc.error_message}</p>
      )}
    </div>
  );
}

/** The professor's checklist while a course is set up: upload, process, build the map, invite. */
export default function CourseSetupPanel({ setup, starting, cancelling, onBuild, onCancel, onViewMap, onUpload }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { documents: docs, build, graph } = setup;
  const building = isActiveBuild(build);
  const changed = setup.materials_changed;
  const settled = setup.phase === 'ready' && changed.length === 0 && build?.status !== 'failed';

  if (settled && !expanded && graph) {
    return (
      <section className={`${panel} px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-3`}>
        <CheckCircle2 className="w-5 h-5 text-[#1b566b] shrink-0" />
        <p className="text-sm text-accent-strong flex-1 min-w-[200px]">
          Course ready
          <span className="text-ink-3">
            {' '}· {graph.nodes_count} concepts · {graph.edges_count} connections · map built {timeAgo(graph.created_at)}
            {' '}· {docs.ready} file{docs.ready === 1 ? '' : 's'} · {setup.students} student{setup.students === 1 ? '' : 's'}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className={pillLine} onClick={() => setExpanded(true)}>Setup details <ChevronDown size={14} /></button>
          <button type="button" className={pillLine} onClick={onBuild} disabled={starting}><RefreshCw size={14} /> Rebuild map</button>
        </div>
      </section>
    );
  }

  const waiting = docs.pending + docs.processing;
  const processState: StepState = docs.total === 0 ? 'todo'
    : waiting ? 'active'
      : docs.failed && !docs.ready ? 'error'
        : docs.failed ? 'warn' : 'done';
  const notReady = docs.items.filter(d => d.status !== 'ready');

  const mapState: StepState = building ? 'active'
    : build?.status === 'failed' ? 'error'
      : graph ? (changed.length ? 'warn' : 'done') : 'todo';
  const mapSummary = building
    ? (build!.status === 'queued' ? 'Queued' : `Building · ${build!.percent}%`)
    : build?.status === 'failed' ? 'Build failed'
      : graph ? `${graph.nodes_count} concepts · ${graph.edges_count} connections · built ${timeAgo(graph.created_at)}`
        : build?.status === 'cancelled' ? 'Cancelled'
          : waiting && setup.auto_build ? 'Starts automatically when every file is processed'
            : docs.ready ? 'Ready to build' : 'Waiting for processed files';
  const canBuild = !building && docs.ready > 0;

  return (
    <section className={`${panel} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-[15px] text-accent-strong">Course setup</h3>
          <p className="text-xs text-ink-3 mt-1">{PHASE_TEXT[setup.phase]}</p>
        </div>
        {settled && (
          <button type="button" className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs text-ink-3 hover:text-accent-strong hover:bg-[#f1f5f7] transition-colors cursor-pointer" onClick={() => setExpanded(false)}>Hide <ChevronUp size={14} /></button>
        )}
      </div>

      <ol>
        <Step state={docs.total ? 'done' : 'active'} title="Upload materials"
          summary={docs.total ? `${docs.total} file${docs.total === 1 ? '' : 's'}` : 'Slides, notes or lecture recordings'}>
          {!docs.total && <button type="button" className={pillDark} onClick={onUpload}><Upload size={14} /> Upload files</button>}
        </Step>

        <Step state={processState} title="Process files"
          summary={docs.total ? `${docs.ready} of ${docs.total} ready${docs.failed ? ` · ${docs.failed} failed` : ''}` : ''}>
          {notReady.length > 0 && (
            <div className="space-y-2">
              {notReady.map(doc => <FileRow key={doc.id} doc={doc} />)}
              {docs.failed > 0 && !waiting && (
                <p className="text-[11px] text-ink-3">Delete a failed file and upload it again to retry it.</p>
              )}
            </div>
          )}
        </Step>

        <Step state={mapState} title="Build the concept map" summary={mapSummary}>
          {building && build && (
            <MapBuildProgress build={build} cancelling={cancelling} onCancel={() => onCancel(build.id)} />
          )}

          {!building && build?.status === 'failed' && (
            <div className="space-y-3">
              <p className="text-xs rounded-xl p-3" style={{ background: CLAY.wash, color: CLAY.ink }}>
                {build.error || 'The build stopped with an error.'}
                {graph && ' The previous map is still available to students.'}
              </p>
              <button type="button" className={pillDark} onClick={onBuild} disabled={!canBuild || starting}><RefreshCw size={14} /> Try again</button>
            </div>
          )}

          {!building && build?.status !== 'failed' && graph && changed.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-clay bg-clay-wash rounded-lg p-3">
                {changed.length} file{changed.length === 1 ? ' was' : 's were'} processed after this map was built
                ({changed.slice(0, 3).join(', ')}{changed.length > 3 ? `, +${changed.length - 3} more` : ''}). Rebuild the map to include {changed.length === 1 ? 'it' : 'them'}.
              </p>
              <div className="flex gap-2">
                <button type="button" className={pillDark} onClick={onBuild} disabled={starting}><RefreshCw size={14} /> Rebuild map</button>
                <button type="button" className={pillLine} onClick={onViewMap}><Map size={14} /> View map</button>
              </div>
            </div>
          )}

          {!building && build?.status !== 'failed' && graph && changed.length === 0 && (
            <div className="space-y-3">
              {build?.status === 'complete' && build.graph_id === graph.id && (
                <p className="text-xs text-ink-3">
                  Built in {formatDuration(build.elapsed_s)} from {build.sources} source{build.sources === 1 ? '' : 's'}.
                  {build.unsupported_edges ? ` ${build.unsupported_edges} connection${build.unsupported_edges === 1 ? '' : 's'} had no supporting quote and ${build.unsupported_edges === 1 ? 'is' : 'are'} drawn dashed.` : ''}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" className={pillDark} onClick={onViewMap}><Map size={14} /> View map</button>
                <button type="button" className={pillLine} onClick={onBuild} disabled={starting}><RefreshCw size={14} /> Rebuild</button>
              </div>
            </div>
          )}

          {!building && !graph && build?.status !== 'failed' && (
            canBuild && !waiting ? (
              <div className="space-y-2">
                <button type="button" className={pillDark} onClick={onBuild} disabled={starting}>
                  {starting ? <Loader2 size={14} className="animate-spin" /> : <Map size={14} />} Build concept map
                </button>
                <p className="text-[11px] text-ink-3">
                  The local AI model reads every file, so this takes a few minutes per file. It runs in the background.
                </p>
              </div>
            ) : waiting ? (
              <div className="space-y-2">
                {setup.auto_build && (
                  <p className="text-[11px] text-ink-3">The build starts on its own once the files above are processed.</p>
                )}
                {canBuild && (
                  <button type="button" className={pillLine} onClick={onBuild} disabled={starting}><Map size={14} /> Build now with the ready files</button>
                )}
              </div>
            ) : null
          )}
        </Step>

        <Step last state={setup.students ? 'done' : 'todo'} title="Invite students"
          summary={setup.students ? `${setup.students} student${setup.students === 1 ? '' : 's'} joined` : 'Get an invite code from the Class card'} />
      </ol>
    </section>
  );
}

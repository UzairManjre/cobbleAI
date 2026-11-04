import { Loader2, X } from 'lucide-react';
import type { GraphBuild } from '../../types/graph';
import { BUILD_STEPS, clockTime, formatDuration } from '../../utils/buildProgress';

interface Props {
  build: GraphBuild;
  onCancel?: () => void;
  cancelling?: boolean;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-lg bg-[#050505] border border-[#1A1A1A]">
      <span className="block text-base font-light text-white tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-[#666666]">{label}</span>
    </div>
  );
}

/** A queued or running concept-map build: step, bar, time left, counters and the activity log. */
export default function MapBuildProgress({ build, onCancel, cancelling }: Props) {
  const queued = build.status === 'queued';
  const stopping = build.cancel_requested || cancelling;
  const stepLabel = BUILD_STEPS[build.step - 1] ?? build.message;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3 text-xs mb-2">
          <span className="text-white font-medium">
            {queued ? 'Waiting for a worker to start the build' : `Step ${build.step} of ${build.total_steps} · ${stepLabel}`}
          </span>
          <span className="text-[#888888] tabular-nums">{build.percent}%</span>
        </div>
        <div className="h-2 bg-[#1A1A1A] rounded-full overflow-hidden" role="progressbar" aria-label="Map build progress"
          aria-valuenow={build.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full bg-white transition-all duration-500 ${queued ? 'animate-pulse' : ''}`}
            style={{ width: `${Math.max(build.percent, 3)}%` }} />
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 text-[11px] text-[#888888] mt-2">
          <span>{build.detail || build.message}</span>
          <span className="tabular-nums whitespace-nowrap">
            {build.elapsed_s !== null && `${formatDuration(build.elapsed_s)} elapsed`}
            {build.eta_s !== null && ` · about ${formatDuration(build.eta_s)} left`}
          </span>
        </div>
      </div>

      {queued && build.waiting_for_worker && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 leading-relaxed">
          No worker has started this build yet. Map builds run on the media worker, after any lecture it is processing.
          If nothing is processing, check that it is running:{' '}
          <code className="text-amber-200">celery -A app.core.celery_app worker -Q media --pool=solo -n media@%h</code>
        </p>
      )}

      {!queued && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Sources" value={build.sources} />
          <Stat label="Chunks read" value={build.chunks_total ? `${build.chunks_done}/${build.chunks_total}` : '-'} />
          <Stat label="Concepts" value={build.concepts_found} />
          <Stat label="Links" value={build.relations_found} />
        </div>
      )}

      {build.events.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#666666] mb-2">Activity</p>
          <ol className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {[...build.events].reverse().slice(0, 8).map((event, i) => (
              <li key={`${event.at}-${i}`} className="flex gap-3 text-xs">
                <span className="text-[#555555] tabular-nums shrink-0">{clockTime(event.at)}</span>
                <span className={i === 0 ? 'text-white' : 'text-[#888888]'}>{event.message}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {onCancel && (
        <button onClick={onCancel} disabled={stopping}
          className="flex items-center gap-1.5 text-xs text-[#888888] hover:text-red-400 disabled:opacity-60 disabled:hover:text-[#888888]">
          {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          {stopping ? (queued ? 'Cancelling...' : 'Stopping after the current chunk...') : 'Cancel build'}
        </button>
      )}
    </div>
  );
}

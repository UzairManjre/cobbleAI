import { useEffect, useRef, useState } from 'react';
import { Loader2, Map as MapIcon } from 'lucide-react';
import { graphsApi } from '../../api/graphs';
import type { CourseGraphStatus } from '../../types/graph';
import { BUILD_STEPS, formatDuration } from '../../utils/buildProgress';
import { apiErrorDetail } from '../../utils/apiError';

interface Props {
  courseId: string;
  role: string | null;
  onReady: () => void;
  onBack: () => void;
}

const POLL_MS = 3000;

/** Shown on the map page until the course has a map: build progress, or what has to happen first. */
export default function MapNotReady({ courseId, role, onReady, onBack }: Props) {
  const [status, setStatus] = useState<CourseGraphStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tick, setTick] = useState(0);
  const readyRef = useRef(onReady);
  useEffect(() => { readyRef.current = onReady; });
  const isProfessor = role === 'professor';

  useEffect(() => {
    let cancelled = false;
    graphsApi.getStatus(courseId)
      .then(res => {
        if (cancelled) return;
        setStatus(res.data);
        if (res.data.status === 'ready') readyRef.current();
      })
      .catch(() => { if (!cancelled) setError('Could not check the map status.'); });
    return () => { cancelled = true; };
  }, [courseId, tick]);

  const waiting = status?.status === 'building' || status?.status === 'processing';
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setTick(t => t + 1), POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, status]);

  const startBuild = async () => {
    setStarting(true);
    setError(null);
    try {
      await graphsApi.startBuild(courseId);
      setTick(t => t + 1);
    } catch (err) {
      setError(apiErrorDetail(err, 'Could not start the map build.'));
    } finally {
      setStarting(false);
    }
  };

  const build = status?.status === 'building' ? status.build : undefined;
  const hasFiles = (status?.total_documents ?? 0) > 0;
  let title = 'No Map Yet';
  let text = isProfessor ? 'Upload materials on the Overview tab first.' : 'Your instructor has not added any materials yet.';
  if (build) {
    title = 'Building the Concept Map';
    text = isProfessor
      ? 'This runs in the background, so you can leave this page. The map opens here when it is ready.'
      : 'Your instructor’s materials are being turned into a concept map. It opens here when it is ready.';
  } else if (status?.status === 'processing') {
    title = 'Materials Processing';
    text = isProfessor
      ? 'Your files are still being processed. The map builds automatically when they finish.'
      : 'Your instructor’s materials are still being processed.';
  } else if (hasFiles) {
    text = isProfessor
      ? 'Your files are processed, but the concept map has not been built yet.'
      : 'Your instructor has not built the concept map for this course yet.';
  }
  const busy = Boolean(build) || status?.status === 'processing';
  return (
    <div className="w-full max-w-lg text-left">
      <div className="flex items-center gap-3 text-accent">
        {busy ? <Loader2 size={18} className="animate-spin" /> : <MapIcon size={18} />}
        <span className="annot">{status ? (busy ? 'In progress' : 'Concept map') : 'Checking'}</span>
      </div>
      <h2 className="font-display text-4xl font-medium tracking-[-0.035em] mt-4">{status ? title.toLowerCase() : 'checking the map…'}</h2>
      {status && <p className="text-ink-3 mt-3 leading-relaxed">{text}</p>}

      {build && (
        <div className="mt-8">
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-ink-2">{build.status === 'queued' ? 'Waiting to start' : `Step ${build.step} of ${build.total_steps}: ${BUILD_STEPS[build.step - 1] ?? build.message}`}</span>
            <span className="font-display tabular">{build.percent}%</span>
          </div>
          <div className="h-1.5 bg-sunken-2 rounded-full overflow-hidden mt-2" role="progressbar" aria-valuenow={build.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(build.percent, 3)}%` }} />
          </div>
          <p className="text-sm text-ink-3 mt-3">
            {build.detail || build.message}
            {build.eta_s !== null && ` · about ${formatDuration(build.eta_s)} left`}
          </p>
          {isProfessor && build.waiting_for_worker && (
            <p className="text-sm text-clay mt-2">No worker has started it yet. Check that the media worker is running.</p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-clay mt-4">{error}</p>}

      <div className="flex flex-wrap gap-3 mt-8">
        {isProfessor && status && !build && status.status !== 'processing' && hasFiles && (
          <button onClick={startBuild} disabled={starting} className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-6 font-display text-white hover:bg-accent-strong disabled:opacity-50 cursor-pointer">
            {starting && <Loader2 size={16} className="animate-spin" />} Build the map
          </button>
        )}
        <button onClick={onBack} className="inline-flex h-11 items-center rounded-full border border-line-strong bg-surface px-6 font-display text-ink hover:border-ink cursor-pointer">
          {isProfessor && build ? 'See progress on the overview' : 'Back to course overview'}
        </button>
      </div>
    </div>
  );
}
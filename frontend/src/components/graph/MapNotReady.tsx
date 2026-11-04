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
  let text = isProfessor ? 'Upload materials on the course page first.' : 'Your instructor has not added any materials yet.';
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

  return (
    <div className="bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-10 text-center shadow-[8px_8px_0_#0A0A0A] max-w-md w-full">
      <div className="w-20 h-20 bg-gray-100 border-[3px] border-[#0A0A0A] rounded-full flex items-center justify-center mx-auto mb-6">
        {build || status?.status === 'processing'
          ? <Loader2 size={32} className="text-[#0A0A0A] animate-spin" />
          : <MapIcon size={32} className="text-[#0A0A0A]" />}
      </div>
      <h2 className="text-2xl font-extrabold text-[#0A0A0A] mb-3">{status ? title : 'Checking the map...'}</h2>
      {status && <p className="text-[#0A0A0A]/60 font-bold text-sm mb-6">{text}</p>}

      {build && (
        <div className="text-left mb-6">
          <div className="flex justify-between text-xs font-extrabold text-[#0A0A0A] mb-2">
            <span>{build.status === 'queued' ? 'Waiting to start' : `Step ${build.step} of ${build.total_steps}: ${BUILD_STEPS[build.step - 1] ?? build.message}`}</span>
            <span>{build.percent}%</span>
          </div>
          <div className="h-3 bg-gray-100 border-2 border-[#0A0A0A] rounded-full overflow-hidden">
            <div className="h-full bg-[#FF4D5B] transition-all duration-500" style={{ width: `${Math.max(build.percent, 3)}%` }} />
          </div>
          <p className="text-xs font-bold text-[#0A0A0A]/60 mt-2">
            {build.detail || build.message}
            {build.eta_s !== null && ` · about ${formatDuration(build.eta_s)} left`}
          </p>
          {isProfessor && build.waiting_for_worker && (
            <p className="text-xs font-bold text-amber-700 mt-2">
              No worker has started it yet. Check that the media worker is running.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs font-bold text-red-600 mb-4">{error}</p>}

      <div className="space-y-3">
        {isProfessor && status && !build && status.status !== 'processing' && hasFiles && (
          <button
            onClick={startBuild}
            disabled={starting}
            className="w-full py-3 bg-[#0A0A0A] text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[4px_4px_0_#FF4D5B] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {starting && <Loader2 size={16} className="animate-spin" />} Build the Map
          </button>
        )}
        <button
          onClick={onBack}
          className="w-full py-3 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[4px_4px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] transition-all"
        >
          {isProfessor && build ? 'See Details on the Course Page' : 'Return to Course Detail'}
        </button>
      </div>
    </div>
  );
}

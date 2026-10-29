import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Captions, CaptionsOff, Loader2, AlertTriangle } from 'lucide-react';
import { lecturesApi } from '../../api/lectures';
import type { ExcludedRange, LectureDetail } from '../../api/lectures';
import ChapterList from '../../components/lecture/ChapterList';
import ExclusionEditor from '../../components/lecture/ExclusionEditor';
import TranscriptPanel from '../../components/lecture/TranscriptPanel';
import CourseTutorChat from '../../components/tutor/CourseTutorChat';
import ConfusionTimeline from '../../components/learner/ConfusionTimeline';
import { markNavigationSeek, useVideoTelemetry } from '../../hooks/useVideoTelemetry';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { analytics } from '../../utils/analytics';
import { formatTimestamp } from '../../utils/format';

type Tab = 'ask' | 'transcript' | 'chapters' | 'confusion' | 'exclusions';

const STAGE_LABELS: Record<string, string> = {
  downloading: 'Preparing the recording',
  transcribing: 'Transcribing speech (on this server)',
  frames: 'Reading slides from the video',
  chapters: 'Writing chapters and notes',
  indexing: 'Making it searchable',
};

export default function LectureView() {
  const { courseId, lectureId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role = useAuthStore(s => s.role);
  const addToast = useToastStore(s => s.addToast);

  const [lecture, setLecture] = useState<LectureDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [captionsUrl, setCaptionsUrl] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [tab, setTab] = useState<Tab>('ask');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<HTMLTrackElement | null>(null);
  const initialSeekDone = useRef<string | undefined>(undefined);
  // The API signs a fresh URL on every load; keep the first one so polling or saving exclusions
  // does not restart playback. It is replaced only when it fails (expired after an hour).
  const [media, setMedia] = useState<{ lectureId?: string; url: string | null }>({ url: null });
  const mediaUrl = media.lectureId === lectureId ? media.url : null;
  const resumeAtRef = useRef<number | null>(null);
  const lastUrlRefreshRef = useRef(0);

  useVideoTelemetry(videoRef, courseId, lectureId, mediaUrl);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!lectureId) return;
    let cancelled = false;
    lecturesApi.get(lectureId)
      .then(res => {
        if (cancelled) return;
        setLecture(res.data);
        setMedia(prev => (prev.lectureId === lectureId && prev.url ? prev : { lectureId, url: res.data.media_url ?? null }));
        setLoadError(null);
      })
      .catch(err => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } }).response?.status;
        setLoadError(status === 404 ? 'This lecture is not available.' : 'Could not load the lecture.');
      });
    return () => { cancelled = true; };
  }, [lectureId, reloadKey]);

  // Keep polling while the recording is still being processed
  const processing = !!lecture && lecture.status !== 'ready' && lecture.status !== 'failed';
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(reload, 5000);
    return () => clearInterval(timer);
  }, [processing, reload]);

  // Captions are fetched with auth and handed to <track> as a blob URL
  useEffect(() => {
    if (!lectureId || lecture?.status !== 'ready') return;
    let url: string | null = null;
    lecturesApi.captions(lectureId).then(res => {
      url = URL.createObjectURL(new Blob([res.data], { type: 'text/vtt' }));
      setCaptionsUrl(url);
    }).catch(() => setCaptionsUrl(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [lectureId, lecture?.status, reloadKey]); // reloadKey: new captions after exclusions change

  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    markNavigationSeek(video);
    video.currentTime = Math.max(0, seconds);
    setCurrentTime(video.currentTime);
  }, []);

  const onSeekLecture = useCallback((docId: string, seconds: number) => {
    if (docId !== lectureId) return false;
    seek(seconds);
    videoRef.current?.play().catch(() => undefined);
    return true;
  }, [lectureId, seek]);

  const getCurrentTime = useCallback(() => videoRef.current?.currentTime ?? 0, []);

  const onVideoError = () => {
    // Most often the signed URL expired: fetch a fresh one and continue where playback stopped
    if (!lectureId || Date.now() - lastUrlRefreshRef.current < 60_000) return;
    lastUrlRefreshRef.current = Date.now();
    resumeAtRef.current = videoRef.current?.currentTime ?? 0;
    lecturesApi.get(lectureId).then(res => setMedia({ lectureId, url: res.data.media_url ?? null })).catch(() => undefined);
  };

  const onLoadedMetadata = () => {
    if (resumeAtRef.current !== null) {
      const at = resumeAtRef.current;
      resumeAtRef.current = null;
      seek(at);
      return;
    }
    const t = Number(searchParams.get('t'));
    // ?t= applies once to each lecture opened
    if (initialSeekDone.current !== lectureId && Number.isFinite(t) && t > 0) {
      initialSeekDone.current = lectureId;
      seek(t);
    }
  };

  const toggleCaptions = () => {
    const track = trackRef.current?.track;
    if (track) track.mode = captionsOn ? 'hidden' : 'showing';
    setCaptionsOn(!captionsOn);
    analytics.track('video_caption_toggle', { category: 'video', courseId, lectureId, on: !captionsOn, t: getCurrentTime() });
  };

  const downloadTranscript = async () => {
    if (!lectureId || !lecture) return;
    try {
      const res = await lecturesApi.transcript(lectureId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lecture.filename.replace(/\.[^.]+$/, '')}-transcript.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast('Could not download the transcript', 'error');
    }
  };

  const back = () => navigate(`/${role}/courses/${courseId}`);

  if (loadError) {
    return (
      <div className="w-full max-w-5xl mx-auto py-16 text-center text-[#888888]">
        <p className="text-sm mb-4">{loadError}</p>
        <button onClick={back} className="text-white underline text-sm">Back to course</button>
      </div>
    );
  }
  if (!lecture) {
    return <div className="w-full flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-[#888888]" /></div>;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ask', label: 'Ask this lecture' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'chapters', label: 'Chapters & notes' },
    ...(role === 'professor' ? [{ id: 'confusion' as Tab, label: 'Confusion' }, { id: 'exclusions' as Tab, label: 'Exclusions' }] : []),
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-white">
      <div className="flex items-center gap-4">
        <button onClick={back} className="p-2 rounded-xl border border-[#1A1A1A] text-[#888888] hover:text-white" aria-label="Back to course">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-[#888888]">Lecture</p>
          <h1 className="text-xl font-light truncate">{lecture.filename}</h1>
        </div>
        {lecture.duration_sec ? <span className="ml-auto text-xs text-[#888888] font-mono">{formatTimestamp(lecture.duration_sec)}</span> : null}
      </div>

      {lecture.status !== 'ready' && (
        <div className={`rounded-2xl border p-5 flex items-center gap-3 ${lecture.status === 'failed' ? 'border-red-500/30 bg-red-500/5' : 'border-[#1A1A1A] bg-[#0A0A0A]'}`}>
          {lecture.status === 'failed' ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <Loader2 className="w-5 h-5 animate-spin text-blue-400" />}
          <div className="flex-1">
            <p className="text-sm">{lecture.status === 'failed' ? 'Processing failed' : STAGE_LABELS[lecture.stage || ''] || 'Waiting to be processed'}</p>
            {lecture.error_message && <p className="text-xs text-red-300 mt-1">{lecture.error_message}</p>}
            {lecture.status !== 'failed' && (
              <div className="h-1 bg-[#1A1A1A] rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((lecture.progress || 0) * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="relative rounded-2xl overflow-hidden border border-[#1A1A1A] bg-black aspect-video">
            {mediaUrl ? (
              <video
                ref={videoRef}
                src={mediaUrl}
                controls
                preload="metadata"
                className="w-full h-full"
                onLoadedMetadata={onLoadedMetadata}
                onError={onVideoError}
                onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
              >
                {captionsUrl && <track ref={trackRef} kind="captions" srcLang="en" label="English" src={captionsUrl} default />}
              </video>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#666666]">The recording will play here once it has been processed.</div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-[#888888] font-mono">{formatTimestamp(currentTime)}</span>
            <button
              type="button"
              onClick={toggleCaptions}
              disabled={!captionsUrl}
              aria-pressed={captionsOn}
              className="flex items-center gap-1.5 text-xs text-[#CCCCCC] hover:text-white disabled:opacity-40"
            >
              {captionsOn ? <Captions className="w-4 h-4" /> : <CaptionsOff className="w-4 h-4" />}
              Captions {captionsOn ? 'on' : 'off'}
            </button>
          </div>

          {lecture.frames.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#888888] mb-2">Slides shown</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {lecture.frames.map(frame => (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => seek(frame.t)}
                    title={frame.caption || frame.ocr_text || `Slide at ${formatTimestamp(frame.t)}`}
                    className="shrink-0 w-36 rounded-lg overflow-hidden border border-[#1A1A1A] hover:border-[#444444] text-left"
                  >
                    <img src={frame.image_url} alt={frame.caption || `Slide at ${formatTimestamp(frame.t)}`} className="w-full aspect-video object-cover" loading="lazy" />
                    <span className="block px-2 py-1 text-[10px] font-mono text-[#888888]">{formatTimestamp(frame.t)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[#1A1A1A] bg-[#0A0A0A] flex flex-col h-[70vh] min-h-[480px]">
          <div className="flex border-b border-[#1A1A1A] overflow-x-auto" role="tablist">
            {tabs.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? 'border-white text-white' : 'border-transparent text-[#888888] hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {tab === 'ask' && courseId && lectureId && (
              lecture.status === 'ready'
                ? <CourseTutorChat courseId={courseId} lectureId={lectureId} getCurrentTime={getCurrentTime} onSeekLecture={onSeekLecture} />
                : <p className="text-xs text-[#888888] p-4">You can ask about this lecture once it has been processed.</p>
            )}
            {tab === 'transcript' && (
              <TranscriptPanel segments={lecture.transcript.segments} currentTime={currentTime} onSeek={seek} onDownload={downloadTranscript} />
            )}
            {tab === 'chapters' && (
              <div className="h-full overflow-y-auto p-4">
                <ChapterList chapters={lecture.chapters} currentTime={currentTime} onSeek={seek} />
              </div>
            )}
            {tab === 'confusion' && lectureId && (
              <div className="h-full overflow-y-auto">
                <ConfusionTimeline lectureId={lectureId} onSeek={seek} />
              </div>
            )}
            {tab === 'exclusions' && lectureId && (
              <div className="h-full overflow-y-auto">
                <ExclusionEditor
                  lectureId={lectureId}
                  ranges={lecture.excluded_ranges}
                  getCurrentTime={getCurrentTime}
                  onSaved={(ranges: ExcludedRange[]) => { setLecture({ ...lecture, excluded_ranges: ranges }); reload(); }}
                />
              </div>
            )}
          </div>
          {lecture.excluded_count > 0 && role === 'student' && (
            <p className="text-[10px] text-[#666666] px-4 py-2 border-t border-[#1A1A1A]">Some parts of this recording were excluded by your instructor.</p>
          )}
        </div>
      </div>
    </div>
  );
}

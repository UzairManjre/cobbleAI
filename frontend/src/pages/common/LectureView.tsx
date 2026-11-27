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
import { panel, pillLine, featureBg, rise } from '../../components/ui/glass';

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

  const back = () => navigate(`/courses/${courseId}`);

  if (loadError) {
    return (
      <section className={`mt-8 ${panel} p-10 text-center`}>
        <p className="text-sm text-ink-3">{loadError}</p>
        <button type="button" onClick={back} className={`mt-4 ${pillLine}`}>Back to the class</button>
      </section>
    );
  }
  if (!lecture) {
    return (
      <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className={`${panel} aspect-video animate-pulse`} />
        <div className={`${panel} animate-pulse`} />
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ask', label: 'Ask' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'chapters', label: 'Chapters' },
    ...(role === 'professor' ? [{ id: 'confusion' as Tab, label: 'Confusion' }, { id: 'exclusions' as Tab, label: 'Exclusions' }] : []),
  ];
  const title = lecture.filename.replace(/\.[a-z0-9]+$/i, '');
  const duration = lecture.duration_sec || 0;
  // The slide on screen now: the last one shown at or before the playhead
  const activeFrame = [...lecture.frames].reverse().find(f => f.t <= currentTime + 0.5)?.id;
  const chapterNow = lecture.chapters.find(c => currentTime >= c.start && currentTime < c.end);
  const failed = lecture.status === 'failed';

  return (
    <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
      {/* Player, what is playing, and the slides */}
      <section aria-label="Lecture recording" style={rise(1)} className={`${panel} p-3 flex flex-col`}>
        <div className="relative rounded-[16px] overflow-hidden bg-[#0b2733] aspect-video">
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
            <div className="w-full h-full grid place-items-center p-8" style={{ background: featureBg }}>
              <div className="w-full max-w-sm text-white">
                <p className="flex items-center gap-2 text-sm">
                  {failed ? <AlertTriangle size={16} /> : <Loader2 size={16} className="animate-spin" />}
                  {failed ? 'Processing failed' : STAGE_LABELS[lecture.stage || ''] || 'Waiting to be processed'}
                </p>
                {lecture.error_message && <p className="mt-1 text-xs text-white/75">{lecture.error_message}</p>}
                {!failed && (
                  <span className="mt-3 block h-1.5 rounded-full bg-white/20 overflow-hidden">
                    <span className="block h-full rounded-full bg-white transition-all" style={{ width: `${Math.round((lecture.progress || 0) * 100)}%` }} />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-2 pt-4">
          <button type="button" onClick={back} aria-label="Back to the class"
            className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-[#f1f5f7] text-[#0e3445] hover:bg-[#e6eef2] transition-colors cursor-pointer">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] text-[#0e3445] truncate">{title}</h1>
            <p className="text-xs text-ink-3 truncate tabular">
              {chapterNow ? <>Now: <span className="text-[#1b566b]">{chapterNow.title}</span></> : 'Recording'}
              {' · '}{formatTimestamp(currentTime)}{duration ? ` / ${formatTimestamp(duration)}` : ''}
            </p>
          </div>
          <button type="button" onClick={toggleCaptions} disabled={!captionsUrl} aria-pressed={captionsOn}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs transition-colors cursor-pointer disabled:opacity-40 ${captionsOn ? 'bg-[#0e3445] text-white' : 'bg-[#f1f5f7] text-[#0e3445] hover:bg-[#e6eef2]'}`}>
            {captionsOn ? <Captions size={14} /> : <CaptionsOff size={14} />} Captions
          </button>
        </div>

        {lecture.frames.length > 0 && (
          <div className="px-2 pt-4 pb-1 mt-auto">
            <p className="text-xs text-ink-3 mb-2">Slides · click to jump</p>
            <div className="flex gap-2.5 overflow-x-auto pb-1.5">
              {lecture.frames.map(frame => {
                const active = frame.id === activeFrame;
                return (
                  <button key={frame.id} type="button" onClick={() => seek(frame.t)}
                    title={frame.caption || frame.ocr_text || `Slide at ${formatTimestamp(frame.t)}`}
                    className={`shrink-0 w-40 rounded-2xl p-1.5 text-left transition-colors cursor-pointer ${active ? 'bg-[#0e3445]' : 'bg-[#f1f5f7] hover:bg-[#e6eef2]'}`}>
                    <img src={frame.image_url} alt={frame.caption || `Slide at ${formatTimestamp(frame.t)}`} className="w-full aspect-video object-cover rounded-xl bg-white" loading="lazy" />
                    <span className={`block px-1.5 pt-1.5 pb-0.5 text-[11px] tabular ${active ? 'text-white' : 'text-ink-3'}`}>{formatTimestamp(frame.t)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Ask, transcript and chapters, the same height as the player */}
      <section aria-label="About this lecture" style={rise(2)} className={`${panel} flex flex-col min-h-[520px] overflow-hidden`}>
        <div className="shrink-0 p-3 pb-0">
          <div className="flex gap-1 p-1 rounded-full bg-[#f1f5f7] overflow-x-auto" role="tablist">
            {tabs.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`flex-1 h-9 px-3 rounded-full text-sm whitespace-nowrap transition-colors cursor-pointer ${tab === t.id ? 'bg-white text-[#0e3445] shadow-[0_2px_8px_-4px_rgba(14,52,69,0.35)]' : 'text-ink-3 hover:text-[#0e3445]'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0 flex flex-col">
            {tab === 'ask' && courseId && lectureId && (
              lecture.status === 'ready'
                ? <CourseTutorChat courseId={courseId} lectureId={lectureId} getCurrentTime={getCurrentTime} onSeekLecture={onSeekLecture} />
                : <p className="m-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">You can ask about this lecture once it has been processed.</p>
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
        </div>
        {lecture.excluded_count > 0 && role === 'student' && (
          <p className="shrink-0 text-[11px] text-ink-4 px-4 py-2 border-t border-[#e6eef2]">Your professor left some parts of this recording out.</p>
        )}
      </section>
    </div>
  );
}

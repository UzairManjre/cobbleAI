import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { analytics } from '../utils/analytics';

const HEARTBEAT_S = 15; // position samples while playing: which parts were actually watched
const REPLAY_MIN_S = 2; // a backward seek of at least this much counts as a replay

/** Call right before setting currentTime from code (transcript, chapter, citation or heatmap clicks):
 *  that seek is logged as navigation, not as the student rewinding. */
export function markNavigationSeek(video: HTMLVideoElement) {
  video.dataset.navSeek = '1';
}

/**
 * Logs play / pause / seek / replay / speed / caption events for one lecture video.
 * These feed the instructor's confusion heatmap (replays and rewinds per moment).
 */
export function useVideoTelemetry(
  videoRef: RefObject<HTMLVideoElement | null>,
  courseId?: string,
  lectureId?: string,
  mediaUrl?: string | null, // re-attach once the player element mounts
) {
  const lastTimeRef = useRef(0);
  const seekFromRef = useRef<number | null>(null);
  const lastBeatRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !lectureId) return;
    const base = { category: 'video', courseId, lectureId };
    const t = () => Math.round(video.currentTime * 10) / 10;

    const onPlay = () => analytics.track('video_play', { ...base, t: t() });
    const onPause = () => {
      if (!video.seeking && !video.ended) analytics.track('video_pause', { ...base, t: t() });
    };
    const onTimeUpdate = () => {
      if (!video.seeking) lastTimeRef.current = video.currentTime;
      if (!video.paused && video.currentTime - lastBeatRef.current >= HEARTBEAT_S) {
        lastBeatRef.current = video.currentTime;
        analytics.track('video_heartbeat', { ...base, t: t(), rate: video.playbackRate });
      }
    };
    const onSeeking = () => {
      if (seekFromRef.current === null) seekFromRef.current = lastTimeRef.current;
    };
    const onSeeked = () => {
      const from = seekFromRef.current ?? lastTimeRef.current;
      const to = video.currentTime;
      seekFromRef.current = null;
      lastTimeRef.current = to;
      lastBeatRef.current = to;
      const navigation = video.dataset.navSeek === '1';
      delete video.dataset.navSeek;
      if (Math.abs(to - from) < 0.5) return;
      const payload = {
        ...base, from: Math.round(from * 10) / 10, to: Math.round(to * 10) / 10,
        direction: to < from ? 'back' : 'forward', source: navigation ? 'navigation' : 'player',
      };
      analytics.track('video_seek', payload);
      if (!navigation && from - to >= REPLAY_MIN_S) analytics.track('video_replay', payload);
    };
    const onRate = () => analytics.track('video_rate', { ...base, t: t(), rate: video.playbackRate });
    const onEnded = () => analytics.track('video_ended', { ...base, t: t() });

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ratechange', onRate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ratechange', onRate);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoRef, courseId, lectureId, mediaUrl]);
}

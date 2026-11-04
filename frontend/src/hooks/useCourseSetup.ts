import { useCallback, useEffect, useRef, useState } from 'react';
import { graphsApi } from '../api/graphs';
import type { CourseSetup, GraphBuild } from '../types/graph';
import { isActiveBuild } from '../utils/buildProgress';

const ACTIVE_POLL_MS = 2500;

/**
 * Course setup status for the professor: each file's processing and the concept-map build.
 * Polls while anything is processing or building, and stops when everything is settled.
 */
export function useCourseSetup(courseId: string | undefined, enabled: boolean, onBuildFinished?: (build: GraphBuild) => void) {
  const [setup, setSetup] = useState<CourseSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const previousBuild = useRef<GraphBuild | null>(null);
  const finishedRef = useRef(onBuildFinished);
  useEffect(() => { finishedRef.current = onBuildFinished; });

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!courseId || !enabled) return;
    let cancelled = false;
    graphsApi.getSetup(courseId)
      .then(res => {
        if (cancelled) return;
        const build = res.data.build;
        const before = previousBuild.current;
        if (before && build && before.id === build.id && isActiveBuild(before) && !isActiveBuild(build)) {
          finishedRef.current?.(build);
        }
        previousBuild.current = build;
        setSetup(res.data);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the setup status');
      });
    return () => { cancelled = true; };
  }, [courseId, enabled, tick]);

  const active = !!setup && (isActiveBuild(setup.build) || setup.documents.pending + setup.documents.processing > 0);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(refresh, ACTIVE_POLL_MS);
    return () => clearTimeout(timer);
  }, [active, setup, refresh]);

  return { setup, error, active, refresh };
}

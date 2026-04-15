/**
 * Analytics SDK — Client-side event tracking and auto-trackers.
 *
 * High cohesion: all analytics logic in one module.
 * Loose coupling: pages/components call track() — no backend details leak in.
 *
 * Usage:
 *   import { analytics } from '@/utils/analytics';
 *   analytics.track('node_visited', { nodeId: 'abc', visitOrder: 3 });
 */

// ── Types ───────────────────────────────────────────────────────────────

type EventPayload = Record<string, unknown>;

// ── Core Tracker ────────────────────────────────────────────────────────

class AnalyticsTracker {
  private queue: Array<{ event: string; payload: EventPayload; ts: number }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;

  /**
   * Track a single event.
   * Events are batched and flushed every 2 seconds to avoid excessive requests.
   */
  track(eventType: string, payload: EventPayload = {}): void {
    if (!this.enabled) return;

    this.queue.push({
      event: eventType,
      payload: { ...payload, timestamp: new Date().toISOString() },
      ts: Date.now(),
    });

    // Flush immediately if queue reaches threshold, otherwise batch
    if (this.queue.length >= 10) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 2000);
    }
  }

  /** Send queued events to the backend. */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = [...this.queue];
    this.queue = [];

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Fire individual events (backend handles them async, fire-and-forget)
      // We use the beacon API for reliability on page unload
      for (const item of batch) {
        // Use fetch with keepalive for reliable delivery
        fetch('http://127.0.0.1:8000/api/analytics/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            event_type: item.event,
            payload: item.payload,
          }),
          keepalive: true,
        }).catch(() => {
          // Silently fail — analytics should never break the app
        });
      }
    } catch {
      // Never throw
    }
  }

  /** Flush immediately (call before page unload). */
  flushSync(): void {
    this.flush();
  }

  /** Enable/disable tracking (useful for testing or opt-out). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// ── Auto-Trackers ───────────────────────────────────────────────────────

/**
 * Track page views via React Router.
 * Call once in App.tsx or a dedicated hook.
 */
export function trackPageViews(): void {
  // This is a no-op placeholder — actual page view tracking
  // is done in the PageViewTracker component that wraps routes.
}

/**
 * Track API errors via axios interceptor.
 * Call once during app initialization.
 */
export function trackApiErrors(axiosInstance: { interceptors: { response: { use: (onFulfilled: any, onRejected: any) => void } } }): void {
  axiosInstance.interceptors.response.use(
    (response: any) => response,
    (error: any) => {
      const status = error.response?.status;
      const url = error.config?.url;
      const method = error.config?.method;

      if (status && status >= 400) {
        analytics.track('api_error', {
          endpoint: url,
          method,
          status_code: status,
          error_message: error.response?.data?.detail || error.message,
        });
      }

      return Promise.reject(error);
    }
  );
}

// ── Singleton ────────────────────────────────────────────────────────────

export const analytics = new AnalyticsTracker();

// Flush on page unload
window.addEventListener('beforeunload', () => {
  analytics.flushSync();
});

// ── React Hooks ──────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook: track node dwell time.
 * Starts a timer when nodeId changes, fires event when component unmounts or nodeId changes.
 */
export function useNodeDwellTime(nodeId: string, extra: Record<string, unknown> = {}) {
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, [nodeId]);

  useEffect(() => {
    return () => {
      const dwellTimeMs = Date.now() - startTimeRef.current;
      analytics.track('node_dwell', {
        nodeId,
        dwellTimeMs,
        ...extra,
      });
    };
  }, [nodeId, extra]);
}

/**
 * Hook: track session lifecycle (start/end).
 * Fires session_started on mount, session_ended on unmount.
 */
export function useSessionTracker(sessionId: string | null, extra: Record<string, unknown> = {}) {
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!sessionId) return;

    startTimeRef.current = Date.now();
    analytics.track('session_started', {
      sessionId,
      entryPoint: 'study_mode',
      ...extra,
    });

    return () => {
      const durationMs = Date.now() - startTimeRef.current;
      analytics.track('session_ended', {
        sessionId,
        durationMs,
        reason: 'navigate_away',
      });
    };
  }, [sessionId, extra]);
}

/**
 * Hook: track page views for React Router.
 * Fires page_view event on every route change.
 */
export function usePageViewTracker(pathname: string, extra: Record<string, unknown> = {}) {
  useEffect(() => {
    if (pathname) {
      analytics.track('page_view', {
        path: pathname,
        ...extra,
      });
    }
  }, [pathname, extra]);
}

/**
 * Hook: track component mount time (generic dwell timer).
 */
export function useComponentDwellTime(eventName: string, payload: Record<string, unknown> = {}) {
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    return () => {
      const dwellTimeMs = Date.now() - startTimeRef.current;
      analytics.track(eventName, { dwellTimeMs, ...payload });
    };
  }, [eventName, payload]);
}

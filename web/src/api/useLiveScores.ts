import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import type { Match, ServerMessage, SportCategory } from '@live-scores/shared';
import { useMatchStore } from '../store/matches';
import { ApiRequestError, fetchMatches } from './client';
import { defaultSocketUrl, LiveSocket } from './socket';
import { browserTimeZone, dayOf, useToday } from './time';

/** SPEC §7 client rules. */
export const SILENCE_FALLBACK_MS = 60_000;
export const DOWN_FALLBACK_MS = 30_000;
export const POLL_INTERVAL_MS = 60_000;
export const HIDDEN_CLOSE_MS = 5 * 60_000;
const FALLBACK_CHECK_MS = 5_000;

export interface LiveScores {
  matches: Match[];
  isLoading: boolean;
  error: ApiRequestError | null;
  /** True while REST polling stands in for the WebSocket. */
  polling: boolean;
  timeZone: string;
}

/**
 * Today's matches of a category: a REST snapshot through TanStack Query, then WebSocket
 * patches merged into the store by id. Falls back to polling when the socket is silent.
 */
export function useLiveScores(category: SportCategory, socketUrl?: string): LiveScores {
  const timeZone = useMemo(browserTimeZone, []);
  const date = useToday(timeZone);
  const [polling, setPolling] = useState(false);
  const socketRef = useRef<LiveSocket | null>(null);
  const categoryRef = useRef(category);
  categoryRef.current = category;

  useEffect(() => {
    const store = useMatchStore.getState();
    const onMessage = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'snapshot':
          if (msg.category === categoryRef.current)
            store.replaceCategory(msg.category, msg.matches);
          break;
        case 'patch':
          store.mergeMatches(msg.matches, msg.ts);
          break;
        case 'counts':
          store.setCounts(msg.counts);
          break;
        case 'status':
          store.setUpstream(msg.upstream);
          break;
      }
    };
    const updateConnection = () =>
      store.setConnection(
        !navigator.onLine ? 'offline' : socket.state === 'open' ? 'connected' : 'reconnecting',
      );

    const socket = new LiveSocket({
      url: socketUrl ?? defaultSocketUrl(),
      onMessage,
      onStateChange: updateConnection,
    });
    socketRef.current = socket;
    socket.subscribe(categoryRef.current);
    socket.open();
    updateConnection();

    const checkFallback = () => {
      const now = Date.now();
      const silent = socket.state === 'open' && now - socket.lastMessageAt > SILENCE_FALLBACK_MS;
      const down = socket.downSince !== null && now - socket.downSince > DOWN_FALLBACK_MS;
      setPolling(silent || down);
    };
    const fallbackTimer = setInterval(checkFallback, FALLBACK_CHECK_MS);

    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      clearTimeout(hiddenTimer);
      if (document.hidden) {
        hiddenTimer = setTimeout(() => socket.close(), HIDDEN_CLOSE_MS);
      } else {
        socket.open(); // no-op if still open; otherwise reconnects and gets a fresh snapshot
      }
    };

    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(fallbackTimer);
      clearTimeout(hiddenTimer);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.close();
      socketRef.current = null;
    };
  }, [socketUrl]);

  useEffect(() => {
    socketRef.current?.subscribe(category);
  }, [category]);

  const query = useQuery({
    queryKey: ['matches', category, date, timeZone],
    queryFn: () => fetchMatches(category, date, timeZone),
    refetchInterval: polling ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof ApiRequestError && err.isRateLimit) && count < 2,
  });

  useEffect(() => {
    if (query.data) useMatchStore.getState().replaceCategory(category, query.data);
  }, [query.data, category]);

  const matches = useMatchStore(
    useShallow((s) =>
      Object.values(s.byId).filter(
        (m) => m.category === category && dayOf(m.startTime, timeZone) === date,
      ),
    ),
  );

  const error = query.error instanceof ApiRequestError ? query.error : null;
  return {
    matches,
    isLoading: query.isPending && matches.length === 0,
    error: matches.length === 0 ? error : null,
    polling,
    timeZone,
  };
}

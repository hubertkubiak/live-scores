import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Server, WebSocket as MockWebSocket } from 'mock-socket';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage } from '@live-scores/shared';
import { useMatchStore } from '../store/matches';
import { match } from '../test/fixtures';
import { LiveSocket } from './socket';
import { DOWN_FALLBACK_MS, useLiveScores } from './useLiveScores';

const WS_URL = 'ws://localhost:8787/ws';
const rest = setupServer();

beforeAll(() => {
  rest.listen({ onUnhandledRequest: 'error' });
  vi.stubGlobal('WebSocket', MockWebSocket);
});
afterAll(() => {
  rest.close();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  useMatchStore.setState({ byId: {}, counts: null, connection: 'reconnecting', lastUpdate: null });
});
afterEach(() => rest.resetHandlers());

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function startWsServer() {
  const server = new Server(WS_URL);
  const received: ClientMessage[] = [];
  const sockets: { send(data: string): void; close(): void }[] = [];
  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (data) => received.push(JSON.parse(String(data)) as ClientMessage));
  });
  const send = (msg: ServerMessage) => sockets.at(-1)?.send(JSON.stringify(msg));
  return { server, received, sockets, send };
}

describe('match store', () => {
  it('merges patches by id and ignores older data', () => {
    const { replaceCategory, mergeMatches } = useMatchStore.getState();
    replaceCategory('football', [match('a'), match('b')]);
    mergeMatches([match('a', { home: { name: 'A', score: 3 }, updatedAt: 5 })]);
    mergeMatches([match('a', { home: { name: 'A', score: 1 }, updatedAt: 4 })]);
    const { byId } = useMatchStore.getState();
    expect(byId.a?.home.score).toBe(3);
    expect(Object.keys(byId)).toEqual(['a', 'b']);
  });

  it('a late REST snapshot does not overwrite a newer patch', () => {
    const { replaceCategory, mergeMatches } = useMatchStore.getState();
    mergeMatches([match('a', { home: { name: 'A', score: 2 }, updatedAt: 9 })]);
    replaceCategory('football', [match('a', { updatedAt: 1 })]);
    expect(useMatchStore.getState().byId.a?.home.score).toBe(2);
  });
});

describe('LiveSocket', () => {
  it('subscribes on open and re-subscribes after reconnecting', async () => {
    const ws = startWsServer();
    const messages: ServerMessage[] = [];
    const socket = new LiveSocket({
      url: WS_URL,
      onMessage: (m) => messages.push(m),
      random: () => 0,
    });
    socket.subscribe('tennis');
    socket.open();

    await waitFor(() => expect(ws.received).toEqual([{ type: 'subscribe', category: 'tennis' }]));
    ws.send({ type: 'pong' });
    await waitFor(() => expect(messages).toEqual([{ type: 'pong' }]));

    ws.sockets[0]!.close();
    await waitFor(() => expect(socket.state).toBe('closed'));
    // Backoff with zero jitter: first retry after 800 ms.
    await waitFor(() => expect(ws.received).toHaveLength(2), { timeout: 2000 });
    expect(ws.received[1]).toEqual({ type: 'subscribe', category: 'tennis' });

    socket.close();
    ws.server.stop();
  });
});

describe('useLiveScores', () => {
  it('loads the REST snapshot, then merges WebSocket patches', async () => {
    const kickoff = match('m1', { home: { name: 'Lech', score: 0 } });
    rest.use(http.get('*/api/matches', () => HttpResponse.json([kickoff])));
    const ws = startWsServer();

    const { result, unmount } = renderHook(() => useLiveScores('football', WS_URL), { wrapper });
    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    await waitFor(() => expect(useMatchStore.getState().connection).toBe('connected'));

    act(() =>
      ws.send({
        type: 'patch',
        ts: Date.now(),
        matches: [{ ...kickoff, home: { name: 'Lech', score: 1 }, updatedAt: 2 }],
      }),
    );
    await waitFor(() => expect(result.current.matches[0]?.home.score).toBe(1));

    act(() =>
      ws.send({
        type: 'counts',
        counts: { football: 1, tennis: 0, basketball: 0, hockey: 0, other: 0 },
      }),
    );
    await waitFor(() => expect(useMatchStore.getState().counts?.football).toBe(1));

    unmount();
    ws.server.stop();
  });

  it('falls back to polling when the socket has been down for over 30 s', async () => {
    rest.use(http.get('*/api/matches', () => HttpResponse.json([])));
    vi.useFakeTimers({
      toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'],
    });
    // No WebSocket server at this URL: every connection attempt fails.
    const { result, unmount } = renderHook(() => useLiveScores('football', 'ws://localhost:9/ws'), {
      wrapper,
    });
    expect(result.current.polling).toBe(false);
    expect(useMatchStore.getState().connection).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWN_FALLBACK_MS + 6_000);
    });
    expect(result.current.polling).toBe(true);
    unmount();
    vi.useRealTimers();
  });
});

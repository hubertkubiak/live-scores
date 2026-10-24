import type { ClientMessage, ServerMessage, SportCategory } from '@live-scores/shared';

export type SocketState = 'connecting' | 'open' | 'closed';

export interface LiveSocketOptions {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onStateChange?: (state: SocketState) => void;
  heartbeatMs?: number;
  random?: () => number;
}

/** Same schedule as the server: 1, 2, 4… s, capped at 30 s, ±20% jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  return Math.round(Math.min(30_000, base + base * 0.2 * (random() * 2 - 1)));
}

/**
 * Browser WebSocket to the proxy: reconnects with backoff, re-sends the current
 * subscription after every reconnect (the server answers with a fresh snapshot)
 * and sends a heartbeat ping.
 */
export class LiveSocket {
  private ws: WebSocket | undefined;
  private category: SportCategory | undefined;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private stopped = true;
  private _state: SocketState = 'closed';
  /** Time of the last message of any kind, for the "no message for 60 s" fallback. */
  lastMessageAt = 0;
  /** When the socket last stopped being open, or null while open. */
  downSince: number | null = Date.now();

  constructor(private readonly options: LiveSocketOptions) {}

  get state() {
    return this._state;
  }

  open() {
    if (!this.stopped) return;
    this.stopped = false;
    // Time spent deliberately closed (background tab) does not count as an outage.
    this.downSince = Date.now();
    this.connect();
  }

  close() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.teardown();
    this.ws?.close();
    this.ws = undefined;
    this.setState('closed');
  }

  subscribe(category: SportCategory) {
    this.category = category;
    this.send({ type: 'subscribe', category });
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private connect() {
    this.reconnectTimer = undefined;
    this.setState('connecting');
    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      this.setState('open');
      if (this.category) this.send({ type: 'subscribe', category: this.category });
      this.heartbeat = setInterval(
        () => this.send({ type: 'ping' }),
        this.options.heartbeatMs ?? 25_000,
      );
    };
    ws.onmessage = (event: MessageEvent<string>) => {
      this.lastMessageAt = Date.now();
      try {
        this.options.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch {
        // Ignore malformed frames.
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.teardown();
      this.ws = undefined;
      this.setState('closed');
      if (this.stopped) return;
      this.reconnectTimer = setTimeout(
        () => this.connect(),
        backoffDelay(this.attempt++, this.options.random),
      );
    };
  }

  private teardown() {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private setState(state: SocketState) {
    if (state === this._state) return;
    this._state = state;
    if (state === 'open') this.downSince = null;
    else this.downSince ??= Date.now();
    this.options.onStateChange?.(state);
  }
}

export function defaultSocketUrl() {
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

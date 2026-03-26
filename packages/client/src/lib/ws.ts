export type WsMessage = {
  type: string;
  [key: string]: unknown;
};

type WsEventHandler = (message: WsMessage) => void;

function getWsUrl(): string {
  const envUrl = import.meta.env.PUBLIC_WS_URL;
  if (envUrl) return envUrl;

  if (typeof window === 'undefined') return '';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_MULTIPLIER = 2;

export class WsClient {
  private ws: WebSocket | null = null;
  private connectionId = 0; // Incremented on each new connection to detect stale sockets
  private handlers = new Map<string, Set<WsEventHandler>>();
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private authMessage: WsMessage | null = null;
  private onStatusChange: ((connected: boolean, reconnecting: boolean) => void) | null = null;
  private onAuthError: ((message: string) => void) | null = null;

  setStatusCallback(cb: (connected: boolean, reconnecting: boolean) => void) {
    this.onStatusChange = cb;
  }

  setAuthErrorCallback(cb: (message: string) => void) {
    this.onAuthError = cb;
  }

  connect(authMessage: WsMessage) {
    this.authMessage = authMessage;
    this.shouldReconnect = true;
    // Cancel any pending reconnect timer to avoid a stale timer
    // firing later and dropping a healthy socket
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectDelay = INITIAL_RECONNECT_DELAY;
    this.doConnect();
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStatusChange?.(false, false);
  }

  on(type: string, handler: WsEventHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  send(message: WsMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private doConnect() {
    // Detach the old socket so its onclose won't trigger stale reconnects
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    const url = getWsUrl();
    if (!url) return;

    // Capture a generation id so callbacks from stale sockets are ignored
    const myId = ++this.connectionId;

    this.onStatusChange?.(false, this.reconnectDelay > INITIAL_RECONNECT_DELAY);

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      if (this.connectionId !== myId) return;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      if (this.authMessage) {
        this.send(this.authMessage);
      }
    };

    socket.onmessage = (event) => {
      if (this.connectionId !== myId) return;
      try {
        const message = JSON.parse(event.data as string) as WsMessage;

        if (message.type === 'auth_ok') {
          this.onStatusChange?.(true, false);
        }

        if (message.type === 'auth_error') {
          this.shouldReconnect = false;
          this.onStatusChange?.(false, false);
          this.onAuthError?.(String(message.message || 'Authentication failed'));
          this.dispatchToHandlers(message);
          return;
        }

        if (message.type === 'pong') {
          return;
        }

        this.dispatchToHandlers(message);
      } catch {
        // Ignore invalid JSON
      }
    };

    socket.onclose = () => {
      if (this.connectionId !== myId) return;
      this.onStatusChange?.(false, this.shouldReconnect);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      // onclose will be called after onerror
    };
  }

  private dispatchToHandlers(message: WsMessage) {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(message);
      }
    }
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler(message);
      }
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    this.onStatusChange?.(false, true);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * RECONNECT_MULTIPLIER,
      MAX_RECONNECT_DELAY,
    );
  }
}

export const wsClient = new WsClient();

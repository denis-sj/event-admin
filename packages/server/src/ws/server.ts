import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { handleMessage } from './handlers.js';

export interface WSClient extends WebSocket {
  isAlive: boolean;
  role?: 'ORGANIZER' | 'JURY';
  eventId?: string;
  organizerId?: string;
  juryMemberId?: string;
}

export const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WSClient, _req: IncomingMessage) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMessage(ws, message);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    // Handle disconnection
  });
});

// Setup ping/pong to detect dead connections
const interval = setInterval(() => {
  wss.clients.forEach((client) => {
    const ws = client as WSClient;
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

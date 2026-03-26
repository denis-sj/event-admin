import { wss, type WSClient } from './server.js';
import { WebSocket } from 'ws';

export class Broadcaster {
  static broadcastToEvent(eventId: string, type: string, payload: unknown) {
    const message = JSON.stringify({ type, payload });

    wss.clients.forEach((client) => {
      const ws = client as WSClient;
      if (ws.readyState === WebSocket.OPEN && ws.eventId === eventId) {
        ws.send(message);
      }
    });
  }

  static broadcastToJury(eventId: string, type: string, payload: unknown) {
    const message = JSON.stringify({ type, payload });

    wss.clients.forEach((client) => {
      const ws = client as WSClient;
      if (ws.readyState === WebSocket.OPEN && ws.eventId === eventId && ws.role === 'JURY') {
        ws.send(message);
      }
    });
  }

  static broadcastToOrganizer(eventId: string, organizerId: string, type: string, payload: unknown) {
    const message = JSON.stringify({ type, payload });

    wss.clients.forEach((client) => {
      const ws = client as WSClient;
      if (
        ws.readyState === WebSocket.OPEN &&
        ws.role === 'ORGANIZER' &&
        ws.eventId === eventId &&
        ws.organizerId === organizerId
      ) {
        ws.send(message);
      }
    });
  }
}

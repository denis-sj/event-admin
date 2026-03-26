import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { Broadcaster } from '../broadcaster.js';
import { wss, type WSClient } from '../server.js';

vi.mock('../server.js', () => ({
  wss: {
    clients: new Set(),
  },
}));

function createClient(overrides: Partial<WSClient> = {}): WSClient {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    ...overrides,
  } as unknown as WSClient;
}

describe('Broadcaster', () => {
  beforeEach(() => {
    (wss.clients as Set<WSClient>).clear();
  });

  describe('broadcastToOrganizer', () => {
    it('should send only to organizer matching both eventId and organizerId', () => {
      const target = createClient({
        role: 'ORGANIZER',
        eventId: 'evt-1',
        organizerId: 'org-1',
      });
      const wrongEvent = createClient({
        role: 'ORGANIZER',
        eventId: 'evt-2',
        organizerId: 'org-1',
      });
      const wrongOrganizer = createClient({
        role: 'ORGANIZER',
        eventId: 'evt-1',
        organizerId: 'org-2',
      });
      const juryClient = createClient({
        role: 'JURY',
        eventId: 'evt-1',
      });

      (wss.clients as Set<WSClient>).add(target);
      (wss.clients as Set<WSClient>).add(wrongEvent);
      (wss.clients as Set<WSClient>).add(wrongOrganizer);
      (wss.clients as Set<WSClient>).add(juryClient);

      Broadcaster.broadcastToOrganizer('evt-1', 'org-1', 'update', { foo: 'bar' });

      expect(target.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'update', payload: { foo: 'bar' } }),
      );
      expect(wrongEvent.send).not.toHaveBeenCalled();
      expect(wrongOrganizer.send).not.toHaveBeenCalled();
      expect(juryClient.send).not.toHaveBeenCalled();
    });

    it('should not send to closed connections', () => {
      const closed = createClient({
        role: 'ORGANIZER',
        eventId: 'evt-1',
        organizerId: 'org-1',
        readyState: WebSocket.CLOSED,
      } as Partial<WSClient>);

      (wss.clients as Set<WSClient>).add(closed);

      Broadcaster.broadcastToOrganizer('evt-1', 'org-1', 'update', {});

      expect(closed.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastToJury', () => {
    it('should send only to jury members in the specified event', () => {
      const juryTarget = createClient({
        role: 'JURY',
        eventId: 'evt-1',
      });
      const juryOtherEvent = createClient({
        role: 'JURY',
        eventId: 'evt-2',
      });
      const organizer = createClient({
        role: 'ORGANIZER',
        eventId: 'evt-1',
        organizerId: 'org-1',
      });

      (wss.clients as Set<WSClient>).add(juryTarget);
      (wss.clients as Set<WSClient>).add(juryOtherEvent);
      (wss.clients as Set<WSClient>).add(organizer);

      Broadcaster.broadcastToJury('evt-1', 'scores', { score: 10 });

      expect(juryTarget.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'scores', payload: { score: 10 } }),
      );
      expect(juryOtherEvent.send).not.toHaveBeenCalled();
      expect(organizer.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastToEvent', () => {
    it('should send to all clients in the specified event', () => {
      const jury = createClient({ role: 'JURY', eventId: 'evt-1' });
      const organizer = createClient({
        role: 'ORGANIZER',
        eventId: 'evt-1',
        organizerId: 'org-1',
      });
      const other = createClient({ role: 'JURY', eventId: 'evt-2' });

      (wss.clients as Set<WSClient>).add(jury);
      (wss.clients as Set<WSClient>).add(organizer);
      (wss.clients as Set<WSClient>).add(other);

      Broadcaster.broadcastToEvent('evt-1', 'notification', { text: 'hello' });

      expect(jury.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'notification', payload: { text: 'hello' } }),
      );
      expect(organizer.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'notification', payload: { text: 'hello' } }),
      );
      expect(other.send).not.toHaveBeenCalled();
    });
  });
});

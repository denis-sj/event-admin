import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { handleMessage } from '../handlers.js';
import type { WSClient } from '../server.js';

vi.mock('../../config.js', () => ({
  config: { JWT_SECRET: 'test_secret' },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

vi.mock('../../prisma.js', () => import('../../__mocks__/prisma.js'));

function createMockWs(): WSClient {
  return {
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WSClient;
}

describe('WS handleMessage', () => {
  let ws: WSClient;

  beforeEach(() => {
    ws = createMockWs();
    vi.clearAllMocks();
  });

  describe('missing fields', () => {
    it('should close if token is missing', async () => {
      await handleMessage(ws, { type: 'auth', role: 'organizer' });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Missing token or role' }),
      );
      expect(ws.close).toHaveBeenCalled();
    });

    it('should close if role is missing', async () => {
      await handleMessage(ws, { type: 'auth', token: 'tok' });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Missing token or role' }),
      );
      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe('organizer auth', () => {
    const validJwt = {
      sub: 'org-1',
      organizerId: 'org-1',
      role: 'organizer',
    };

    it('should reject if eventId is missing', async () => {
      await handleMessage(ws, { type: 'auth', role: 'organizer', token: 'tok' });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Missing eventId for organizer' }),
      );
      expect(ws.close).toHaveBeenCalled();
      expect(ws.role).toBeUndefined();
    });

    it('should reject if JWT role is not organizer', async () => {
      vi.mocked(jwt.verify).mockReturnValue({
        sub: 'org-1',
        organizerId: 'org-1',
        role: 'jury',
      } as never);

      await handleMessage(ws, {
        type: 'auth',
        role: 'organizer',
        token: 'tok',
        eventId: 'evt-1',
      });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Authentication failed' }),
      );
      expect(ws.close).toHaveBeenCalled();
      expect(ws.role).toBeUndefined();
    });

    it('should reject if event does not exist', async () => {
      vi.mocked(jwt.verify).mockReturnValue(validJwt as never);
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      await handleMessage(ws, {
        type: 'auth',
        role: 'organizer',
        token: 'tok',
        eventId: 'evt-missing',
      });

      expect(prisma.event.findUnique).toHaveBeenCalledWith({
        where: { id: 'evt-missing' },
        select: { organizerId: true },
      });
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Event not found or access denied' }),
      );
      expect(ws.close).toHaveBeenCalled();
      expect(ws.role).toBeUndefined();
    });

    it('should reject if organizer does not own the event', async () => {
      vi.mocked(jwt.verify).mockReturnValue(validJwt as never);
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'other-organizer',
      } as never);

      await handleMessage(ws, {
        type: 'auth',
        role: 'organizer',
        token: 'tok',
        eventId: 'evt-1',
      });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Event not found or access denied' }),
      );
      expect(ws.close).toHaveBeenCalled();
      expect(ws.role).toBeUndefined();
    });

    it('should authenticate when organizer owns the event', async () => {
      vi.mocked(jwt.verify).mockReturnValue(validJwt as never);
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        organizerId: 'org-1',
      } as never);

      await handleMessage(ws, {
        type: 'auth',
        role: 'organizer',
        token: 'tok',
        eventId: 'evt-1',
      });

      expect(ws.role).toBe('ORGANIZER');
      expect(ws.organizerId).toBe('org-1');
      expect(ws.eventId).toBe('evt-1');
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_ok', eventId: 'evt-1' }),
      );
      expect(ws.close).not.toHaveBeenCalled();
    });
  });

  describe('jury auth', () => {
    it('should reject if jury token not found', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.juryMember.findUnique).mockResolvedValue(null);

      await handleMessage(ws, { type: 'auth', role: 'jury', token: 'bad-tok' });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Authentication failed' }),
      );
      expect(ws.close).toHaveBeenCalled();
    });

    it('should authenticate jury and set firstLogin on first connection', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.juryMember.findUnique).mockResolvedValue({
        id: 'jury-1',
        eventId: 'evt-2',
        firstLogin: null,
      } as never);
      vi.mocked(prisma.juryMember.update).mockResolvedValue({} as never);

      await handleMessage(ws, { type: 'auth', role: 'jury', token: 'jury-tok' });

      expect(ws.role).toBe('JURY');
      expect(ws.juryMemberId).toBe('jury-1');
      expect(ws.eventId).toBe('evt-2');
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_ok', eventId: 'evt-2' }),
      );
      expect(ws.close).not.toHaveBeenCalled();

      const updateCall = vi.mocked(prisma.juryMember.update).mock.calls[0][0];
      expect(updateCall.data).toHaveProperty('firstLogin');
      expect(updateCall.data).toHaveProperty('lastActive');
    });

    it('should not overwrite firstLogin on subsequent connections', async () => {
      const { prisma } = await import('../../prisma.js');
      vi.mocked(prisma.juryMember.findUnique).mockResolvedValue({
        id: 'jury-1',
        eventId: 'evt-2',
        firstLogin: new Date('2025-01-01'),
      } as never);
      vi.mocked(prisma.juryMember.update).mockResolvedValue({} as never);

      await handleMessage(ws, { type: 'auth', role: 'jury', token: 'jury-tok' });

      const updateCall = vi.mocked(prisma.juryMember.update).mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('firstLogin');
      expect(updateCall.data).toHaveProperty('lastActive');
    });
  });

  describe('unknown role', () => {
    it('should reject unknown role', async () => {
      await handleMessage(ws, { type: 'auth', role: 'admin', token: 'tok' });

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auth_error', message: 'Unknown role' }),
      );
      expect(ws.close).toHaveBeenCalled();
    });
  });
});

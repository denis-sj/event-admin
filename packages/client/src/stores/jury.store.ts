import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WsMessage } from '../lib/ws';

// ---------- Types ----------

export interface JuryCriterion {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  sortOrder: number;
}

export interface JuryTeamParticipant {
  id: string;
  name: string;
}

export interface JuryTeamTask {
  id: string;
  title: string;
  description?: string | null;
}

export interface JuryTeamEvaluation {
  id: string;
  status: 'DRAFT' | 'CONFIRMED';
  comment: string | null;
  scores: Array<{ criterionId: string; value: number }>;
}

export interface JuryTeam {
  id: string;
  name: string;
  projectDescription: string | null;
  presentationOrder: number | null;
  participants: JuryTeamParticipant[];
  task: JuryTeamTask | null;
  evaluation: JuryTeamEvaluation | null;
}

export interface JuryEventData {
  id: string;
  title: string;
  description: string;
  date: string;
  logoPath: string | null;
  status: string;
  currentTeamId: string | null;
  scoringTeamId: string | null;
  timerDuration: number;
  criteria: JuryCriterion[];
}

export interface TimerState {
  isRunning: boolean;
  remaining: number;
  duration: number;
}

export interface PendingAction {
  id: string;
  type: 'saveScores' | 'confirmEvaluation';
  teamId: string;
  payload: unknown;
  createdAt: number;
}

// ---------- Store ----------

interface JuryState {
  // Auth
  token: string | null;
  eventId: string | null;
  juryMemberId: string | null;
  juryName: string | null;
  authenticated: boolean;

  // Data
  event: JuryEventData | null;
  teams: JuryTeam[];
  currentTeamId: string | null;
  scoringTeamId: string | null;
  timer: TimerState | null;

  // UI state
  selectedTeamId: string | null;
  loading: boolean;
  error: string | null;

  // Offline queue
  pendingActions: PendingAction[];
  syncing: boolean;

  // Actions
  setToken: (token: string) => void;
  setAuth: (data: { eventId: string; juryMemberId: string; juryName: string }) => void;
  setAuthenticated: (value: boolean) => void;
  setEvent: (event: JuryEventData) => void;
  setTeams: (teams: JuryTeam[]) => void;
  updateTeam: (teamId: string, data: Partial<JuryTeam>) => void;
  setCurrentTeamId: (teamId: string | null) => void;
  setScoringTeamId: (teamId: string | null) => void;
  setTimer: (timer: TimerState | null) => void;
  setSelectedTeamId: (teamId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Offline
  addPendingAction: (action: Omit<PendingAction, 'id' | 'createdAt'>) => void;
  removePendingAction: (id: string) => void;
  setSyncing: (syncing: boolean) => void;

  // Evaluation helpers
  updateTeamEvaluation: (
    teamId: string,
    evaluation: JuryTeamEvaluation,
  ) => void;

  // WS event handlers
  handleWsMessage: (msg: WsMessage) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  token: null,
  eventId: null,
  juryMemberId: null,
  juryName: null,
  authenticated: false,
  event: null,
  teams: [],
  currentTeamId: null,
  scoringTeamId: null,
  timer: null,
  selectedTeamId: null,
  loading: false,
  error: null,
  pendingActions: [],
  syncing: false,
};

export const useJuryStore = create<JuryState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setToken: (token) => {
        localStorage.setItem('jury_token', token);
        set({ token });
      },

      setAuth: ({ eventId, juryMemberId, juryName }) =>
        set({ eventId, juryMemberId, juryName }),

      setAuthenticated: (value) => set({ authenticated: value }),

      setEvent: (event) =>
        set({
          event,
          currentTeamId: event.currentTeamId,
          scoringTeamId: event.scoringTeamId,
        }),

      setTeams: (teams) => set({ teams }),

      updateTeam: (teamId, data) =>
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, ...data } : t,
          ),
        })),

      setCurrentTeamId: (teamId) => set({ currentTeamId: teamId }),

      setScoringTeamId: (teamId) => set({ scoringTeamId: teamId }),

      setTimer: (timer) => set({ timer }),

      setSelectedTeamId: (teamId) => set({ selectedTeamId: teamId }),

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error }),

      addPendingAction: (action) =>
        set((state) => ({
          pendingActions: [
            ...state.pendingActions,
            {
              ...action,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              createdAt: Date.now(),
            },
          ],
        })),

      removePendingAction: (id) =>
        set((state) => ({
          pendingActions: state.pendingActions.filter((a) => a.id !== id),
        })),

      setSyncing: (syncing) => set({ syncing }),

      updateTeamEvaluation: (teamId, evaluation) =>
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, evaluation } : t,
          ),
        })),

      handleWsMessage: (msg) => {
        const state = get();
        switch (msg.type) {
          case 'team:current': {
            // Server sends { team: fullTeamObject | null }
            const payload = msg.payload as { team: { id: string } | null };
            const teamId = payload.team?.id ?? null;
            set({ currentTeamId: teamId });
            // Auto-navigate to the current team when scoring is available
            if (teamId && !state.selectedTeamId) {
              set({ selectedTeamId: teamId });
            }
            break;
          }
          case 'timer:state': {
            // Server sends { duration, remaining, isRunning }
            const payload = msg.payload as TimerState;
            set({ timer: payload });
            break;
          }
          case 'scoring:status': {
            // Server sends { scoringTeamId, isOpen }
            const payload = msg.payload as {
              scoringTeamId: string | null;
              isOpen: boolean;
            };
            set({ scoringTeamId: payload.scoringTeamId });
            break;
          }
          default:
            break;
        }
      },

      reset: () => {
        localStorage.removeItem('jury_token');
        set(initialState);
      },
    }),
    {
      name: 'jury-store',
      partialize: (state) => ({
        token: state.token,
        eventId: state.eventId,
        juryMemberId: state.juryMemberId,
        juryName: state.juryName,
        event: state.event,
        teams: state.teams,
        currentTeamId: state.currentTeamId,
        scoringTeamId: state.scoringTeamId,
        pendingActions: state.pendingActions,
      }),
    },
  ),
);

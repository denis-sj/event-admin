import { useEffect, useCallback, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { wsClient } from '../../lib/ws';
import { juryGet, juryPut, juryPost, ApiError } from '../../lib/api';
import { useJuryStore } from '../../stores/jury.store';
import { useWsStore } from '../../stores/ws.store';
import type {
  JuryEventData,
  JuryTeam,
  PendingAction,
} from '../../stores/jury.store';
import { ConnectionStatus } from './ConnectionStatus';
import { TeamCard } from './TeamCard';
import { Timer } from './Timer';
import { ScoreForm } from './ScoreForm';
import { TeamList } from './TeamList';
import { Spinner } from '../ui';

interface JuryAppProps {
  token?: string;
}

export default function JuryApp({ token }: JuryAppProps) {
  const store = useJuryStore();
  const wsStatus = useWsStore();
  const [view, setView] = useState<'main' | 'teams' | 'score'>('main');
  const syncingRef = useRef(false);
  const initializedRef = useRef(false);

  // Initialize token and load data
  useEffect(() => {
    if (!token) {
      store.setError('Token not provided');
      return;
    }

    store.setToken(token);
    store.setLoading(true);
    store.setError(null);

    loadEventData(token).finally(() => {
      initializedRef.current = true;
    });
  }, [token]);

  // Connect WebSocket after we have eventId
  useEffect(() => {
    if (!store.eventId || !token) return;

    wsClient.setStatusCallback((connected, reconnecting) => {
      wsStatus.setStatus(connected, reconnecting);
    });

    wsClient.setAuthErrorCallback((message) => {
      toast.error(`Auth error: ${message}`);
      store.setAuthenticated(false);
    });

    wsClient.connect({
      type: 'auth',
      role: 'jury',
      token,
    });

    // Listen for WS events
    const unsubs = [
      wsClient.on('team:current', (msg) => store.handleWsMessage(msg)),
      wsClient.on('timer:state', (msg) => store.handleWsMessage(msg)),
      wsClient.on('scoring:status', (msg) => store.handleWsMessage(msg)),
      wsClient.on('auth_ok', () => {
        store.setAuthenticated(true);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      wsClient.disconnect();
    };
  }, [store.eventId, token]);

  // Refresh teams when reconnecting
  const prevConnectedRef = useRef(false);
  useEffect(() => {
    if (wsStatus.connected && !prevConnectedRef.current) {
      // Just came online — refresh teams to get fresh data
      if (token && initializedRef.current) {
        refreshTeams();
      }
    }
    prevConnectedRef.current = wsStatus.connected;
  }, [wsStatus.connected]);

  // Sync pending actions whenever they exist and we're connected
  useEffect(() => {
    if (wsStatus.connected && store.pendingActions.length > 0 && !syncingRef.current) {
      syncPendingActions();
    }
  }, [wsStatus.connected, store.pendingActions.length]);

  async function loadEventData(juryToken: string) {
    try {
      localStorage.setItem('jury_token', juryToken);

      // Load event data — discover endpoint resolves eventId from token
      const event = await juryGet<JuryEventData>(
        'jury/discover',
      );

      store.setEvent(event);
      store.setAuth({
        eventId: event.id,
        juryMemberId: '', // will be set from auth_ok or not needed client-side
        juryName: '',
      });

      // Load teams
      const teams = await juryGet<JuryTeam[]>(
        `jury/events/${event.id}/teams`,
      );
      store.setTeams(teams);
      store.setLoading(false);
    } catch (err) {
      // If we have cached data (persisted event + teams), show it
      const cachedEvent = useJuryStore.getState().event;
      const cachedTeams = useJuryStore.getState().teams;
      if (cachedEvent && cachedTeams.length > 0) {
        // Restore eventId for WS connection attempt
        store.setAuth({
          eventId: cachedEvent.id,
          juryMemberId: useJuryStore.getState().juryMemberId || '',
          juryName: useJuryStore.getState().juryName || '',
        });
        store.setLoading(false);
        toast.error('Offline — showing cached data');
      } else {
        store.setLoading(false);
        store.setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load event data',
        );
      }
    }
  }

  const syncPendingActions = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    store.setSyncing(true);

    const actions = [...store.pendingActions];

    for (const action of actions) {
      try {
        await executePendingAction(action);
        store.removePendingAction(action.id);
      } catch (err) {
        // If it's a SCORING_CLOSED error, remove the action (stale)
        if (err instanceof ApiError && err.code === 'SCORING_CLOSED') {
          store.removePendingAction(action.id);
          toast.error('Scoring closed — some offline scores were not saved');
        } else {
          // Keep in queue for retry
          break;
        }
      }
    }

    syncingRef.current = false;
    store.setSyncing(false);
  }, [store.pendingActions]);

  async function executePendingAction(action: PendingAction) {
    const eventId = store.eventId;
    if (!eventId) return;

    if (action.type === 'saveScores') {
      await juryPut(
        `jury/events/${eventId}/teams/${action.teamId}/scores`,
        action.payload,
      );
    } else if (action.type === 'confirmEvaluation') {
      await juryPost(
        `jury/events/${eventId}/teams/${action.teamId}/confirm`,
      );
    }
  }

  // Save scores (with offline support)
  const saveScores = useCallback(
    async (
      teamId: string,
      scores: Array<{ criterionId: string; value: number }>,
      comment: string | null,
    ) => {
      const payload = { scores, comment };

      // Optimistically update local state
      store.updateTeamEvaluation(teamId, {
        id: '',
        status: 'DRAFT',
        comment,
        scores,
      });

      if (!wsStatus.connected) {
        store.addPendingAction({
          type: 'saveScores',
          teamId,
          payload,
        });
        return;
      }

      try {
        const eventId = store.eventId;
        if (!eventId) return;

        const result = await juryPut<{
          id: string;
          status: string;
          comment: string | null;
          scores: Array<{ criterionId: string; value: number }>;
        }>(`jury/events/${eventId}/teams/${teamId}/scores`, payload);

        store.updateTeamEvaluation(teamId, {
          id: result.id,
          status: result.status as 'DRAFT' | 'CONFIRMED',
          comment: result.comment,
          scores: result.scores,
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'SCORING_CLOSED') {
          toast.error('Scoring is closed for this team');
        } else {
          // Save to offline queue
          store.addPendingAction({
            type: 'saveScores',
            teamId,
            payload,
          });
          toast.error('Connection lost — scores saved locally');
        }
      }
    },
    [wsStatus.connected, store.eventId],
  );

  // Confirm evaluation (with offline support)
  const confirmEvaluation = useCallback(
    async (teamId: string) => {
      // Find the current evaluation to preserve scores in optimistic update
      const team = store.teams.find((t) => t.id === teamId);
      const currentEvaluation = team?.evaluation;

      // Optimistically mark as CONFIRMED to block further edits immediately
      if (currentEvaluation) {
        store.updateTeamEvaluation(teamId, {
          ...currentEvaluation,
          status: 'CONFIRMED',
        });
      }

      if (!wsStatus.connected) {
        store.addPendingAction({
          type: 'confirmEvaluation',
          teamId,
          payload: null,
        });
        toast('Confirmation queued — will be sent when online');
        return;
      }

      try {
        const eventId = store.eventId;
        if (!eventId) return;

        const result = await juryPost<{
          id: string;
          status: string;
          comment: string | null;
          scores: Array<{ criterionId: string; value: number }>;
        }>(`jury/events/${eventId}/teams/${teamId}/confirm`);

        store.updateTeamEvaluation(teamId, {
          id: result.id,
          status: 'CONFIRMED',
          comment: result.comment,
          scores: result.scores,
        });

        toast.success('Evaluation confirmed');
      } catch (err) {
        // Revert optimistic update on failure
        if (currentEvaluation) {
          store.updateTeamEvaluation(teamId, currentEvaluation);
        }
        if (err instanceof ApiError) {
          toast.error(err.message);
        } else {
          // Re-apply optimistic update since we're queuing
          if (currentEvaluation) {
            store.updateTeamEvaluation(teamId, {
              ...currentEvaluation,
              status: 'CONFIRMED',
            });
          }
          store.addPendingAction({
            type: 'confirmEvaluation',
            teamId,
            payload: null,
          });
          toast.error('Connection lost — confirmation queued');
        }
      }
    },
    [wsStatus.connected, store.eventId, store.teams],
  );

  // Refresh teams data
  const refreshTeams = useCallback(async () => {
    const eventId = store.eventId;
    if (!eventId) return;
    try {
      const teams = await juryGet<JuryTeam[]>(
        `jury/events/${eventId}/teams`,
      );
      store.setTeams(teams);
    } catch {
      // Silently fail — use cached data
    }
  }, [store.eventId]);

  // Navigate to score form for a team
  const openScoreForm = useCallback(
    (teamId: string) => {
      store.setSelectedTeamId(teamId);
      setView('score');
    },
    [],
  );

  // --- Render ---

  if (store.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Toaster position="top-center" />
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (store.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Toaster position="top-center" />
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Error</h2>
          <p className="mt-2 text-sm text-gray-500">{store.error}</p>
          <button
            onClick={() => {
              store.setError(null);
              store.setLoading(true);
              if (token) loadEventData(token);
            }}
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentTeam = store.teams.find((t) => t.id === store.currentTeamId);
  const selectedTeam = store.teams.find((t) => t.id === store.selectedTeamId);
  const isScoringOpen = store.scoringTeamId !== null;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-gray-900">
              {store.event?.title || 'Ideathon'}
            </h1>
          </div>
          <ConnectionStatus />
        </div>
        {store.timer && <Timer timer={store.timer} />}
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-lg px-4 pt-4">
        {view === 'main' && (
          <>
            {/* Current presenting team */}
            {currentTeam && (
              <TeamCard
                team={currentTeam}
                isCurrent
                isScoringOpen={isScoringOpen && store.scoringTeamId === currentTeam.id}
                onScore={() => openScoreForm(currentTeam.id)}
              />
            )}

            {!currentTeam && (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
                <p className="text-sm text-gray-500">
                  Waiting for the next presentation...
                </p>
              </div>
            )}

            {/* Quick team list preview */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Teams</h2>
                <button
                  onClick={() => {
                    refreshTeams();
                    setView('teams');
                  }}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  View all
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {store.teams.slice(0, 5).map((team) => (
                  <div
                    key={team.id}
                    onClick={() => openScoreForm(team.id)}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 active:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {team.name}
                      </p>
                    </div>
                    <EvaluationBadge evaluation={team.evaluation} />
                  </div>
                ))}
                {store.teams.length > 5 && (
                  <button
                    onClick={() => setView('teams')}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-center text-sm text-gray-500 active:bg-gray-50"
                  >
                    +{store.teams.length - 5} more teams
                  </button>
                )}
              </div>
            </div>

            {/* Pending actions indicator */}
            {store.pendingActions.length > 0 && (
              <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
                <p className="text-sm text-yellow-800">
                  {store.syncing
                    ? 'Syncing...'
                    : `${store.pendingActions.length} pending action(s) — will sync when online`}
                </p>
              </div>
            )}
          </>
        )}

        {view === 'teams' && (
          <TeamList
            teams={store.teams}
            currentTeamId={store.currentTeamId}
            scoringTeamId={store.scoringTeamId}
            onSelectTeam={openScoreForm}
            onBack={() => setView('main')}
          />
        )}

        {view === 'score' && selectedTeam && store.event && (
          <ScoreForm
            team={selectedTeam}
            criteria={store.event.criteria}
            isScoringOpen={isScoringOpen && store.scoringTeamId === selectedTeam.id}
            onSave={saveScores}
            onConfirm={confirmEvaluation}
            onBack={() => {
              store.setSelectedTeamId(null);
              setView('main');
            }}
          />
        )}
      </main>
    </div>
  );
}

// Small helper component for evaluation status badges
function EvaluationBadge({
  evaluation,
}: {
  evaluation: { status: 'DRAFT' | 'CONFIRMED' } | null;
}) {
  if (!evaluation) {
    return (
      <span className="ml-2 flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
        Not scored
      </span>
    );
  }

  if (evaluation.status === 'CONFIRMED') {
    return (
      <span className="ml-2 flex-shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        Confirmed
      </span>
    );
  }

  return (
    <span className="ml-2 flex-shrink-0 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
      Draft
    </span>
  );
}

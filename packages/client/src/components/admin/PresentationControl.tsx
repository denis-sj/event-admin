import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';
import { apiGet, apiPost, apiPut, apiPatch, ApiError } from '../../lib/api';
import { wsClient, type WsMessage } from '../../lib/ws';
import { useAuthStore } from '../../stores/auth.store';
import { Button, Card, Badge, Spinner } from '../ui';
import type { Event, Team } from '@ideathon/shared';

interface TimerState {
  duration: number;
  remaining: number;
  isRunning: boolean;
}

function SortableTeamItem({
  team,
  isCurrent,
  onSetCurrent,
}: {
  team: Team;
  isCurrent: boolean;
  onSetCurrent: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: team.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        isCurrent ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-400 hover:text-gray-600 touch-none"
        title="Перетащить"
      >
        ⠿
      </button>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-gray-900">{team.name}</span>
        {isCurrent && (
          <Badge variant="success" className="ml-2">
            Выступает
          </Badge>
        )}
      </div>
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={onSetCurrent}>
          Выбрать
        </Button>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Extract typed payload from WS message. Server sends { type, payload: { ... } } */
function wsPayload(msg: WsMessage): Record<string, unknown> {
  return (msg.payload as Record<string, unknown>) ?? {};
}

export function PresentationControl() {
  const { eventId } = useParams();
  const token = useAuthStore((s) => s.token);
  const [event, setEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const wsConnected = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchData = useCallback(async () => {
    try {
      const [ev, ts, timerData] = await Promise.all([
        apiGet<Event>(`organizer/events/${eventId}`),
        apiGet<Team[]>(`organizer/events/${eventId}/teams`),
        apiGet<TimerState | null>(`organizer/events/${eventId}/presentation/timer`),
      ]);
      setEvent(ev);
      const sorted = [...ts].sort((a, b) => (a.presentationOrder ?? 999) - (b.presentationOrder ?? 999));
      setTeams(sorted);
      setTimer(timerData);
    } catch {
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!token || !eventId || wsConnected.current) return;

    wsClient.connect({ type: 'auth', role: 'organizer', token, eventId });
    wsConnected.current = true;

    const unsub1 = wsClient.on('timer:state', (msg) => {
      const p = wsPayload(msg);
      setTimer({
        duration: p.duration as number,
        remaining: p.remaining as number,
        isRunning: p.isRunning as boolean,
      });
    });

    const unsub2 = wsClient.on('team:current', (msg) => {
      const p = wsPayload(msg);
      const team = p.team as { id: string } | null;
      setEvent((prev) => prev ? { ...prev, currentTeamId: team?.id ?? null } : prev);
    });

    const unsub3 = wsClient.on('scoring:status', (msg) => {
      const p = wsPayload(msg);
      setEvent((prev) =>
        prev
          ? { ...prev, scoringTeamId: (p.scoringTeamId as string | null) ?? null }
          : prev,
      );
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      wsClient.disconnect();
      wsConnected.current = false;
    };
  }, [token, eventId]);

  const handleSetCurrent = async (teamId: string | null) => {
    setActionLoading(true);
    try {
      const updated = await apiPost<Event>(`organizer/events/${eventId}/presentation/current`, {
        teamId,
      });
      setEvent(updated);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTimer = async (action: 'start' | 'pause' | 'reset') => {
    try {
      const t = await apiPost<TimerState>(`organizer/events/${eventId}/presentation/timer`, {
        action,
      });
      setTimer(t);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка таймера');
    }
  };

  const handleScoring = async (open: boolean) => {
    setActionLoading(true);
    try {
      await apiPatch(`organizer/events/${eventId}/presentation/scoring`, { open });
      setEvent((prev) =>
        prev
          ? { ...prev, scoringTeamId: open ? prev.currentTeamId : null }
          : prev,
      );
      toast.success(open ? 'Приём оценок открыт' : 'Приём оценок закрыт');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = teams.findIndex((t) => t.id === active.id);
    const newIndex = teams.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(teams, oldIndex, newIndex);
    setTeams(reordered);

    try {
      await apiPut(`organizer/events/${eventId}/presentation/order`, {
        teamIds: reordered.map((t) => t.id),
      });
    } catch {
      toast.error('Ошибка сортировки');
      fetchData();
    }
  };

  if (loading || !event) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const currentTeam = teams.find((t) => t.id === event.currentTeamId);
  const scoringOpen = Boolean(event.scoringTeamId);
  const timerDuration = event.timerDuration;
  const displayTimer = timer ?? { duration: timerDuration, remaining: timerDuration, isRunning: false };
  const timerDanger = displayTimer.remaining <= 30 && displayTimer.remaining > 0;

  return (
    <div>
      <div className="mb-4">
        <Link to={`/events/${eventId}`} className="text-sm text-primary-600 hover:underline">
          ← К мероприятию
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Управление презентацией</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Timer & Scoring */}
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Таймер</h2>
            <div
              className={`text-center text-6xl font-mono font-bold mb-6 ${
                timerDanger ? 'text-red-600' : displayTimer.isRunning ? 'text-green-600' : 'text-gray-900'
              }`}
            >
              {formatTime(displayTimer.remaining)}
            </div>
            <div className="flex justify-center gap-3">
              {!displayTimer.isRunning ? (
                <Button onClick={() => handleTimer('start')}>Старт</Button>
              ) : (
                <Button variant="secondary" onClick={() => handleTimer('pause')}>
                  Пауза
                </Button>
              )}
              <Button variant="secondary" onClick={() => handleTimer('reset')}>
                Сброс
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Текущее выступление</h2>
            {currentTeam ? (
              <div className="mb-4">
                <p className="text-lg font-medium text-gray-900">{currentTeam.name}</p>
                <p className="text-sm text-gray-500">
                  {scoringOpen ? 'Приём оценок открыт' : 'Приём оценок закрыт'}
                </p>
              </div>
            ) : (
              <p className="text-gray-500 mb-4">Команда не выбрана</p>
            )}
            <div className="flex gap-3">
              {currentTeam && !scoringOpen && (
                <Button onClick={() => handleScoring(true)} loading={actionLoading}>
                  Открыть оценку
                </Button>
              )}
              {scoringOpen && (
                <Button variant="danger" onClick={() => handleScoring(false)} loading={actionLoading}>
                  Закрыть оценку
                </Button>
              )}
              {currentTeam && (
                <Button
                  variant="secondary"
                  onClick={() => handleSetCurrent(null)}
                  loading={actionLoading}
                >
                  Снять выступление
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* Team Order */}
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Порядок выступлений</h2>
          {teams.length === 0 ? (
            <p className="text-gray-500">Нет команд</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={teams.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {teams.map((team) => (
                    <SortableTeamItem
                      key={team.id}
                      team={team}
                      isCurrent={team.id === event.currentTeamId}
                      onSetCurrent={() => handleSetCurrent(team.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Card>
      </div>
    </div>
  );
}

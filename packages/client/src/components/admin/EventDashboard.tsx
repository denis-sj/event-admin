import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiGet, apiPatch, ApiError } from '../../lib/api';
import { Button, Card, Badge, Spinner } from '../ui';
import type { Event, EventStatus } from '@ideathon/shared';

type EventFull = Event & {
  _count: { teams: number; criteria: number; tasks: number; juryMembers: number };
};

const statusLabels: Record<EventStatus, string> = {
  DRAFT: 'Черновик',
  ACTIVE: 'Активно',
  SCORING_CLOSED: 'Оценка закрыта',
  COMPLETED: 'Завершено',
};

const statusVariants: Record<EventStatus, 'default' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  SCORING_CLOSED: 'warning',
  COMPLETED: 'info',
};

const nextStatusAction: Partial<Record<EventStatus, { status: EventStatus; label: string }>> = {
  DRAFT: { status: 'ACTIVE', label: 'Начать мероприятие' },
  ACTIVE: { status: 'SCORING_CLOSED', label: 'Закрыть приём оценок' },
  SCORING_CLOSED: { status: 'COMPLETED', label: 'Завершить мероприятие' },
};

const sections = [
  { path: 'criteria', label: 'Критерии оценки', icon: '☰' },
  { path: 'tasks', label: 'Задания', icon: '☐' },
  { path: 'teams', label: 'Команды', icon: '♟' },
  { path: 'import', label: 'Импорт', icon: '⬆' },
  { path: 'jury', label: 'Жюри', icon: '⚖' },
  { path: 'presentation', label: 'Презентация', icon: '▶' },
  { path: 'results', label: 'Результаты', icon: '📊' },
  { path: 'diplomas', label: 'Дипломы', icon: '🎓' },
];

export function EventDashboard() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchEvent = () => {
    apiGet<EventFull>(`organizer/events/${eventId}`)
      .then(setEvent)
      .catch(() => toast.error('Не удалось загрузить мероприятие'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvent();
  }, [eventId]);

  const handleStatusChange = async (newStatus: EventStatus) => {
    setStatusLoading(true);
    try {
      const updated = await apiPatch<EventFull>(`organizer/events/${eventId}/status`, {
        status: newStatus,
      });
      setEvent(updated);
      toast.success(`Статус изменён: ${statusLabels[newStatus]}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ошибка смены статуса';
      toast.error(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  if (loading || !event) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const action = nextStatusAction[event.status];

  return (
    <div>
      <div className="mb-6">
        <Link to="/" className="text-sm text-primary-600 hover:underline">
          ← Все мероприятия
        </Link>
      </div>

      <Card className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {event.logoPath && (
              <img
                src={event.logoPath}
                alt="Logo"
                className="h-16 w-16 rounded-lg object-contain border border-gray-200"
              />
            )}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
                <Badge variant={statusVariants[event.status]}>
                  {statusLabels[event.status]}
                </Badge>
              </div>
              <p className="text-sm text-gray-500">
                {new Date(event.date).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {event.description && (
                <p className="mt-2 text-sm text-gray-600">{event.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/events/${eventId}/edit`)}
            >
              Редактировать
            </Button>
            {action && (
              <Button
                size="sm"
                loading={statusLoading}
                onClick={() => handleStatusChange(action.status)}
              >
                {action.label}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-6 border-t border-gray-100 pt-4 text-sm text-gray-500">
          <span>Команд: {event._count.teams}</span>
          <span>Жюри: {event._count.juryMembers}</span>
          <span>Критериев: {event._count.criteria}</span>
          <span>Заданий: {event._count.tasks}</span>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((s) => (
          <Link key={s.path} to={`/events/${eventId}/${s.path}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer text-center py-8">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="font-medium text-gray-900">{s.label}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

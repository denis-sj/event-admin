import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api';
import { Button, Card, Badge, Spinner } from '../ui';
import type { Event, EventStatus } from '@ideathon/shared';

type EventWithCounts = Event & {
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

export function EventList() {
  const [events, setEvents] = useState<EventWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<EventWithCounts[]>('organizer/events')
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Мероприятия</h1>
        <Link to="events/new">
          <Button>Создать мероприятие</Button>
        </Link>
      </div>

      {events.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500 mb-4">У вас пока нет мероприятий</p>
          <Link to="events/new">
            <Button>Создать первое мероприятие</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link key={event.id} to={`events/${event.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-900 line-clamp-2">
                    {event.title}
                  </h2>
                  <Badge variant={statusVariants[event.status]}>
                    {statusLabels[event.status]}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  {new Date(event.date).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                {event.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{event.description}</p>
                )}
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>{event._count.teams} команд</span>
                  <span>{event._count.juryMembers} жюри</span>
                  <span>{event._count.criteria} критериев</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { apiGet, apiPost, apiPatch, apiUpload, ApiError } from '../../lib/api';
import { Button, Input, Card, Spinner } from '../ui';
import type { Event } from '@ideathon/shared';

interface EventFormData {
  title: string;
  description: string;
  date: string;
  timerDuration: number;
  uniqueTaskAssignment: boolean;
}

export function EventForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(eventId);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EventFormData>({
    defaultValues: {
      title: '',
      description: '',
      date: '',
      timerDuration: 300,
      uniqueTaskAssignment: false,
    },
  });

  useEffect(() => {
    if (!eventId) return;
    apiGet<Event>(`organizer/events/${eventId}`)
      .then((event) => {
        reset({
          title: event.title,
          description: event.description || '',
          date: event.date.slice(0, 16),
          timerDuration: event.timerDuration,
          uniqueTaskAssignment: event.uniqueTaskAssignment,
        });
        if (event.logoPath) {
          setLogoPreview(event.logoPath);
        }
      })
      .catch(() => toast.error('Не удалось загрузить мероприятие'))
      .finally(() => setFetching(false));
  }, [eventId, reset]);

  const onSubmit = async (data: EventFormData) => {
    setLoading(true);
    try {
      const payload = {
        ...data,
        date: new Date(data.date).toISOString(),
        timerDuration: Number(data.timerDuration),
      };

      let event: Event;
      if (isEdit) {
        event = await apiPatch<Event>(`organizer/events/${eventId}`, payload);
      } else {
        event = await apiPost<Event>('organizer/events', payload);
      }

      if (logoFile) {
        const fd = new FormData();
        fd.append('logo', logoFile);
        await apiUpload(`organizer/events/${event.id}/logo`, fd);
      }

      toast.success(isEdit ? 'Мероприятие обновлено' : 'Мероприятие создано');
      navigate(`/events/${event.id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ошибка сохранения';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  if (fetching) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        {isEdit ? 'Редактирование мероприятия' : 'Новое мероприятие'}
      </h1>
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Название"
            {...register('title', { required: 'Введите название' })}
            error={errors.title?.message}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Описание</label>
            <textarea
              {...register('description')}
              rows={4}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <Input
            label="Дата и время"
            type="datetime-local"
            {...register('date', { required: 'Выберите дату' })}
            error={errors.date?.message}
          />

          <Input
            label="Длительность таймера (секунды)"
            type="number"
            {...register('timerDuration', {
              valueAsNumber: true,
              min: { value: 30, message: 'Минимум 30 секунд' },
              max: { value: 3600, message: 'Максимум 3600 секунд' },
            })}
            error={errors.timerDuration?.message}
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="uniqueTaskAssignment"
              {...register('uniqueTaskAssignment')}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="uniqueTaskAssignment" className="text-sm text-gray-700">
              Уникальное назначение заданий (одно задание — одна команда)
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Логотип</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
            />
            {logoPreview && (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="mt-2 h-20 w-20 rounded-lg object-contain border border-gray-200"
              />
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              {isEdit ? 'Сохранить' : 'Создать'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Отмена
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

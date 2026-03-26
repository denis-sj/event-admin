import { useEffect, useState, useCallback } from 'react';
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
import { apiGet, apiPost, apiPatch, apiDelete, apiPut, ApiError } from '../../lib/api';
import { Button, Input, Card, Modal, Spinner } from '../ui';
import type { Criterion, Event } from '@ideathon/shared';

function SortableCriterion({
  criterion,
  locked,
  onEdit,
  onDelete,
}: {
  criterion: Criterion;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: criterion.id,
    disabled: locked,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      {!locked && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-400 hover:text-gray-600 touch-none"
          title="Перетащить"
        >
          ⠿
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900">{criterion.name}</div>
        {criterion.description && (
          <div className="text-sm text-gray-500 truncate">{criterion.description}</div>
        )}
      </div>
      <div className="shrink-0 text-sm text-gray-500">макс. {criterion.maxScore}</div>
      {!locked && (
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Изм.
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}

export function CriteriaManager() {
  const { eventId } = useParams();
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formMax, setFormMax] = useState(10);
  const [saving, setSaving] = useState(false);

  const locked = event?.status !== 'DRAFT';

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchData = useCallback(async () => {
    try {
      const [ev, crit] = await Promise.all([
        apiGet<Event>(`organizer/events/${eventId}`),
        apiGet<Criterion[]>(`organizer/events/${eventId}/criteria`),
      ]);
      setEvent(ev);
      setCriteria(crit);
    } catch {
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAdd = () => {
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setFormMax(10);
    setModalOpen(true);
  };

  const openEdit = (c: Criterion) => {
    setEditingId(c.id);
    setFormName(c.name);
    setFormDesc(c.description || '');
    setFormMax(c.maxScore);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Введите название');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: formName, description: formDesc || null, maxScore: formMax };
      if (editingId) {
        await apiPatch(`organizer/events/${eventId}/criteria/${editingId}`, payload);
      } else {
        await apiPost(`organizer/events/${eventId}/criteria`, payload);
      }
      setModalOpen(false);
      fetchData();
      toast.success(editingId ? 'Критерий обновлён' : 'Критерий добавлен');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить критерий?')) return;
    try {
      await apiDelete(`organizer/events/${eventId}/criteria/${id}`);
      fetchData();
      toast.success('Критерий удалён');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка удаления');
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = criteria.findIndex((c) => c.id === active.id);
    const newIndex = criteria.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(criteria, oldIndex, newIndex);
    setCriteria(reordered);

    try {
      await apiPut(`organizer/events/${eventId}/criteria/order`, {
        criterionIds: reordered.map((c) => c.id),
      });
    } catch {
      toast.error('Ошибка сортировки');
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link to={`/events/${eventId}`} className="text-sm text-primary-600 hover:underline">
          ← К мероприятию
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Критерии оценки</h1>
        {!locked && <Button onClick={openAdd}>Добавить критерий</Button>}
      </div>

      {locked && (
        <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          Мероприятие активно — изменение критериев заблокировано
        </div>
      )}

      {criteria.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500">Критерии ещё не добавлены</p>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={criteria.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {criteria.map((c) => (
                <SortableCriterion
                  key={c.id}
                  criterion={c}
                  locked={locked}
                  onEdit={() => openEdit(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Редактировать критерий' : 'Новый критерий'}>
        <div className="space-y-4">
          <Input
            label="Название"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Описание</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <Input
            label="Максимальный балл"
            type="number"
            value={formMax}
            onChange={(e) => setFormMax(Number(e.target.value))}
            min={1}
            max={100}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button loading={saving} onClick={handleSave}>
              {editingId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

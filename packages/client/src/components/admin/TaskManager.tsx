import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
import { Button, Input, Card, Modal, Badge, Spinner } from '../ui';
import type { Task, Team } from '@ideathon/shared';

type TaskWithTeams = Task & { teams?: { id: string; name: string }[] };

const difficultyLabels: Record<string, string> = {
  LOW: 'Лёгкий',
  MEDIUM: 'Средний',
  HIGH: 'Сложный',
};

const difficultyVariants: Record<string, 'success' | 'warning' | 'danger'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

export function TaskManager() {
  const { eventId } = useParams();
  const [tasks, setTasks] = useState<TaskWithTeams[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDifficulty, setFormDifficulty] = useState('MEDIUM');
  const [assignTeamId, setAssignTeamId] = useState('');
  const [assignTaskId, setAssignTaskId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [t, tm] = await Promise.all([
        apiGet<TaskWithTeams[]>(`organizer/events/${eventId}/tasks`),
        apiGet<Team[]>(`organizer/events/${eventId}/teams`),
      ]);
      setTasks(t);
      setTeams(tm);
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
    setFormTitle('');
    setFormDesc('');
    setFormDifficulty('MEDIUM');
    setModalOpen(true);
  };

  const openEdit = (t: TaskWithTeams) => {
    setEditingId(t.id);
    setFormTitle(t.title);
    setFormDesc(t.description || '');
    setFormDifficulty(t.difficulty);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      toast.error('Введите название');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: formTitle,
        description: formDesc || null,
        difficulty: formDifficulty,
      };
      if (editingId) {
        await apiPatch(`organizer/events/${eventId}/tasks/${editingId}`, payload);
      } else {
        await apiPost(`organizer/events/${eventId}/tasks`, payload);
      }
      setModalOpen(false);
      fetchData();
      toast.success(editingId ? 'Задание обновлено' : 'Задание добавлено');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить задание?')) return;
    try {
      await apiDelete(`organizer/events/${eventId}/tasks/${id}`);
      fetchData();
      toast.success('Задание удалено');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка удаления');
    }
  };

  const openAssign = (taskId: string) => {
    setAssignTaskId(taskId);
    setAssignTeamId('');
    setAssignOpen(true);
  };

  const handleAssign = async () => {
    if (!assignTeamId) {
      toast.error('Выберите команду');
      return;
    }
    setSaving(true);
    try {
      await apiPost(`organizer/events/${eventId}/tasks/assign`, {
        teamId: assignTeamId,
        taskId: assignTaskId,
      });
      setAssignOpen(false);
      fetchData();
      toast.success('Задание назначено');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка назначения');
    } finally {
      setSaving(false);
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
        <h1 className="text-2xl font-bold text-gray-900">Задания</h1>
        <Button onClick={openAdd}>Добавить задание</Button>
      </div>

      {tasks.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500">Задания ещё не добавлены</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900">{task.title}</h3>
                    <Badge variant={difficultyVariants[task.difficulty]}>
                      {difficultyLabels[task.difficulty]}
                    </Badge>
                  </div>
                  {task.description && (
                    <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                  )}
                  {task.teams && task.teams.length > 0 && (
                    <div className="text-sm text-gray-500">
                      Команды: {task.teams.map((t) => t.name).join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => openAssign(task.id)}>
                    Назначить
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(task)}>
                    Изм.
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(task.id)}>
                    ✕
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Редактировать задание' : 'Новое задание'}
      >
        <div className="space-y-4">
          <Input label="Название" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Описание</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Сложность</label>
            <select
              value={formDifficulty}
              onChange={(e) => setFormDifficulty(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="LOW">Лёгкий</option>
              <option value="MEDIUM">Средний</option>
              <option value="HIGH">Сложный</option>
            </select>
          </div>
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

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Назначить задание команде">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Команда</label>
            <select
              value={assignTeamId}
              onChange={(e) => setAssignTeamId(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Выберите команду</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Отмена
            </Button>
            <Button loading={saving} onClick={handleAssign}>
              Назначить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

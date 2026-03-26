import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
import { Button, Input, Card, Modal, Spinner } from '../ui';
import type { Team, Participant } from '@ideathon/shared';

type TeamWithParticipants = Team & { participants: Participant[] };

export function TeamManager() {
  const { eventId } = useParams();
  const [teams, setTeams] = useState<TeamWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [participantModalOpen, setParticipantModalOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await apiGet<TeamWithParticipants[]>(`organizer/events/${eventId}/teams`);
      setTeams(data);
    } catch {
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddTeam = () => {
    setEditingTeamId(null);
    setTeamName('');
    setTeamDesc('');
    setTeamModalOpen(true);
  };

  const openEditTeam = (team: TeamWithParticipants) => {
    setEditingTeamId(team.id);
    setTeamName(team.name);
    setTeamDesc(team.projectDescription || '');
    setTeamModalOpen(true);
  };

  const handleSaveTeam = async () => {
    if (!teamName.trim()) {
      toast.error('Введите название');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: teamName, projectDescription: teamDesc || null };
      if (editingTeamId) {
        await apiPatch(`organizer/events/${eventId}/teams/${editingTeamId}`, payload);
      } else {
        await apiPost(`organizer/events/${eventId}/teams`, payload);
      }
      setTeamModalOpen(false);
      fetchData();
      toast.success(editingTeamId ? 'Команда обновлена' : 'Команда добавлена');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    if (!confirm('Удалить команду? Все данные команды будут удалены.')) return;
    try {
      await apiDelete(`organizer/events/${eventId}/teams/${id}?force=true`);
      fetchData();
      toast.success('Команда удалена');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка удаления');
    }
  };

  const openAddParticipant = (teamId: string) => {
    setActiveTeamId(teamId);
    setEditingParticipantId(null);
    setPName('');
    setPEmail('');
    setParticipantModalOpen(true);
  };

  const openEditParticipant = (teamId: string, p: Participant) => {
    setActiveTeamId(teamId);
    setEditingParticipantId(p.id);
    setPName(p.name);
    setPEmail(p.email || '');
    setParticipantModalOpen(true);
  };

  const handleSaveParticipant = async () => {
    if (!pName.trim()) {
      toast.error('Введите имя');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: pName, email: pEmail || null };
      if (editingParticipantId) {
        await apiPatch(
          `organizer/events/${eventId}/teams/${activeTeamId}/participants/${editingParticipantId}`,
          payload,
        );
      } else {
        await apiPost(`organizer/events/${eventId}/teams/${activeTeamId}/participants`, payload);
      }
      setParticipantModalOpen(false);
      fetchData();
      toast.success(editingParticipantId ? 'Участник обновлён' : 'Участник добавлен');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteParticipant = async (teamId: string, participantId: string) => {
    if (!confirm('Удалить участника?')) return;
    try {
      await apiDelete(
        `organizer/events/${eventId}/teams/${teamId}/participants/${participantId}`,
      );
      fetchData();
      toast.success('Участник удалён');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка удаления');
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
        <h1 className="text-2xl font-bold text-gray-900">Команды</h1>
        <div className="flex gap-2">
          <Link to={`/events/${eventId}/import`}>
            <Button variant="secondary">Импорт</Button>
          </Link>
          <Button onClick={openAddTeam}>Добавить команду</Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500 mb-4">Команды ещё не добавлены</p>
          <Link to={`/events/${eventId}/import`}>
            <Button variant="secondary">Импортировать из файла</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <Card key={team.id}>
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                >
                  <h3 className="font-medium text-gray-900">{team.name}</h3>
                  {team.projectDescription && (
                    <p className="text-sm text-gray-600">{team.projectDescription}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Участников: {team.participants.length}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => openEditTeam(team)}>
                    Изм.
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteTeam(team.id)}>
                    ✕
                  </Button>
                </div>
              </div>

              {expandedTeam === team.id && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Участники</span>
                    <Button size="sm" variant="secondary" onClick={() => openAddParticipant(team.id)}>
                      Добавить
                    </Button>
                  </div>
                  {team.participants.length === 0 ? (
                    <p className="text-sm text-gray-400">Нет участников</p>
                  ) : (
                    <ul className="space-y-2">
                      {team.participants.map((p) => (
                        <li key={p.id} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="text-gray-900">{p.name}</span>
                            {p.email && <span className="text-gray-400 ml-2">{p.email}</span>}
                          </div>
                          <div className="flex gap-1">
                            <button
                              className="text-gray-400 hover:text-gray-600 text-xs"
                              onClick={() => openEditParticipant(team.id, p)}
                            >
                              Изм.
                            </button>
                            <button
                              className="text-gray-400 hover:text-red-600 text-xs"
                              onClick={() => handleDeleteParticipant(team.id, p.id)}
                            >
                              ✕
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        title={editingTeamId ? 'Редактировать команду' : 'Новая команда'}
      >
        <div className="space-y-4">
          <Input label="Название" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Описание проекта</label>
            <textarea
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setTeamModalOpen(false)}>
              Отмена
            </Button>
            <Button loading={saving} onClick={handleSaveTeam}>
              {editingTeamId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={participantModalOpen}
        onClose={() => setParticipantModalOpen(false)}
        title={editingParticipantId ? 'Редактировать участника' : 'Новый участник'}
      >
        <div className="space-y-4">
          <Input label="Имя" value={pName} onChange={(e) => setPName(e.target.value)} />
          <Input label="Email" type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setParticipantModalOpen(false)}>
              Отмена
            </Button>
            <Button loading={saving} onClick={handleSaveParticipant}>
              {editingParticipantId ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

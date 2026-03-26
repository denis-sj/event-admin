import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../../lib/api';
import { Button, Input, Card, Modal, Badge, Spinner } from '../ui';

/** Shape from JuryService.list() — does NOT include token */
interface JuryListItem {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  firstLogin: string | null;
  lastActive: string | null;
  isOnline: boolean;
  confirmedEvaluations: number;
  draftEvaluations: number;
  totalTeams: number;
}

/** Shape from JuryService.create() / regenerateToken() — includes token */
interface JuryWithToken {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  token: string;
  firstLogin: string | null;
  lastActive: string | null;
}

export function JuryManager() {
  const { eventId } = useParams();
  const [juryMembers, setJuryMembers] = useState<JuryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrJuryUrl, setQrJuryUrl] = useState<string | null>(null);
  const [qrJuryName, setQrJuryName] = useState('');
  // After creating a jury member, show their token/link
  const [newTokenModalOpen, setNewTokenModalOpen] = useState(false);
  const [newJuryToken, setNewJuryToken] = useState<string | null>(null);
  const [newJuryName, setNewJuryName] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const members = await apiGet<JuryListItem[]>(`organizer/events/${eventId}/jury`);
      setJuryMembers(members);
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
    setFormEmail('');
    setModalOpen(true);
  };

  const openEdit = (j: JuryListItem) => {
    setEditingId(j.id);
    setFormName(j.name);
    setFormEmail(j.email || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Введите имя');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: formName, email: formEmail || null };
      if (editingId) {
        await apiPatch(`organizer/events/${eventId}/jury/${editingId}`, payload);
        setModalOpen(false);
        fetchData();
        toast.success('Жюри обновлён');
      } else {
        const created = await apiPost<JuryWithToken>(`organizer/events/${eventId}/jury`, payload);
        setModalOpen(false);
        // Show the token to the organizer
        setNewJuryToken(created.token);
        setNewJuryName(created.name);
        setNewTokenModalOpen(true);
        fetchData();
        toast.success('Жюри добавлен');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить члена жюри?')) return;
    try {
      await apiDelete(`organizer/events/${eventId}/jury/${id}`);
      fetchData();
      toast.success('Жюри удалён');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка удаления');
    }
  };

  const handleRegenerateToken = async (id: string) => {
    if (!confirm('Перегенерировать ссылку? Старая перестанет работать.')) return;
    try {
      const updated = await apiPost<JuryWithToken>(`organizer/events/${eventId}/jury/${id}/regenerate-token`);
      setNewJuryToken(updated.token);
      setNewJuryName(updated.name);
      setNewTokenModalOpen(true);
      fetchData();
      toast.success('Ссылка обновлена');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка');
    }
  };

  const showQr = async (juryId: string, name: string) => {
    try {
      const data = await apiGet<{ qrCode: string; url: string }>(`organizer/events/${eventId}/jury/${juryId}/qr`);
      setQrData(data.qrCode);
      setQrJuryUrl(data.url);
      setQrJuryName(name);
      setQrModalOpen(true);
    } catch {
      toast.error('Не удалось получить QR-код');
    }
  };

  const getJuryLink = (token: string) => {
    return `${window.location.origin}/jury/${token}`;
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getJuryLink(token));
    toast.success('Ссылка скопирована');
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
        <h1 className="text-2xl font-bold text-gray-900">Жюри</h1>
        <Button onClick={openAdd}>Добавить жюри</Button>
      </div>

      {juryMembers.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500">Члены жюри ещё не добавлены</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {juryMembers.map((j) => (
            <Card key={j.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900">{j.name}</h3>
                    {j.isOnline ? (
                      <Badge variant="success">Онлайн</Badge>
                    ) : (
                      <Badge>Офлайн</Badge>
                    )}
                  </div>
                  {j.email && <p className="text-sm text-gray-500">{j.email}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    {j.firstLogin ? (
                      <span>
                        Первый вход:{' '}
                        {new Date(j.firstLogin).toLocaleString('ru-RU')}
                      </span>
                    ) : (
                      <span>Ещё не заходил</span>
                    )}
                    <span>
                      Оценил: {j.confirmedEvaluations}/{j.totalTeams}
                    </span>
                    {j.draftEvaluations > 0 && (
                      <span>Черновиков: {j.draftEvaluations}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => showQr(j.id, j.name)}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      QR-код
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const data = await apiGet<{ url: string }>(`organizer/events/${eventId}/jury/${j.id}/qr`);
                          await navigator.clipboard.writeText(data.url);
                          toast.success('Ссылка скопирована');
                        } catch {
                          toast.error('Не удалось получить ссылку');
                        }
                      }}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      Копировать ссылку
                    </button>
                    <button
                      onClick={() => handleRegenerateToken(j.id)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Перегенерировать ссылку
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(j)}>
                    Изм.
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(j.id)}>
                    ✕
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Редактировать жюри' : 'Новый член жюри'}>
        <div className="space-y-4">
          <Input label="Имя" value={formName} onChange={(e) => setFormName(e.target.value)} />
          <Input label="Email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
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

      <Modal open={qrModalOpen} onClose={() => setQrModalOpen(false)} title={`QR-код: ${qrJuryName}`}>
        {qrData && (
          <div className="text-center">
            <img src={qrData} alt="QR code" className="mx-auto w-64 h-64" />
            {qrJuryUrl && (
              <div className="mt-4 flex items-center gap-2">
                <input
                  readOnly
                  value={qrJuryUrl}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(qrJuryUrl);
                    toast.success('Ссылка скопирована');
                  }}
                >
                  Копировать
                </Button>
              </div>
            )}
            <p className="mt-3 text-sm text-gray-500">
              Покажите QR-код или скопируйте ссылку для входа в систему
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={newTokenModalOpen}
        onClose={() => setNewTokenModalOpen(false)}
        title={`Ссылка для ${newJuryName}`}
      >
        {newJuryToken && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Скопируйте ссылку и передайте её члену жюри. Ссылка позволяет войти без регистрации.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={getJuryLink(newJuryToken)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50"
              />
              <Button size="sm" onClick={() => copyLink(newJuryToken!)}>
                Копировать
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

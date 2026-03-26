import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiGet, apiPut, apiPost, apiUpload, apiDownload, apiBlob, ApiError } from '../../lib/api';
import { Button, Input, Card, Spinner } from '../ui';

interface DiplomaSettingsData {
  eventId: string;
  backgroundPath: string | null;
  primaryColor: string;
  textColor: string;
}

interface Diploma {
  id: string;
  teamId: string;
  verificationCode: string;
  filePath: string | null;
  generatedAt: string;
}

export function DiplomaSettings() {
  const { eventId } = useParams();
  const [settings, setSettings] = useState<DiplomaSettingsData | null>(null);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#1a365d');
  const [textColor, setTextColor] = useState('#1a202c');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const s = await apiGet<DiplomaSettingsData>(`organizer/events/${eventId}/diplomas/settings`);
      setSettings(s);
      setPrimaryColor(s.primaryColor);
      setTextColor(s.textColor);
    } catch {
      // Settings might not exist yet, that's ok
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updated = await apiPut<DiplomaSettingsData>(`organizer/events/${eventId}/diplomas/settings`, {
        primaryColor,
        textColor,
      });
      setSettings(updated);
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('background', file);
      const updated = await apiUpload<DiplomaSettingsData>(
        `organizer/events/${eventId}/diplomas/background`,
        fd,
      );
      setSettings(updated);
      toast.success('Фон загружен');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка загрузки');
    }
  };

  const handlePreview = async () => {
    try {
      const blob = await apiBlob(`organizer/events/${eventId}/diplomas/preview`);
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch {
      toast.error('Ошибка генерации предпросмотра');
    }
  };

  const handleGenerate = async () => {
    if (!confirm('Сгенерировать дипломы для всех команд?')) return;
    setGenerating(true);
    try {
      const data = await apiPost<Diploma[]>(`organizer/events/${eventId}/diplomas/generate`);
      setDiplomas(data);
      toast.success(`Сгенерировано ${data.length} дипломов`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Ошибка генерации');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadAll = () => {
    apiDownload(`organizer/events/${eventId}/diplomas/download-all`, 'diplomas.zip');
  };

  const handleDownloadOne = (teamId: string, teamName: string) => {
    apiDownload(`organizer/events/${eventId}/diplomas/${teamId}`, `diploma-${teamName}.pdf`);
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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Дипломы</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Настройки шаблона</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Основной цвет
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border border-gray-300"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Цвет текста</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border border-gray-300"
                  />
                  <Input
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Фоновое изображение
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleBackgroundUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                />
                {settings?.backgroundPath && (
                  <p className="mt-1 text-xs text-gray-400">Фон загружен</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSaveSettings} loading={saving}>
                  Сохранить настройки
                </Button>
                <Button variant="secondary" onClick={handlePreview}>
                  Предпросмотр
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Генерация</h2>
            <div className="space-y-4">
              <Button onClick={handleGenerate} loading={generating}>
                Сгенерировать дипломы
              </Button>
              {diplomas.length > 0 && (
                <div>
                  <Button variant="secondary" onClick={handleDownloadAll} className="mb-4">
                    Скачать все (ZIP)
                  </Button>
                  <div className="space-y-2">
                    {diplomas.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">
                          Код: {d.verificationCode}
                        </span>
                        <button
                          onClick={() => handleDownloadOne(d.teamId, d.verificationCode)}
                          className="text-primary-600 hover:underline"
                        >
                          Скачать PDF
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div>
          {previewUrl && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Предпросмотр</h2>
              <iframe
                src={previewUrl}
                className="w-full h-[600px] rounded-lg border border-gray-200"
                title="Diploma preview"
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiUpload, apiPost, ApiError } from '../../lib/api';
import { Button, Card, Spinner } from '../ui';

interface ColumnMapping {
  teamName: number;
  participantName: number;
  participantEmail?: number | null;
  projectDescription?: number | null;
}

interface ExistingTeam {
  id: string;
  name: string;
}

interface ImportPreview {
  fileId: string;
  headers: string[];
  totalRows: number;
  previewRows: string[][];
  allRows: string[][];
  suggestedMapping: ColumnMapping;
  existingTeams: ExistingTeam[];
}

interface ImportResult {
  teamsCreated: number;
  teamsUpdated: number;
  skippedEntries: string[];
  createdTeams: string[];
  updatedTeams: string[];
}

type Step = 'upload' | 'mapping' | 'result';

/** Resolution for an imported team name: map to existing team ID or "new" */
type TeamResolution = string | 'new';

export function ImportWizard() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    teamName: 0,
    participantName: 1,
    participantEmail: null,
    projectDescription: null,
  });
  const [result, setResult] = useState<ImportResult | null>(null);
  /** Map: lowercased imported team name → existing team ID or "new" */
  const [teamResolutions, setTeamResolutions] = useState<Record<string, TeamResolution>>({});

  /** Cross-reference imported team names (from current mapping) with existing teams */
  const conflictingTeams = useMemo(() => {
    if (!preview || preview.existingTeams.length === 0) return [];
    const existingLower = new Map(
      preview.existingTeams.map((t) => [t.name.toLowerCase(), t]),
    );
    // Extract unique team names from ALL rows using the currently selected column
    const seen = new Set<string>();
    const conflicts: { importedName: string; existingTeam: ExistingTeam }[] = [];
    for (const row of preview.allRows) {
      const raw = (row[mapping.teamName] ?? '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = existingLower.get(key);
      if (existing) {
        conflicts.push({ importedName: raw, existingTeam: existing });
      }
    }
    return conflicts;
  }, [preview, mapping.teamName]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await apiUpload<ImportPreview>(
        `organizer/events/${eventId}/import/preview`,
        fd,
      );
      setPreview(data);
      setMapping(data.suggestedMapping);
      setTeamResolutions({});
      setStep('mapping');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Ошибка загрузки файла');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const hasResolutions = Object.keys(teamResolutions).length > 0;

      const data = await apiPost<ImportResult>(`organizer/events/${eventId}/import/apply`, {
        fileId: preview.fileId,
        mapping,
        ...(hasResolutions ? { teamResolutions } : {}),
      });
      setResult(data);
      setStep('result');
      toast.success('Импорт завершён');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (field: keyof ColumnMapping, value: string) => {
    const num = value === '' ? null : Number(value);
    setMapping((prev) => ({ ...prev, [field]: num }));
    // Clear resolutions when team column changes since they reference the old column's names
    if (field === 'teamName') {
      setTeamResolutions({});
    }
  };

  const updateResolution = (importedNameLower: string, value: string) => {
    setTeamResolutions((prev) => {
      const next = { ...prev };
      if (value === '') {
        // Auto-match (default): remove explicit resolution
        delete next[importedNameLower];
      } else {
        next[importedNameLower] = value;
      }
      return next;
    });
  };

  return (
    <div>
      <div className="mb-4">
        <Link to={`/events/${eventId}`} className="text-sm text-primary-600 hover:underline">
          ← К мероприятию
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Импорт участников</h1>

      {step === 'upload' && (
        <Card className="text-center py-12">
          <p className="text-gray-600 mb-4">
            Загрузите файл CSV или Excel (XLSX) с данными команд и участников
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Поддерживаются выгрузки из Яндекс Форм и любые табличные файлы
          </p>
          {loading ? (
            <Spinner />
          ) : (
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-primary-600 px-6 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
              Выбрать файл
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </Card>
      )}

      {step === 'mapping' && preview && (
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Маппинг колонок</h2>
            <p className="text-sm text-gray-500 mb-4">
              Укажите, какая колонка соответствует какому полю. Найдено {preview.totalRows} строк.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(['teamName', 'participantName', 'participantEmail', 'projectDescription'] as const).map(
                (field) => {
                  const labels: Record<string, string> = {
                    teamName: 'Название команды *',
                    participantName: 'Имя участника *',
                    participantEmail: 'Email участника',
                    projectDescription: 'Описание проекта',
                  };
                  const required = field === 'teamName' || field === 'participantName';
                  return (
                    <div key={field}>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        {labels[field]}
                      </label>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) => updateMapping(field, e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {!required && <option value="">— Не указано —</option>}
                        {preview.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                },
              )}
            </div>
          </Card>

          {preview.existingTeams.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Существующие команды</h2>
              {conflictingTeams.length > 0 ? (
                <>
                  <p className="text-sm text-gray-500 mb-3">
                    Следующие команды из файла совпадают с существующими.
                    По умолчанию данные будут объединены. Вы можете указать другое действие.
                  </p>
                  <div className="space-y-2">
                    {conflictingTeams.map(({ importedName, existingTeam }) => {
                      const key = importedName.toLowerCase();
                      const currentValue = teamResolutions[key] ?? '';
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                        >
                          <span className="text-sm font-medium text-gray-800 min-w-0 truncate flex-1">
                            {importedName}
                          </span>
                          <select
                            value={currentValue}
                            onChange={(e) => updateResolution(key, e.target.value)}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="">
                              Объединить с «{existingTeam.name}»
                            </option>
                            <option value="new">Создать новую команду</option>
                            {preview.existingTeams
                              .filter((t) => t.id !== existingTeam.id)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  Объединить с «{t.name}»
                                </option>
                              ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-3">
                    В мероприятии уже есть команды. Совпадения по названию будут объединены автоматически.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {preview.existingTeams.map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Предпросмотр</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    {preview.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-gray-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.previewRows.map((row, ri) => (
                    <tr key={ri} className="border-b border-gray-100">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-gray-700">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button onClick={handleApply} loading={loading}>
              Импортировать
            </Button>
            <Button variant="secondary" onClick={() => setStep('upload')}>
              Назад
            </Button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Результаты импорта</h2>
          <div className="space-y-2 text-sm mb-6">
            <p className="text-green-700">
              Создано команд: {result.teamsCreated}
              {result.createdTeams.length > 0 && (
                <span className="text-gray-500"> ({result.createdTeams.join(', ')})</span>
              )}
            </p>
            <p className="text-blue-700">
              Обновлено команд: {result.teamsUpdated}
              {result.updatedTeams.length > 0 && (
                <span className="text-gray-500"> ({result.updatedTeams.join(', ')})</span>
              )}
            </p>
            {result.skippedEntries.length > 0 && (
              <div className="mt-4">
                <p className="text-yellow-700 font-medium mb-2">Пропущено:</p>
                <ul className="space-y-1">
                  {result.skippedEntries.map((entry, i) => (
                    <li key={i} className="text-yellow-600">
                      {entry}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button onClick={() => navigate(`/events/${eventId}/teams`)}>
              К командам
            </Button>
            <Button variant="secondary" onClick={() => { setStep('upload'); setResult(null); setPreview(null); }}>
              Импортировать ещё
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

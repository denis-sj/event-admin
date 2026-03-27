import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiGet, apiDownload } from '../../lib/api';
import { Button, Card, Spinner } from '../ui';
import type { Task } from '@ideathon/shared';

interface JuryScore {
  juryMemberId: string;
  juryName: string;
  value: number;
  isAnomaly: boolean;
  comment: string | null;
}

interface CriterionResult {
  criterionId: string;
  criterionName: string;
  avgScore: number;
  juryScores: JuryScore[];
}

interface TeamResult {
  id: string;
  name: string;
  taskId: string | null;
  taskTitle: string | null;
  rank: number;
  totalAvgScore: number;
  criteriaScores: CriterionResult[];
}

interface ResultsData {
  filter: { taskId: string | null };
  teams: TeamResult[];
  anomalyThreshold: number;
}

export function ResultsTable() {
  const { eventId } = useParams();
  const [results, setResults] = useState<ResultsData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTaskId, setFilterTaskId] = useState<string>('');
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const fetchResults = useCallback(async (taskId?: string) => {
    setLoading(true);
    try {
      const query = taskId ? `?taskId=${taskId}` : '';
      const data = await apiGet<ResultsData>(`organizer/events/${eventId}/results${query}`);
      setResults(data);
    } catch {
      toast.error('Ошибка загрузки результатов');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    Promise.all([
      fetchResults(),
      apiGet<Task[]>(`organizer/events/${eventId}/tasks`).then(setTasks),
    ]);
  }, [eventId, fetchResults]);

  const handleFilterChange = (taskId: string) => {
    setFilterTaskId(taskId);
    fetchResults(taskId || undefined);
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    const query = filterTaskId ? `?format=${format}&taskId=${filterTaskId}` : `?format=${format}`;
    apiDownload(
      `organizer/events/${eventId}/results/export${query}`,
      `results.${format}`,
    );
  };

  if (loading && !results) {
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Результаты</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleExport('xlsx')}>
            Экспорт XLSX
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('csv')}>
            Экспорт CSV
          </Button>
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="mb-6">
          <select
            value={filterTaskId}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Все задания</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {!results || results.teams.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-gray-500">Нет результатов</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {results.teams.map((team) => (
            <Card key={team.id}>
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700">
                    {team.rank}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{team.name}</h3>
                    {team.taskTitle && (
                      <p className="text-sm text-gray-500">{team.taskTitle}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary-700">
                    {team.totalAvgScore.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-400">средний балл</div>
                </div>
              </div>

              {expandedTeam === team.id && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Критерий
                          </th>
                          {team.criteriaScores[0]?.juryScores.map((js) => (
                            <th
                              key={js.juryMemberId}
                              className="px-3 py-2 text-center font-medium text-gray-600"
                            >
                              {js.juryName}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-center font-medium text-gray-600">
                            Среднее
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.criteriaScores.map((cr) => (
                          <tr key={cr.criterionId} className="border-b border-gray-100">
                            <td className="px-3 py-2 text-gray-700">{cr.criterionName}</td>
                            {cr.juryScores.map((js) => (
                              <td
                                key={js.juryMemberId}
                                className={`px-3 py-2 text-center ${
                                  js.isAnomaly
                                    ? 'bg-red-50 text-red-700 font-medium'
                                    : 'text-gray-700'
                                }`}
                                title={js.comment || undefined}
                              >
                                {Number.isInteger(js.value) ? js.value : js.value.toFixed(1)}
                                {js.isAnomaly && (
                                  <span className="ml-1 text-xs text-red-500" title="Аномальная оценка">
                                    !
                                  </span>
                                )}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center font-medium text-gray-900">
                              {cr.avgScore.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

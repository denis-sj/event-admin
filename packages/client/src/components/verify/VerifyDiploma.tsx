import { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../lib/api';
import { Spinner } from '../ui';

interface DiplomaData {
  eventTitle: string;
  eventDate: string;
  teamName: string;
  participants: string[];
  taskTitle: string | null;
  rank: number;
  totalScore: number;
  generatedAt: string;
}

interface VerifyDiplomaProps {
  code?: string;
}

export default function VerifyDiploma({ code }: VerifyDiplomaProps) {
  const [data, setData] = useState<DiplomaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('Код верификации не указан');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchDiploma() {
      try {
        const result = await apiGet<DiplomaData>(`public/verify/${code}`);
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NOT_FOUND') {
          setError('Диплом с указанным кодом не найден');
        } else {
          setError('Не удалось загрузить данные. Попробуйте позже.');
        }
        setLoading(false);
      }
    }

    fetchDiploma();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-gray-500">Проверка диплома...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Верификация не пройдена</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Verification badge */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <span className="text-sm font-medium text-green-700">Диплом подтверждён</span>
        </div>

        {/* Main card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Header */}
          <div className="border-b border-gray-100 px-6 py-5 text-center">
            <h1 className="text-xl font-bold text-gray-900">{data.eventTitle}</h1>
            <p className="mt-1 text-sm text-gray-500">{data.eventDate}</p>
          </div>

          {/* Team info */}
          <div className="px-6 py-5">
            {/* Rank and score */}
            <div className="mb-5 flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600">
                  {data.rank}-е
                </div>
                <div className="text-xs text-gray-500">место</div>
              </div>
              <div className="h-10 w-px bg-gray-200" />
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {data.totalScore.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500">баллов</div>
              </div>
            </div>

            {/* Details */}
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Команда</dt>
                <dd className="mt-0.5 text-sm font-semibold text-gray-900">{data.teamName}</dd>
              </div>

              {data.participants.length > 0 && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Участники</dt>
                  <dd className="mt-0.5 text-sm text-gray-700">
                    {data.participants.join(', ')}
                  </dd>
                </div>
              )}

              {data.taskTitle && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Задание</dt>
                  <dd className="mt-0.5 text-sm text-gray-700">{data.taskTitle}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-6 py-3 text-center">
            <p className="text-xs text-gray-400">
              Выдан {data.generatedAt} · Код: {code}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

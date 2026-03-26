import type { JuryTeam } from '../../stores/jury.store';

interface TeamListProps {
  teams: JuryTeam[];
  currentTeamId: string | null;
  scoringTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  onBack: () => void;
}

export function TeamList({
  teams,
  currentTeamId,
  scoringTeamId,
  onSelectTeam,
  onBack,
}: TeamListProps) {
  return (
    <div>
      {/* Header with back button */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 active:bg-gray-50"
          aria-label="Back"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">All teams</h2>
      </div>

      {/* Stats */}
      <div className="mb-4 flex gap-3">
        <div className="flex-1 rounded-lg bg-white border border-gray-200 px-3 py-2 text-center">
          <p className="text-lg font-bold text-gray-900">{teams.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="flex-1 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center">
          <p className="text-lg font-bold text-green-700">
            {teams.filter((t) => t.evaluation?.status === 'CONFIRMED').length}
          </p>
          <p className="text-xs text-green-600">Confirmed</p>
        </div>
        <div className="flex-1 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-center">
          <p className="text-lg font-bold text-yellow-700">
            {teams.filter((t) => t.evaluation?.status === 'DRAFT').length}
          </p>
          <p className="text-xs text-yellow-600">Draft</p>
        </div>
        <div className="flex-1 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-center">
          <p className="text-lg font-bold text-gray-500">
            {teams.filter((t) => !t.evaluation).length}
          </p>
          <p className="text-xs text-gray-500">Pending</p>
        </div>
      </div>

      {/* Team list */}
      <div className="space-y-2">
        {teams.map((team) => {
          const isCurrent = team.id === currentTeamId;
          const isScoring = team.id === scoringTeamId;

          return (
            <div
              key={team.id}
              onClick={() => onSelectTeam(team.id)}
              className={`cursor-pointer rounded-lg border bg-white px-4 py-3 transition-colors active:bg-gray-50 ${
                isCurrent
                  ? 'border-primary-300 ring-1 ring-primary-100'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {team.presentationOrder != null && (
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                        {team.presentationOrder}
                      </span>
                    )}
                    <p className="truncate text-sm font-medium text-gray-900">
                      {team.name}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-500" />
                        </span>
                        Presenting
                      </span>
                    )}
                    {isScoring && !isCurrent && (
                      <span className="text-xs font-medium text-blue-600">
                        Scoring open
                      </span>
                    )}
                    {team.task && (
                      <span className="truncate text-xs text-gray-500">
                        {team.task.title}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-3 flex flex-shrink-0 items-center gap-2">
                  <StatusBadge evaluation={team.evaluation} />
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({
  evaluation,
}: {
  evaluation: { status: 'DRAFT' | 'CONFIRMED' } | null;
}) {
  if (!evaluation) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        -
      </span>
    );
  }

  if (evaluation.status === 'CONFIRMED') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
        <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100">
      <span className="h-2 w-2 rounded-full bg-yellow-500" />
    </span>
  );
}

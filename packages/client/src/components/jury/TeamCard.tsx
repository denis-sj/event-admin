import type { JuryTeam } from '../../stores/jury.store';
import { Button } from '../ui';

interface TeamCardProps {
  team: JuryTeam;
  isCurrent?: boolean;
  isScoringOpen?: boolean;
  onScore: () => void;
}

export function TeamCard({
  team,
  isCurrent = false,
  isScoringOpen = false,
  onScore,
}: TeamCardProps) {
  return (
    <div
      className={`rounded-xl border bg-white shadow-sm ${
        isCurrent
          ? 'border-primary-300 ring-2 ring-primary-100'
          : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            {isCurrent && (
              <div className="mb-1 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-primary-600">
                  Now presenting
                </span>
              </div>
            )}
            <h3 className="truncate text-lg font-semibold text-gray-900">
              {team.name}
            </h3>
          </div>
          {team.evaluation && (
            <span
              className={`ml-2 flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                team.evaluation.status === 'CONFIRMED'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {team.evaluation.status === 'CONFIRMED' ? 'Confirmed' : 'Draft'}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3 px-4 py-3">
        {team.projectDescription && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Project
            </p>
            <p className="mt-0.5 text-sm text-gray-700 line-clamp-3">
              {team.projectDescription}
            </p>
          </div>
        )}

        {team.task && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Task
            </p>
            <p className="mt-0.5 text-sm font-medium text-gray-700">
              {team.task.title}
            </p>
          </div>
        )}

        {team.participants.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Participants
            </p>
            <p className="mt-0.5 text-sm text-gray-600">
              {team.participants.map((p) => p.name).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="border-t border-gray-100 px-4 py-3">
        <Button
          onClick={onScore}
          variant={isScoringOpen ? 'primary' : 'secondary'}
          size="lg"
          className="w-full"
        >
          {team.evaluation
            ? team.evaluation.status === 'CONFIRMED'
              ? 'View scores'
              : 'Edit scores'
            : isScoringOpen
              ? 'Score now'
              : 'Score team'}
        </Button>
      </div>
    </div>
  );
}

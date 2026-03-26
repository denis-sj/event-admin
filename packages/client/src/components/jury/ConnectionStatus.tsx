import { useWsStore } from '../../stores/ws.store';
import { useJuryStore } from '../../stores/jury.store';

export function ConnectionStatus() {
  const { connected, reconnecting } = useWsStore();
  const { syncing, pendingActions } = useJuryStore();

  if (syncing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500" />
        </span>
        <span className="text-xs font-medium text-yellow-600">Syncing</span>
      </div>
    );
  }

  if (connected) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        </span>
        <span className="text-xs font-medium text-green-600">Online</span>
        {pendingActions.length > 0 && (
          <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
            {pendingActions.length}
          </span>
        )}
      </div>
    );
  }

  if (reconnecting) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500" />
        </span>
        <span className="text-xs font-medium text-yellow-600">Reconnecting</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span className="text-xs font-medium text-red-600">Offline</span>
      {pendingActions.length > 0 && (
        <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
          {pendingActions.length}
        </span>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { TimerState } from '../../stores/jury.store';

interface TimerProps {
  timer: TimerState;
}

export function Timer({ timer }: TimerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedRef = useRef(false);

  const minutes = Math.floor(timer.remaining / 60);
  const seconds = timer.remaining % 60;
  const progress = timer.duration > 0 ? timer.remaining / timer.duration : 0;

  const isLow = timer.remaining <= 30 && timer.remaining > 0;
  const isExpired = timer.remaining <= 0 && timer.isRunning;

  // Play sound when timer expires
  useEffect(() => {
    if (isExpired && !hasPlayedRef.current) {
      hasPlayedRef.current = true;
      // Use Web Audio API for a simple beep
      try {
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gain.gain.value = 0.3;
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.5);
      } catch {
        // Audio not available
      }
    }
    if (timer.remaining > 5) {
      hasPlayedRef.current = false;
    }
  }, [isExpired, timer.remaining]);

  // Timer color
  let barColor = 'bg-primary-500';
  let textColor = 'text-gray-900';
  if (isExpired) {
    barColor = 'bg-red-500';
    textColor = 'text-red-600';
  } else if (isLow) {
    barColor = 'bg-yellow-500';
    textColor = 'text-yellow-600';
  }

  return (
    <div className="border-t border-gray-100 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {timer.isRunning && (
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isLow || isExpired ? 'bg-red-400' : 'bg-primary-400'}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${isLow || isExpired ? 'bg-red-500' : 'bg-primary-500'}`} />
            </span>
          )}
          <span className="text-xs font-medium text-gray-500">
            {timer.isRunning ? 'Timer' : 'Paused'}
          </span>
        </div>
        <span className={`font-mono text-lg font-bold tabular-nums ${textColor}`}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
      </div>
      {/* Progress bar */}
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <audio ref={audioRef} />
    </div>
  );
}

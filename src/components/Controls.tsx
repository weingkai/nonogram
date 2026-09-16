import type { Playback } from '../hooks/usePlayback';
import type { SolveResult } from '../solver/types';

interface Props {
  playback: Playback;
  result: SolveResult | null;
  solving: boolean;
  canSolve: boolean;
  onSolve: () => void;
}

export function Controls({ playback, result, solving, canSolve, onSolve }: Props) {
  const { total, index, playing } = playback;
  const hasSteps = total > 0;

  return (
    <div className="controls">
      <div className="control-row">
        <button className="primary" onClick={onSolve} disabled={!canSolve || solving}>
          {solving ? 'Solving…' : 'Solve'}
        </button>
        <button onClick={playback.restart} disabled={!hasSteps}>
          ⏮ Reset
        </button>
        <button onClick={playback.stepBack} disabled={!hasSteps || index === 0}>
          ◀ Step
        </button>
        <button onClick={playback.toggle} disabled={!hasSteps}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={playback.stepForward} disabled={!hasSteps || index >= total}>
          Step ▶
        </button>
        <button onClick={playback.toEnd} disabled={!hasSteps || index >= total}>
          Skip to end ⏭
        </button>
      </div>

      <div className="control-row">
        <label className="slider">
          <span>Step {index} / {total}</span>
          <input
            type="range"
            min={0}
            max={Math.max(total, 1)}
            value={index}
            disabled={!hasSteps}
            onChange={(e) => {
              playback.pause();
              playback.setIndex(Number(e.target.value));
            }}
          />
        </label>
        <label className="slider narrow">
          <span>Speed {playback.speed}/s</span>
          <input
            type="range"
            min={1}
            max={60}
            value={playback.speed}
            onChange={(e) => playback.setSpeed(Number(e.target.value))}
          />
        </label>
      </div>

      {result && (
        <p className={`outcome outcome-${result.outcome}`}>
          {result.outcome === 'solved' && `Solved in ${result.steps.length} steps (${result.elapsedMs.toFixed(1)} ms).`}
          {result.outcome === 'unsolvable' && 'No solution exists for these clues.'}
          {result.outcome === 'aborted' && 'Gave up — this puzzle exceeded the search budget.'}
        </p>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { SolverStep } from '../solver/types';

interface Props {
  steps: SolverStep[];
  /** Number of steps applied — so the active entry is `index - 1`. */
  index: number;
  onJump: (index: number) => void;
}

export function LogPanel({ steps, index, onJump }: Props) {
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (steps.length === 0) {
    return (
      <aside className="log">
        <h2>Reasoning</h2>
        <p className="log-empty">
          Type the row and column clues into the grid headers, then press <strong>Solve</strong>.
          Every deduction the solver makes will be explained here.
        </p>
      </aside>
    );
  }

  return (
    <aside className="log">
      <h2>Reasoning <span className="count">{steps.length} steps</span></h2>
      <ol className="log-list">
        {steps.map((step, i) => {
          const active = i === index - 1;
          return (
            <li
              key={i}
              ref={active ? activeRef : undefined}
              className={`log-item kind-${step.kind} ${active ? 'active' : ''} ${
                i < index ? 'applied' : 'pending'
              }`}
              onClick={() => onJump(i + 1)}
            >
              <span className="log-n">{i + 1}</span>
              <span className="log-text">{step.message}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

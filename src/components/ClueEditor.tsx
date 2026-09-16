import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Axis } from '../solver/types';

interface Props {
  axis: Axis;
  index: number;
  /** The header cell the editor points at. */
  anchor: HTMLElement | null;
  value: string;
  valid: boolean;
  onChange: (value: string) => void;
  onMove: (delta: number) => void;
  onClose: () => void;
  /** Called with this editor's own axis/index so a stale blur can be ignored. */
  onBlur: (axis: Axis, index: number) => void;
}

/** Below this viewport width the editor docks to the top of the screen instead. */
const NARROW = 640;
const BOX_WIDTH = 230;

interface Position {
  left: number;
  top: number;
  width: number;
  docked: boolean;
}

/**
 * The clue input, rendered into `document.body`. It has to be a portal: anchored inside
 * the grid it would be clipped by the grid's horizontal scroll container, and on a phone
 * there is rarely room beside a header cell anyway.
 */
export function ClueEditor({
  axis,
  index,
  anchor,
  value,
  valid,
  onChange,
  onMove,
  onClose,
  onBlur,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (vw <= NARROW || !anchor) {
        setPosition({ left: 8, top: 8, width: vw - 16, docked: true });
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const height = boxRef.current?.offsetHeight ?? 44;
      const clamp = (v: number, max: number) => Math.min(Math.max(8, v), Math.max(8, max));

      const left =
        axis === 'col'
          ? clamp(rect.left + rect.width / 2 - BOX_WIDTH / 2, vw - BOX_WIDTH - 8)
          : clamp(rect.right - BOX_WIDTH, vw - BOX_WIDTH - 8);
      const top =
        axis === 'col'
          ? clamp(rect.bottom - height - 2, vh - height - 8)
          : clamp(rect.top + rect.height / 2 - height / 2, vh - height - 8);

      setPosition({ left, top, width: BOX_WIDTH, docked: false });
    };

    place();
    // Keep the box glued to its header while the grid or page scrolls.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, axis, index]);

  const label = `${axis === 'row' ? 'Row' : 'Column'} ${index + 1}`;

  return createPortal(
    <div
      ref={boxRef}
      className={`clue-editor ${position?.docked ? 'docked' : ''} ${valid ? '' : 'invalid'}`}
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        width: position?.width ?? BOX_WIDTH,
        visibility: position ? 'visible' : 'hidden',
      }}
      // Tapping the chrome must not steal focus from the input.
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget.querySelector('input')) e.preventDefault();
      }}
    >
      <span className="clue-editor-label">{label}</span>
      <input
        key={`${axis}-${index}`}
        autoFocus
        value={value}
        spellCheck={false}
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} clues`}
        placeholder="e.g. 3 1 2"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            onMove(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        onBlur={() => onBlur(axis, index)}
      />
      <div className="clue-editor-actions">
        <button type="button" aria-label="Previous line" onClick={() => onMove(-1)}>
          ‹
        </button>
        <button type="button" aria-label="Next line" onClick={() => onMove(1)}>
          ›
        </button>
        <button type="button" aria-label="Done editing clues" onClick={onClose}>
          ✓
        </button>
      </div>
    </div>,
    document.body,
  );
}

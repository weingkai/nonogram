import { useCallback, useEffect, useMemo, useState } from 'react';

export interface Playback {
  index: number;
  playing: boolean;
  /** Steps per second. */
  speed: number;
  total: number;
  setIndex: (i: number) => void;
  setSpeed: (s: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepForward: () => void;
  stepBack: () => void;
  restart: () => void;
  toEnd: () => void;
}

/**
 * Drives the step timeline: a cursor into the solver's step list plus a play timer.
 * The cursor and the "wants to play" flag are the only state; the visible index and
 * playing flag are derived, so a shorter step list can never leave a stale cursor behind.
 */
export function usePlayback(total: number): Playback {
  const [cursor, setCursor] = useState(0);
  const [wantPlay, setWantPlay] = useState(false);
  const [speed, setSpeed] = useState(20);

  const index = Math.min(cursor, total);
  const playing = wantPlay && index < total;

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => setCursor(Math.min(total, index + 1)), 1000 / speed);
    return () => window.clearTimeout(id);
  }, [playing, index, total, speed]);

  // No upper clamp: `index` already caps the cursor at `total` on read, so this stays
  // correct when a solve hands us a longer step list in the same render.
  const setIndex = useCallback((i: number) => setCursor(Math.max(0, i)), []);

  const pause = useCallback(() => setWantPlay(false), []);

  const play = useCallback(() => {
    if (total === 0) return;
    setCursor((c) => (Math.min(c, total) >= total ? 0 : c));
    setWantPlay(true);
  }, [total]);

  const stepBy = useCallback(
    (delta: number) => {
      setWantPlay(false);
      setCursor((c) => Math.max(0, Math.min(total, Math.min(c, total) + delta)));
    },
    [total],
  );

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const stepForward = useCallback(() => stepBy(1), [stepBy]);
  const stepBack = useCallback(() => stepBy(-1), [stepBy]);
  const restart = useCallback(() => {
    setWantPlay(false);
    setCursor(0);
  }, []);
  const toEnd = useCallback(() => {
    setWantPlay(false);
    setCursor(total);
  }, [total]);

  return useMemo(
    () => ({
      index,
      playing,
      speed,
      total,
      setIndex,
      setSpeed,
      play,
      pause,
      toggle,
      stepForward,
      stepBack,
      restart,
      toEnd,
    }),
    [index, playing, speed, total, setIndex, play, pause, toggle, stepForward, stepBack, restart, toEnd],
  );
}

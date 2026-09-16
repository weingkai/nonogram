import { useEffect, useState } from 'react';

/**
 * Tracks the content width of an element via a ref callback:
 *
 * ```tsx
 * const [ref, width] = useElementWidth<HTMLDivElement>();
 * <div ref={ref} />
 * ```
 *
 * Returns 0 until the first measurement lands, so callers need a sensible fallback.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!el) return;

    if (typeof ResizeObserver === 'undefined') {
      const measure = () => setWidth(el.clientWidth);
      const initial = window.setTimeout(measure, 0);
      window.addEventListener('resize', measure);
      return () => {
        window.clearTimeout(initial);
        window.removeEventListener('resize', measure);
      };
    }

    // ResizeObserver delivers an initial observation, so there is no need to measure
    // synchronously here.
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return [setEl, width];
}

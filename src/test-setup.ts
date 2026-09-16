import '@testing-library/jest-dom/vitest';

// jsdom implements no layout, so scrollIntoView is missing.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom ships no ResizeObserver; the grid sizing hook falls back gracefully, but the
// stub keeps that path out of the tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

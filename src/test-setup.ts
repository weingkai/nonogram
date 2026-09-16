import '@testing-library/jest-dom/vitest';

// jsdom implements no layout, so scrollIntoView is missing.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

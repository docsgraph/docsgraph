import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Vitest doesn't auto-run Testing Library's DOM cleanup between tests
// (that's a Jest-specific auto-registration), so do it explicitly —
// otherwise elements from one test leak into the next test's queries.
afterEach(() => {
  cleanup();
});

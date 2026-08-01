import { docsgraphPreset } from '@docsgraph/config/eslint-preset.js';

// Root-level lint pass for any stray files outside the workspace packages
// (e.g. this file itself). Individual apps/packages define their own
// eslint.config.js that spreads `docsgraphPreset` plus package-specific rules.
export default [
  ...docsgraphPreset,
  {
    ignores: [
      'apps/desktop/src-tauri/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
    ],
  },
];

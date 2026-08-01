import { docsgraphPreset } from '@docsgraph/config/eslint-preset.js';

export default [
  ...docsgraphPreset,
  {
    ignores: ['dist/**'],
  },
];

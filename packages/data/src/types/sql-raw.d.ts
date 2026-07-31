// Ambient module for Vite/Vitest's `?raw` import suffix, used to inline
// migration SQL files as strings at build time.
declare module '*.sql?raw' {
  const content: string;
  export default content;
}

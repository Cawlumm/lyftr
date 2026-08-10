import type { UserConfig } from 'vite'

// Shared by vite.config.ts AND vitest.config.ts. Vitest ignores vite.config.ts
// entirely when a vitest.config.ts exists, so a resolve block written into only one
// of them yields a passing build with a failing test run (or the reverse) — and the
// failure mode is "Invalid hook call", not something that names the real cause.
//
// dedupe: web is a workspace member, so react/react-dom/zustand/axios hoist to the
// repo root while web/node_modules may also hold a copy. @lyftr/shared imports
// zustand and axios; React hooks and zustand stores both break if two instances
// load. dedupe resolves these from the project root in dev and in build.
//
// fs.allow: the dev server must read packages/shared, which is outside web/.
export const resolveConfig = {
  resolve: { dedupe: ['react', 'react-dom', 'zustand', 'axios'] },
  server: { fs: { allow: ['..'] } },
} satisfies UserConfig

import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode artifact` produces one self-contained HTML page (scripts and
// styles inlined, fonts from Google Fonts) for publishing as a hosted preview.
export default defineConfig(({ mode }) =>
  mode === 'artifact'
    ? {
        plugins: [react(), viteSingleFile()],
        resolve: {
          alias: [{ find: /^\.\/fonts$/, replacement: fileURLToPath(new URL('./src/fonts.artifact.ts', import.meta.url)) }],
        },
        build: { outDir: 'dist-artifact', emptyOutDir: true },
      }
    : {
        plugins: [react()],
        // three (the relief model) is one lazy chunk of ~540 kB, loaded after first paint.
        build: { chunkSizeWarningLimit: 600 },
      },
)

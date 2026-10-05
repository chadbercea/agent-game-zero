import { defineConfig } from 'vite';

const isThree = (id: string) => /node_modules[\\/]three[\\/]/.test(id);
const isLilGui = (id: string) => id.includes('lil-gui');

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE. Local dev stays at /.
  base: process.env.BASE ?? '/',
  build: {
    // three.js core alone is ~584 KB minified (≈145 KB gzip) and can't be split
    // further without forking it. It now lives in its own long-cacheable vendor
    // chunk, so the limit is raised just above it instead of warning every build.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Sandbox-only debug panel: its own chunk, separate from three.js.
            { name: 'lil-gui', test: isLilGui },
            // three.js core + the examples/jsm modules we use (controls, CSS2D, RoomEnvironment…).
            { name: 'three', test: (id) => isThree(id) && !isLilGui(id) },
          ],
        },
      },
    },
  },
});

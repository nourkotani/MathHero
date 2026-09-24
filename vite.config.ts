import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// ADR 0001: the build must produce exactly one self-contained HTML file
// (dist/MathHero.html) that runs offline from a double-click.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  // Baked Blender models (ADR 0007) are assets: inlined as data URIs.
  assetsInclude: ['**/*.glb'],
  build: {
    rollupOptions: {
      input: 'MathHero.html',
    },
  },
});

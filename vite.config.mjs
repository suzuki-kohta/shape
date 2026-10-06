import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const projectRoot = import.meta.dirname;

export default defineConfig({
  // Wallpaper Engine loads the project from a local directory, so assets must
  // use relative URLs instead of paths rooted at the web server.
  base: './',
  publicDir: false,
  plugins: [
    {
      name: 'copy-wallpaper-runtime-assets',
      async closeBundle() {
        const outputDir = resolve(projectRoot, 'dist');
        await mkdir(outputDir, { recursive: true });
        await Promise.all(['lib', 'js'].map((directory) =>
          cp(resolve(projectRoot, directory), resolve(outputDir, directory), { recursive: true })
        ));
        await Promise.all(['project.json', 'preview.png'].map((file) =>
          cp(resolve(projectRoot, file), resolve(outputDir, file))
        ));
      }
    }
  ]
});

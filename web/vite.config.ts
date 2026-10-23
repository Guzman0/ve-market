import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `--mode single` inlines everything into one HTML file (used for previews).
// The normal build is served from GitHub Pages under /<repo>/.
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
}))

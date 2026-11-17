import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project at https://<user>.github.io/<repo>/
// If you rename the GitHub repository, change REPO_NAME to match.
const REPO_NAME = 'my-money-tracker'

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // Build + `npm run preview` use the repo sub-path (same as GitHub Pages); `npm run dev` stays at "/"
  base: command === 'build' || isPreview ? `/${REPO_NAME}/` : '/',
  server: { host: true },
  // recharts is large by nature; jsPDF is already split out and loaded on demand
  build: { chunkSizeWarningLimit: 700 }
}))

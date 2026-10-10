import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH lets the same build serve from a sub-path (GitHub Pages) or the root (Vercel).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
})

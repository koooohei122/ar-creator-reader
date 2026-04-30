import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ar-creator-reader/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'esnext',
  },
})

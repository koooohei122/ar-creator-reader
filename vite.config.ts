import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // スマホ確認用に全インターフェースでリッスン
    port: 5173,
    // HTTPS が必要な場合は下記コメントを外してください (スマホカメラ等)
    // https: true,
  },
  build: {
    target: 'esnext',
  },
  // three.js の treeshaking を正しく扱う
  optimizeDeps: {
    include: ['three'],
  },
})

import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * MindAR 1.2.5 は Three.js r152 で削除された sRGBEncoding を import しているため、
 * Three.js 0.167+ では build エラーになる。
 * 仮想モジュール __three-compat を経由して sRGBEncoding = 3001 を補完する。
 */
function threeCompatPlugin(): Plugin {
  const VIRTUAL = '__three-compat'
  return {
    name: 'three-compat',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL) return '\0' + VIRTUAL
    },
    load(id) {
      if (id === '\0' + VIRTUAL) {
        // three の全エクスポート + 削除済み定数を追加
        return `export * from 'three'; export const sRGBEncoding = 3001;`
      }
    },
    transform(code, id) {
      // MindAR の dist ファイル内の `from "three"` を仮想モジュールに差し替え
      if (id.includes('mindar-image-three.prod.js')) {
        return code.replaceAll('"three"', `"${VIRTUAL}"`)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), threeCompatPlugin()],
  // GitHub Pages のサブパスに合わせる
  base: '/ar-creator-reader/',
  server: {
    host: true,   // スマホ確認用に全インターフェースでリッスン
    port: 5173,
    // HTTPS が必要な場合は下記コメントを外してください (スマホカメラ等)
    // https: true,
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    include: ['three'],
    // mind-ar は事前バンドル対象外 (内部の相対 import を壊さないため)
    exclude: ['mind-ar'],
  },
})

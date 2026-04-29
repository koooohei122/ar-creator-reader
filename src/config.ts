/**
 * AR アプリ設定ファイル
 * ここの値を変えるだけで主要パラメータを調整できます
 */

// Vite が設定する BASE_URL を使う
// ローカル: '/'  / GitHub Pages: '/ar-creator-reader/'
const BASE = import.meta.env.BASE_URL

export const CONFIG = {
  // ---- AR ターゲット ----
  // public/targets/marker.mind を生成して配置してください (READMEを参照)
  TARGET_SRC: `${BASE}targets/marker.mind`,

  // ---- Web リンク ----
  TARGET_URL: 'https://github.com/koooohei122/ar-creator-reader',
  TARGET_URL_LABEL: 'サイトを開く',

  // ---- 3D モデル ----
  // public/models/character.glb を配置してください。なければ自動でフォールバックキャラを表示
  MODEL_PATH: `${BASE}models/character.glb`,

  // ---- キャラクター トランスフォーム ----
  // ターゲット中心からのオフセット (x, y, z)  単位はターゲットの幅=1 に相当
  CHARACTER_POSITION: [0, 0.1, 0] as [number, number, number],
  CHARACTER_SCALE:    [0.15, 0.15, 0.15] as [number, number, number],
  CHARACTER_ROTATION: [0, 0, 0] as [number, number, number],

  // ---- セグメンテーション ----
  // true: オクルージョンON / false: OFF (デフォルト状態)
  // 一旦 false でデバッグ。Segmentation が camera 表示を阻害している可能性を切り分ける
  SEGMENTATION_ENABLED_DEFAULT: false,
  // 処理解像度。小さいほど速いが粗い。256×144 推奨 (モバイル)
  SEGMENTATION_WIDTH: 256,
  SEGMENTATION_HEIGHT: 144,
  // ModelSelection: 0=general, 1=landscape(高速)
  SEGMENTATION_MODEL: 1 as 0 | 1,

  // ---- パフォーマンス ----
  // FPS がこの値を下回ったらオクルージョン自動OFF
  FPS_THRESHOLD_DISABLE_OCCLUSION: 15,
  // FPS チェック間隔 (ms)
  FPS_CHECK_INTERVAL_MS: 5000,

  // ---- デバッグ ----
  DEBUG_DEFAULT: false,

  // ---- MindAR トラッキング感度 ----
  FILTER_MIN_CF: 0.001,
  FILTER_BETA: 1000,
  WARM_UP_TOLERANCE: 5,
  MISS_TOLERANCE: 5,
} as const

/**
 * MindAR CDN グローバル型定義
 * index.html の <script> タグで読み込まれた mindar-image-three.prod.js が
 * window.MINDAR として公開する API の型です。
 *
 * Note: import を使うとモジュールスコープになり declare global が必要になるため、
 * ここでは Three.js 型の参照を最小限の手書き型で代替しています。
 */

// Three.js の最低限の型 (グローバル宣言内で import が使えないため手書き)
interface ThreeGroup {
  add(object: object): void
  position: { set(x: number, y: number, z: number): void; y: number }
  scale: { set(x: number, y: number, z: number): void }
  rotation: { set(x: number, y: number, z: number): void }
  visible: boolean
}

interface ThreeScene {
  add(object: object): void
}

interface ThreeCamera {
  [key: string]: unknown
}

interface ThreeWebGLRenderer {
  domElement: HTMLCanvasElement
  setAnimationLoop(callback: (() => void) | null): void
  render(scene: ThreeScene, camera: ThreeCamera): void
}

interface MindARImageAnchor {
  group: ThreeGroup
  onTargetFound?: () => void
  onTargetLost?: () => void
}

interface MindARThreeConstructorOptions {
  container: HTMLElement
  imageTargetSrc: string
  maxTrack?: number
  filterMinCF?: number
  filterBeta?: number
  warmupTolerance?: number
  missTolerance?: number
  /** MindAR 組み込み UI を非表示: 'no' */
  uiLoading?: string
  uiScanning?: string
  uiError?: string
  /** カメラ指定 (スマホ背面カメラ: 'environment') */
  facing?: 'environment' | 'user'
}

interface MindARThreeInstance {
  renderer: ThreeWebGLRenderer
  scene: ThreeScene
  camera: ThreeCamera
  addAnchor(targetIndex: number): MindARImageAnchor
  start(): Promise<void>
  stop(): void
  pauseTracking(): void
  unpauseTracking(): void
}

declare const MINDAR: {
  IMAGE: {
    MindARThree: new (options: MindARThreeConstructorOptions) => MindARThreeInstance
  }
}

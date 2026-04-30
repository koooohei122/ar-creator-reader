/**
 * MindARController
 * MindAR の初期化・ライフサイクル・3D キャラクター管理を担う
 *
 * 設計メモ:
 * - MindAR は Vite でバンドルすると内包する TF.js の WASM ロードパスが壊れる
 * - そのため MindAR だけ esm.sh CDN から動的インポートしてバンドルを回避する
 * - Three.js は npm 版をそのまま使用 (Three.js は flag-check ベースなので
 *   異なるインスタンス間でも Object3D の追加・レンダリングが動作する)
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CONFIG } from '../config'

// esm.sh が "three" の bare import を自動解決するため importmap 不要
// deps=three@0.151.0: sRGBEncoding が残っている最後のバージョンを指定
const MINDAR_CDN = 'https://esm.sh/mind-ar@1.2.5/dist/mindar-image-three.prod.js?deps=three@0.151.0'

export interface StartOptions {
  container: HTMLElement
  onTargetFound: () => void
  onTargetLost: () => void
  onStarted: () => void
  onError: (error: Error) => void
  isCharacterVisible: boolean
}

export class MindARController {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mindarThree: any = null
  private origGUM: typeof navigator.mediaDevices.getUserMedia | null = null
  private mixer: THREE.AnimationMixer | null = null
  private clock = new THREE.Clock()
  private characterGroup: THREE.Group | null = null
  private isRunning = false
  private fallbackStartTime = 0
  private leftArm: THREE.Mesh | null = null
  private rightArm: THREE.Mesh | null = null

  async start(opts: StartOptions): Promise<void> {
    const { container, onTargetFound, onTargetLost, onStarted, onError, isCharacterVisible } = opts

    // MindAR を CDN から動的ロード (Vite バンドルを回避して TF.js WASM を正常動作させる)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { MindARThree } = await import(/* @vite-ignore */ MINDAR_CDN) as any

    // カメラ高解像度リクエスト（MindAR は video:{} のみで解像度未指定のため）
    this.origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    const origGUM = this.origGUM
    navigator.mediaDevices.getUserMedia = (constraints: MediaStreamConstraints) => {
      if (constraints?.video && typeof constraints.video === 'object') {
        const v = constraints.video as MediaTrackConstraints
        v.width  = { ideal: 1920 }
        v.height = { ideal: 1080 }
      }
      return origGUM(constraints)
    }

    try {
      this.mindarThree = new MindARThree({
        container,
        imageTargetSrc: CONFIG.TARGET_SRC,
        maxTrack: 1,
        filterMinCF: CONFIG.FILTER_MIN_CF,
        filterBeta: CONFIG.FILTER_BETA,
        warmupTolerance: CONFIG.WARM_UP_TOLERANCE,
        missTolerance: CONFIG.MISS_TOLERANCE,
        uiLoading: 'no',
        uiScanning: 'no',
        uiError: 'no',
      })

      const { renderer, scene, camera } = this.mindarThree

      // ライト
      scene.add(new THREE.AmbientLight(0xffffff, 0.9))
      const dir = new THREE.DirectionalLight(0xffffff, 1.2)
      dir.position.set(1, 3, 2)
      scene.add(dir)

      // アンカー (ターゲット画像 #0)
      const anchor = this.mindarThree.addAnchor(0)
      anchor.onTargetFound = () => {
        console.log('[AR] ★ onTargetFound fired')
        onTargetFound()
      }
      anchor.onTargetLost = () => {
        console.log('[AR] onTargetLost fired')
        onTargetLost()
      }

      // キャラクター用グループ
      this.characterGroup = new THREE.Group()
      this.characterGroup.position.set(...CONFIG.CHARACTER_POSITION)
      this.characterGroup.scale.set(...CONFIG.CHARACTER_SCALE)
      this.characterGroup.rotation.set(...CONFIG.CHARACTER_ROTATION)
      this.characterGroup.visible = isCharacterVisible
      anchor.group.add(this.characterGroup)

      this.addShadowCircle(this.characterGroup)
      await this.loadCharacter(this.characterGroup)

      await this.mindarThree.start()
      this.isRunning = true

      // Three.js canvas の CSS を強制設定
      // iOS Safari: alpha:true のキャンバスがデフォルトで非表示になるケースへの対処
      const glCanvas = renderer.domElement
      glCanvas.style.position = 'absolute'
      glCanvas.style.top = '0'
      glCanvas.style.left = '0'
      glCanvas.style.width = '100%'
      glCanvas.style.height = '100%'
      glCanvas.style.visibility = 'visible'
      glCanvas.style.opacity = '1'
      glCanvas.style.zIndex = '1'
      console.log('[AR] renderer canvas size:', glCanvas.width, 'x', glCanvas.height, 'css:', glCanvas.style.cssText)

      // iOS Safari 等で video element が compositing layer から外れて消えるのを防ぐため
      // video 要素へ直接 GPU layer を適用 (コンテナの transform は除去済み)
      const videoEl = container.querySelector('video') as HTMLVideoElement | null
      if (videoEl) {
        videoEl.style.transform = 'translateZ(0)'
        ;(videoEl.style as CSSStyleDeclaration & { webkitTransform?: string }).webkitTransform = 'translateZ(0)'
        videoEl.style.willChange = 'transform'
        videoEl.style.backfaceVisibility = 'hidden'
        ;(videoEl.style as CSSStyleDeclaration & { webkitBackfaceVisibility?: string }).webkitBackfaceVisibility = 'hidden'
        videoEl.style.visibility = 'visible'
        videoEl.style.opacity = '1'
        videoEl.setAttribute('playsinline', '')
        videoEl.setAttribute('webkit-playsinline', '')
        videoEl.muted = true
        videoEl.play().catch(() => { /* 既に再生中 */ })
        console.log('[AR] video element GPU layer applied', {
          width: videoEl.videoWidth,
          height: videoEl.videoHeight,
          paused: videoEl.paused,
          readyState: videoEl.readyState,
        })
      } else {
        console.warn('[AR] video element not found in container after start')
      }

      onStarted()

      renderer.setAnimationLoop(() => {
        const delta = this.clock.getDelta()
        if (this.mixer) this.mixer.update(delta)
        this.updateFallbackAnim()
        renderer.render(scene, camera)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const friendly = msg.includes('404') || msg.includes('Failed to fetch') || msg.includes('network')
        ? `マーカーファイルが見つかりません (${CONFIG.TARGET_SRC})\nREADME の手順で marker.mind を配置してください`
        : msg
      onError(new Error(friendly))
    }
  }

  private addShadowCircle(parent: THREE.Group): void {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -0.01
    parent.add(shadow)
  }

  private async loadCharacter(parent: THREE.Group): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(CONFIG.MODEL_PATH)
      parent.add(gltf.scene)
      if (gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(gltf.scene)
        const clip =
          THREE.AnimationClip.findByName(gltf.animations, 'idle') ??
          THREE.AnimationClip.findByName(gltf.animations, 'Idle') ??
          THREE.AnimationClip.findByName(gltf.animations, 'walk') ??
          THREE.AnimationClip.findByName(gltf.animations, 'Walk') ??
          gltf.animations[0]
        this.mixer.clipAction(clip).play()
      }
      console.log('[AR] モデル読み込み完了')
    } catch {
      console.log('[AR] モデル未検出 → フォールバックキャラ使用')
      this.addFallbackCharacter(parent)
    }
  }

  private addFallbackCharacter(parent: THREE.Group): void {
    this.fallbackStartTime = Date.now()

    const bodyMat  = new THREE.MeshBasicMaterial({ color: 0x1565C0 })
    const bellyMat = new THREE.MeshBasicMaterial({ color: 0xBBDEFB })
    const finMat   = new THREE.MeshBasicMaterial({ color: 0x0D47A1 })
    const eyeMat   = new THREE.MeshBasicMaterial({ color: 0x0D0D0D })

    // ローカル Y 軸方向にクジラを組み立て、Z 軸で 90° 回転させて横向きにする
    // (ローカル Y → ワールド -X = 水平方向)
    const w = new THREE.Group()
    w.rotation.z = Math.PI / 2
    parent.add(w)

    // 胴体: ローカル Y 方向に細長い
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), bodyMat)
    body.scale.set(1.0, 2.2, 0.95)
    w.add(body)

    // お腹（明るい色）: ローカル -X → ワールド -Y (下側) に配置
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.43, 20, 12), bellyMat)
    belly.scale.set(0.88, 2.0, 0.88)
    belly.position.set(-0.16, 0, 0)
    w.add(belly)

    // 頭: ローカル +Y 方向 → ワールド -X (左側)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), bodyMat)
    head.position.set(0, 0.65, 0)
    w.add(head)

    // 背びれ: ローカル +X → ワールド +Y (上側) に頂点が向くよう rotation.z = -PI/2
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.35, 5), finMat)
    dorsal.position.set(0.46, 0.08, 0)
    dorsal.rotation.z = -Math.PI / 2
    w.add(dorsal)

    // 尾びれ基部: ローカル -Y → ワールド +X (右側)。アニメーション用 (leftArm)
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.14), finMat)
    tail.position.set(0, -0.88, 0)
    w.add(tail)
    this.leftArm = tail

    // 尾びれ上下フルーク: ローカル ±X → ワールド ±Y (上下に広がる)
    const fluke1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.26), finMat)
    fluke1.position.set(0.22, -0.08, 0)
    tail.add(fluke1)
    const fluke2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.26), finMat)
    fluke2.position.set(-0.22, -0.08, 0)
    tail.add(fluke2)

    // 胸びれ (奥側): ローカル ±Z (奥行き方向)。アニメーション用 (rightArm)
    const pec1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.14), finMat)
    pec1.position.set(-0.28, -0.05, 0.44)
    w.add(pec1)
    this.rightArm = pec1

    const pec2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.14), finMat)
    pec2.position.set(-0.28, -0.05, -0.44)
    w.add(pec2)

    // 目: 頭部の ±Z に配置
    for (const z of [0.27, -0.27]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat)
      eye.position.set(0, 0.62, z)
      w.add(eye)
    }
  }

  private updateFallbackAnim(): void {
    if (!this.leftArm || !this.rightArm || !this.characterGroup) return
    const t = (Date.now() - this.fallbackStartTime) / 1000
    // ゆったり浮かぶ
    this.characterGroup.position.y = CONFIG.CHARACTER_POSITION[1] + Math.sin(t * 1.2) * 0.05
    // 尾びれを上下に振る
    this.leftArm.rotation.z  =  Math.sin(t * 2.5) * 0.4
    // 胸びれをゆっくり揺らす
    this.rightArm.rotation.z = -0.25 + Math.sin(t * 1.5) * 0.12
  }

  setCharacterVisible(visible: boolean): void {
    if (this.characterGroup) this.characterGroup.visible = visible
  }

  stop(): void {
    if (this.origGUM) {
      navigator.mediaDevices.getUserMedia = this.origGUM
      this.origGUM = null
    }
    if (this.mindarThree && this.isRunning) {
      try {
        this.mindarThree.renderer.setAnimationLoop(null)
        this.mindarThree.stop()
      } catch { /* ignore */ }
      this.isRunning = false
    }
    this.mindarThree = null
    this.mixer = null
    this.characterGroup = null
    this.leftArm = null
    this.rightArm = null
  }
}

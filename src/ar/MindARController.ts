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

    // MindAR の getUserMedia は解像度未指定 → ブラウザが低解像度を選びがち
    // 事前にパッチして 1280×720 を要求する
    this.origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    const origGUM = this.origGUM
    const patchedGUM = (constraints: MediaStreamConstraints) => {
      if (constraints?.video && typeof constraints.video === 'object') {
        const v = constraints.video as MediaTrackConstraints
        v.width  = { ideal: 1280 }
        v.height = { ideal: 720 }
      }
      return origGUM(constraints)
    }
    navigator.mediaDevices.getUserMedia = patchedGUM

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
        console.log('[AR] ★ onTargetFound fired — anchor.group.visible:', anchor.group.visible)
        onTargetFound()
      }
      anchor.onTargetLost = () => {
        console.log('[AR] onTargetLost fired')
        onTargetLost()
      }

      // 診断用: アンカー原点に鮮やかな赤球を置く
      // → これが画面に出ればトラッキング自体は成功している証明になる
      const diagSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      )
      diagSphere.position.set(0, 0, 0)
      anchor.group.add(diagSphere)

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
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4fc3f7 })
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffcc99 })
    const legMat  = new THREE.MeshLambertMaterial({ color: 0x1565c0 })
    const eyeMat  = new THREE.MeshBasicMaterial({ color: 0x222222 })

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.2), bodyMat)
    body.position.y = 0.9
    parent.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), skinMat)
    head.position.y = 1.35
    parent.add(head)

    ;[[-0.08, 0.19], [0.08, 0.19]].forEach(([x, z]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat)
      eye.position.set(x, 1.38, z)
      parent.add(eye)
    })

    this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.45, 0.15), bodyMat)
    this.leftArm.position.set(-0.3, 0.85, 0)
    parent.add(this.leftArm)

    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.45, 0.15), bodyMat)
    this.rightArm.position.set(0.3, 0.85, 0)
    parent.add(this.rightArm)

    ;[[-0.12, legMat], [0.12, legMat]].forEach(([x, mat]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), mat as THREE.Material)
      leg.position.set(x as number, 0.35, 0)
      parent.add(leg)
    })
  }

  private updateFallbackAnim(): void {
    if (!this.leftArm || !this.rightArm || !this.characterGroup) return
    const t = (Date.now() - this.fallbackStartTime) / 1000
    this.characterGroup.position.y = CONFIG.CHARACTER_POSITION[1] + Math.sin(t * 2) * 0.02
    this.leftArm.rotation.x  =  Math.sin(t * 2) * 0.35
    this.rightArm.rotation.x = -Math.sin(t * 2) * 0.35
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

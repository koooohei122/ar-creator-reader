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

    const bodyMat  = new THREE.MeshLambertMaterial({ color: 0x1565C0 })
    const bellyMat = new THREE.MeshLambertMaterial({ color: 0xBBDEFB })
    const finMat   = new THREE.MeshLambertMaterial({ color: 0x0D47A1 })
    const eyeMat   = new THREE.MeshBasicMaterial ({ color: 0x0D0D0D })

    // 胴体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), bodyMat)
    body.scale.set(2.2, 1.0, 0.95)
    parent.add(body)

    // お腹（明るい色）
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.43, 20, 12), bellyMat)
    belly.scale.set(2.05, 0.6, 0.88)
    belly.position.set(0, -0.16, 0)
    parent.add(belly)

    // 頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), bodyMat)
    head.scale.set(1.05, 0.9, 1.0)
    head.position.set(-0.65, 0.04, 0)
    parent.add(head)

    // 背びれ
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.35, 5), finMat)
    dorsal.position.set(0.12, 0.46, 0)
    dorsal.rotation.z = -0.18
    parent.add(dorsal)

    // 尾びれ（アニメーション用 → leftArm）
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 0.12), finMat)
    tail.position.set(0.9, 0, 0)
    parent.add(tail)
    this.leftArm = tail
    const fluke1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.26), finMat)
    fluke1.position.set(0.14, 0, 0.22); fluke1.rotation.y = 0.35
    tail.add(fluke1)
    const fluke2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.26), finMat)
    fluke2.position.set(0.14, 0, -0.22); fluke2.rotation.y = -0.35
    tail.add(fluke2)

    // 胸びれ右（アニメーション用 → rightArm）
    const pecR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.14), finMat)
    pecR.position.set(-0.05, -0.28, 0.44)
    pecR.rotation.x = 0.5; pecR.rotation.z = -0.25
    parent.add(pecR)
    this.rightArm = pecR

    // 胸びれ左
    const pecL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.14), finMat)
    pecL.position.set(-0.05, -0.28, -0.44)
    pecL.rotation.x = -0.5; pecL.rotation.z = -0.25
    parent.add(pecL)

    // 目
    for (const z of [0.28, -0.28]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat)
      eye.position.set(-0.62, 0.13, z)
      parent.add(eye)
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

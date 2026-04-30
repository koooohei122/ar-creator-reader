/**
 * MindARController
 * MindAR の初期化・ライフサイクル・3D キャラクター管理を担う
 *
 * 設計メモ:
 * - mind-ar を npm package として直接 import (CDN / global 依存を排除)
 * - Vite が mind-ar 内の Three.js import を同一 node_modules/three に解決するため
 *   MindAR シーンと GLTFLoader で同じ Three.js インスタンスを共有できる
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
// @ts-expect-error mind-ar は TypeScript 型定義を持たない
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import { CONFIG } from '../config'

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

    try {
      this.mindarThree = new MindARThree({
        container,
        imageTargetSrc: CONFIG.TARGET_SRC,
        maxTrack: 1,
        filterMinCF: CONFIG.FILTER_MIN_CF,
        filterBeta: CONFIG.FILTER_BETA,
        warmupTolerance: CONFIG.WARM_UP_TOLERANCE,
        missTolerance: CONFIG.MISS_TOLERANCE,
        // MindAR デフォルトの UI overlay を無効化:
        //   ・自前で StatusBadge / GuideOverlay を提供しているため不要
        //   ・MindAR の scanning overlay (z-index:2, body 直下) が出現すると
        //     iOS Safari 等で video の compositing layer が崩れカメラ映像が消える症状を回避
        // mind-ar@1.2.5 は 'no' を渡すと UI 自体を生成しない (内部で 'no' をガード済み)
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

      // iOS Safari 等で video element が compositing layer から外れて消えるのを防ぐため
      // 強制的に GPU layer に promotion + visibility 保証
      const videoEl = container.querySelector('video') as HTMLVideoElement | null
      if (videoEl) {
        videoEl.style.transform = 'translateZ(0)'
        ;(videoEl.style as CSSStyleDeclaration & { webkitTransform?: string }).webkitTransform = 'translateZ(0)'
        videoEl.style.willChange = 'transform'
        videoEl.style.backfaceVisibility = 'hidden'
        ;(videoEl.style as CSSStyleDeclaration & { webkitBackfaceVisibility?: string }).webkitBackfaceVisibility = 'hidden'
        videoEl.style.visibility = 'visible'
        videoEl.style.opacity = '1'
        // iOS Safari でバックグラウンド遷移後に play() が止まらないよう保証
        videoEl.setAttribute('playsinline', '')
        videoEl.setAttribute('webkit-playsinline', '')
        videoEl.muted = true
        videoEl.play().catch(() => { /* 既に再生中 */ })
        console.log('[AR] video element promoted to GPU layer', {
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

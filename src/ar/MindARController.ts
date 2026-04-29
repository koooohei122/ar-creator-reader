/**
 * MindARController
 * MindAR の初期化・ライフサイクル・3D キャラクター管理を担う
 *
 * 設計メモ:
 * - MindAR は CDN 経由でグローバル (window.MINDAR) として提供される
 * - MindAR 内部の Three.js と npm の three は別インスタンスだが、
 *   Three.js オブジェクトは JS 標準オブジェクトなのでシーンへの追加は互換
 * - GLTFLoader は npm three から使用し、MindAR のシーンに追加する
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
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
  private mindarThree: MindARThreeInstance | null = null
  private mixer: THREE.AnimationMixer | null = null
  private clock = new THREE.Clock()
  private characterGroup: THREE.Group | null = null
  private isRunning = false
  // フォールバックキャラクターのアニメーション用
  private fallbackStartTime = 0
  private leftArm: THREE.Mesh | null = null
  private rightArm: THREE.Mesh | null = null

  async start(opts: StartOptions): Promise<void> {
    const { container, onTargetFound, onTargetLost, onStarted, onError, isCharacterVisible } = opts

    try {
      if (typeof MINDAR === 'undefined' || !MINDAR?.IMAGE?.MindARThree) {
        throw new Error(
          'MindAR が読み込まれていません。インターネット接続を確認してください。'
        )
      }

      this.mindarThree = new MINDAR.IMAGE.MindARThree({
        container,
        imageTargetSrc: CONFIG.TARGET_SRC,
        maxTrack: 1,
        filterMinCF: CONFIG.FILTER_MIN_CF,
        filterBeta: CONFIG.FILTER_BETA,
        warmupTolerance: CONFIG.WARM_UP_TOLERANCE,
        missTolerance: CONFIG.MISS_TOLERANCE,
        // uiLoading/uiScanning/uiError は省略 → MindAR デフォルト UI を使用
        // ('no' をセレクタとして解釈し null 参照エラーになるため外す)
      })

      const { renderer, scene, camera } = this.mindarThree

      // ライト設定
      const ambient = new THREE.AmbientLight(0xffffff, 0.9)
      scene.add(ambient)
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
      dirLight.position.set(1, 3, 2)
      scene.add(dirLight)

      // アンカー (ターゲット画像インデックス 0)
      const anchor = this.mindarThree.addAnchor(0)
      anchor.onTargetFound = onTargetFound
      anchor.onTargetLost = onTargetLost

      // キャラクター用グループ
      this.characterGroup = new THREE.Group()
      this.characterGroup.position.set(...CONFIG.CHARACTER_POSITION)
      this.characterGroup.scale.set(...CONFIG.CHARACTER_SCALE)
      this.characterGroup.rotation.set(...CONFIG.CHARACTER_ROTATION)
      this.characterGroup.visible = isCharacterVisible
      // anchor.group は ThreeGroup 型だが Three.js の Group と互換
      ;(anchor.group as unknown as THREE.Group).add(this.characterGroup)

      // 簡易シャドウ (楕円形)
      this.addShadowCircle(this.characterGroup)

      // キャラクターモデル読み込み (失敗時はフォールバック)
      await this.loadCharacter(this.characterGroup)

      // MindAR スタート
      await this.mindarThree.start()
      this.isRunning = true
      onStarted()

      // アニメーションループ (MindAR の WebGL ループに乗る)
      renderer.setAnimationLoop(() => {
        const delta = this.clock.getDelta()
        if (this.mixer) this.mixer.update(delta)
        this.updateFallbackAnim()
        renderer.render(scene, camera)
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // marker.mind が見つからない場合のわかりやすいメッセージ
      const friendly = msg.includes('404') || msg.includes('Failed to fetch') || msg.includes('network')
        ? `マーカーファイルが見つかりません (${CONFIG.TARGET_SRC})\nREADME の手順で marker.mind を配置してください`
        : msg
      onError(new Error(friendly))
    }
  }

  private addShadowCircle(parent: THREE.Group): void {
    const geo = new THREE.CircleGeometry(0.45, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    })
    const shadow = new THREE.Mesh(geo, mat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -0.01
    parent.add(shadow)
  }

  private async loadCharacter(parent: THREE.Group): Promise<void> {
    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(CONFIG.MODEL_PATH)
      parent.add(gltf.scene)

      if (gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(gltf.scene)
        // idle / walk を優先
        const clip =
          THREE.AnimationClip.findByName(gltf.animations, 'idle') ??
          THREE.AnimationClip.findByName(gltf.animations, 'Idle') ??
          THREE.AnimationClip.findByName(gltf.animations, 'walk') ??
          THREE.AnimationClip.findByName(gltf.animations, 'Walk') ??
          gltf.animations[0]
        this.mixer.clipAction(clip).play()
      }

      console.log('[AR] キャラクターモデル読み込み完了')
    } catch {
      console.log('[AR] モデルが見つかりません → フォールバックキャラクターを使用')
      this.addFallbackCharacter(parent)
    }
  }

  private addFallbackCharacter(parent: THREE.Group): void {
    this.fallbackStartTime = Date.now()

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4fc3f7 })
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffcc99 })
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1565c0 })
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 })

    // 胴体
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.2), bodyMat)
    body.position.y = 0.9
    parent.add(body)

    // 頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), skinMat)
    head.position.y = 1.35
    parent.add(head)

    // 目
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat)
    eyeL.position.set(-0.08, 1.38, 0.19)
    parent.add(eyeL)
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat)
    eyeR.position.set(0.08, 1.38, 0.19)
    parent.add(eyeR)

    // 左腕
    this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.45, 0.15), bodyMat)
    this.leftArm.position.set(-0.3, 0.85, 0)
    parent.add(this.leftArm)

    // 右腕
    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.45, 0.15), bodyMat)
    this.rightArm.position.set(0.3, 0.85, 0)
    parent.add(this.rightArm)

    // 左脚
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), legMat)
    legL.position.set(-0.12, 0.35, 0)
    parent.add(legL)

    // 右脚
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), legMat)
    legR.position.set(0.12, 0.35, 0)
    parent.add(legR)
  }

  /** フォールバックキャラのアイドルアニメーション (setAnimationLoop 内から呼ばれる) */
  private updateFallbackAnim(): void {
    if (!this.leftArm || !this.rightArm || !this.characterGroup) return
    const t = (Date.now() - this.fallbackStartTime) / 1000
    // 上下ボブ
    this.characterGroup.position.y = CONFIG.CHARACTER_POSITION[1] + Math.sin(t * 2.0) * 0.02
    // 腕振り
    this.leftArm.rotation.x = Math.sin(t * 2.0) * 0.35
    this.rightArm.rotation.x = -Math.sin(t * 2.0) * 0.35
  }

  setCharacterVisible(visible: boolean): void {
    if (this.characterGroup) this.characterGroup.visible = visible
  }

  stop(): void {
    if (this.mindarThree && this.isRunning) {
      try {
        this.mindarThree.renderer.setAnimationLoop(null)
        this.mindarThree.stop()
      } catch {
        // stop 時のエラーは無視
      }
      this.isRunning = false
    }
    this.mindarThree = null
    this.mixer = null
    this.characterGroup = null
    this.leftArm = null
    this.rightArm = null
  }
}

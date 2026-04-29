/**
 * ARScene
 * MindAR コンテナ + オクルージョン オーバーレイ + セグメンテーション を統括するコンポーネント
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { MindARController } from '../ar/MindARController'
import { useSegmentation } from '../hooks/useSegmentation'
import { useFpsMonitor } from '../hooks/useFpsMonitor'
import { useARStore } from '../store'

interface ARSceneProps {
  isStarted: boolean
}

export const ARScene: React.FC<ARSceneProps> = ({ isStarted }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<MindARController | null>(null)

  // callback ref でキャンバスマウントを確実に捕捉
  const [overlayCanvas, setOverlayCanvas] = useState<HTMLCanvasElement | null>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)

  const {
    setStatus,
    setError,
    setFps,
    isCharacterVisible,
    isOcclusionEnabled,
    setOcclusionEnabled,
  } = useARStore()

  // ---- セグメンテーション ----
  useSegmentation({
    enabled: isOcclusionEnabled,
    videoElement,
    overlayCanvas,
  })

  // ---- FPS モニター ----
  useFpsMonitor({
    active: isStarted,
    onFpsUpdate: setFps,
    onLowFps: () => {
      console.warn('[AR] 低 FPS のためオクルージョンを自動 OFF')
      setOcclusionEnabled(false)
    },
  })

  // ---- コールバック ----
  const handleTargetFound = useCallback(() => {
    setStatus('target_found')
  }, [setStatus])

  const handleTargetLost = useCallback(() => {
    setStatus('searching')
  }, [setStatus])

  const handleStarted = useCallback(() => {
    setStatus('camera_ready')

    // MindAR が DOM に video 要素を追加するのを待ってから取得
    const tryFindVideo = () => {
      const video = containerRef.current?.querySelector('video') ?? null
      if (video) {
        setVideoElement(video)
        setStatus('searching')
      } else {
        setTimeout(tryFindVideo, 300)
      }
    }
    setTimeout(tryFindVideo, 600)
  }, [setStatus])

  const handleError = useCallback(
    (error: Error) => {
      console.error('[ARScene] Error:', error)
      setError(error.message)
      setStatus('error')
    },
    [setError, setStatus]
  )

  // ---- AR 起動 / 停止 ----
  useEffect(() => {
    if (!isStarted || !containerRef.current) return

    setStatus('starting')
    const controller = new MindARController()
    controllerRef.current = controller

    controller.start({
      container: containerRef.current,
      onTargetFound: handleTargetFound,
      onTargetLost: handleTargetLost,
      onStarted: handleStarted,
      onError: handleError,
      isCharacterVisible,
    })

    return () => {
      controller.stop()
      controllerRef.current = null
      setVideoElement(null)
      setStatus('idle')
    }
    // isCharacterVisible は依存から外す (起動後は setCharacterVisible で制御)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStarted])

  // ---- キャラ表示切替 ----
  useEffect(() => {
    controllerRef.current?.setCharacterVisible(isCharacterVisible)
  }, [isCharacterVisible])

  if (!isStarted) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* MindAR が video + Three.js canvas を追加するコンテナ */}
      {/* zIndex: 1 で独自 stacking context を作成し、MindAR が追加する video (z-index:-2) を
          祖先の黒背景より手前に描画させる。
          transform/willChange で GPU compositing layer に固定し、iOS Safari で video が
          消えるのを防ぐ。 */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
        }}
      />

      {/* オクルージョン オーバーレイ (Three.js キャンバスの上に重ねる) */}
      <canvas
        ref={setOverlayCanvas}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    </div>
  )
}

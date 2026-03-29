/**
 * useSegmentation
 * MediaPipe Selfie Segmentation を使って前景マスクを描画するフック
 *
 * 描画ロジック:
 *  1. overlayCanvas にビデオフレームを描画
 *  2. セグメンテーションマスク (人物=白) で destination-in クリッピング
 *  3. 結果: 人物ピクセルだけが残り、背景は透明
 *  → Three.js キャンバス(中間レイヤー)の上に人物が重なってキャラが隠れて見える
 */

import { useEffect, useRef } from 'react'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'
import type { Results } from '@mediapipe/selfie_segmentation'
import { CONFIG } from '../config'

interface UseSegmentationOptions {
  enabled: boolean
  videoElement: HTMLVideoElement | null
  overlayCanvas: HTMLCanvasElement | null
}

export function useSegmentation({
  enabled,
  videoElement,
  overlayCanvas,
}: UseSegmentationOptions): void {
  const segRef = useRef<SelfieSegmentation | null>(null)
  const frameRef = useRef<number>(0)
  const processingRef = useRef(false)

  useEffect(() => {
    // オフ or 必要要素なし → キャンバスをクリア
    if (!enabled || !videoElement || !overlayCanvas) {
      if (overlayCanvas) {
        const ctx = overlayCanvas.getContext('2d')
        ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      }
      return
    }

    const seg = new SelfieSegmentation({
      locateFile: (file) =>
        // WASM・モデルファイルは CDN から取得 (ローカルに置く必要なし)
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`,
    })

    seg.setOptions({
      modelSelection: CONFIG.SEGMENTATION_MODEL,
      selfieMode: false,
    })

    seg.onResults((results: Results) => {
      if (!overlayCanvas || !videoElement) return
      const ctx = overlayCanvas.getContext('2d')
      if (!ctx) return

      // キャンバスを表示サイズに同期 (CSS 100% に対して実解像度をセット)
      const rect = overlayCanvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const targetW = Math.round(rect.width * dpr)
      const targetH = Math.round(rect.height * dpr)
      if (overlayCanvas.width !== targetW || overlayCanvas.height !== targetH) {
        overlayCanvas.width = targetW
        overlayCanvas.height = targetH
      }

      const { width, height } = overlayCanvas
      if (width === 0 || height === 0) return

      ctx.save()
      ctx.clearRect(0, 0, width, height)

      // ①  実際のカメラフレームをフルサイズで描画
      ctx.drawImage(videoElement, 0, 0, width, height)

      // ②  マスクで前景 (人物) 部分だけ残し、背景を透明化
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(results.segmentationMask, 0, 0, width, height)

      ctx.restore()
    })

    segRef.current = seg

    // 推論ループ
    const tick = async () => {
      if (segRef.current && !processingRef.current && videoElement.readyState >= 2) {
        processingRef.current = true
        try {
          await segRef.current.send({ image: videoElement })
        } catch {
          // フレームエラーは無視して継続
        }
        processingRef.current = false
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frameRef.current)
      seg.close().catch(() => {})
      segRef.current = null
      // オーバーレイをクリア
      const ctx = overlayCanvas.getContext('2d')
      ctx?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
    }
  }, [enabled, videoElement, overlayCanvas])
}

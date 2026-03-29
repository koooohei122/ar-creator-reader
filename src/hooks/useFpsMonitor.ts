/**
 * useFpsMonitor
 * FPS を計測し、低 FPS 時に自動でオクルージョンを無効化する
 */

import { useEffect, useRef } from 'react'
import { CONFIG } from '../config'

interface UseFpsMonitorOptions {
  active: boolean
  onLowFps: () => void
  onFpsUpdate: (fps: number) => void
}

export function useFpsMonitor({ active, onLowFps, onFpsUpdate }: UseFpsMonitorOptions): void {
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const rafRef = useRef<number>(0)
  const hasDisabledRef = useRef(false)

  useEffect(() => {
    if (!active) return

    const tick = () => {
      frameCountRef.current++
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    const intervalId = setInterval(() => {
      const now = performance.now()
      const elapsed = (now - lastTimeRef.current) / 1000
      const fps = Math.round(frameCountRef.current / elapsed)

      onFpsUpdate(fps)
      frameCountRef.current = 0
      lastTimeRef.current = now

      // FPS が閾値を下回ったら一度だけ自動 OFF
      if (!hasDisabledRef.current && fps < CONFIG.FPS_THRESHOLD_DISABLE_OCCLUSION && fps > 0) {
        console.warn(`[FPS] 低 FPS 検知 (${fps}fps) → オクルージョン自動 OFF`)
        hasDisabledRef.current = true
        onLowFps()
      }
    }, CONFIG.FPS_CHECK_INTERVAL_MS)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearInterval(intervalId)
    }
  }, [active, onLowFps, onFpsUpdate])
}

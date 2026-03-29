import React, { useState } from 'react'
import { ARScene } from './components/ARScene'
import { UIControls } from './components/UIControls'
import { StatusBadge } from './components/StatusBadge'
import { GuideOverlay } from './components/GuideOverlay'
import { DebugPanel } from './components/DebugPanel'
import { useARStore } from './store'

const App: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false)
  const { status, isDebugVisible, setError } = useARStore()

  const handleStart = () => {
    setError(null)
    setIsStarted(true)
  }

  const handleStop = () => {
    setIsStarted(false)
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: '#000',
        overflow: 'hidden',
      }}
    >
      {/* AR 描画レイヤー */}
      <ARScene isStarted={isStarted} />

      {/* ステータスバッジ (上部) */}
      {isStarted && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            whiteSpace: 'nowrap',
          }}
        >
          <StatusBadge status={status} />
        </div>
      )}

      {/* スキャンガイド */}
      {isStarted && <GuideOverlay status={status} />}

      {/* デバッグパネル */}
      {isStarted && isDebugVisible && <DebugPanel />}

      {/* UI コントロール */}
      <UIControls isStarted={isStarted} onStart={handleStart} onStop={handleStop} />
    </div>
  )
}

export default App

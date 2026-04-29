import React, { useState } from 'react'
import { ARScene } from './components/ARScene'
import { UIControls } from './components/UIControls'
import { StatusBadge } from './components/StatusBadge'
import { GuideOverlay } from './components/GuideOverlay'
import { DebugPanel } from './components/DebugPanel'
import { useARStore } from './store'

const App: React.FC = () => {
  const [isStarted, setIsStarted] = useState(false)
  const { status, isDebugVisible, errorMessage, setError, setStatus } = useARStore()

  const handleStart = () => {
    setError(null)
    setIsStarted(true)
  }

  const handleStop = () => {
    setIsStarted(false)
    setStatus('idle')
    setError(null)
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      {/* AR 描画レイヤー */}
      <ARScene isStarted={isStarted} />

      {/* ステータスバッジ */}
      {isStarted && status !== 'error' && (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 30, whiteSpace: 'nowrap' }}>
          <StatusBadge status={status} />
        </div>
      )}

      {/* スキャンガイド */}
      {isStarted && <GuideOverlay status={status} />}

      {/* デバッグパネル */}
      {isStarted && isDebugVisible && <DebugPanel />}

      {/* ---- エラーオーバーレイ ---- */}
      {isStarted && status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, gap: 20,
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <p style={{ color: '#ff6b6b', fontWeight: 700, fontSize: 18, margin: 0 }}>エラーが発生しました</p>
          <div style={{
            background: 'rgba(255,100,100,0.1)', border: '1px solid #ff6b6b',
            borderRadius: 12, padding: '14px 20px',
            color: '#ffaaaa', fontSize: 13, textAlign: 'center',
            maxWidth: 340, lineHeight: 1.7, wordBreak: 'break-all',
          }}>
            {errorMessage ?? '不明なエラー'}
          </div>
          <p style={{ color: '#888', fontSize: 12, textAlign: 'center', margin: 0, maxWidth: 300, lineHeight: 1.7 }}>
            • カメラの許可を確認してください<br />
            • HTTPS (GitHub Pages) でアクセスしているか確認<br />
            • ページをリロードして再試行
          </p>
          <button
            onClick={handleStop}
            style={{
              padding: '12px 36px', fontSize: 16, fontWeight: 700,
              background: '#1976d2', color: '#fff',
              border: 'none', borderRadius: 50, cursor: 'pointer',
            }}
          >
            ← スタート画面に戻る
          </button>
        </div>
      )}

      {/* UI コントロール */}
      <UIControls isStarted={isStarted} onStart={handleStart} onStop={handleStop} />
    </div>
  )
}

export default App

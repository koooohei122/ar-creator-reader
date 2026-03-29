/**
 * UIControls
 * AR 開始/停止ボタン + 各種トグルを表示する UI コンポーネント
 */

import React from 'react'
import { useARStore } from '../store'

interface UIControlsProps {
  isStarted: boolean
  onStart: () => void
  onStop: () => void
}

// ---- 汎用トグルボタン ----
interface ToggleProps {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange, disabled }) => (
  <button
    onClick={() => !disabled && onChange(!checked)}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      background: checked
        ? 'rgba(79,195,247,0.2)'
        : 'rgba(255,255,255,0.07)',
      border: `1.5px solid ${checked ? '#4fc3f7' : 'rgba(255,255,255,0.25)'}`,
      borderRadius: 20,
      color: checked ? '#4fc3f7' : '#aaa',
      fontSize: 13,
      fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      backdropFilter: 'blur(6px)',
      transition: 'all 0.2s',
      minWidth: 0,
      flexShrink: 0,
    }}
  >
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        border: `2px solid ${checked ? '#4fc3f7' : '#666'}`,
        background: checked ? '#4fc3f7' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: '#000',
        flexShrink: 0,
      }}
    >
      {checked ? '✓' : ''}
    </span>
    {label}
  </button>
)

// ---- メイン UI ----
export const UIControls: React.FC<UIControlsProps> = ({ isStarted, onStart, onStop }) => {
  const {
    isCharacterVisible,
    isOcclusionEnabled,
    isDebugVisible,
    errorMessage,
    setCharacterVisible,
    setOcclusionEnabled,
    setDebugVisible,
  } = useARStore()

  return (
    <>
      {/* Start / Stop ボタン (中央) */}
      {!isStarted && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            gap: 24,
          }}
        >
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>🌐 Web AR</div>
            <div style={{ fontSize: 14, color: '#aaa' }}>
              カメラを起動して AR を体験
            </div>
          </div>

          <button
            onClick={onStart}
            style={{
              padding: '16px 48px',
              fontSize: 18,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4fc3f7, #0288d1)',
              color: '#fff',
              border: 'none',
              borderRadius: 50,
              cursor: 'pointer',
              boxShadow: '0 4px 24px rgba(79,195,247,0.4)',
              transition: 'transform 0.15s',
            }}
            onMouseDown={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)')}
            onMouseUp={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
          >
            Start AR
          </button>

          {errorMessage && (
            <div
              style={{
                maxWidth: 320,
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid #ef4444',
                borderRadius: 10,
                color: '#fca5a5',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              ⚠ {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* 実行中コントロール (下部) */}
      {isStarted && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 8,
            padding: '0 12px',
            maxWidth: '100vw',
          }}
        >
          <Toggle
            label="キャラ表示"
            checked={isCharacterVisible}
            onChange={setCharacterVisible}
          />
          <Toggle
            label="オクルージョン"
            checked={isOcclusionEnabled}
            onChange={setOcclusionEnabled}
          />
          <Toggle
            label="デバッグ"
            checked={isDebugVisible}
            onChange={setDebugVisible}
          />
          <button
            onClick={onStop}
            style={{
              padding: '8px 18px',
              background: 'rgba(239,68,68,0.2)',
              border: '1.5px solid #ef4444',
              borderRadius: 20,
              color: '#ef4444',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            停止
          </button>
        </div>
      )}
    </>
  )
}

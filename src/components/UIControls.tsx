/**
 * UIControls
 * AR 開始/停止ボタン + 各種トグルを表示する UI コンポーネント
 */

import React, { useState } from 'react'
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
      background: checked ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.07)',
      border: `1.5px solid ${checked ? '#4fc3f7' : 'rgba(255,255,255,0.25)'}`,
      borderRadius: 20,
      color: checked ? '#4fc3f7' : '#aaa',
      fontSize: 13,
      fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      backdropFilter: 'blur(6px)',
      transition: 'all 0.2s',
      flexShrink: 0,
    }}
  >
    <span
      style={{
        width: 16, height: 16, borderRadius: 4,
        border: `2px solid ${checked ? '#4fc3f7' : '#666'}`,
        background: checked ? '#4fc3f7' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: '#000', flexShrink: 0,
      }}
    >
      {checked ? '✓' : ''}
    </span>
    {label}
  </button>
)

// ---- マーカー表示モーダル ----
const MarkerModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 20, gap: 16,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#fff', borderRadius: 16, padding: 20,
        maxWidth: 340, width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}
    >
      <p style={{ color: '#333', fontWeight: 700, fontSize: 15, margin: 0 }}>
        このマーカーをスキャン
      </p>

      {/* マーカー画像 */}
      <img
        src="targets/marker.jpg"
        alt="AR Marker"
        style={{ width: '100%', maxWidth: 260, borderRadius: 8, border: '2px solid #eee' }}
      />

      <p style={{ color: '#666', fontSize: 13, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
        ① この画像を印刷するか<br />
        ② 別のスマホ・PC に表示して<br />
        カメラでスキャンしてください
      </p>

      {/* ダウンロードリンク */}
      <a
        href="targets/marker.jpg"
        download="ar-marker.png"
        style={{
          padding: '10px 24px',
          background: '#1976d2', color: '#fff',
          borderRadius: 20, textDecoration: 'none',
          fontSize: 14, fontWeight: 600,
        }}
      >
        画像を保存
      </a>

      <button
        onClick={onClose}
        style={{
          border: 'none', background: 'none',
          color: '#999', fontSize: 14, cursor: 'pointer', padding: 4,
        }}
      >
        閉じる
      </button>
    </div>
  </div>
)

// ---- メイン UI ----
export const UIControls: React.FC<UIControlsProps> = ({ isStarted, onStart, onStop }) => {
  const {
    isCharacterVisible, isOcclusionEnabled, isDebugVisible, errorMessage,
    setCharacterVisible, setOcclusionEnabled, setDebugVisible,
  } = useARStore()

  const [showMarker, setShowMarker] = useState(false)

  return (
    <>
      {showMarker && <MarkerModal onClose={() => setShowMarker(false)} />}

      {/* ---- スタート画面 ---- */}
      {!isStarted && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 50,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 20, padding: '24px 20px',
            background: 'linear-gradient(160deg, #0a0a1a 0%, #0d1b2a 100%)',
          }}
        >
          {/* タイトル */}
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>⭐ Web AR</div>
            <div style={{ fontSize: 14, color: '#90caf9' }}>
              マーカーを映すと 3D キャラが出現
            </div>
          </div>

          {/* マーカー手順カード */}
          <div
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 16, padding: '16px 20px',
              maxWidth: 320, width: '100%',
            }}
          >
            <p style={{ color: '#ccc', fontSize: 13, margin: '0 0 12px', fontWeight: 600 }}>
              使い方
            </p>
            <ol style={{ color: '#aaa', fontSize: 13, paddingLeft: 18, margin: 0, lineHeight: 2 }}>
              <li>下の「マーカーを表示」で画像を確認</li>
              <li>印刷するか別の画面に表示する</li>
              <li>「Start AR」でカメラを起動</li>
              <li>マーカーにカメラを向ける ✓</li>
            </ol>
          </div>

          {/* マーカー表示ボタン */}
          <button
            onClick={() => setShowMarker(true)}
            style={{
              padding: '12px 28px', fontSize: 15, fontWeight: 700,
              background: 'rgba(79,195,247,0.15)',
              border: '2px solid #4fc3f7',
              borderRadius: 50, color: '#4fc3f7', cursor: 'pointer',
              maxWidth: 280, width: '100%',
            }}
          >
            ⭐ マーカーを表示
          </button>

          {/* Start AR ボタン */}
          <button
            onClick={onStart}
            style={{
              padding: '16px 0', fontSize: 18, fontWeight: 700,
              background: 'linear-gradient(135deg, #4fc3f7, #0288d1)',
              color: '#fff', border: 'none', borderRadius: 50,
              cursor: 'pointer', maxWidth: 280, width: '100%',
              boxShadow: '0 4px 24px rgba(79,195,247,0.35)',
            }}
          >
            Start AR
          </button>

          {/* エラー表示 */}
          {errorMessage && (
            <div
              style={{
                maxWidth: 320, padding: '12px 16px',
                background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444',
                borderRadius: 10, color: '#fca5a5', fontSize: 13, textAlign: 'center',
              }}
            >
              ⚠ {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* ---- 実行中コントロール (下部) ---- */}
      {isStarted && (
        <div
          style={{
            position: 'absolute', bottom: 24, left: '50%',
            transform: 'translateX(-50%)', zIndex: 30,
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
            gap: 8, padding: '0 12px', maxWidth: '100vw',
          }}
        >
          <Toggle label="キャラ表示" checked={isCharacterVisible} onChange={setCharacterVisible} />
          <Toggle label="オクルージョン" checked={isOcclusionEnabled} onChange={setOcclusionEnabled} />
          <Toggle label="デバッグ" checked={isDebugVisible} onChange={setDebugVisible} />
          <button
            onClick={onStop}
            style={{
              padding: '8px 18px',
              background: 'rgba(239,68,68,0.2)', border: '1.5px solid #ef4444',
              borderRadius: 20, color: '#ef4444',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
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

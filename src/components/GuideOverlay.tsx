/**
 * GuideOverlay
 * ターゲット未検出時にユーザーへの案内を表示する
 */

import React from 'react'
import type { ARStatus } from '../store'

interface GuideOverlayProps {
  status: ARStatus
}

export const GuideOverlay: React.FC<GuideOverlayProps> = ({ status }) => {
  if (status === 'target_found' || status === 'idle' || status === 'error') return null

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 20,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      {/* スキャン枠アニメーション */}
      <div
        style={{
          width: 160,
          height: 160,
          position: 'relative',
        }}
      >
        {/* 四隅 */}
        {[
          { top: 0, left: 0, borderTop: '3px solid #4fc3f7', borderLeft: '3px solid #4fc3f7' },
          { top: 0, right: 0, borderTop: '3px solid #4fc3f7', borderRight: '3px solid #4fc3f7' },
          { bottom: 0, left: 0, borderBottom: '3px solid #4fc3f7', borderLeft: '3px solid #4fc3f7' },
          { bottom: 0, right: 0, borderBottom: '3px solid #4fc3f7', borderRight: '3px solid #4fc3f7' },
        ].map((style, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 28,
              height: 28,
              ...style,
            }}
          />
        ))}

        {/* スキャンライン */}
        <div
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            height: 2,
            background: 'linear-gradient(90deg, transparent, #4fc3f7, transparent)',
            animation: 'scan 2s linear infinite',
          }}
        />
      </div>

      <p
        style={{
          color: '#e0f7fa',
          fontSize: 14,
          fontWeight: 600,
          textAlign: 'center',
          background: 'rgba(0,0,0,0.5)',
          padding: '6px 16px',
          borderRadius: 12,
          backdropFilter: 'blur(4px)',
        }}
      >
        青いカードをカメラに向けてください
      </p>

      <style>{`
        @keyframes scan {
          0% { top: 4px; }
          100% { top: calc(100% - 6px); }
        }
      `}</style>
    </div>
  )
}

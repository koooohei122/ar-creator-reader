/**
 * WebLinkPanel
 * マーカー認識中に画面下部に浮かび上がる「サイトを開く」パネル
 */

import React, { useEffect, useState } from 'react'
import { CONFIG } from '../config'
import type { ARStatus } from '../store'

interface WebLinkPanelProps {
  status: ARStatus
}

export const WebLinkPanel: React.FC<WebLinkPanelProps> = ({ status }) => {
  const [visible, setVisible] = useState(false)

  // target_found になったらふわっと表示、見失ったら消える
  useEffect(() => {
    if (status === 'target_found') {
      const t = setTimeout(() => setVisible(true), 200)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
    }
  }, [status])

  // URL が設定されていなければ何も表示しない
  if (!CONFIG.TARGET_URL) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 100,
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? 0 : 30}px)`,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        zIndex: 25,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <a
        href={CONFIG.TARGET_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 28px',
          background: 'linear-gradient(135deg, #0288d1, #26c6da)',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: 50,
          fontWeight: 700,
          fontSize: 16,
          boxShadow: '0 4px 20px rgba(2,136,209,0.5)',
          backdropFilter: 'blur(8px)',
          border: '1.5px solid rgba(255,255,255,0.3)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 20 }}>🌐</span>
        {CONFIG.TARGET_URL_LABEL}
        <span style={{ fontSize: 14, opacity: 0.8 }}>→</span>
      </a>

      {/* URL の小さい表示 */}
      <p style={{
        textAlign: 'center',
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        marginTop: 6,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 300,
      }}>
        {CONFIG.TARGET_URL}
      </p>
    </div>
  )
}

import React from 'react'
import { useARStore } from '../store'

export const DebugPanel: React.FC = () => {
  const { status, fps, isOcclusionEnabled, isCharacterVisible, errorMessage } = useARStore()

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 10,
        zIndex: 30,
        background: 'rgba(0,0,0,0.72)',
        color: '#7fff7f',
        fontFamily: 'monospace',
        fontSize: 12,
        padding: '8px 12px',
        borderRadius: 8,
        lineHeight: 1.7,
        pointerEvents: 'none',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(127,255,127,0.3)',
        minWidth: 200,
      }}
    >
      <div style={{ color: '#aaffaa', marginBottom: 4, fontWeight: 700 }}>🐛 DEBUG</div>
      <div>status: <span style={{ color: '#fff' }}>{status}</span></div>
      <div>fps: <span style={{ color: fps < 20 ? '#ff6060' : '#fff' }}>{fps}</span></div>
      <div>occlusion: <span style={{ color: '#fff' }}>{isOcclusionEnabled ? 'ON' : 'OFF'}</span></div>
      <div>character: <span style={{ color: '#fff' }}>{isCharacterVisible ? 'ON' : 'OFF'}</span></div>
      {errorMessage && (
        <div style={{ color: '#ff6060', marginTop: 4, maxWidth: 240, wordBreak: 'break-all' }}>
          ⚠ {errorMessage}
        </div>
      )}
    </div>
  )
}

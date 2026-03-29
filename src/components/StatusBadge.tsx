import React from 'react'
import type { ARStatus } from '../store'

const STATUS_LABELS: Record<ARStatus, string> = {
  idle: '待機中',
  starting: 'カメラ起動中...',
  camera_ready: 'カメラ準備完了',
  searching: 'マーカーを探しています',
  target_found: 'ターゲット認識中 ✓',
  error: 'エラー',
}

const STATUS_COLORS: Record<ARStatus, string> = {
  idle: '#555',
  starting: '#f59e0b',
  camera_ready: '#3b82f6',
  searching: '#8b5cf6',
  target_found: '#10b981',
  error: '#ef4444',
}

interface StatusBadgeProps {
  status: ARStatus
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 12px',
      borderRadius: 20,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(6px)',
      border: `1.5px solid ${STATUS_COLORS[status]}`,
      color: STATUS_COLORS[status],
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: '0.03em',
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: STATUS_COLORS[status],
        flexShrink: 0,
        animation: status === 'searching' ? 'pulse 1.2s ease-in-out infinite' : 'none',
      }}
    />
    {STATUS_LABELS[status]}
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `}</style>
  </div>
)

import { create } from 'zustand'
import { CONFIG } from './config'

export type ARStatus =
  | 'idle'
  | 'starting'
  | 'camera_ready'
  | 'searching'
  | 'target_found'
  | 'error'

interface ARStore {
  status: ARStatus
  isCharacterVisible: boolean
  isOcclusionEnabled: boolean
  isDebugVisible: boolean
  fps: number
  errorMessage: string | null

  setStatus: (status: ARStatus) => void
  setCharacterVisible: (v: boolean) => void
  setOcclusionEnabled: (v: boolean) => void
  setDebugVisible: (v: boolean) => void
  setFps: (fps: number) => void
  setError: (msg: string | null) => void
}

export const useARStore = create<ARStore>((set) => ({
  status: 'idle',
  isCharacterVisible: true,
  isOcclusionEnabled: CONFIG.SEGMENTATION_ENABLED_DEFAULT,
  isDebugVisible: CONFIG.DEBUG_DEFAULT,
  fps: 0,
  errorMessage: null,

  setStatus: (status) => set({ status }),
  setCharacterVisible: (isCharacterVisible) => set({ isCharacterVisible }),
  setOcclusionEnabled: (isOcclusionEnabled) => set({ isOcclusionEnabled }),
  setDebugVisible: (isDebugVisible) => set({ isDebugVisible }),
  setFps: (fps) => set({ fps }),
  setError: (errorMessage) => set({ errorMessage }),
}))

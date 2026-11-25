export const COURT_CAMERAS = {
  baseline: 'Baseline',
  player: 'Player',
  overhead: 'Overhead',
  side: 'Sideline',
  net: 'Net cam',
  chase: 'Ball chase',
  orbit: 'Free orbit',
} as const

export const LAB_CAMERAS = {
  quarter: 'Three-quarter',
  front: 'Front',
  side: 'Profile',
  rear: 'Rear',
  low: 'Court level',
  orbit: 'Free orbit',
} as const

export type CameraMode = keyof typeof COURT_CAMERAS
export type LabAngle = keyof typeof LAB_CAMERAS
export type Orbit = { yaw: number; elevation: number; zoom: number }
export const courtOrbit = (): Orbit => ({ yaw: .35, elevation: .47, zoom: 1 })
export const athleteOrbit = (): Orbit => ({ yaw: 2.48, elevation: .20, zoom: 1 })

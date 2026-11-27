import { clamp, type Vec3 } from './config.ts'

export const COURT_CAMERAS = {
  baseline: 'Baseline',
  player: 'Player',
  overhead: 'Overhead',
  side: 'Sideline',
  net: 'Net cam',
  chase: 'Ball chase',
  contact: 'Contact close-up',
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
export type Orbit = { yaw: number; elevation: number; zoom: number; target: Vec3; radius: number; fov: number }
export const courtOrbit = (): Orbit => ({ yaw: .35, elevation: .47, zoom: 1, target: { x: 0, y: .55, z: -1.25 }, radius: 24, fov: 46 })
export const athleteOrbit = (): Orbit => ({ yaw: 2.48, elevation: .20, zoom: 1, target: { x: -.36, y: 1.05, z: 6.74 }, radius: 4.75, fov: 39 })

export function orbitFromView(eye: Vec3, look: Vec3, fov: number): Orbit {
  const x = eye.x - look.x, y = eye.y - look.y, z = eye.z - look.z
  return { yaw: Math.atan2(x, z), elevation: Math.atan2(y, Math.hypot(x, z)), zoom: 1,
    target: { x: look.x, y: look.y, z: look.z }, radius: Math.max(.1, Math.hypot(x, y, z)), fov }
}

export function rotateOrbit(orbit: Orbit, dx: number, dy: number) {
  orbit.yaw -= dx
  orbit.elevation = clamp(orbit.elevation + dy, -.38, Math.PI / 2 - .00001)
}

export function zoomOrbit(orbit: Orbit, factor: number) {
  orbit.zoom = clamp(orbit.zoom * factor, .30, 2.5)
}

export function panOrbit(orbit: Orbit, dx: number, dy: number, height: number, closeup: boolean) {
  const metres = 2 * orbit.radius * orbit.zoom * Math.tan(orbit.fov * Math.PI / 360) / Math.max(1, height)
  const right = -dx * metres, up = dy * metres
  const sin = Math.sin(orbit.yaw), cos = Math.cos(orbit.yaw)
  const forward = -up * Math.sin(orbit.elevation)
  const target = orbit.target
  target.x = clamp(target.x + right * cos + forward * sin, closeup ? -3.8 : -14, closeup ? 3 : 14)
  target.z = clamp(target.z - right * sin + forward * cos, closeup ? 3 : -19, closeup ? 10.5 : 19)
  target.y = clamp(target.y + up * Math.cos(orbit.elevation), closeup ? .02 : -.9, closeup ? 3.2 : 11)
}

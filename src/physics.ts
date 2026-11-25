import { COURT, SHOTS, SURFACES, clamp, type Aim, type Shot, type Surface, type Vec3 } from './config.ts'

export const GRAVITY = 9.81
export const BALL_MASS = 0.057
const DRAG = 0.014
const MAGNUS = 0.00016
export const STEP = 1 / 120

export interface Ball {
  position: Vec3
  velocity: Vec3
  spin: number
  sideSpin: number
  bounces: number
}

export interface Conditions {
  surface: Surface
  wind: number
}

export type ContactKind = 'racket' | 'court' | 'net'
export interface Contact {
  kind: ContactKind
  position: Vec3
  before: Vec3
  after: Vec3
  duration: number
}
export type Impact = { kind: 'net' | 'bounce'; position: Vec3; contact: Contact }

const BOUNCE_DURATION: Record<Surface, number> = { hard: .005, clay: .0065, grass: .0055 }

export function contactAt(kind: ContactKind, position: Vec3, before: Vec3, after: Vec3, surface: Surface): Contact {
  const duration = kind === 'racket' ? .005 : kind === 'net' ? .018 : BOUNCE_DURATION[surface]
  return { kind, position: { ...position }, before: { ...before }, after: { ...after }, duration }
}

export function netHeight(x: number): number {
  return COURT.netCenter + (COURT.netPost - COURT.netCenter) * Math.min(1, (x / COURT.stickX) ** 2)
}

export function makeBall(position: Vec3, velocity: Vec3, spin = 0, sideSpin = 0): Ball {
  return { position: { ...position }, velocity: { ...velocity }, spin, sideSpin, bounces: 0 }
}

export function speedOf(velocity: Vec3): number {
  return Math.hypot(velocity.x, velocity.y, velocity.z)
}

function aerodynamicAcceleration(ball: Ball, wind: number) {
  const { velocity, spin, sideSpin } = ball
  const airX = velocity.x - wind
  const airZ = velocity.z
  const travelSpeed = Math.hypot(airX, airZ)
  const drag = DRAG * Math.hypot(travelSpeed, velocity.y)
  const lift = clamp(-MAGNUS * spin * travelSpeed, -9, 9)
  const curl = MAGNUS * sideSpin
  return { dragX: -drag * airX, dragY: -drag * velocity.y, dragZ: -drag * airZ, lift, curlX: curl * airZ, curlZ: -curl * airX }
}

export function flightForces(ball: Ball, wind: number) {
  const a = aerodynamicAcceleration(ball, wind)
  return {
    gravity: { x: 0, y: -BALL_MASS * GRAVITY, z: 0 },
    drag: { x: BALL_MASS * a.dragX, y: BALL_MASS * a.dragY, z: BALL_MASS * a.dragZ },
    magnus: { x: BALL_MASS * a.curlX, y: BALL_MASS * a.lift, z: BALL_MASS * a.curlZ },
  }
}

export function analyzeContact(contact: Contact) {
  const { before, after, duration } = contact
  const impulse = { x: BALL_MASS * (after.x - before.x), y: BALL_MASS * (after.y - before.y), z: BALL_MASS * (after.z - before.z) }
  const force = { x: impulse.x / duration, y: impulse.y / duration, z: impulse.z / duration }
  const energy = (v: Vec3) => BALL_MASS * speedOf(v) ** 2 / 2
  return { impulse, force, beforeEnergy: energy(before), afterEnergy: energy(after) }
}

function integrate(ball: Ball, dt: number, wind: number): void {
  const { position, velocity } = ball
  const a = aerodynamicAcceleration(ball, wind)
  velocity.x += (a.dragX + a.curlX) * dt
  velocity.y += (-GRAVITY + a.dragY + a.lift) * dt
  velocity.z += (a.dragZ + a.curlZ) * dt
  position.x += velocity.x * dt
  position.y += velocity.y * dt
  position.z += velocity.z * dt
}

export function stepBall(ball: Ball, dt: number, conditions: Conditions, collideWithNet = true): Impact | null {
  const { position, velocity } = ball
  const previous = { ...position }
  integrate(ball, dt, conditions.wind)
  if (collideWithNet && previous.z * position.z <= 0 && previous.z !== position.z) {
    const fraction = previous.z / (previous.z - position.z)
    const x = previous.x + (position.x - previous.x) * fraction
    const y = previous.y + (position.y - previous.y) * fraction
    if (Math.abs(x) <= COURT.postX && y < netHeight(x) + COURT.ballRadius) {
      const before = { ...velocity }
      position.z = Math.sign(previous.z || -velocity.z) * COURT.ballRadius
      velocity.z *= -0.19
      velocity.x *= 0.46
      velocity.y = Math.min(velocity.y, 0) - 0.6
      ball.spin *= 0.5
      ball.sideSpin *= 0.5
      const point = { x, y, z: 0 }
      return { kind: 'net', position: point, contact: contactAt('net', point, before, velocity, conditions.surface) }
    }
  }
  if (position.y <= COURT.ballRadius && velocity.y < 0) {
    const before = { ...velocity }
    const fraction = clamp((previous.y - COURT.ballRadius) / (previous.y - position.y), 0, 1)
    position.x = previous.x + (position.x - previous.x) * fraction
    position.z = previous.z + (position.z - previous.z) * fraction
    position.y = COURT.ballRadius
    const { restitution, grip } = SURFACES[conditions.surface]
    const spinKick = clamp(ball.spin / 42000, -0.055, 0.07)
    velocity.y *= -restitution
    velocity.x *= grip + spinKick
    velocity.z *= grip + spinKick
    ball.spin *= 0.63
    ball.sideSpin *= 0.7
    ball.bounces += 1
    return { kind: 'bounce', position: { ...position }, contact: contactAt('court', position, before, velocity, conditions.surface) }
  }
  return null
}

/** Solve the launch velocity for a prescribed arrival point and flight time. */
export function launchTo(start: Vec3, end: Aim, duration: number, spin: number, wind: number, sideSpin = 0): Ball {
  const target = { ...end, y: COURT.ballRadius }
  const velocity = {
    x: (target.x - start.x) / duration,
    y: (target.y - start.y) / duration + GRAVITY * duration / 2,
    z: (target.z - start.z) / duration,
  }
  const steps = Math.ceil(duration / STEP)
  const dt = duration / steps
  for (let pass = 0; pass < 7; pass += 1) {
    const test = makeBall(start, velocity, spin, sideSpin)
    for (let step = 0; step < steps; step += 1) integrate(test, dt, wind)
    velocity.x += (target.x - test.position.x) * 1.13 / duration
    velocity.y += (target.y - test.position.y) * 1.13 / duration
    velocity.z += (target.z - test.position.z) * 1.13 / duration
  }
  return makeBall(start, velocity, spin, sideSpin)
}

export function shotBall(start: Vec3, aim: Aim, shot: Shot, serve: boolean, quality: number): Ball {
  const preset = SHOTS[shot]
  const duration = (serve ? preset.serveDuration : preset.duration) + (1 - quality) * 0.09
  const sliceServe = serve && shot === 'slice'
  // Aim describes the calm-air landing. Wind and off-center timing change the result.
  return launchTo(start, aim, duration, sliceServe ? 510 : preset.spin, 0, sliceServe ? 1800 : 0)
}

export interface FlightPoint extends Vec3 {
  t: number
}

export function traceBall(initial: Ball, conditions: Conditions, seconds = 2.4, stopAtFirstBounce = false) {
  const ball = { ...makeBall(initial.position, initial.velocity, initial.spin, initial.sideSpin), bounces: initial.bounces }
  const points: FlightPoint[] = [{ ...ball.position, t: 0 }]
  let landing: Vec3 | null = null
  let net: Vec3 | null = null
  let bounceHeight = 0
  let apex = ball.position.y
  let clearance: number | null = null
  for (let step = 0; step < Math.ceil(seconds / STEP); step += 1) {
    const previous = { ...ball.position }
    const impact = stepBall(ball, STEP, conditions)
    if (clearance === null && previous.z * ball.position.z <= 0 && previous.z !== ball.position.z) {
      const fraction = previous.z / (previous.z - ball.position.z)
      const x = previous.x + (ball.position.x - previous.x) * fraction
      const y = previous.y + (ball.position.y - previous.y) * fraction
      if (Math.abs(x) <= COURT.postX) clearance = y - netHeight(x) - COURT.ballRadius
    }
    if (impact?.kind === 'net') {
      net = impact.position
      clearance = impact.position.y - netHeight(impact.position.x) - COURT.ballRadius
    }
    if (impact?.kind === 'bounce' && !landing) landing = impact.position
    apex = Math.max(apex, ball.position.y)
    if (ball.bounces === initial.bounces + 1) bounceHeight = Math.max(bounceHeight, ball.position.y)
    if (step % 3 === 0 || impact) points.push({ ...ball.position, t: (step + 1) * STEP })
    if ((stopAtFirstBounce && landing) || ball.bounces > initial.bounces + 1) break
  }
  return { points, landing, net, apex, bounceHeight, clearance }
}

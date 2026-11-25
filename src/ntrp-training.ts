import { COURT, clamp, type Aim, type DrillId, type Shot, type Trajectory, type Zone } from './config.ts'
import { EXERCISES, NTRP, NTRP_LEVELS, type Exercise, type NtrpLevel, type NtrpSkill } from './ntrp.ts'
import { launchTo, type Ball } from './physics.ts'

export type Take = 'afterBounce' | 'beforeBounce' | 'rising' | 'overhead' | 'toss'
export type Score = 'placement' | 'recovery' | 'rally' | 'pattern'
type Direction = 'forehand' | 'backhand' | 'sides'
type Placement = 'ground' | 'service' | 'deep' | 'short' | 'lane' | 'court'

type ExerciseSettings = {
  base: DrillId
  take: Take
  trajectory: Trajectory
  score: Score
  placement: Placement
  direction: Direction
  shot: Shot
}

const defaults: ExerciseSettings = {
  base: 'forehand', take: 'afterBounce', trajectory: 'drive', score: 'placement',
  placement: 'ground', direction: 'forehand', shot: 'topspin',
}
const settings: Record<Exercise, Partial<ExerciseSettings>> = {
  forehand: {},
  backhand: { direction: 'backhand' },
  serve: { base: 'serve', take: 'toss', placement: 'service', shot: 'flat' },
  spinServe: { base: 'serve', take: 'toss', placement: 'service' },
  return: { direction: 'sides' },
  pressureReturn: { direction: 'sides', placement: 'lane', shot: 'flat' },
  volley: { take: 'beforeBounce', trajectory: 'volley', direction: 'sides', shot: 'flat' },
  lowVolley: { take: 'beforeBounce', trajectory: 'volley', direction: 'sides', shot: 'slice' },
  lob: { trajectory: 'lob', placement: 'deep', direction: 'sides' },
  drop: { trajectory: 'drop', placement: 'short', shot: 'slice' },
  approach: { base: 'footwork', score: 'recovery', placement: 'deep' },
  halfVolley: { take: 'rising', trajectory: 'volley', direction: 'sides', shot: 'flat' },
  overhead: { take: 'overhead', trajectory: 'smash', placement: 'deep', shot: 'flat' },
  pass: { direction: 'sides', placement: 'lane' },
  recovery: { base: 'footwork', score: 'recovery', placement: 'court', direction: 'sides' },
  rally: { base: 'rally', score: 'rally', placement: 'court', direction: 'sides' },
  doubles: { base: 'footwork', score: 'recovery', placement: 'lane', direction: 'sides' },
  pattern: { base: 'rally', score: 'pattern', placement: 'lane', direction: 'sides' },
}

export interface NtrpPlan extends ExerciseSettings {
  id: string
  level: NtrpLevel
  skill: NtrpSkill
  exercise: Exercise
  tier: number
  goal: number
  title: string
  cue: string
  objective: string
  home: Aim
  recover: Aim
  contactWindow: number
  paceLabel: string
}

export function ntrpPlan(level: NtrpLevel, skill: NtrpSkill, exercise: Exercise): NtrpPlan {
  if (!NTRP[level].skills[skill].exercises.includes(exercise)) {
    throw new RangeError(`Exercise ${exercise} is unavailable for ${level} ${skill}.`)
  }
  const tier = NTRP_LEVELS.indexOf(level)
  const config = { ...defaults, ...settings[exercise] }
  if (exercise === 'doubles' && tier >= 5) {
    config.take = 'beforeBounce'
    config.trajectory = 'volley'
    config.shot = 'flat'
  }
  const baseDepth = [6.6, 7.25, 8.65, 9.45, 10.42, 10.68, 10.90, 11.0][tier]
  const start: Aim = { x: config.direction === 'backhand' ? -.41 : config.direction === 'sides' ? 0 : .41, z: baseDepth }
  if (config.take === 'toss') start.z = 12.40
  if (exercise === 'return' || exercise === 'pressureReturn') {
    start.z = exercise === 'pressureReturn' ? 9.23 : 10.52
    start.x = 1.18
  }
  if (config.take === 'beforeBounce' || config.take === 'rising') start.z = 4.45 + .09 * tier
  if (exercise === 'overhead') start.z = 6.74
  if (exercise === 'approach') start.z = 8.32
  if (exercise === 'doubles') {
    start.x = 2.23
    if (tier < 5) start.z = 9.45
  }
  const recover = exercise === 'approach' ? { x: 0, z: 5.45 }
    : exercise === 'doubles' ? { ...start } : { x: 0, z: start.z }
  const goal = config.score === 'rally' ? (tier < 3 ? 3 : tier < 6 ? 5 : 6)
    : config.score === 'pattern' ? 2 : tier < 2 ? 3 : tier < 5 ? 4 : 5
  const objective = {
    placement: `Land ${goal} balls in the highlighted area.`,
    recovery: `Place the ball and recover to the ring ${goal} times.`,
    rally: `Keep ${goal} legal shots in a row.`,
    pattern: `Complete ${goal} two-ball patterns. Find depth first, then the open lane.`,
  }[config.score]
  return {
    ...config, id: `${level}:${skill}:${exercise}`, level, skill, exercise, tier, goal,
    title: EXERCISES[exercise].title, cue: EXERCISES[exercise].cue, objective, home: start, recover,
    contactWindow: [.32, .29, .25, .225, .195, .173, .155, .14][tier],
    paceLabel: tier < 2 ? 'Gentle feeds' : tier < 4 ? 'Slow feeds' : tier < 6 ? 'Moderate feeds' : 'Varied pace',
  }
}

export function practiceTarget(plan: NtrpPlan, adSide: boolean, attempt: number, openLane: boolean): Zone {
  const { tier, placement, exercise } = plan
  if (placement === 'court') {
    return { xMin: -COURT.singles, xMax: COURT.singles, zMin: -COURT.halfLength, zMax: -.1 }
  }
  if (placement === 'service') {
    const small = tier >= 4
    const wide = small && attempt % 2 === 1
    const xMin = small ? wide ? 2.22 : .27 : .20
    const xMax = small ? wide ? 3.92 : 1.80 : 3.98
    return { xMin: adSide ? xMin : -xMax, xMax: adSide ? xMax : -xMin,
      zMin: -6.32, zMax: small ? -4.00 : -1.14 }
  }
  if (placement === 'short') {
    return { xMin: -2.52, xMax: 2.52, zMin: -3.90, zMax: -1.15 }
  }
  if (placement === 'deep' && tier < 3) return { xMin: -3.64, xMax: 3.64, zMin: -10.2, zMax: -4.5 }
  if (placement === 'deep') {
    return { xMin: -3.74, xMax: 3.74, zMin: -11.73, zMax: tier >= 6 ? -8.50 : -7.18 }
  }
  if (exercise === 'pattern') {
    return openLane ? { xMin: 1.1, xMax: 3.96, zMin: -8.83, zMax: -4.90 }
      : { xMin: -3.94, xMax: -.90, zMin: -11.68, zMax: -8.65 }
  }
  if (tier < 3 && placement !== 'lane') {
    return { xMin: -3.76, xMax: 3.76, zMin: tier < 2 ? -7.2 : -9.90, zMax: -1.25 }
  }
  const right = plan.direction === 'backhand' ? tier < 5 || attempt % 2 === 1
    : tier >= 5 && attempt % 2 === 1
  const inner = tier < 5 ? .28 : placement === 'lane' ? 1.35 : .70
  const outer = exercise === 'doubles' ? 5.28 : tier >= 7 ? 3.83 : 3.99
  const short = tier >= 6 && attempt % 2 === 1 && placement !== 'lane'
  return { xMin: right ? inner : -outer, xMax: right ? outer : -inner,
    zMin: short ? -7.80 : tier < 4 ? -11.45 : -11.73,
    zMax: short ? -4.85 : placement === 'lane' && tier < 5 ? -3.7 : tier < 5 ? -4.80 : -8.25 }
}

export function practiceFeed(plan: NtrpPlan, attempt: number, server: Aim, wind: number, returnFrom?: { x: number; y: number; z: number }): Ball {
  const { exercise, tier, direction, take, home } = plan
  const sign = direction === 'backhand' ? -1 : direction === 'sides' && tier >= 2 && attempt % 2 ? -1 : 1
  const alternating = direction === 'sides'
  let bounceX = sign * (alternating ? 1.04 + Math.max(0, tier - 2) * .15 : 1.00)
  let bounceZ = home.z - (tier < 3 ? 1.24 : 1.84) - (tier >= 6 ? (attempt % 3) * .21 : 0)
  let spin = tier < 2 ? 280 : 580 + tier * 85
  let duration = [1.50, 1.47, 1.43, 1.40, 1.33, 1.27, 1.19, 1.10][tier]
  const origin = returnFrom ? { x: returnFrom.x, y: Math.max(.72, returnFrom.y), z: Math.min(returnFrom.z, -4.3) }
    : { x: server.x + .42, y: tier < 2 ? 1.16 : 1.44, z: server.z + .35 }

  if (exercise === 'return' || exercise === 'pressureReturn') {
    const serveSide = tier < 5 || attempt % 2 === 0 ? 1 : -1
    origin.x = serveSide * -1.54
    origin.y = 2.74
    origin.z = -12.30
    bounceX = serveSide * (tier < 6 ? .86 : 1.28)
    bounceZ = 5.92 - (tier >= 6 ? .36 * (attempt % 2) : 0)
    duration = exercise === 'pressureReturn' ? .91 : 1.00 - .038 * tier
    spin = exercise === 'pressureReturn' ? 2050 : 340 + tier * 90
  } else if (take === 'beforeBounce') {
    bounceX = exercise === 'doubles' ? 2.05 + (attempt % 2) * .70 : sign * (exercise === 'lowVolley' ? 1.8 + tier * .13 : .64 + tier * .16)
    bounceZ = home.z + (exercise === 'lowVolley' ? .82 : 3.9)
    duration = exercise === 'lowVolley' ? 1.16 + .027 * tier : 1.10 + (tier < 2 ? .20 : .16)
    origin.y = exercise === 'lowVolley' ? 1.58 : 1.24
    spin = 190
  } else if (take === 'overhead') {
    bounceZ = home.z + 1.25
    duration = 2.04 + (tier % 2) * .13
    origin.y = 1.20
    origin.z = -8.9
    spin = 140
  } else if (take === 'rising') {
    bounceZ = home.z - 1.02
    duration = 1.29
    spin = 340
  } else if (exercise === 'approach') {
    bounceZ = 5.9 - .15 * (attempt % 2)
    duration = 1.27
  } else if (exercise === 'recovery') {
    bounceX = sign * (tier < 2 ? 1.08 + tier * .20 : 1.54 + tier * .14)
  } else if (exercise === 'doubles') {
    bounceX = 1.60 + .59 * (attempt % 3)
    bounceZ = home.z - 1.68
  }
  return launchTo(origin, { x: bounceX, z: bounceZ }, duration, spin, wind)
}

export function practiceFeeder(plan: NtrpPlan): Aim {
  if (plan.exercise === 'return' || plan.exercise === 'pressureReturn') return { x: -1.54, z: -12.32 }
  if (plan.exercise === 'doubles') return { x: -2.35, z: -9.65 }
  return { x: -1.4, z: [-5.15, -6.45, -7.72, -8.45, -9.35, -9.72, -10.45, -10.63][plan.tier] }
}

export function recoveryRadius(plan: NtrpPlan): number {
  return plan.tier < 3 ? 1.16 : plan.tier < 6 ? .94 : .79
}

export function practiceSign(plan: NtrpPlan, ad: boolean, attempt: number) {
  if (plan.take === 'toss') return ad ? -1 : 1
  if (plan.direction === 'backhand') return -1
  if (plan.exercise === 'doubles') return 1
  return plan.direction === 'sides' && plan.tier >= 2 && attempt % 2 ? -1 : 1
}

export function aimWidth(plan: NtrpPlan): number {
  return clamp(1.12 - plan.tier * .037, .87, 1.12)
}

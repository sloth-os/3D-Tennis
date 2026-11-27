import { clamp, type Technique, type Vec3 } from './config.ts'
import { GRAVITY } from './physics.ts'

type Joint = [number, number, number]
type Frame = {
  t: number
  hips: number
  hipYaw: number
  chestYaw: number
  hand: Joint
  elbow: Joint
  free: Joint
  racket: Joint
  stride?: number
}

const ready: Frame = {
  t: 0, hips: 0.92, hipYaw: 0, chestYaw: 0,
  hand: [0.30, 1.15, -0.39], elbow: [0.47, 1.18, -0.05],
  free: [-0.21, 1.19, -0.39], racket: [0.32, 0.5, -0.37],
}
const end = { ...ready, t: 1 }

const phases: Record<Technique, Frame[]> = {
  forehand: [
    ready,
    { t: .24, hips: .91, hipYaw: -.27, chestYaw: -.66, hand: [.64, 1.22, .18], elbow: [.49, 1.24, .24],
      free: [-.27, 1.27, -.51], racket: [.16, .54, .52], stride: .04 },
    { t: .43, hips: .87, hipYaw: -.53, chestYaw: -.96, hand: [.72, .97, .40], elbow: [.49, 1.08, .25],
      free: [-.34, 1.16, -.44], racket: [.43, -.43, .25], stride: .09 },
    { t: .62, hips: .98, hipYaw: .27, chestYaw: .02, hand: [.63, 1.13, -.51], elbow: [.40, 1.16, -.27],
      free: [-.51, 1.19, -.14], racket: [.39, .27, -.42], stride: .14 },
    { t: .8, hips: 1.01, hipYaw: .56, chestYaw: .86, hand: [-.32, 1.53, -.29], elbow: [.08, 1.30, -.41],
      free: [-.43, 1.20, .16], racket: [-.45, .33, .25], stride: .13 },
    end,
  ],
  backhand: [
    ready,
    { t: .24, hips: .92, hipYaw: .31, chestYaw: .71, hand: [-.53, 1.16, .12], elbow: [.01, 1.16, -.27],
      free: [-.62, 1.2, .17], racket: [-.48, .40, .43], stride: -.07 },
    { t: .43, hips: .87, hipYaw: .53, chestYaw: .89, hand: [-.69, .95, .32], elbow: [-.24, 1.06, .03],
      free: [-.77, .98, .39], racket: [-.44, -.31, .40], stride: -.13 },
    { t: .62, hips: .97, hipYaw: -.19, chestYaw: .03, hand: [-.50, 1.13, -.55], elbow: [-.12, 1.14, -.31],
      free: [-.62, 1.16, -.57], racket: [-.54, .25, -.35], stride: -.16 },
    { t: .81, hips: 1, hipYaw: -.55, chestYaw: -.80, hand: [.38, 1.49, -.36], elbow: [.53, 1.25, -.42],
      free: [.49, 1.54, -.30], racket: [.41, .40, .25], stride: -.12 },
    end,
  ],
  serve: [
    { t: 0, hips: .97, hipYaw: -.67, chestYaw: -.61, hand: [.32, 1.02, -.28], elbow: [.42, 1.18, .23],
      free: [-.16, 1.2, -.43], racket: [.06, .03, -.80], stride: .12 },
    { t: .24, hips: .95, hipYaw: -.71, chestYaw: -.91, hand: [.52, 1.51, .39], elbow: [.62, 1.35, .17],
      free: [-.20, 1.94, -.35], racket: [.02, .75, .19], stride: .16 },
    { t: .43, hips: .89, hipYaw: -.59, chestYaw: -.78, hand: [.32, 1.52, .42], elbow: [.57, 1.65, .29],
      free: [-.19, 1.96, -.35], racket: [-.10, -.70, .20], stride: .17 },
    { t: .62, hips: 1.07, hipYaw: .18, chestYaw: -.13, hand: [.31, 2.04, -.16], elbow: [.29, 1.78, -.03],
      free: [-.24, 1.32, -.25], racket: [.1, .83, -.30], stride: .19 },
    { t: .81, hips: .96, hipYaw: .67, chestYaw: .74, hand: [-.47, 1.07, -.43], elbow: [-.17, 1.44, -.30],
      free: [-.47, 1.27, .19], racket: [-.42, -.54, .07], stride: .26 },
    end,
  ],
  footwork: [
    ready,
    { ...ready, t: .22, hips: 1.04, stride: -.11 },
    { ...ready, t: .43, hips: .81, stride: .07, hipYaw: -.19, chestYaw: -.13 },
    { ...ready, t: .64, hips: .89, stride: .25, hipYaw: -.35, chestYaw: -.26,
      hand: [.42, 1.1, -.27], free: [-.48, 1.09, -.18] },
    { ...ready, t: .83, hips: .94, stride: .12, hipYaw: .12, chestYaw: -.09 },
    end,
  ],
  volley: [
    ready,
    { ...ready, t: .24, hipYaw: -.12, chestYaw: -.27, stride: .07,
      hand: [.44, 1.23, -.28], elbow: [.46, 1.13, -.08], racket: [.14, .68, -.39] },
    { ...ready, t: .43, hips: .86, hipYaw: -.15, chestYaw: -.33, stride: .14,
      hand: [.54, 1.14, -.28], elbow: [.45, 1.09, -.12], racket: [.17, .68, -.29] },
    { ...ready, t: .62, hips: .92, hipYaw: .05, chestYaw: -.10, stride: .23,
      hand: [.60, 1.10, -.47], elbow: [.41, 1.10, -.24], racket: [.23, .70, -.41] },
    { ...ready, t: .81, hips: .96, hipYaw: .21, chestYaw: .10, stride: .24,
      hand: [.34, 1.17, -.67], elbow: [.35, 1.14, -.34], racket: [.05, .67, -.58] },
    end,
  ],
  backhandVolley: [
    ready,
    { ...ready, t: .24, hipYaw: .18, chestYaw: .44, stride: -.07,
      hand: [-.25, 1.22, -.31], elbow: [.14, 1.13, -.19], free: [-.38, 1.36, -.26], racket: [-.32, .68, -.13] },
    { ...ready, t: .43, hips: .87, hipYaw: .28, chestYaw: .56, stride: -.15,
      hand: [-.38, 1.08, -.21], elbow: [-.04, 1.12, -.22], free: [-.54, 1.20, -.09], racket: [-.41, .62, -.22] },
    { ...ready, t: .62, hips: .89, hipYaw: .14, chestYaw: .37, stride: -.22,
      hand: [-.40, 1.03, -.43], elbow: [-.11, 1.10, -.29], free: [-.53, 1.18, .14], racket: [-.38, .60, -.37] },
    { ...ready, t: .81, hips: .94, hipYaw: .07, chestYaw: .23, stride: -.21,
      hand: [-.39, 1.12, -.61], elbow: [-.08, 1.13, -.30], free: [-.56, 1.23, .18], racket: [-.31, .54, -.54] },
    end,
  ],
  overhead: [
    ready,
    { ...ready, t: .24, hips: .97, hipYaw: -.81, chestYaw: -.90, stride: .20,
      hand: [.45, 1.50, .31], elbow: [.64, 1.36, .24], free: [-.23, 1.90, -.38], racket: [.17, .72, .27] },
    { ...ready, t: .43, hips: .91, hipYaw: -.55, chestYaw: -.75, stride: .24,
      hand: [.29, 1.51, .48], elbow: [.65, 1.68, .26], free: [-.24, 1.97, -.37], racket: [-.12, -.83, .10] },
    { ...ready, t: .62, hips: 1.07, hipYaw: .25, chestYaw: .07, stride: .19,
      hand: [.32, 2.02, -.23], elbow: [.39, 1.81, -.02], free: [-.28, 1.41, -.28], racket: [.15, .77, -.36] },
    { ...ready, t: .81, hips: .98, hipYaw: .66, chestYaw: .77, stride: .28,
      hand: [-.42, 1.11, -.50], elbow: [-.08, 1.35, -.31], free: [-.47, 1.30, .10], racket: [-.41, -.50, -.22] },
    end,
  ],
  halfVolley: [
    ready,
    { ...ready, t: .24, hips: .84, hipYaw: -.17, chestYaw: -.33, stride: .09,
      hand: [.46, .86, -.28], elbow: [.40, 1.01, -.09], racket: [.32, -.52, -.35] },
    { ...ready, t: .43, hips: .70, hipYaw: -.19, chestYaw: -.44, stride: .21,
      hand: [.50, .63, -.32], elbow: [.43, .87, -.13], racket: [.36, -.62, -.35] },
    { ...ready, t: .62, hips: .71, hipYaw: .02, chestYaw: -.20, stride: .25,
      hand: [.57, .64, -.50], elbow: [.41, .85, -.26], racket: [.39, -.49, -.56] },
    { ...ready, t: .81, hips: .90, hipYaw: .28, chestYaw: .22, stride: .26,
      hand: [.50, 1.00, -.55], elbow: [.39, .99, -.26], racket: [.31, .35, -.65] },
    end,
  ],
  lob: [
    ready,
    { ...ready, t: .24, hipYaw: -.22, chestYaw: -.54, stride: .05,
      hand: [.57, 1.04, .23], elbow: [.45, 1.16, .16], racket: [.27, .43, .46] },
    { ...ready, t: .43, hips: .84, hipYaw: -.42, chestYaw: -.83, stride: .15,
      hand: [.66, .86, .24], elbow: [.48, 1.01, .16], racket: [.39, -.60, .22] },
    { ...ready, t: .62, hips: .98, hipYaw: .18, chestYaw: .03, stride: .20,
      hand: [.64, 1.14, -.48], elbow: [.42, 1.10, -.26], racket: [.23, .59, -.46] },
    { ...ready, t: .81, hips: 1.02, hipYaw: .49, chestYaw: .70, stride: .22,
      hand: [.04, 1.68, -.43], elbow: [.21, 1.38, -.38], racket: [-.37, .70, -.02] },
    end,
  ],
  drop: [
    ready,
    { ...ready, t: .24, hipYaw: -.22, chestYaw: -.51, stride: .08,
      hand: [.47, 1.27, .03], elbow: [.44, 1.18, -.03], racket: [.24, .54, .49] },
    { ...ready, t: .43, hips: .87, chestYaw: -.51, stride: .13,
      hand: [.60, 1.32, -.21], elbow: [.43, 1.20, -.09], racket: [.32, .32, -.20] },
    { ...ready, t: .62, hips: .96, hipYaw: .16, chestYaw: -.04, stride: .21,
      hand: [.57, 1.03, -.51], elbow: [.39, 1.09, -.22], racket: [.38, .19, -.61] },
    { ...ready, t: .81, hips: .95, hipYaw: .37, chestYaw: .25, stride: .23,
      hand: [.22, .94, -.65], elbow: [.37, 1.04, -.35], racket: [.26, .44, -.50] },
    end,
  ],
}

export type MuscleGroup = 'legs' | 'core' | 'arm'
export const MUSCLES = {
  legs: { label: 'Leg drive', detail: 'Gluteals, quadriceps, calves', color: '#74e7ff' },
  core: { label: 'Trunk rotation', detail: 'Obliques, trunk stabilizers', color: '#bda2ff' },
  arm: { label: 'Racket arm', detail: 'Deltoid, triceps, forearm', color: '#ff936f' },
} as const

export const BODY_MASS = 75
export const MOTION_DURATION: Record<Technique, number> = {
  forehand: 2.2, backhand: 2.25, serve: 2.4, footwork: 1.85, volley: 1.5, backhandVolley: 1.55,
  halfVolley: 1.65, overhead: 2.15, lob: 2.0, drop: 1.85,
}
export const GRIP_TO_STRINGS = .45

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3) => vec(a.x + b.x, a.y + b.y, a.z + b.z)
export const subtract = (a: Vec3, b: Vec3) => vec(a.x - b.x, a.y - b.y, a.z - b.z)
export const scale = (a: Vec3, s: number) => vec(a.x * s, a.y * s, a.z * s)
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
export const magnitude = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
export const mix = (a: Vec3, b: Vec3, amount: number) => add(a, scale(subtract(b, a), amount))

function unit(v: Vec3) { return scale(v, 1 / Math.max(.000001, magnitude(v))) }
function rotateY(v: Vec3, angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return vec(v.x * c + v.z * s, v.y, v.z * c - v.x * s)
}

function curve(p: Frame, a: Frame, b: Frame, n: Frame, t: number, value: (frame: Frame) => number) {
  const dt = b.t - a.t
  const h = (t - a.t) / dt
  const h2 = h * h
  const h3 = h2 * h
  const v0 = value(a)
  const v1 = value(b)
  const m0 = p === a ? 0 : (v1 - value(p)) * dt / (b.t - p.t)
  const m1 = n === b ? 0 : (value(n) - v0) * dt / (n.t - a.t)
  return (2 * h3 - 3 * h2 + 1) * v0 + (h3 - 2 * h2 + h) * m0 + (-2 * h3 + 3 * h2) * v1 + (h3 - h2) * m1
}

function articulated(origin: Vec3, target: Vec3, bend: Vec3, upper: number, lower: number) {
  const delta = subtract(target, origin)
  const distance = clamp(magnitude(delta), Math.abs(upper - lower) + .001, upper + lower - .001)
  const axis = magnitude(delta) > .000001 ? unit(delta) : vec(0, -1, 0)
  const pole = subtract(bend, origin)
  const tangent = subtract(pole, scale(axis, dot(pole, axis)))
  const fallback = Math.abs(axis.z) < .9 ? vec(0, 0, -1) : vec(1, 0, 0)
  const direction = unit(magnitude(tangent) > .0001 ? tangent : subtract(fallback, scale(axis, dot(fallback, axis))))
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance)
  return {
    mid: add(origin, add(scale(axis, along), scale(direction, Math.sqrt(Math.max(0, upper ** 2 - along ** 2))))),
    end: add(origin, scale(axis, distance)),
  }
}

type Arm = { shoulder: Vec3; elbow: Vec3; hand: Vec3; lengths: readonly [number, number] }
type Leg = { hip: Vec3; knee: Vec3; ankle: Vec3; planted: boolean; lengths: readonly [number, number] }
export interface Pose {
  hips: Vec3
  torso: Vec3
  neck: Vec3
  head: Vec3
  hipYaw: number
  chestYaw: number
  lean: number
  arms: [Arm, Arm]
  legs: [Leg, Leg]
  shaft: Vec3
  racketHead: Vec3
  travel: number
}

interface MotionOptions { movement?: number; depth?: number; run?: number; split?: number; racketTarget?: Vec3 }

function pulse(time: number, from: number, to: number) {
  return Math.sin(Math.PI * clamp((time - from) / (to - from), 0, 1)) ** 2
}

export function samplePose(technique: Technique, progress: number, options: MotionOptions = {}): Pose {
  const frames = phases[technique]
  const t = clamp(progress, 0, 1)
  const i = Math.max(1, frames.findIndex(frame => frame.t >= t))
  const a = frames[i - 1]
  const b = frames[i]
  const value = (fn: (frame: Frame) => number) => curve(frames[i - 2] ?? a, a, b, frames[i + 1] ?? b, t, fn)
  const point = (key: 'hand' | 'elbow' | 'free' | 'racket') => vec(value(f => f[key][0]), value(f => f[key][1]), value(f => f[key][2]))
  const split = options.split ?? 1
  const splitLift = .10 * pulse(split, .065, .205)
  const dip = .045 * pulse(split, 0, .085) + .095 * pulse(split, .19, .37)
  const hipsY = value(f => f.hips) - dip + splitLift
  const hipYaw = value(f => f.hipYaw)
  const chestYaw = value(f => f.chestYaw)
  const stride = value(f => f.stride ?? 0)
  const sideways = options.movement ?? 0
  const upcourt = options.depth ?? 0
  const lean = clamp(sideways, -1, 1) * .10
  const strideAngle = options.run ?? 0
  const effort = Math.min(1, Math.hypot(sideways, upcourt))
  const runCycle = Math.sin(strideAngle) * effort
  const hop = technique === 'serve' ? .17 * pulse(t, .47, .75)
    : technique === 'overhead' ? .098 * pulse(t, .49, .74) : technique === 'footwork' ? .115 * pulse(t, .10, .34) : 0
  const travel = technique === 'footwork' ? .44 * pulse(t, .44, 1) : 0
  const weightShift = technique === 'forehand' ? -.10 * pulse(t, .43, .95) + .05 * pulse(t, .16, .54)
    : technique === 'backhand' ? .09 * pulse(t, .43, .94) : travel
  const hips = vec(lean * .3 + weightShift, hipsY - .045 * effort + Math.abs(runCycle) * .021, -stride * .27)
  const torso = add(hips, vec(lean * .52, .245, -stride * .1))
  const neck = add(torso, vec(lean * .17, .25, -.014))
  const head = add(neck, vec(0, .149, -.005))
  const shaft = unit(point('racket'))
  const armLengths = [.331, .299] as const
  const legLengths = [.447, .457] as const

  function arm(sign: 1 | -1, secondGrip?: Vec3): Arm {
    const shoulder = add(torso, rotateY(vec(sign * .218, .139, 0), chestYaw))
    let target = add(point(sign > 0 ? 'hand' : 'free'), vec(lean + weightShift, -dip + splitLift, 0))
    if (secondGrip) target = mix(target, secondGrip, clamp((t - .045) / .15, 0, 1) * clamp((1 - t) / .14, 0, 1))
    const isHit = sign > 0 && options.racketTarget && t >= .59
    const wrist = isHit ? mix(target, subtract(options.racketTarget!, scale(shaft, GRIP_TO_STRINGS)), clamp(1 - (t - .62) * 10, 0, 1)) : target
    const elbowHint = sign > 0 ? add(point('elbow'), vec(lean + weightShift, -dip, 0))
      : add(mix(shoulder, target, .50), vec(-.12, -.19, .16))
    const result = articulated(shoulder, wrist, elbowHint, ...armLengths)
    return { shoulder, elbow: result.mid, hand: result.end, lengths: armLengths }
  }

  function leg(sign: 1 | -1): Leg {
    const hip = add(hips, rotateY(vec(sign * .126, -.026, 0), hipYaw))
    const lift = Math.max(0, runCycle * sign) * .17 + hop + splitLift
    const footTravel = technique === 'footwork' ? travel * (sign > 0 ? 1.5 : .52) : 0
    const step = Math.cos(strideAngle) * sign
    const splitWidth = .075 * pulse(split, .08, .39)
    const target = vec(sign * (.236 + Math.abs(stride) * .39 + splitWidth) + footTravel + step * sideways * .27,
      .125 + lift, sign * stride + step * upcourt * .34 - .054 * pulse(t, .53, .94))
    const kneeHint = add(mix(hip, target, .5), rotateY(vec(sign * .043, 0, -.44), hipYaw * .42))
    const result = articulated(hip, target, kneeHint, ...legLengths)
    return { hip, knee: result.mid, ankle: result.end, planted: result.end.y < .15, lengths: legLengths }
  }

  const hittingArm = arm(1)
  const arms: Pose['arms'] = [hittingArm, arm(-1, technique === 'backhand' ? add(hittingArm.hand, scale(shaft, .083)) : undefined)]
  return { hips, torso, neck, head, hipYaw, chestYaw, lean, arms, legs: [leg(1), leg(-1)], shaft,
    racketHead: add(arms[0].hand, scale(shaft, GRIP_TO_STRINGS)), travel }
}

function massCenter(pose: Pose): Vec3 {
  let center = add(scale(mix(pose.hips, pose.torso, .76), .497), scale(pose.head, .081))
  for (let i = 0; i < 2; i += 1) {
    const { shoulder, elbow, hand } = pose.arms[i]
    const { hip, knee, ankle } = pose.legs[i]
    center = add(center, scale(mix(shoulder, elbow, .43), .028))
    center = add(center, scale(mix(elbow, hand, .47), .022))
    center = add(center, scale(mix(hip, knee, .43), .10))
    center = add(center, scale(mix(knee, ankle, .44), .061))
  }
  return center
}

function flexion(a: Vec3, joint: Vec3, b: Vec3) {
  const cosine = dot(unit(subtract(a, joint)), unit(subtract(b, joint)))
  return 180 - Math.acos(clamp(cosine, -1, 1)) * 180 / Math.PI
}

export function analyzeMotion(technique: Technique, progress: number, pose = samplePose(technique, progress)) {
  const duration = MOTION_DURATION[technique]
  const t = clamp(progress, .022, .978)
  const a = samplePose(technique, t - .018)
  const b = samplePose(technique, t + .018)
  const center = massCenter(pose)
  const derivativeCenter = massCenter(samplePose(technique, t))
  const dt = .018 * duration
  const acceleration = scale(add(subtract(massCenter(a), scale(derivativeCenter, 2)), massCenter(b)), 1 / dt ** 2)
  const [right, left] = pose.legs
  const both = right.planted && left.planted
  const supported = right.planted || left.planted
  const rightShare = both ? clamp((center.x - left.ankle.x) / Math.max(.1, right.ankle.x - left.ankle.x), .04, .96) : Number(right.planted)
  const ground = supported
    ? vec(BODY_MASS * acceleration.x, BODY_MASS * Math.max(0, GRAVITY + acceleration.y), BODY_MASS * acceleration.z) : vec()
  return {
    center, ground, right: scale(ground, rightShare), left: scale(ground, supported ? 1 - rightShare : 0),
    knee: flexion(right.hip, right.knee, right.ankle),
    elbow: flexion(pose.arms[0].shoulder, pose.arms[0].elbow, pose.arms[0].hand),
    separation: Math.abs(pose.chestYaw - pose.hipYaw) * 180 / Math.PI,
    racketSpeed: magnitude(subtract(b.racketHead, a.racketHead)) / (2 * dt),
  }
}

export function activeMuscle(technique: Technique, phase: number): MuscleGroup {
  if (technique === 'footwork' || phase < .13 || (phase > .33 && phase < .49) || phase > .84) return 'legs'
  return phase < .56 ? 'core' : 'arm'
}

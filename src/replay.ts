import { clamp, type Aim, type Technique } from './config.ts'
import { makeBall, type Ball, type Conditions, type Contact } from './physics.ts'

export type StrokePose = { technique: Technique; progress: number }
export type FootMotion = { velocity: Aim; stride: number; split: number }
export type RivalFrame = { position: Aim; pose: StrokePose; feet: FootMotion }
export type ReplayFrame = { time: number; ball: Ball; player: Aim; pose: StrokePose; conditions: Conditions;
  feet: FootMotion; opponent: RivalFrame; end: number }
export type ReplayEvent = { time: number; contact: Contact }
export type ShotReplay = { frames: ReplayFrame[]; events: ReplayEvent[]; score?: { you: number; rival: number } }

function copyFeet(feet: FootMotion): FootMotion { return { ...feet, velocity: { ...feet.velocity } } }

export function snapshot(time: number, ball: Ball, player: Aim, pose: StrokePose, conditions: Conditions,
  feet: FootMotion, opponent: RivalFrame, end: number): ReplayFrame {
  return { time, ball: { ...makeBall(ball.position, ball.velocity, ball.spin, ball.sideSpin), bounces: ball.bounces, rotation: { ...ball.rotation } },
    player: { ...player }, pose, conditions: { ...conditions }, feet: copyFeet(feet), end,
    opponent: { ...opponent, position: { ...opponent.position }, feet: copyFeet(opponent.feet) } }
}

export function replayBounds(replay: ShotReplay): [number, number] {
  return [replay.frames[0].time, replay.frames.at(-1)!.time]
}

export function sampleReplay(replay: ShotReplay, time: number): ReplayFrame {
  const [start, end] = replayBounds(replay)
  time = clamp(time, start, end)
  let lo = 0
  let hi = replay.frames.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (replay.frames[mid].time <= time) lo = mid
    else hi = mid
  }
  const a = replay.frames[lo]
  const b = replay.frames[hi]
  if (time >= b.time || a.time === b.time) return b
  if (time <= a.time) return a

  const fraction = (time - a.time) / (b.time - a.time)
  const mix = (x: number, y: number) => x + (y - x) * fraction
  const blendAim = (a: Aim, b: Aim) => ({ x: mix(a.x, b.x), z: mix(a.z, b.z) })
  const blendPose = (a: StrokePose, b: StrokePose) => ({ technique: a.technique,
    progress: a.technique === b.technique ? mix(a.progress, b.progress) : a.progress })
  const blendFeet = (a: FootMotion, b: FootMotion) => ({ velocity: blendAim(a.velocity, b.velocity),
    stride: mix(a.stride, b.stride), split: mix(a.split, b.split) })
  const latest = replay.events.find(event => event.time > a.time && event.time <= b.time)
  const ball = latest ? (time < latest.time ? a.ball : b.ball) : fraction < .5 ? a.ball : b.ball
  return {
    time,
    ball: { ...ball, rotation: { x: mix(a.ball.rotation.x, b.ball.rotation.x), y: mix(a.ball.rotation.y, b.ball.rotation.y),
      z: mix(a.ball.rotation.z, b.ball.rotation.z) }, position: { x: mix(a.ball.position.x, b.ball.position.x), y: mix(a.ball.position.y, b.ball.position.y),
      z: mix(a.ball.position.z, b.ball.position.z) } },
    player: blendAim(a.player, b.player), pose: blendPose(a.pose, b.pose), feet: blendFeet(a.feet, b.feet),
    opponent: { position: blendAim(a.opponent.position, b.opponent.position), pose: blendPose(a.opponent.pose, b.opponent.pose),
      feet: blendFeet(a.opponent.feet, b.opponent.feet) }, conditions: a.conditions, end: a.end,
  }
}

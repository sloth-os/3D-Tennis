import { clamp, type Aim, type Technique } from './config.ts'
import { makeBall, type Ball, type Conditions, type Contact } from './physics.ts'

export type StrokePose = { technique: Technique; progress: number }
export type ReplayFrame = { time: number; ball: Ball; player: Aim; pose: StrokePose; conditions: Conditions }
export type ReplayEvent = { time: number; contact: Contact }
export type ShotReplay = { frames: ReplayFrame[]; events: ReplayEvent[] }

export function snapshot(time: number, ball: Ball, player: Aim, pose: StrokePose, conditions: Conditions): ReplayFrame {
  return { time, ball: { ...makeBall(ball.position, ball.velocity, ball.spin, ball.sideSpin), bounces: ball.bounces },
    player: { ...player }, pose, conditions: { ...conditions } }
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
  const latest = replay.events.find(event => event.time > a.time && event.time <= b.time)
  const ball = latest ? (time < latest.time ? a.ball : b.ball) : fraction < .5 ? a.ball : b.ball
  return {
    time,
    ball: { ...ball, position: { x: mix(a.ball.position.x, b.ball.position.x), y: mix(a.ball.position.y, b.ball.position.y),
      z: mix(a.ball.position.z, b.ball.position.z) } },
    player: { x: mix(a.player.x, b.player.x), z: mix(a.player.z, b.player.z) },
    pose: { technique: a.pose.technique,
      progress: a.pose.technique === b.pose.technique ? mix(a.pose.progress, b.pose.progress) : a.pose.progress },
    conditions: a.conditions,
  }
}

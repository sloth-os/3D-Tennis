import type { Aim, Shot } from './config.ts'
import { CONTACT_BALLS, CONTACT_START, liveSwingTip, type ContactBall, type StrokeSide } from './contact-training.ts'
import { Game } from './game.ts'
import { STEP, type Conditions } from './physics.ts'
import type { ShotReplay } from './replay.ts'
import { FOOTING } from './point-play.ts'
import { samplePose } from './motion.ts'

export const DEMO_PHASES = ['Split', 'Move', 'Contact', 'Recover'] as const

/** Play the same feed with the same runner, timing window and ball solver used in practice. */
export function buildContactDemo(ball: ContactBall, side: StrokeSide, conditions: Conditions, shot: Shot = 'topspin') {
  const g = new Game()
  g.selectContact(ball, side)
  g.setConditions(conditions)
  g.shot = shot
  g.begin()
  g.setAim(side === 'forehand' ? -2.4 : 2.4, -8.8)
  const clip: ShotReplay = { frames: [], events: [] }
  let mark: NonNullable<Game['receiveMark']> | null = null
  let struck = -1, split = false
  for (let i = 0; i < 7 / STEP; i++) {
    if (!split && g.phase === 'countdown' && g.phaseTime >= .87) { g.split(); split = true }
    let destination: Aim = CONTACT_START
    if (g.receiveMark && g.phase === 'incoming') {
      mark = g.receiveMark
      destination = mark.feet
      if (Math.abs(g.contactError) <= .009 && g.cue().title === 'Swing now') {
        g.swing()
        if (g.replay) {
          const hit = g.replay.events[0]
          struck = hit.time
          mark = { ...mark, contact: { ...hit.contact.position }, feet: { ...g.player } }
          if (clip.frames.at(-1)?.time === struck) clip.frames.pop()
          clip.frames.push(g.captureFrame())
        }
      }
    } else if (struck >= 0) destination = g.recoverySpot
    const dx = destination.x - g.player.x, dz = destination.z - g.player.z, distance = Math.hypot(dx, dz)
    const speed = Math.min(6.25, Math.sqrt(2 * FOOTING[conditions.surface].brake * distance) * .77, distance * 7)
    const factor = speed / (6.5 * Math.max(.001, distance))
    const movement = { x: dx * factor, z: dz * factor }
    g.update(STEP, movement)
    if (!g.ball) continue
    const frame = g.captureFrame()
    if (struck < 0 && g.lastContact?.kind === 'court' && !clip.events.length)
      clip.events.push({ time: frame.time, contact: g.lastContact })
    if ((i % 3 === 0 || !clip.frames.length) && frame.time > (clip.frames.at(-1)?.time ?? -1)) clip.frames.push(frame)
    if (struck >= 0 && frame.time >= struck + 1.12) break
  }
  if (!mark || struck < 0 || !g.replay) return null
  clip.events.push(...g.replay.events)
  const start = clip.frames[0].time, end = clip.frames.at(-1)!.time
  const spec = CONTACT_BALLS[ball]
  const swingPath = clip.frames.filter(f => f.time >= struck - .29 && f.time <= struck + .23).map(f => {
    const head = samplePose(f.pose.technique, f.pose.progress, { strike: f.pose.strike, shot: f.pose.shot,
      movement: f.feet.velocity.x / 6.5, depth: f.feet.velocity.z / 6.5, run: f.feet.stride, split: f.feet.split }).racketHead
    return { x: f.player.x + head.x, y: .014 + head.y, z: f.player.z + head.z }
  })
  return { clip, mark, swingPath, recovery: g.recoverySpot, start, end, struck,
    times: [start, start + (struck - start) * .50, struck, Math.min(end, struck + .62)],
    cues: ['Split as the feeder strikes. Land balanced and read the bounce.', spec.move,
      shot === 'topspin' ? spec.swing : liveSwingTip(mark.contact.y, side, shot), spec.recover] }
}
export type ContactDemo = NonNullable<ReturnType<typeof buildContactDemo>>

export function demoPhase(demo: ContactDemo, time: number) {
  if (time >= demo.struck + .25) return 3
  if (time >= demo.struck - .16) return 2
  return time > demo.start + .27 ? 1 : 0
}

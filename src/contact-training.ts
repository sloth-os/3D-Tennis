import type { Aim, Shot } from './config.ts'
import { launchTo, traceBall, type Conditions, type FlightPoint } from './physics.ts'

export type StrokeSide = 'forehand' | 'backhand'
export const CONTACT_START = { x: 0, z: 10.95 }

export const CONTACT_BALLS = {
  waist: { label: 'Waist-high drive', x: .97, z: 10.30, height: 1.00, gap: 2.2,
    move: 'Split on the feed. Turn the shoulders and use small steps to leave a comfortable gap beside the hip.',
    swing: 'Drop the racket below the ball, then drive forward and up through waist-high contact.',
    recover: 'Finish across the body. Push back toward your starting mark and face the feeder.' },
  low: { label: 'Low skidding ball', x: 1.04, z: 9.70, height: .46, gap: .95,
    move: 'Step in early and bend at the hips and knees. Keep the chest lifted as you get down to the bounce.',
    swing: 'Set the racket below knee-high contact. Extend through the ball and lift it over the net.',
    recover: 'Rise out of the bent legs and take a quick adjustment step back into balance.' },
  high: { label: 'Shoulder-high bounce', x: 1.28, z: 10.85, height: 1.56, gap: 3.50,
    move: 'Turn early and adjust back and sideways to leave space for the high bounce.',
    swing: 'Prepare the racket high. Rotate through shoulder-height contact with a more level swing.',
    recover: 'Let the racket finish across the body, then push off the outside leg to regain the middle.' },
  wide: { label: 'Wide ball', x: 3.75, z: 10.26, height: .91, gap: 2.18,
    move: 'Use a crossover to cover ground, then shorten the final steps. Brake on the outside leg.',
    swing: 'Create room beside the hip. Drive cross-court with net clearance as the outside leg supports the turn.',
    recover: 'Push off the outside leg and cross back toward center. Split again as the opponent hits.' },
  short: { label: 'Short approach', x: 1.35, z: 6.48, height: .78, gap: 1.9,
    move: 'Read the short bounce and run diagonally forward. Use small braking steps before you swing.',
    swing: 'Meet the ball out in front with a compact forward swing. A shorter court calls for controlled pace.',
    recover: 'Follow the approach inside the court and split in position to cover the pass.' },
  deep: { label: 'Deep to the baseline', x: 1.40, z: 12.46, height: 1.10, gap: 2.65,
    move: 'Turn side-on and use a drop step to get behind the bounce. Leave room between the ball and your hip.',
    swing: 'Set the feet behind the contact. Send a high, deep reply to buy time to recover.',
    recover: 'Move back toward the baseline as the reply travels. Set the feet for the next split.' },
  body: { label: 'Ball at the body', x: .04, z: 10.29, height: .94, gap: 2.1,
    move: 'Turn early and sidestep away from the ball’s line to create space for the racket.',
    swing: 'Use a compact backswing. Keep the hands clear of the torso and meet the ball just ahead of the hip.',
    recover: 'Bring the feet back under the hips and square up to the opponent.' },
} as const
export type ContactBall = keyof typeof CONTACT_BALLS

export function contactRecovery(ball: ContactBall, side: StrokeSide): Aim {
  return ball === 'short' ? { x: side === 'forehand' ? .68 : -.68, z: 4.8 } : CONTACT_START
}

export function contactAtDepth(points: FlightPoint[], z: number) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (a.bounces !== 1 || b.bounces !== 1 || a.z > z || b.z < z) continue
    const t = (z - a.z) / (b.z - a.z)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z }
  }
}

/** Set feed pace and direction so that the simulated rebound reaches the teaching point on this surface. */
export function contactFeed(ball: ContactBall, side: StrokeSide, conditions: Conditions) {
  const spec = CONTACT_BALLS[ball]
  const sign = side === 'forehand' ? 1 : -1
  const start = { x: -.52 * sign, y: 1.50, z: -9.6 }
  const targetX = spec.x * sign
  const bounce = { x: targetX, z: spec.z - spec.gap }
  let low = .93, high = 2.70
  for (let i = 0; i < 7; i++) {
    const duration = (low + high) / 2
    const feed = launchTo(start, bounce, duration, 620, conditions.wind)
    const hit = contactAtDepth(traceBall(feed, conditions, 3.6).points, spec.z)
    if (hit) bounce.x += (targetX - hit.x) * .78
    if (!hit || hit.y < spec.height) low = duration
    else high = duration
  }
  return launchTo(start, bounce, (low + high) / 2, 620, conditions.wind)
}

export function contactHeight(y: number) {
  return y < .72 ? 'Low contact' : y > 1.29 ? 'High contact' : 'Waist-high contact'
}

export function liveSwingTip(y: number, side: string, shot: Shot = 'topspin') {
  const stroke = side.toLowerCase()
  if (shot === 'slice') return y < .72 ? 'Bend the knees. Use a slightly open face and carry the slice forward.'
    : 'Set the racket above contact. Send the slice forward with a shallow downward path.'
  if (shot === 'flat') return y < .72 ? 'Get low and lift the drive enough to clear the net.'
    : 'Prepare at ball height. Drive through the ' + stroke + ' in front of the hip.'
  if (y < .72) return 'Bend the knees. Lift the ' + stroke + ' through the low ball.'
  if (y > 1.29) return 'Set the racket high. Rotate the ' + stroke + ' through shoulder-height contact.'
  return 'Turn the shoulders. Drive the ' + stroke + ' forward and up from waist height.'
}

export function moveToStance(player: Aim, feet: Aim) {
  const dx = feet.x - player.x, dz = feet.z - player.z
  const horizontal = Math.abs(dx) < .36 ? '' : dx > 0 ? 'right' : 'left'
  const depth = Math.abs(dz) < .40 ? '' : dz > 0 ? 'back' : 'forward'
  return [depth, horizontal].filter(Boolean).join(' and ')
}

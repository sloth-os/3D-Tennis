import { COURT, clamp, type Aim, type Surface } from './config.ts'
import { launchTo, type FlightPoint } from './physics.ts'

export type Side = 'you' | 'rival'
export type Pace = keyof typeof OPPONENTS
export const OPPONENTS = {
  club: { label: 'Club player', speed: 3.4, reaction: .25, duration: 1.37, width: 2.40 },
  competitor: { label: 'Competitor', speed: 4.35, reaction: .18, duration: 1.16, width: 3.15 },
  expert: { label: 'Expert', speed: 5.25, reaction: .13, duration: 1.02, width: 3.62 },
} as const

export const FOOTING: Record<Surface, { drive: number; brake: number }> = {
  hard: { drive: 20, brake: 26 }, clay: { drive: 16, brake: 12 }, grass: { drive: 17.5, brake: 18 },
}

export function advanceFeet(position: Aim, velocity: Aim, desired: Aim, dt: number, surface: Surface) {
  const dx = desired.x - velocity.x, dz = desired.z - velocity.z
  const change = Math.hypot(dx, dz)
  const braking = velocity.x * dx + velocity.z * dz < 0
  const limit = FOOTING[surface][braking ? 'brake' : 'drive'] * dt
  const amount = change > 0 ? Math.min(1, limit / change) : 0
  velocity.x += dx * amount
  velocity.z += dz * amount
  position.x += velocity.x * dt
  position.z += velocity.z * dt
}

export type LineCall = { inside: boolean; margin: number; edge: string }
const FOOTPRINT = .014
const CENTER_LINE_HALF = .0254

/** The dimensions go to the outside edges. The center service line belongs to both boxes. */
export function callLanding(position: Aim, near: boolean, serviceAd?: boolean, doubles = false): LineCall {
  const depth = near ? position.z : -position.z
  const service = serviceAd !== undefined
  const side = (serviceAd ? 1 : -1) * (near ? -1 : 1)
  const across = service ? side * position.x : Math.abs(position.x)
  const width = !service && doubles ? COURT.doubles : COURT.singles
  const acrossMargin = width - across
  const centerMargin = service ? across + CENTER_LINE_HALF : Infinity
  const endMargin = (service ? COURT.service : COURT.halfLength) - depth
  const xMargin = Math.min(acrossMargin, centerMargin)
  const zMargin = Math.min(depth, endMargin)
  const edge = xMargin < zMargin ? centerMargin < acrossMargin ? 'center service line' : doubles && !service ? 'doubles sideline' : 'singles sideline'
    : depth < endMargin ? 'net' : service ? 'service line' : 'baseline'
  const margin = xMargin < 0 || zMargin < 0
    ? FOOTPRINT - Math.hypot(Math.min(0, xMargin), Math.min(0, zMargin))
    : Math.min(xMargin, zMargin) + FOOTPRINT
  return { inside: margin >= 0 && depth >= 0, margin, edge }
}

export function lineDistance(call: LineCall) {
  const distance = Math.abs(call.margin)
  const unit = distance < 1 ? Math.round(distance * 100) + ' cm' : distance.toFixed(1) + ' m'
  return unit + (call.inside ? ' inside the ' : ' beyond the ') + call.edge
}

/** Bisect the angles to the two available singles passing lanes at service-line depth. */
export function recoveryPosition(striker: Aim, depth = 10.65): Aim {
  const side = depth >= 0 ? 1 : -1
  const distance = Math.max(1, side * (side * COURT.service - striker.z))
  const left = Math.atan2(-COURT.singles - striker.x, distance)
  const right = Math.atan2(COURT.singles - striker.x, distance)
  return { x: clamp(striker.x + Math.tan((left + right) / 2) * side * (depth - striker.z), -2.8, 2.8), z: depth }
}

export function interceptFlight(points: FlightPoint[], start: Aim, speed: number, reaction: number) {
  let choice: { stance: Aim; ball: FlightPoint } | null = null
  let bestCost = Infinity
  for (const p of points) {
    if (p.bounces !== 1 || p.z > -.75 || p.z < -15.5 || p.y < .28 || p.y > 1.82) continue
    const side = Math.sign(p.x - start.x) || 1
    const stance = { x: p.x - side * .61, z: p.z - .59 }
    const travel = Math.hypot(stance.x - start.x, stance.z - start.z)
    const shortfall = Math.max(0, travel - Math.max(0, p.t - reaction - .1) * speed)
    const cost = shortfall * 12 + Math.abs(p.y - .92) * .65 + travel * .105 + p.t * .14
    if (cost < bestCost) { bestCost = cost; choice = { stance, ball: p } }
  }
  return choice
}

function variation(seed: number) {
  const n = Math.sin(seed * 92.73 + 13.19) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

export type PointNote = { winner: Side; reason: string; shots: number; you: number; rival: number }
const stats = () => ({ firstIn: 0, firstTotal: 0, aces: 0, doubles: 0, winners: 0, distance: 0 })

export class Tiebreak {
  you = 0
  rival = 0
  serve: 1 | 2 = 1
  servingPoint: Side = 'you'
  ad = false
  end = 0
  serviceBall = true
  strikes = 0
  rivalWork = 0
  longest = 0
  lastPoints: PointNote[] = []
  stats = { you: stats(), rival: stats() }
  pace: Pace

  constructor(pace: Pace = 'club') { this.pace = pace }

  get played() { return this.you + this.rival }
  get finished() { return Math.max(this.you, this.rival) >= 7 && Math.abs(this.you - this.rival) >= 2 }
  get parameters() { return OPPONENTS[this.pace] }
  get runningSpeed() { return this.parameters.speed * (1 - .32 * clamp((this.rivalWork - 8) / 30, 0, 1)) }
  get pointBall() {
    if (this.finished) return ''
    if (this.you >= 6 && this.you > this.rival) return 'Match point for you'
    if (this.rival >= 6 && this.rival > this.you) return 'Match point against'
    return ''
  }

  prepare() {
    this.servingPoint = Math.floor((this.played + 1) / 2) % 2 === 0 ? 'you' : 'rival'
    this.ad = this.played % 2 === 1
    this.end = Math.floor(this.played / 6) % 2
    this.serviceBall = true
    this.strikes = 0
    this.rivalWork = 0
  }

  serveIn() {
    if (this.serve === 1) {
      this.stats[this.servingPoint].firstIn++
      this.stats[this.servingPoint].firstTotal++
    }
    this.serviceBall = false
  }

  /** A first fault and a service let both leave the point score intact. */
  fault(): boolean {
    if (this.serve === 1) {
      this.stats[this.servingPoint].firstTotal++
      this.serve = 2
      return false
    }
    this.stats[this.servingPoint].doubles++
    this.award(this.servingPoint === 'you' ? 'rival' : 'you', 'Double fault')
    return true
  }

  award(winner: Side, reason: string) {
    if (this.finished) return
    this[winner]++
    if (reason === 'Ace') this.stats[winner].aces++
    if (reason === 'Clean winner') this.stats[winner].winners++
    this.longest = Math.max(this.longest, this.strikes)
    this.lastPoints.unshift({ winner, reason, shots: this.strikes, you: this.you, rival: this.rival })
    // The scoreboard keeps the full score across extended tiebreaks.
    if (this.lastPoints.length > 32) this.lastPoints.pop()
    this.serve = 1
  }

  opponentServe(wind: number) {
    const sign = this.ad ? -1 : 1
    const seed = this.played * 9 + this.serve
    const second = this.serve === 2
    const target = { x: sign * (second ? 1.55 : 2.30 + variation(seed) * 1.28),
      z: (second ? 5.05 : 5.86) + variation(seed + 2) * (second ? .48 : .77) }
    const duration = this.parameters.duration * (second ? .71 : .61)
    return launchTo({ x: -sign * 1.87 - .34, y: 2.60, z: -11.93 }, target, duration,
      second ? 1800 : 650, wind * .53, second ? 210 : -520)
  }

  opponentReturn(origin: FlightPoint | { x: number; y: number; z: number }, player: Aim, speed: number, wind: number) {
    const seed = this.played * 17 + this.strikes * 3
    const load = clamp((this.rivalWork - 5) / 28, 0, 1)
    const pressure = clamp((speed - 1.35) / 4 + Math.max(0, .75 - origin.y) + load * .90, 0, 1)
    const open = Math.abs(player.x) > .8 ? -Math.sign(player.x) : Math.sign(variation(seed))
    const width = this.parameters.width * (1 - .52 * pressure)
    const target = { x: open * width + variation(seed + 1) * (.30 + pressure * 3.4),
      z: 8.45 + variation(seed + 2) * (1.05 + pressure * 3.65) + (this.pace === 'expert' ? .58 : 0) }
    return launchTo(origin, target, this.parameters.duration + pressure * .26, 900 + pressure * 620, wind * .49)
  }
}

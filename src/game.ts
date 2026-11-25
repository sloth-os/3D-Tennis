import {
  COURT, DRILLS, clamp, inZone, targetFor, zoneCenter,
  type Aim, type DrillId, type Shot, type Technique, type Vec3,
} from './config.ts'
import { contactAt, launchTo, makeBall, shotBall, speedOf, stepBall, traceBall, type Ball, type Conditions, type Contact } from './physics.ts'
import { snapshot, type ReplayFrame, type ShotReplay, type StrokePose } from './replay.ts'

export type Phase = 'idle' | 'countdown' | 'incoming' | 'outgoing' | 'opponent' | 'recover' | 'between' | 'finished'
export type Motion = { x: number; z: number }
export type Cue = { title: string; detail: string; tone: 'neutral' | 'good' | 'warn' }
export type Sound = 'bounce' | 'hit' | 'good' | 'miss' | 'ready'
export type ShotMetrics = {
  speed: number
  spin: number
  sideSpin: number
  timing: number
  clearance: number | null
  landing: Vec3 | null
}

const HOME = 10.95
const SERVE_HOME = 12.40
const SERVE_CONTACT = 0.55
const MAX_ATTEMPTS = 12
const EMPTY_CUE: Cue = { title: 'Ready to train', detail: 'Start the drill to receive your first ball.', tone: 'neutral' }

export class Game {
  drill: DrillId = 'forehand'
  shot: Shot = 'topspin'
  conditions: Conditions = { surface: 'hard', wind: 0 }
  adSide = false
  phase: Phase = 'idle'
  paused = false
  phaseTime = 0
  player: Aim = { x: 0.45, z: HOME }
  playerMotion: Motion = { x: 0, z: 0 }
  opponent: Aim = { x: -1.4, z: -10.6 }
  opponentSwing = 1
  aim = zoneCenter(targetFor('forehand', false))
  ball: Ball | null = null
  trail: Vec3[] = []
  forecast: Vec3[] = []
  lastLanding: Vec3 | null = null
  lastShot: ShotMetrics | null = null
  lastContact: Contact | null = null
  replay: ShotReplay | null = null
  attempts = 0
  hits = 0
  streak = 0
  bestStreak = 0
  splitClock = 1
  splitTimed = false
  swingClock = 1
  technique: Technique = 'forehand'
  result: Cue = EMPTY_CUE
  private readonly sound: (sound: Sound) => void
  private announcedContact = false
  private clock = 0
  private preparation: ReplayFrame[] = []
  private recordUntil = 0

  constructor(sound: (sound: Sound) => void = () => {}) {
    this.sound = sound
  }

  get zone() { return targetFor(this.drill, this.adSide) }
  get progress() { return this.drill === 'rally' ? this.bestStreak : this.hits }
  get goal() { return DRILLS[this.drill].goal }
  get active() { return this.phase !== 'idle' && this.phase !== 'finished' }

  select(drill: DrillId): void {
    this.drill = drill
    this.shot = DRILLS[drill].shot
    this.adSide = false
    this.reset()
  }

  setServeSide(adSide: boolean): void {
    this.adSide = adSide
    this.reset()
  }

  reset(): void {
    this.phase = 'idle'
    this.paused = false
    this.phaseTime = 0
    this.hits = 0
    this.attempts = 0
    this.streak = 0
    this.bestStreak = 0
    this.result = EMPTY_CUE
    this.lastShot = null
    this.lastLanding = null
    this.lastContact = null
    this.replay = null
    this.clock = 0
    this.preparation = []
    this.recordUntil = 0
    this.ball = null
    this.forecast = []
    this.trail = []
    this.aim = zoneCenter(this.zone)
    this.placePlayers()
  }

  private placePlayers(): void {
    const serving = this.drill === 'serve'
    this.player = { x: serving ? (this.adSide ? -1.7 : 1.7) : this.drill === 'forehand' ? 0.45 : 0,
      z: serving ? SERVE_HOME : HOME }
    this.opponent = { x: -1.4, z: -10.6 }
    this.playerMotion = { x: 0, z: 0 }
    this.technique = serving ? 'serve' : 'forehand'
    this.swingClock = 1
    this.opponentSwing = 1
    this.splitClock = 1
    this.splitTimed = false
  }

  begin(): void {
    const aim = { ...this.aim }
    this.reset()
    this.aim = aim
    this.enter('countdown')
  }

  setAim(x: number, z: number): void {
    this.aim = {
      x: clamp(x, -COURT.doubles - 0.65, COURT.doubles + 0.65),
      z: clamp(z, -COURT.halfLength - 1, -0.35),
    }
  }

  setConditions(conditions: Conditions): void {
    this.conditions = conditions
    if (this.ball && (this.phase === 'incoming' || this.phase === 'outgoing')) {
      const flight = traceBall(this.ball, conditions, 2.4, this.phase === 'outgoing')
      this.forecast = flight.points
      if (this.phase === 'outgoing' && this.ball.position.z > 0 && this.lastShot) this.lastShot.clearance = flight.clearance
    }
  }

  split(): void {
    if (!this.active || this.paused || this.splitClock < 0.28 || this.drill === 'serve') return
    this.splitClock = 0
    if ((this.phase === 'countdown' && this.phaseTime > 0.68)
      || (this.phase === 'incoming' && this.phaseTime < 0.30)
      || (this.phase === 'opponent' && this.phaseTime > 0.25)) this.splitTimed = true
  }

  get contactError(): number {
    if (!this.ball || this.phase !== 'incoming') return Number.NaN
    if (this.drill === 'serve') return this.phaseTime - SERVE_CONTACT
    return (this.ball.position.z - (this.player.z - 0.65)) / Math.max(this.ball.velocity.z, 4)
  }

  private canReach(): boolean {
    if (!this.ball) return false
    const { position } = this.ball
    if (this.drill === 'serve') return Math.abs(position.x - this.player.x) < 1.05 && position.y > 2.1
    const contactX = this.player.x + (position.x >= this.player.x ? 0.60 : -0.60)
    return Math.abs(position.x - contactX) < 0.95 && position.y >= 0.17 && position.y <= 2.30
  }

  private contactOpen(): boolean {
    return !!this.ball && (this.drill === 'serve' || this.ball.bounces > 0)
      && Math.abs(this.contactError) <= 0.125 && this.canReach()
  }

  get posture(): StrokePose {
    if (this.swingClock < .50) return { technique: this.technique, progress: clamp(.62 + this.swingClock * .76, .62, 1) }
    const serve = this.drill === 'serve'
    const technique = serve ? 'serve' : this.ball && this.ball.position.x < this.player.x ? 'backhand' : 'forehand'
    const progress = this.phase === 'incoming'
      ? serve ? clamp(this.phaseTime * .91, 0, .55) : clamp((this.contactError + .66) * .79, .02, .55)
      : serve ? 0 : .025
    return { technique, progress }
  }

  get previewBall(): Ball {
    const serve = this.drill === 'serve'
    const origin = { x: this.player.x + .52, y: serve ? 2.72 : 1.08, z: this.player.z - .78 }
    return shotBall(origin, this.aim, this.shot, serve, 1)
  }

  cue(): Cue {
    if (this.paused) return { title: 'Drill paused', detail: 'Resume when you’re ready.', tone: 'neutral' }
    if (this.phase === 'countdown') {
      if (this.drill === 'serve') return { title: 'Set for the toss', detail: 'Aim into the diagonal service box.', tone: 'neutral' }
      if (this.drill === 'footwork') return { title: 'Watch the feeder', detail: 'Use Shift or Split as the feeder hits.', tone: 'neutral' }
      return { title: 'Get ready', detail: 'Read the bounce and meet the ball in front.', tone: 'neutral' }
    }
    if (this.phase === 'incoming') {
      const error = this.contactError
      if (this.contactOpen()) return { title: 'Swing now', detail: 'Press Space or tap Swing.', tone: 'good' }
      if (this.drill === 'serve') return { title: 'Follow the toss', detail: 'Swing as it reaches the top of the window.', tone: 'neutral' }
      if (this.ball && this.ball.bounces > 0 && Math.abs(error) < 0.28 && !this.canReach()) {
        return { title: 'Move to the ball', detail: 'Leave room for the racket beside your body.', tone: 'warn' }
      }
      return { title: 'Read the bounce', detail: 'Move into position and wait for the contact window.', tone: 'neutral' }
    }
    if (this.phase === 'outgoing') return { title: 'Track your shot', detail: 'Watch where it crosses the net and lands.', tone: 'neutral' }
    if (this.phase === 'opponent') return { title: 'Stay in the rally', detail: 'Reset your feet as the feeder moves.', tone: 'good' }
    if (this.phase === 'recover') return { title: 'Recover to center', detail: 'Move back into the ring before the next feed.', tone: 'warn' }
    return this.result
  }

  swing(): void {
    if (this.paused || this.phase !== 'incoming' || !this.ball) return
    const error = this.contactError
    const serving = this.drill === 'serve'
    this.technique = serving ? 'serve' : this.ball.position.x >= this.player.x ? 'forehand' : 'backhand'
    this.swingClock = 0

    if (serving && this.player.z <= COURT.halfLength) {
      this.finishAttempt(false, 'Foot fault', 'Start and strike the serve from behind the baseline.')
      return
    }
    if ((!serving && this.ball.bounces === 0) || error < -0.17) {
      this.finishAttempt(false, 'Too early', 'Wait for the ball to enter the green contact window.')
      return
    }
    if (error > 0.17) {
      this.finishAttempt(false, 'Too late', 'Contact the ball while it is still in front of you.')
      return
    }
    if (!this.canReach()) {
      this.finishAttempt(false, 'Out of reach', 'Move your feet and leave a racket’s length beside you.')
      return
    }

    const quality = clamp(1 - Math.abs(error) / 0.20, 0, 1)
    const aim = {
      x: this.aim.x + (this.technique === 'backhand' ? -1 : 1) * error * 3.1,
      z: this.aim.z - (1 - quality) * 1.5,
    }
    const incoming = this.ball
    this.ball = shotBall(incoming.position, aim, this.shot, serving, quality)
    this.lastContact = contactAt('racket', this.ball.position, incoming.velocity, this.ball.velocity, this.conditions.surface)
    this.replay = {
      frames: [...this.preparation, snapshot(this.clock, this.ball, this.player, this.posture, this.conditions)],
      events: [{ time: this.clock, contact: this.lastContact }],
    }
    this.recordUntil = this.clock + 3.2
    const flight = traceBall(this.ball, this.conditions, 2.4, true)
    this.lastShot = {
      speed: speedOf(this.ball.velocity),
      spin: this.ball.spin,
      sideSpin: this.ball.sideSpin,
      timing: error,
      clearance: flight.clearance,
      landing: null,
    }
    this.trail = []
    this.forecast = flight.points
    this.sound('hit')
    this.enter('outgoing')
  }

  update(dt: number, motion: Motion): void {
    if (this.paused) return
    this.swingClock += dt
    this.splitClock += dt
    this.opponentSwing += dt
    if (!this.active) return
    this.clock += dt
    this.phaseTime += dt
    this.move(dt, motion)

    if (this.phase === 'countdown' && this.phaseTime >= 0.94) {
      this.feed()
      return
    }

    if (this.ball) {
      const impact = stepBall(this.ball, dt, this.conditions)
      if (this.phase === 'incoming') {
        this.preparation.push(snapshot(this.clock, this.ball, this.player, this.posture, this.conditions))
        if (this.preparation.length > 46) this.preparation.shift()
      } else if (this.replay && this.clock <= this.recordUntil) {
        this.replay.frames.push(snapshot(this.clock, this.ball, this.player, this.posture, this.conditions))
      }
      if (this.ball.bounces < 3) {
        this.trail.push({ ...this.ball.position })
        if (this.trail.length > 52) this.trail.shift()
      }
      if (impact && this.phase !== 'between' && this.phase !== 'recover') {
        this.lastContact = impact.contact
        this.sound(impact.kind === 'bounce' ? 'bounce' : 'miss')
      }
      if (impact && this.phase === 'outgoing') {
        this.replay?.events.push({ time: this.clock, contact: impact.contact })
        this.recordUntil = this.clock + .44
        if (impact.kind === 'net') this.finishAttempt(false, 'Into the net', 'Aim deeper or use topspin for a higher flight path.')
        else this.resolveLanding(impact.position)
        return
      }
      if (this.phase === 'incoming' && (this.contactError > 0.30 || this.ball.bounces >= 2 || this.phaseTime > 3.3)) {
        this.finishAttempt(false, 'Missed contact', 'Use the green timing window to meet the next ball.')
        return
      }
      if (this.phase === 'incoming' && !this.announcedContact && this.contactOpen()) {
        this.announcedContact = true
        this.sound('ready')
      }
      if (this.phase === 'opponent') {
        this.opponent.x += clamp(this.ball.position.x - this.opponent.x, -dt * 6, dt * 6)
        if (this.ball.position.z < -9.35 || this.ball.bounces >= 2 || this.phaseTime > 1) this.feed(this.ball.position)
        return
      }
      if (this.phase === 'outgoing' && this.phaseTime > 3.2) {
        this.finishAttempt(false, 'Out of play', 'Aim for the middle of the target on the next feed.')
        return
      }
    }

    if (this.phase === 'recover') {
      if (Math.abs(this.player.x) < 0.78 && Math.abs(this.player.z - HOME) < 0.95) {
        this.finishAttempt(true, 'Recovered to center', this.splitTimed ? 'Well-timed split and a quick recovery.' : 'Good recovery. Try a split-step on the next feed.')
      } else if (this.phaseTime > 1.75) {
        this.finishAttempt(false, 'Recovery missed', 'Start back toward the center ring right after the swing.')
      }
    } else if (this.phase === 'between' && this.phaseTime > 1.72) {
      this.ball = null
      this.trail = []
      this.forecast = []
      this.splitTimed = false
      if (this.progress >= this.goal || this.attempts >= MAX_ATTEMPTS) this.enter('finished')
      else this.enter('countdown')
    }
  }

  private enter(phase: Phase): void {
    this.phase = phase
    this.phaseTime = 0
  }

  private move(dt: number, motion: Motion): void {
    const strength = Math.max(1, Math.hypot(motion.x, motion.z))
    const pace = this.splitTimed && this.splitClock < 0.58 ? 8.4 : 6.5
    const blend = Math.min(1, dt * 18)
    this.playerMotion.x += (motion.x * pace / strength - this.playerMotion.x) * blend
    this.playerMotion.z += (motion.z * pace / strength - this.playerMotion.z) * blend
    this.player.x = clamp(this.player.x + this.playerMotion.x * dt, -6.8, 6.8)
    this.player.z = clamp(this.player.z + this.playerMotion.z * dt, 3.4, 15.25)
  }

  private feed(returnFrom?: Vec3): void {
    const { player, drill } = this
    const wind = this.conditions.wind
    if (drill === 'serve') {
      this.ball = makeBall({ x: player.x + 0.47, y: 1.54, z: player.z - 0.37 }, { x: 0.075, y: 4.91, z: -1.03 })
    } else {
      const forehand = [1.05, 0.99, 1.42, 0.87, 1.18]
      const footwork = [2.76, -2.72, 2.92, -2.6]
      const rally = [0.8, -1.7, 1.85, -2.12, 2.18, -1.38]
      const pattern = drill === 'forehand' ? forehand : drill === 'footwork' ? footwork : rally
      const x = pattern[this.attempts % pattern.length]
      const z = (drill === 'footwork' ? 8.2 : 8.45) + (this.attempts % 3) * 0.29
      const origin = returnFrom
        ? { x: returnFrom.x, y: Math.max(returnFrom.y, 0.72), z: Math.min(returnFrom.z, -6.8) }
        : { x: this.opponent.x + 0.45, y: 1.48, z: this.opponent.z + 0.35 }
      this.opponent.x = origin.x - 0.45
      this.ball = launchTo(origin, { x, z }, drill === 'footwork' ? 1.42 : 1.34, 630, wind)
      this.opponentSwing = 0
      this.sound('hit')
    }
    this.trail = []
    this.lastLanding = null
    this.preparation = []
    this.recordUntil = 0
    this.announcedContact = false
    this.forecast = traceBall(this.ball, this.conditions, 2.23).points
    this.enter('incoming')
  }

  private resolveLanding(position: Vec3): void {
    this.lastLanding = position
    if (this.lastShot) this.lastShot.landing = position
    const serve = this.drill === 'serve'
    const correctHalf = this.adSide ? position.x >= 0 : position.x <= 0
    const legal = inZone(position, { xMin: -COURT.singles, xMax: COURT.singles,
      zMin: serve ? -COURT.service : -COURT.halfLength, zMax: 0 }) && (!serve || correctHalf)
    if (!legal) {
      const title = serve ? 'Service fault' : position.z < -COURT.halfLength ? 'Long' : position.z >= 0 ? 'Short' : 'Wide'
      this.finishAttempt(false, title, serve ? 'Land your first bounce inside the diagonal service box.' : 'Choose a target with more room inside the singles lines.')
    } else if (serve || this.drill === 'forehand') {
      if (inZone(position, this.zone)) this.finishAttempt(true, 'Target hit', serve ? 'Good reach and placement into the box.' : 'Clean contact into the deep cross-court zone.')
      else this.finishAttempt(false, 'In court, off target', 'Adjust your aim toward the center of the highlighted zone.')
    } else if (this.drill === 'footwork') {
      this.enter('recover')
    } else {
      this.attempts += 1
      this.hits += 1
      this.streak += 1
      this.bestStreak = Math.max(this.bestStreak, this.streak)
      this.result = { title: 'Rally kept alive', detail: `${this.streak} in a row.`, tone: 'good' }
      this.sound('good')
      this.enter(this.progress >= this.goal || this.attempts >= MAX_ATTEMPTS ? 'between' : 'opponent')
    }
  }

  private finishAttempt(success: boolean, title: string, detail: string): void {
    this.attempts += 1
    if (success) this.hits += 1
    else this.streak = 0
    this.result = { title, detail, tone: success ? 'good' : 'warn' }
    this.sound(success ? 'good' : 'miss')
    this.enter('between')
  }
}

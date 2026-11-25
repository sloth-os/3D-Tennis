import {
  COURT, DRILLS, clamp, inZone, targetFor, zoneCenter,
  type Aim, type DrillId, type Shot, type Technique, type Vec3,
} from './config.ts'
import { contactAt, launchTo, makeBall, shotBall, speedOf, stepBall, traceBall, type Ball, type Conditions, type Contact } from './physics.ts'
import { snapshot, type ReplayFrame, type ShotReplay, type StrokePose } from './replay.ts'
import { aimWidth, practiceFeed, practiceFeeder, practiceSign, practiceTarget, recoveryRadius, type NtrpPlan, type Take } from './ntrp-training.ts'

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
  plan: NtrpPlan | null = null
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

  get zone() { return this.plan ? practiceTarget(this.plan, this.adSide, this.attempts, this.streak % 2 === 1) : targetFor(this.drill, this.adSide) }
  get recoverySpot() { return this.plan?.recover ?? { x: 0, z: HOME } }
  get recoverySize() { return this.plan ? recoveryRadius(this.plan) : .78 }
  get progress() { return (this.plan?.score ?? (this.drill === 'rally' ? 'rally' : 'placement')) === 'rally' ? this.bestStreak : this.hits }
  get goal() { return this.plan?.goal ?? DRILLS[this.drill].goal }
  get active() { return this.phase !== 'idle' && this.phase !== 'finished' }
  get serving() { return this.drill === 'serve' }
  get take(): Take { return this.plan?.take ?? (this.serving ? 'toss' : 'afterBounce') }
  get showTarget() { return this.plan ? this.plan.placement !== 'court' : this.drill === 'serve' || this.drill === 'forehand' }
  get netOpponent() {
    if (this.plan?.exercise === 'doubles') return { x: 2.28, z: -3.90 }
    if (this.plan?.exercise === 'lob' || this.plan?.exercise === 'pass') return { x: .28, z: -4.45 }
    return null
  }
  get partner() { return this.plan?.exercise === 'doubles' ? { x: -2.24, z: 3.95 } : null }

  select(drill: DrillId): void {
    this.plan = null
    this.drill = drill
    this.shot = DRILLS[drill].shot
    this.adSide = false
    this.reset()
  }

  selectPlan(plan: NtrpPlan): void {
    this.plan = plan
    this.drill = plan.base
    this.shot = plan.shot
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
    const serving = this.serving
    this.player = { x: serving ? (this.adSide ? -1.7 : 1.7) : this.drill === 'forehand' ? 0.45 : 0,
      z: serving ? SERVE_HOME : HOME }
    if (this.plan && !serving) this.player = { ...this.plan.home }
    this.opponent = this.plan ? practiceFeeder(this.plan) : { x: -1.4, z: -10.6 }
    this.playerMotion = { x: 0, z: 0 }
    this.technique = this.swingTechnique()
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
    if (this.serving) return this.phaseTime - SERVE_CONTACT
    return (this.ball.position.z - (this.player.z - 0.65)) / Math.max(this.ball.velocity.z, 4)
  }

  private canReach(): boolean {
    if (!this.ball) return false
    const { position } = this.ball
    if (this.serving) return Math.abs(position.x - this.player.x) < 1.05 && position.y > 2.1
    if (this.take === 'overhead') return Math.abs(position.x - this.player.x) < 1.45 && position.y >= 1.90 && position.y <= 3.18
    if (this.take === 'rising' && (position.y > .87 || this.ball.velocity.y <= 0)) return false
    const contactX = this.player.x + (position.x >= this.player.x ? 0.60 : -0.60)
    const correctSide = this.plan?.direction === 'backhand' ? position.x < this.player.x + .08
      : this.plan?.direction === 'forehand' ? position.x >= this.player.x - .08 : true
    return correctSide && Math.abs(position.x - contactX) < (this.plan ? aimWidth(this.plan) : .95)
      && position.y >= (this.take === 'rising' ? .10 : .17) && position.y <= 2.30
  }

  private contactOpen(): boolean {
    return !!this.ball && this.contactIsPlayable()
      && Math.abs(this.contactError) <= (this.plan ? this.plan.contactWindow - .035 : .125) && this.canReach()
  }

  private contactIsPlayable(): boolean {
    if (!this.ball) return false
    if (this.take === 'toss') return true
    if (this.take === 'beforeBounce' || this.take === 'overhead') return this.ball.bounces === 0
    return this.ball.bounces === 1
  }

  private swingTechnique(): Technique {
    const backhand = this.ball ? this.ball.position.x < this.player.x : this.plan?.direction === 'backhand'
    switch (this.take) {
      case 'toss': return 'serve'
      case 'beforeBounce': return backhand ? 'backhandVolley' : 'volley'
      case 'overhead': return 'overhead'
      case 'rising': return 'halfVolley'
      default:
        if (backhand) return 'backhand'
        return this.plan?.trajectory === 'lob' ? 'lob' : this.plan?.trajectory === 'drop' ? 'drop' : 'forehand'
    }
  }

  get posture(): StrokePose {
    if (this.swingClock < .50) return { technique: this.technique, progress: clamp(.62 + this.swingClock * .76, .62, 1) }
    const serve = this.drill === 'serve'
    const technique = this.swingTechnique()
    const progress = this.phase === 'incoming'
      ? serve ? clamp(this.phaseTime * .91, 0, .55) : clamp((this.contactError + .66) * .79, .02, .55)
      : serve ? 0 : .025
    return { technique, progress }
  }

  get previewBall(): Ball {
    const sign = this.plan ? practiceSign(this.plan, this.adSide, this.attempts) : 1
    const origin = { x: this.player.x + .52 * sign, y: this.serving || this.take === 'overhead' ? 2.72
      : this.take === 'rising' ? .40 : 1.08, z: this.player.z - .78 }
    return this.launch(origin, this.aim, 1)
  }

  private launch(origin: Vec3, aim: Aim, quality: number): Ball {
    const scale = !this.plan ? 1 : this.plan.tier < 2 ? 1.07 : this.plan.tier === 7 && this.plan.exercise !== 'spinServe' ? .96 : 1
    return shotBall(origin, aim, this.shot, this.serving, quality, this.plan?.trajectory, scale)
  }

  cue(): Cue {
    if (this.paused) return { title: 'Drill paused', detail: 'Resume when you’re ready.', tone: 'neutral' }
    if (this.phase === 'countdown') {
      if (this.plan) return { title: this.plan.title, detail: this.plan.cue, tone: 'neutral' }
      if (this.drill === 'serve') return { title: 'Set for the toss', detail: 'Aim into the diagonal service box.', tone: 'neutral' }
      if (this.drill === 'footwork') return { title: 'Watch the feeder', detail: 'Use Shift or Split as the feeder hits.', tone: 'neutral' }
      return { title: 'Get ready', detail: 'Read the bounce and meet the ball in front.', tone: 'neutral' }
    }
    if (this.phase === 'incoming') {
      const error = this.contactError
      if (this.contactOpen()) return { title: 'Swing now', detail: 'Press Space or tap Swing.', tone: 'good' }
      if (this.drill === 'serve') return { title: 'Follow the toss', detail: 'Swing as it reaches the top of the window.', tone: 'neutral' }
      if (this.take === 'beforeBounce') return { title: 'Read the volley', detail: 'Move to the feed and swing before it bounces.', tone: 'neutral' }
      if (this.take === 'overhead') return { title: 'Track the lob', detail: 'Get behind the ball and reach as it drops into range.', tone: 'neutral' }
      if (this.take === 'rising') return { title: 'Catch the rise', detail: 'Meet the ball just after the bounce.', tone: 'neutral' }
      if (this.ball && this.ball.bounces > 0 && Math.abs(error) < 0.28 && !this.canReach()) {
        return { title: 'Move to the ball', detail: 'Leave room for the racket beside your body.', tone: 'warn' }
      }
      return { title: 'Read the bounce', detail: 'Move into position and wait for the contact window.', tone: 'neutral' }
    }
    if (this.phase === 'outgoing') return { title: 'Track your shot', detail: 'Watch where it crosses the net and lands.', tone: 'neutral' }
    if (this.phase === 'opponent') return { title: 'Stay in the rally', detail: 'Reset your feet as the feeder moves.', tone: 'good' }
    if (this.phase === 'recover') return { title: this.plan ? 'Reach the recovery ring' : 'Recover to center', detail: 'Move into the ring before the next feed.', tone: 'warn' }
    return this.result
  }

  swing(): void {
    if (this.paused || this.phase !== 'incoming' || !this.ball) return
    const error = this.contactError
    const serving = this.serving
    const window = this.plan?.contactWindow ?? .17
    this.technique = this.swingTechnique()
    this.swingClock = 0

    if (serving && this.player.z <= COURT.halfLength) {
      this.finishAttempt(false, 'Foot fault', 'Start and strike the serve from behind the baseline.')
      return
    }
    if ((this.take === 'beforeBounce' || this.take === 'overhead') && this.ball.bounces > 0) {
      this.finishAttempt(false, 'Ball already bounced', 'Move forward to take the next feed out of the air.')
      return
    }
    if (!this.contactIsPlayable() || error < -window) {
      this.finishAttempt(false, 'Too early', 'Wait for the ball to enter the green contact window.')
      return
    }
    if (error > window) {
      this.finishAttempt(false, 'Too late', 'Contact the ball while it is still in front of you.')
      return
    }
    if (!this.canReach()) {
      const detail = this.plan?.direction === 'backhand' ? 'Keep the bounce on your backhand side and leave space to swing.'
        : 'Move your feet and leave a racket’s length beside you.'
      this.finishAttempt(false, 'Out of reach', detail)
      return
    }

    const quality = clamp(1 - Math.abs(error) / (this.plan ? window + .045 : .20), 0, 1)
    const assisted = this.plan && this.plan.tier < 3 ? .52 : 1
    const aim = {
      x: this.aim.x + (this.technique === 'backhand' ? -1 : 1) * error * 3.1 * assisted,
      z: this.aim.z - (1 - quality) * 1.5 * assisted,
    }
    const incoming = this.ball
    this.ball = this.launch(incoming.position, aim, quality)
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
      const late = this.plan ? this.plan.contactWindow + .14 : .30
      const contactTimeout = this.take === 'overhead' ? 3.7 : 3.3
      if (this.phase === 'incoming' && (this.contactError > late || this.ball.bounces >= 2 || this.phaseTime > contactTimeout)) {
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
      const spot = this.recoverySpot
      const inside = this.plan
        ? Math.hypot(this.player.x - spot.x, this.player.z - spot.z) <= this.recoverySize
        : Math.abs(this.player.x) < .78 && Math.abs(this.player.z - HOME) < .95
      if (inside) {
        this.finishAttempt(true, this.plan ? 'Recovery complete' : 'Recovered to center',
          this.splitTimed ? 'Well-timed split and a quick recovery.' : 'Good recovery. Try a split-step on the next feed.')
      } else if (this.phaseTime > (this.plan ? 2.20 : 1.75)) {
        this.finishAttempt(false, 'Recovery missed', 'Move toward the highlighted recovery ring right after the swing.')
      }
    } else if (this.phase === 'between' && this.phaseTime > 1.72) {
      this.ball = null
      this.trail = []
      this.forecast = []
      this.splitTimed = false
      if (this.progress >= this.goal || this.attempts >= MAX_ATTEMPTS) this.enter('finished')
      else {
        this.resetPracticeAim()
        this.enter('countdown')
      }
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
    } else if (this.plan) {
      this.ball = practiceFeed(this.plan, this.attempts, this.opponent, wind, returnFrom)
      this.opponent = { x: this.ball.position.x - .42, z: this.ball.position.z - .35 }
      this.opponentSwing = 0
      this.sound('hit')
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
    this.forecast = traceBall(this.ball, this.conditions, this.plan?.take === 'overhead' ? 3 : 2.58).points
    this.enter('incoming')
  }

  private resolveLanding(position: Vec3): void {
    this.lastLanding = position
    if (this.lastShot) this.lastShot.landing = position
    const serve = this.drill === 'serve'
    const correctHalf = this.adSide ? position.x >= 0 : position.x <= 0
    const width = this.plan?.exercise === 'doubles' ? COURT.doubles : COURT.singles
    const legal = inZone(position, { xMin: -width, xMax: width,
      zMin: serve ? -COURT.service : -COURT.halfLength, zMax: 0 }) && (!serve || correctHalf)
    if (!legal) {
      const title = serve ? 'Service fault' : position.z < -COURT.halfLength ? 'Long' : position.z >= 0 ? 'Short' : 'Wide'
      this.finishAttempt(false, title, serve ? 'Land your first bounce inside the diagonal service box.' : 'Choose a target with more room inside the singles lines.')
    } else if (this.plan) {
      this.scorePractice(position)
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

  private resetPracticeAim(): void {
    if (this.plan && !inZone(this.aim, this.zone)) this.aim = zoneCenter(this.zone)
  }

  private scorePractice(position: Vec3): void {
    const plan = this.plan!
    if (!inZone(position, this.zone)) {
      this.finishAttempt(false, 'In court, off target', 'Use the highlighted landing area on the next feed.')
      return
    }
    if (plan.score === 'placement') {
      this.finishAttempt(true, 'Target hit', 'The shot landed in the highlighted area.')
      return
    }
    if (plan.score === 'recovery') {
      this.enter('recover')
      return
    }
    this.attempts += 1
    this.streak += 1
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    const pattern = plan.score === 'pattern'
    if (!pattern || this.streak % 2 === 0) this.hits += 1
    this.result = pattern
      ? this.streak % 2 ? { title: 'Depth found', detail: 'Use the open lane on the next ball.', tone: 'good' }
        : { title: 'Pattern complete', detail: 'Start the next point with another deep drive.', tone: 'good' }
      : { title: 'Rally kept alive', detail: `${this.streak} in a row.`, tone: 'good' }
    this.sound('good')
    this.resetPracticeAim()
    this.enter(this.progress >= this.goal || this.attempts >= MAX_ATTEMPTS ? 'between' : 'opponent')
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

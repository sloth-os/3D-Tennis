import {
  COURT, DRILLS, clamp, inZone, targetFor, zoneCenter,
  type Aim, type DrillId, type Shot, type Surface, type Technique, type Vec3,
} from './config.ts'
import { contactAt, launchTo, makeBall, shotBall, speedOf, stepBall, traceBall, type Ball, type Conditions, type Contact } from './physics.ts'
import { snapshot, type ReplayFrame, type ShotReplay, type StrokePose } from './replay.ts'
import { aimWidth, practiceFeed, practiceFeeder, practiceSign, practiceTarget, recoveryRadius, type NtrpPlan, type Take } from './ntrp-training.ts'
import { advanceFeet, callLanding, interceptFlight, lineDistance, recoveryPosition, Tiebreak, type LineCall, type Pace, type Side } from './point-play.ts'
import { CONTACT_BALLS, CONTACT_START, contactAtDepth, contactFeed, contactRecovery, liveSwingTip, moveToStance,
  type ContactBall, type StrokeSide } from './contact-training.ts'

export type Phase = 'idle' | 'countdown' | 'incoming' | 'outgoing' | 'opponent' | 'recover' | 'between' | 'finished'
export type Motion = { x: number; z: number }
export type Cue = { title: string; detail: string; tone: 'neutral' | 'good' | 'warn' }
export type Sound = 'bounce' | 'hit' | 'good' | 'miss' | 'ready'
export type SoundSpot = { x: number; surface: Surface; speed: number }
export type ShotMetrics = {
  number: number
  aim: Aim
  stroke: Technique
  conditions: Conditions
  result: 'In flight' | 'In' | 'Target hit' | 'Out' | 'Net' | 'Let'
  call: LineCall | null
  clip: ShotReplay
  speed: number
  spin: number
  sideSpin: number
  timing: number
  clearance: number | null
  landing: Vec3 | null
}

const HOME = 10.95
const SERVE_HOME = 12.40
const SERVE_CONTACT = 0.485
const MAX_ATTEMPTS = 12
const EMPTY_CUE: Cue = { title: 'Ready to train', detail: 'Start the drill to receive your first ball.', tone: 'neutral' }

export class Game {
  drill: DrillId = 'forehand'
  plan: NtrpPlan | null = null
  match: Tiebreak | null = null
  pace: Pace = 'club'
  contactBall: ContactBall = 'waist'
  contactSide: StrokeSide = 'forehand'
  private strike?: Vec3
  private swingShot: Shot = 'topspin'
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
  opponentTechnique: Technique = 'forehand'
  opponentMotion: Aim = { x: 0, z: 0 }
  playerStride = 0
  opponentStride = 0
  intercept: ReturnType<typeof interceptFlight> = null
  private chaseTime = 0
  private touchedTape = false
  private serveFootFault = false
  private missedSwing = ''
  aim = zoneCenter(targetFor('forehand', false))
  ball: Ball | null = null
  trail: Vec3[] = []
  forecast: Vec3[] = []
  receiveMark: { feet: Aim; contact: Vec3; bounce: Vec3 | null; side: 'Forehand' | 'Backhand' } | null = null
  lastLanding: Vec3 | null = null
  lastCall: LineCall | null = null
  lastShot: ShotMetrics | null = null
  readonly shots: ShotMetrics[] = []
  lastContact: Contact | null = null
  private lastNet: { contact: Contact; time: number } | null = null
  get netMotion() { return this.lastNet ? { contact: this.lastNet.contact, age: this.clock - this.lastNet.time } : null }
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
  private readonly sound: (sound: Sound, spot?: SoundSpot) => void
  private announcedContact = false
  private clock = 0
  private preparation: ReplayFrame[] = []
  private recordUntil = 0

  constructor(sound: (sound: Sound, spot?: SoundSpot) => void = () => {}) {
    this.sound = sound
  }

  get zone() {
    if (this.match && this.serving) return { xMin: this.adSide ? 0 : -COURT.singles, xMax: this.adSide ? COURT.singles : 0,
      zMin: -COURT.service, zMax: 0 }
    return this.plan ? practiceTarget(this.plan, this.adSide, this.attempts, this.streak % 2 === 1) : targetFor(this.drill, this.adSide)
  }
  get recoverySpot() {
    if (this.drill === 'contact') return contactRecovery(this.contactBall, this.contactSide)
    if (this.match) return recoveryPosition(this.intercept?.ball ?? this.opponent)
    return this.plan?.recover ?? { x: 0, z: HOME }
  }
  get recoverySize() { return this.plan ? recoveryRadius(this.plan) : .78 }
  get progress() { return this.match?.you ?? ((this.plan?.score ?? (this.drill === 'rally' ? 'rally' : 'placement')) === 'rally' ? this.bestStreak : this.hits) }
  get goal() { return this.plan?.goal ?? DRILLS[this.drill].goal }
  get active() { return this.phase !== 'idle' && this.phase !== 'finished' }
  get serving() { return this.drill === 'serve' || !!this.match && this.match.servingPoint === 'you' && this.match.serviceBall }
  get courtConditions(): Conditions { return this.match?.end ? { surface: this.conditions.surface, wind: -this.conditions.wind } : this.conditions }
  get take(): Take {
    if (this.match && !this.match.serviceBall && this.phase === 'incoming' && this.ball?.bounces === 0)
      return this.ball.position.y > 2.10 ? 'overhead' : 'beforeBounce'
    return this.plan?.take ?? (this.serving ? 'toss' : 'afterBounce')
  }
  get showTarget() { return this.plan ? this.plan.placement !== 'court' : this.serving || this.drill === 'forehand' }
  get opponentPose(): StrokePose {
    if (this.opponentSwing < .51) return { technique: this.opponentTechnique, progress: .62 + this.opponentSwing * .74 }
    if (this.match?.servingPoint === 'rival' && this.phase === 'countdown')
      return { technique: 'serve', progress: clamp(this.phaseTime * .61, 0, .59) }
    if (this.intercept && (this.phase === 'opponent' || this.phase === 'outgoing')) {
      const lead = this.intercept.ball.t - this.chaseTime
      return { technique: this.intercept.ball.x <= this.opponent.x ? 'forehand' : 'backhand',
        progress: clamp(.58 - lead * .89, .025, .58) }
    }
    return { technique: 'forehand', progress: .025 }
  }
  get opponentToss(): Ball | null {
    if (this.phase !== 'countdown' || this.match?.servingPoint !== 'rival' || this.phaseTime < .46) return null
    const t = this.phaseTime - .46
    return makeBall({ x: this.opponent.x - .27 - .14 * t, y: 1.44 + 4.78 * t - 4.905 * t * t,
      z: this.opponent.z + .20 + .48 * t }, { x: -.14, y: 4.78 - 9.81 * t, z: .48 })
  }
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

  selectContact(ball: ContactBall, side: StrokeSide) {
    this.contactBall = ball
    this.contactSide = side
    this.select('contact')
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
    this.match = this.drill === 'match' ? new Tiebreak(this.pace) : null
    this.phase = 'idle'
    this.paused = false
    this.phaseTime = 0
    this.hits = 0
    this.attempts = 0
    this.streak = 0
    this.bestStreak = 0
    this.result = EMPTY_CUE
    this.lastShot = null
    this.shots.length = 0
    this.lastLanding = null
    this.lastCall = null
    this.lastContact = null
    this.lastNet = null
    this.replay = null
    this.clock = 0
    this.preparation = []
    this.recordUntil = 0
    this.ball = null
    this.forecast = []
    this.receiveMark = null
    this.trail = []
    this.placePlayers()
    this.aim = zoneCenter(this.zone)
  }

  private placePlayers(): void {
    this.match?.prepare()
    if (this.match) this.adSide = this.match.ad
    const serving = this.serving
    this.player = { x: serving ? (this.adSide ? -1.7 : 1.7) : this.drill === 'forehand' ? 0.45 : 0,
      z: serving ? SERVE_HOME : HOME }
    if (this.plan && !serving) this.player = { ...this.plan.home }
    if (this.drill === 'contact') this.player = { ...CONTACT_START }
    this.opponent = this.plan ? practiceFeeder(this.plan) : { x: -1.4, z: -10.6 }
    if (this.match) {
      const sign = this.adSide ? -1 : 1
      if (!serving) this.player = { x: sign * 1.92, z: 10.34 }
      this.opponent = { x: -sign * (serving ? 1.80 : 1.87), z: serving ? -10.75 : -12.36 }
    }
    this.playerMotion = { x: 0, z: 0 }
    this.opponentMotion = { x: 0, z: 0 }
    this.playerStride = this.opponentStride = 0
    this.intercept = null
    this.touchedTape = false
    this.serveFootFault = false
    this.missedSwing = ''
    this.strike = undefined
    this.opponentTechnique = 'forehand'
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
    if (this.ball && (this.phase === 'incoming' || this.phase === 'outgoing' || this.phase === 'opponent')) {
      const flight = traceBall(this.ball, this.courtConditions, this.drill === 'contact' ? 3.6 : 2.65)
      this.forecast = flight.points
      if (this.phase !== 'incoming') this.trackOpponent(flight.points)
      else this.markReceive(flight)
      if (this.phase === 'outgoing' && this.ball.position.z > 0 && this.lastShot) this.lastShot.clearance = flight.clearance
    }
  }

  split(): void {
    if (!this.active || this.paused || this.splitClock < 0.28 || this.serving) return
    this.splitClock = 0
    const lead = this.intercept ? this.intercept.ball.t - this.chaseTime : Infinity
    this.splitTimed = (this.phase === 'countdown' && this.phaseTime > 0.68)
      || (this.phase === 'incoming' && this.phaseTime < 0.30)
      || ((this.phase === 'outgoing' || this.phase === 'opponent') && lead >= -.10 && lead < .22)
  }

  get contactError(): number {
    if (!this.ball || this.phase !== 'incoming') return Number.NaN
    if (this.serving) return this.phaseTime - SERVE_CONTACT
    return (this.ball.position.z - (this.player.z - 0.65)) / Math.max(this.ball.velocity.z, 4)
  }

  private canReach(): boolean {
    if (!this.ball) return false
    const { position } = this.ball
    if (this.drill === 'contact' && this.receiveMark) {
      const sign = this.contactSide === 'forehand' ? 1 : -1
      const space = (position.x - this.player.x) * sign
      return space >= .27 && space <= 1.04 && Math.abs(position.z - this.receiveMark.contact.z) < .72
        && Math.abs(position.y - this.receiveMark.contact.y) < .31
    }
    if (this.serving) return Math.abs(position.x - this.player.x - .32) < .62 && Math.abs(position.z - this.player.z + .45) < .60 && position.y > 2.1
    if (this.take === 'overhead') return Math.abs(position.x - this.player.x) < 1.45 && position.y >= 1.90 && position.y <= 3.18
    if (this.take === 'rising' && (position.y > .87 || this.ball.velocity.y <= 0)) return false
    const contactX = this.player.x + (position.x >= this.player.x ? 0.60 : -0.60)
    const correctSide = this.plan?.direction === 'backhand' ? position.x < this.player.x + .08
      : this.plan?.direction === 'forehand' ? position.x >= this.player.x - .08 : true
    return correctSide && Math.abs(position.x - contactX) < (this.plan ? aimWidth(this.plan) : .95)
      && position.y >= (this.take === 'rising' ? .10 : .17) && position.y <= 2.30
  }

  private markReceive(flight: ReturnType<typeof traceBall>) {
    const previous = this.receiveMark
    const bounce = this.ball && this.ball.bounces > 0 ? previous?.bounce ?? null : flight.landing
    this.receiveMark = null
    if (this.serving) return
    if (this.drill === 'contact') {
      const contact = contactAtDepth(flight.points, CONTACT_BALLS[this.contactBall].z)
      if (contact) {
        const forehand = this.contactSide === 'forehand'
        this.receiveMark = { feet: { x: contact.x + (forehand ? -.62 : .62), z: contact.z + .65 },
          contact, bounce, side: forehand ? 'Forehand' : 'Backhand' }
        return
      }
      if (previous && this.ball && this.ball.position.z >= previous.contact.z) { this.receiveMark = previous; return }
    }
    const take = this.plan?.take ?? (this.match && this.player.z <= COURT.service && !this.match.serviceBall ? 'beforeBounce' : 'afterBounce')
    const bounced = take === 'afterBounce' || take === 'rising'
    const depth = this.plan?.home.z ?? this.player.z
    let nearest = Infinity
    for (const p of flight.points) {
      if (p.z <= .50 || p.bounces !== Number(bounced) || p.y < (take === 'overhead' ? 1.90 : .20)
        || p.y > (take === 'rising' ? .85 : take === 'overhead' ? 3.08 : 2.10)) continue
      const cost = Math.abs(p.z - (depth - .65))
      if (cost >= nearest) continue
      nearest = cost
      const sign = this.plan?.direction === 'forehand' ? 1 : this.plan?.direction === 'backhand' ? -1 : Math.sign(p.x - this.player.x) || 1
      this.receiveMark = { feet: { x: p.x - sign * .62, z: p.z + .65 }, contact: p, bounce: bounced ? bounce : null,
        side: sign > 0 ? 'Forehand' : 'Backhand' }
    }
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
    if (this.drill === 'contact') return this.contactSide
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
    if (this.swingClock < .50) return { technique: this.technique, progress: clamp(.62 + this.swingClock * .76, .62, 1), strike: this.strike, shot: this.swingShot }
    const serve = this.serving
    const technique = this.swingTechnique()
    const progress = this.phase === 'incoming'
      ? serve ? clamp(this.phaseTime * .56 / SERVE_CONTACT, 0, .56) : clamp((this.contactError + .66) * .79, .02, .55)
      : serve ? 0 : .025
    const mark = this.phase === 'incoming' ? this.receiveMark : null
    const strike = mark && (technique === 'forehand' || technique === 'backhand')
      ? { x: mark.contact.x - mark.feet.x, y: mark.contact.y - .014, z: mark.contact.z - mark.feet.z } : undefined
    return { technique, progress, strike, shot: this.shot }
  }

  get previewBall(): Ball {
    const sign = this.plan ? practiceSign(this.plan, this.adSide, this.attempts) : 1
    const origin = { x: this.player.x + (this.serving ? .34 : .52 * sign), y: this.serving ? 2.55 : this.take === 'overhead' ? 2.72
      : this.take === 'rising' ? .40 : 1.08, z: this.player.z - (this.serving ? .43 : .78) }
    return this.launch(origin, this.aim, 1)
  }

  private launch(origin: Vec3, aim: Aim, quality: number): Ball {
    const scale = !this.plan ? 1 : this.plan.tier < 2 ? 1.07 : this.plan.tier === 7 && this.plan.exercise !== 'spinServe' ? .96 : 1
    const trajectory = this.match && this.take === 'beforeBounce' ? 'volley' : this.match && this.take === 'overhead' ? 'smash' : this.plan?.trajectory
    return shotBall(origin, aim, this.shot, this.serving, quality, trajectory, scale)
  }

  cue(): Cue {
    if (this.paused) return { title: this.match ? 'Tiebreak paused' : 'Drill paused', detail: 'Resume when you’re ready.', tone: 'neutral' }
    if (this.phase === 'countdown') {
      if (this.drill === 'contact') return { title: CONTACT_BALLS[this.contactBall].label, detail: CONTACT_BALLS[this.contactBall].move, tone: 'neutral' }
      if (this.match) return { title: this.serving ? 'Your serve' : 'Return of serve',
        detail: (this.match.played > 0 && this.match.played % 6 === 0 ? 'Change of ends · ' : '') + (this.match.ad ? 'Ad court' : 'Deuce court')
          + ' · ' + (this.serving ? 'Aim into the diagonal box, then time the toss.' : 'Split on the strike and let the serve bounce.'), tone: 'neutral' }
      if (this.plan) return { title: this.plan.title, detail: this.plan.cue, tone: 'neutral' }
      if (this.drill === 'serve') return { title: 'Set for the toss', detail: 'Aim into the diagonal service box.', tone: 'neutral' }
      if (this.drill === 'footwork') return { title: 'Watch the feeder', detail: 'Use Shift or Split as the feeder hits.', tone: 'neutral' }
      return { title: 'Get ready', detail: 'Read the bounce and meet the ball in front.', tone: 'neutral' }
    }
    if (this.phase === 'incoming') {
      const error = this.contactError
      const mark = this.receiveMark
      const side = mark?.side ?? (this.ball && this.ball.position.x < this.player.x ? 'Backhand' : 'Forehand')
      const move = mark ? moveToStance(this.player, mark.feet) : ''
      const volley = this.take === 'beforeBounce' && !(this.match && this.player.z > COURT.service)
      const overhead = this.take === 'overhead' && (!this.match || this.player.z < COURT.service)
      if (this.missedSwing && this.swingClock < .26) return { title: this.missedSwing, detail: 'The ball is live. Recover for another swing.', tone: 'warn' }
      if (this.contactOpen()) {
        const technique = this.swingTechnique()
        const detail = technique === 'serve' || technique === 'overhead' ? 'Reach up to the ball just in front of your hitting shoulder.'
          : technique === 'halfVolley' ? 'Stay low and block forward just after the bounce.'
          : technique === 'volley' || technique === 'backhandVolley' ? 'Meet it out in front with a short punch and a steady wrist.'
          : technique === 'lob' ? 'Brush up the back of the ball and finish high over the net player.'
          : technique === 'drop' ? 'Soften the grip and cushion the ball with a slightly open face.'
          : liveSwingTip(this.ball!.position.y, technique, this.shot)
        return { title: 'Swing now', detail, tone: 'good' }
      }
      if (this.serving) return { title: 'Follow the toss', detail: 'Extend up to contact slightly ahead of the hitting shoulder.', tone: 'neutral' }
      if (overhead) return { title: 'Track the lob', detail: 'Turn sideways and use crossover steps to get behind the ball. Reach high in front.', tone: 'neutral' }
      if (this.take === 'rising') return { title: move ? 'Move ' + move : 'Catch the rise', detail: 'Bend the knees, set the face low and block just after the bounce.', tone: 'neutral' }
      if (volley) return { title: move ? 'Move ' + move : 'Set for the volley', detail: 'Split, step diagonally to the ball and meet it in front with a short punch.', tone: 'neutral' }
      if (this.match?.serviceBall && !this.ball?.bounces) return { title: 'Let the serve bounce', detail: move
        ? 'Move ' + move + ' to the blue shoes and turn for the ' + side.toLowerCase() + '.' : 'Split and turn. Keep the racket in front for the return.', tone: 'neutral' }
      if (mark) {
        return { title: move ? 'Move ' + move : 'Set for the ' + side.toLowerCase(),
          detail: (move ? 'Find the blue shoes. ' : '') + liveSwingTip(mark.contact.y, side, this.shot),
          tone: Math.abs(error) < .18 && !!move ? 'warn' : 'neutral' }
      }
      return { title: 'Read the bounce', detail: 'Move into position and wait for the contact window.', tone: 'neutral' }
    }
    if (this.match && (this.phase === 'outgoing' || this.phase === 'opponent'))
      return { title: this.touchedTape ? 'Net cord' : 'Cover the reply', detail: 'Recover toward the blue ring. Split as your opponent strikes.', tone: 'neutral' }
    if (this.phase === 'outgoing' && this.drill === 'contact') return { title: 'Recover for the reply',
      detail: CONTACT_BALLS[this.contactBall].recover, tone: 'neutral' }
    if (this.phase === 'outgoing') return { title: 'Track your shot', detail: 'Watch where it crosses the net and lands.', tone: 'neutral' }
    if (this.phase === 'opponent') return { title: 'Stay in the rally', detail: 'Reset your feet as the feeder moves.', tone: 'good' }
    if (this.phase === 'recover' && this.drill === 'contact') return { title: 'Move into the recovery ring', detail: CONTACT_BALLS[this.contactBall].recover, tone: 'warn' }
    if (this.phase === 'recover') return { title: this.plan ? 'Reach the recovery ring' : 'Recover to center', detail: 'Move into the ring before the next feed.', tone: 'warn' }
    return this.result
  }

  swing(): void {
    if (this.paused || this.phase !== 'incoming' || !this.ball) return
    if (this.match && this.swingClock < .26) return
    const error = this.contactError
    const serving = this.serving
    const window = this.plan?.contactWindow ?? .17
    this.technique = this.swingTechnique()
    this.swingClock = 0

    if (this.match && !serving) {
      if (Math.abs(error) > window || !this.canReach()) {
        this.missedSwing = Math.abs(error) <= window ? 'Swing missed wide' : error < 0 ? 'Early swing' : 'Late swing'
        return
      }
      if (this.match.serviceBall && this.ball.bounces === 0) {
        this.match.serveIn()
        this.pointTo('rival', 'Serve volleyed', 'The receiver must let the serve bounce before making contact.')
        return
      }
    }

    if (serving && (this.serveFootFault || this.player.z <= COURT.halfLength)) {
      this.finishAttempt(false, 'Foot fault', 'Set both feet behind the baseline on the serving side.')
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
      const detail = this.drill === 'contact' ? CONTACT_BALLS[this.contactBall].move
        : this.plan?.direction === 'backhand' ? 'Keep the bounce on your backhand side and leave space to swing.'
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
    this.swingShot = this.shot
    this.strike = { x: incoming.position.x - this.player.x, y: incoming.position.y - .014, z: incoming.position.z - this.player.z }
    this.ball = this.launch(incoming.position, aim, quality)
    this.ball.rotation = { ...incoming.rotation }
    if (this.match) this.match.strikes++
    this.touchedTape = false
    this.lastContact = contactAt('racket', this.ball.position, incoming.velocity, this.ball.velocity, this.conditions.surface)
    this.replay = {
      frames: [...this.preparation, this.captureFrame()],
      events: [{ time: this.clock, contact: this.lastContact }],
      score: this.match ? { you: this.match.you, rival: this.match.rival } : undefined,
    }
    this.recordUntil = this.clock + 3.2
    const flight = traceBall(this.ball, this.courtConditions, 2.95)
    this.trackOpponent(flight.points)
    this.lastShot = {
      number: (this.shots.at(-1)?.number ?? 0) + 1, aim: { ...this.aim }, stroke: this.technique,
      conditions: { ...this.courtConditions }, result: 'In flight', call: null, clip: this.replay,
      speed: speedOf(this.ball.velocity),
      spin: this.ball.spin,
      sideSpin: this.ball.sideSpin,
      timing: error,
      clearance: flight.clearance,
      landing: null,
    }
    this.shots.push(this.lastShot)
    if (this.shots.length > 32) this.shots.shift()
    this.trail = []
    this.forecast = flight.points
    this.sound('hit', { x: incoming.position.x, surface: this.conditions.surface, speed: speedOf(this.ball.velocity) })
    this.enter('outgoing')
  }

  captureFrame(): ReplayFrame {
    return snapshot(this.clock, this.ball!, this.player, this.posture, this.courtConditions,
      { velocity: this.playerMotion, stride: this.playerStride, split: this.splitClock },
      { position: this.opponent, pose: this.opponentPose,
        feet: { velocity: this.opponentMotion, stride: this.opponentStride, split: 1 } }, this.match?.end ?? 0)
  }

  private trackOpponent(points: Parameters<typeof interceptFlight>[0]) {
    this.chaseTime = 0
    this.intercept = this.drill === 'match' || this.drill === 'rally'
      ? interceptFlight(points, this.opponent, this.match?.runningSpeed ?? 6.65, this.match?.parameters.reaction ?? .12) : null
  }

  private moveOpponent(dt: number) {
    const chasing = this.phase === 'outgoing' || this.phase === 'opponent'
    if (chasing) this.chaseTime += dt
    const recovering = this.match && this.phase === 'incoming' && !this.match.serviceBall
    const target = chasing ? this.intercept?.stance : recovering ? recoveryPosition(this.player, -10.4) : null
    let vx = 0, vz = 0
    if (target && (!chasing || this.chaseTime >= (this.match?.parameters.reaction ?? .12))) {
      const dx = target.x - this.opponent.x, dz = target.z - this.opponent.z
      const distance = Math.hypot(dx, dz)
      const speed = Math.min(this.match?.runningSpeed ?? 6.65, distance * 7) * (recovering ? .77 : 1)
      if (distance > .045) { vx = dx * speed / distance; vz = dz * speed / distance }
    }
    advanceFeet(this.opponent, this.opponentMotion, { x: vx, z: vz }, dt, this.conditions.surface)
    const distance = Math.hypot(this.opponentMotion.x, this.opponentMotion.z) * dt
    this.opponentStride += distance * 4.45
    if (this.match && (chasing || recovering)) {
      this.match.rivalWork += distance
      this.match.stats.rival.distance += distance
    }
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
    this.moveOpponent(dt)

    if (this.phase === 'countdown' && this.phaseTime >= 0.94) {
      this.feed()
      return
    }

    if (this.ball) {
      const impact = stepBall(this.ball, dt, this.courtConditions)
      if (this.phase === 'incoming') {
        this.preparation.push(this.captureFrame())
        if (this.preparation.length > 46) this.preparation.shift()
      } else if (this.replay && this.clock <= this.recordUntil) {
        this.replay.frames.push(this.captureFrame())
      }
      if (this.ball.bounces < 3) {
        this.trail.push({ ...this.ball.position })
        if (this.trail.length > 52) this.trail.shift()
      }
      if (impact && this.phase !== 'between' && this.phase !== 'recover') {
        this.lastContact = impact.contact
        if (impact.kind !== 'bounce') this.lastNet = { contact: impact.contact, time: this.clock }
        this.sound(impact.kind === 'bounce' || impact.kind === 'cord' ? 'bounce' : 'miss',
          { x: impact.position.x, surface: this.conditions.surface, speed: Math.abs(impact.contact.before.y) })
      }
      if (impact?.kind === 'cord') this.touchedTape = true
      if (impact && this.phase === 'outgoing') {
        this.replay?.events.push({ time: this.clock, contact: impact.contact })
        if (impact.kind !== 'cord') this.recordUntil = this.clock + .44
        if (impact.kind === 'net') {
          if (this.lastShot) this.lastShot.result = 'Net'
          this.finishAttempt(false, 'Into the net', 'Aim deeper or use topspin for a higher flight path.')
        }
        else if (impact.kind === 'bounce') this.resolveLanding(impact.position)
        return
      }
      if (this.match && this.phase === 'incoming' && !this.serving && impact) {
        if (impact.kind === 'net') {
          if (this.match.serviceBall) this.serviceFault('Serve into the net')
          else this.pointTo('you', 'Opponent hit the net', 'Your previous shot left the opponent a difficult reply.')
          return
        }
        if (impact.kind === 'bounce' && this.ball.bounces === 1) {
          const call = callLanding(impact.position, true, this.match.serviceBall ? this.adSide : undefined)
          this.lastCall = call
          this.lastLanding = impact.position
          if (!call.inside) {
            if (this.match.serviceBall) this.serviceFault(lineDistance(call))
            else this.pointTo('you', 'Opponent hit out', lineDistance(call))
            return
          }
          if (this.match.serviceBall) {
            if (this.touchedTape) { this.serviceLet(); return }
            this.match.serveIn()
          }
        }
      }
      const late = this.plan ? this.plan.contactWindow + .14 : .30
      const contactTimeout = this.take === 'overhead' || this.drill === 'contact' ? 4.0 : 3.3
      if (this.phase === 'incoming' && this.match && this.serving && this.ball.bounces === 1) {
        this.result = { title: 'Toss reset', detail: 'An untouched toss can be taken again. Swing near the top of the next toss.', tone: 'neutral' }
        this.enter('between')
        return
      }
      if (this.phase === 'incoming' && ((!this.match && this.contactError > late) || this.ball.bounces >= 2 || this.phaseTime > contactTimeout)) {
        this.finishAttempt(false, 'Missed contact', this.drill === 'contact' ? CONTACT_BALLS[this.contactBall].move : 'Use the green timing window to meet the next ball.')
        return
      }
      if (this.phase === 'incoming' && !this.announcedContact && this.contactOpen()) {
        this.announcedContact = true
        this.sound('ready')
      }
      if (this.phase === 'opponent') {
        const p = this.ball.position
        const reachable = this.ball.bounces === 1 && p.y > .24 && p.y < 2.05
          && Math.abs(p.x - this.opponent.x) < 1.22 && Math.abs(p.z - (this.opponent.z + .59)) < .86
        if (reachable && (!this.intercept || this.chaseTime >= this.intercept.ball.t - .035)) {
          this.feed(p)
        } else if (this.ball.bounces >= 2 || this.phaseTime > 2.45) {
          if (this.match) this.pointTo('you', this.match.strikes === 1 ? 'Ace' : 'Clean winner', 'The second bounce beat the opponent to the ball.')
          else { this.ball = null; this.enter('countdown') }
        }
        return
      }
      if (this.phase === 'outgoing' && this.phaseTime > 3.2) {
        this.finishAttempt(false, 'Out of play', 'Aim for the middle of the target on the next feed.')
        return
      }
    }

    if (this.phase === 'recover') {
      const spot = this.recoverySpot
      const inside = this.plan || this.drill === 'contact'
        ? Math.hypot(this.player.x - spot.x, this.player.z - spot.z) <= this.recoverySize
        : Math.abs(this.player.x) < .78 && Math.abs(this.player.z - HOME) < .95
      if (inside) {
        this.finishAttempt(true, this.drill === 'contact' ? 'Contact and recovery' : this.plan ? 'Recovery complete' : 'Recovered to center',
          this.splitTimed ? 'Well-timed split and a quick recovery.' : 'Good recovery. Try a split-step on the next feed.')
      } else if (this.phaseTime > (this.plan || this.drill === 'contact' ? 2.20 : 1.75)) {
        this.finishAttempt(false, 'Recovery missed', 'Move toward the highlighted recovery ring right after the swing.')
      }
    } else if (this.phase === 'between' && this.phaseTime > 1.72) {
      this.ball = null
      this.trail = []
      this.forecast = []
      this.splitTimed = false
      if (this.match ? this.match.finished : this.progress >= this.goal || this.attempts >= MAX_ATTEMPTS) this.enter('finished')
      else {
        if (this.match) {
          this.placePlayers()
          this.aim = this.serving ? { x: (this.adSide ? 1 : -1) * 2.12, z: -4.85 } : { x: this.adSide ? 2.0 : -2.0, z: -8.85 }
        } else if (this.drill === 'contact') this.placePlayers()
        else this.resetPracticeAim()
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
    const pace = this.splitTimed && this.splitClock > .18 && this.splitClock < .58 ? 8.4 : 6.5
    const airborne = this.splitClock > .085 && this.splitClock < .185
    const desired = airborne ? this.playerMotion : { x: motion.x * pace / strength, z: motion.z * pace / strength }
    advanceFeet(this.player, this.playerMotion, desired, dt, this.conditions.surface)
    this.player.x = clamp(this.player.x, -6.8, 6.8)
    this.player.z = clamp(this.player.z, this.match ? 1.35 : 3.4, 15.25)
    const distance = Math.hypot(this.playerMotion.x, this.playerMotion.z) * dt
    this.playerStride += distance * 4.45
    if (this.match && this.phase !== 'between') this.match.stats.you.distance += distance
    if (this.serving && this.phase === 'incoming' && (this.player.z <= COURT.halfLength
      || (this.adSide ? -1 : 1) * this.player.x < 0 || Math.abs(this.player.x) > COURT.singles)) this.serveFootFault = true
  }

  private feed(returnFrom?: Vec3): void {
    const { player, drill } = this
    const wind = this.courtConditions.wind
    const arrive = returnFrom ? this.ball?.velocity : this.opponentToss?.velocity
    if (this.serving) {
      this.ball = makeBall({ x: player.x + .27, y: 1.44, z: player.z - .20 }, { x: .14, y: 4.78, z: -.48 })
    } else if (this.match) {
      this.ball = returnFrom
        ? this.match.opponentReturn(returnFrom, player, Math.hypot(this.opponentMotion.x, this.opponentMotion.z), wind)
        : this.match.opponentServe(wind)
      this.match.strikes++
    } else if (drill === 'contact') {
      this.ball = contactFeed(this.contactBall, this.contactSide, this.courtConditions)
      this.opponent = { x: this.ball.position.x + .42, z: this.ball.position.z - .38 }
    } else if (this.plan) {
      this.ball = practiceFeed(this.plan, this.attempts, this.opponent, wind, returnFrom)
      if (!returnFrom) this.opponent = { x: this.ball.position.x - .42, z: this.ball.position.z - .35 }
    } else {
      const forehand = [1.05, 0.99, 1.42, 0.87, 1.18]
      const footwork = [2.76, -2.72, 2.92, -2.6]
      const rally = [0.8, -1.7, 1.85, -2.12, 2.18, -1.38]
      const pattern = drill === 'forehand' ? forehand : drill === 'footwork' ? footwork : rally
      const x = pattern[this.attempts % pattern.length]
      const z = (drill === 'footwork' ? 8.2 : 8.45) + (this.attempts % 3) * 0.29
      const origin = returnFrom ?? { x: this.opponent.x - 0.45, y: 1.48, z: this.opponent.z + 0.35 }
      this.ball = launchTo(origin, { x, z }, drill === 'footwork' ? 1.42 : 1.34, 630, wind)
    }
    if (!this.serving) {
      if (arrive) this.lastContact = contactAt('racket', this.ball.position, arrive, this.ball.velocity, this.conditions.surface)
      this.opponentTechnique = !returnFrom && (this.match || this.plan?.exercise === 'return' || this.plan?.exercise === 'pressureReturn')
        ? 'serve' : this.ball.position.x <= this.opponent.x ? 'forehand' : 'backhand'
      this.opponentSwing = 0
      this.sound('hit', { x: this.ball.position.x, surface: this.conditions.surface, speed: speedOf(this.ball.velocity) })
    }
    this.intercept = null
    this.touchedTape = false
    this.serveFootFault = false
    this.missedSwing = ''
    this.lastLanding = null
    this.lastCall = null
    this.trail = []
    this.preparation = []
    this.recordUntil = 0
    this.announcedContact = false
    const flight = traceBall(this.ball, this.courtConditions, drill === 'contact' ? 3.6 : this.plan?.take === 'overhead' ? 3 : 2.58)
    this.forecast = flight.points
    this.enter('incoming')
    this.markReceive(flight)
  }

  private resolveLanding(position: Vec3): void {
    this.lastLanding = position
    if (this.lastShot) this.lastShot.landing = position
    const serve = this.serving
    const call = callLanding(position, false, serve ? this.adSide : undefined, this.plan?.exercise === 'doubles')
    this.lastCall = call
    if (this.lastShot) {
      this.lastShot.call = call
      this.lastShot.result = !call.inside ? 'Out' : serve && this.touchedTape ? 'Let'
        : !this.match && this.showTarget && inZone(position, this.zone) ? 'Target hit' : 'In'
    }
    if (!call.inside) {
      const title = serve ? 'Service fault' : position.z < -COURT.halfLength ? 'Long' : position.z >= 0 ? 'Short' : 'Wide'
      this.finishAttempt(false, title, lineDistance(call) + '. Aim farther inside on the next ball.')
    } else if (serve && this.touchedTape) {
      this.serviceLet()
    } else if (this.match) {
      if (serve) {
        this.match.serveIn()
        this.aim = { x: this.adSide ? -2.35 : 2.35, z: -9.1 }
      }
      this.enter('opponent')
    } else if (this.drill === 'contact') {
      this.enter('recover')
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
    if (this.match) {
      if (this.serving) this.serviceFault(title === 'Service fault' ? detail : title)
      else {
        const reason = this.match.strikes === 1 && !this.match.serviceBall && title === 'Missed contact' ? 'Ace' : title
        this.pointTo('rival', reason, detail)
      }
      return
    }
    this.attempts += 1
    if (success) this.hits += 1
    else this.streak = 0
    this.result = { title, detail, tone: success ? 'good' : 'warn' }
    this.sound(success ? 'good' : 'miss')
    this.enter('between')
  }

  private pointTo(winner: Side, reason: string, detail: string) {
    this.match!.award(winner, reason)
    this.attempts = this.match!.played
    this.result = { title: (winner === 'you' ? 'Your point' : 'Opponent’s point') + ' · ' + reason,
      detail, tone: winner === 'you' ? 'good' : 'warn' }
    this.sound(winner === 'you' ? 'good' : 'miss')
    this.enter('between')
  }

  private serviceFault(detail: string) {
    const match = this.match!
    const lost = match.fault()
    this.attempts = match.played
    this.result = { title: lost ? 'Double fault · ' + (match.servingPoint === 'you' ? 'Opponent’s point' : 'Your point')
      : 'First fault · Second serve', detail, tone: match.servingPoint === 'you' ? 'warn' : 'neutral' }
    this.sound(lost && match.servingPoint === 'rival' ? 'good' : 'miss')
    this.enter('between')
  }

  private serviceLet() {
    this.result = { title: 'Let · Replay the serve', detail: 'The serve clipped the tape and landed in the correct box.', tone: 'neutral' }
    this.enter('between')
  }
}

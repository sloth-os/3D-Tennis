import './styles.css'
import { appMarkup } from './ui.ts'
import { icon } from './icons.ts'
import { DRILLS, SHOTS, SURFACES, WINDS, clamp, zoneCenter, type DrillId, type Shot, type Surface, type Technique, type Wind } from './config.ts'
import { TECHNIQUES } from './coaching.ts'
import type { CourtView, GameView } from './court-view.ts'
import { COURT_CAMERAS, LAB_CAMERAS, courtOrbit, athleteOrbit, type CameraMode, type LabAngle } from './cameras.ts'
import { analyzeMotion, activeMuscle, BODY_MASS, magnitude, MUSCLES, type MuscleGroup } from './motion.ts'
import { FORCE_COLORS, type ForceMode } from './analysis-colors.ts'
import type { BodyState } from './world-analysis.ts'
import { replayBounds, sampleReplay, type ShotReplay } from './replay.ts'
import { Game, type Sound, type SoundSpot } from './game.ts'
import { FlightChart } from './chart.ts'
import { analyzeContact, flightForces, STEP, type Ball, type Contact } from './physics.ts'
import { SkillPath, planMotion } from './skill-path.ts'
import { OPPONENTS, type Pace, type Tiebreak } from './point-play.ts'
import { SessionReview } from './session-review.ts'

type Page = 'training' | 'ntrp' | 'technique' | 'guide'
type Direction = 'left' | 'right' | 'up' | 'down'
type Bests = Partial<Record<DrillId, number>>
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const all = <T extends HTMLElement = HTMLElement>(query: string) => Array.from(document.querySelectorAll<T>(query))
const storageKey = 'baseline-lab-v1'
const saved = readPreferences()
byId('app').innerHTML = appMarkup()

function readPreferences(): {
  surface?: Surface; wind?: Wind; trail?: boolean; guides?: boolean; audio?: boolean; best?: Bests;
  ntrpLevel?: unknown; ntrpRecords?: unknown;
  pace?: Pace; matchesWon?: number; matchesPlayed?: number
} {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

let audioEnabled = saved.audio === true
let audioContext: AudioContext | undefined
let impactNoise: AudioBuffer | undefined
function playSound(type: Sound, spot?: SoundSpot) {
  if (!audioEnabled || !audioContext || audioContext.state !== 'running') return
  const now = audioContext.currentTime
  if (spot && (type === 'bounce' || type === 'hit')) {
    impactNoise ??= audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * .16), audioContext.sampleRate)
    const samples = impactNoise.getChannelData(0)
    if (samples[0] === 0) {
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    }
    const racket = type === 'hit'
    const bright = { hard: 1, clay: .73, grass: .49 }[spot.surface]
    const pan = audioContext.createStereoPanner()
    pan.pan.value = clamp(spot.x / 7, -.85, .85)
    pan.connect(audioContext.destination)
    const body = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const frequency = racket ? 265 + spot.speed * 1.4 : 96 + bright * 65
    body.frequency.setValueAtTime(frequency, now)
    body.frequency.exponentialRampToValueAtTime(racket ? 104 : 60, now + .078)
    gain.gain.setValueAtTime(clamp(spot.speed / (racket ? 90 : 41), .06, .24), now)
    gain.gain.exponentialRampToValueAtTime(.001, now + .105)
    body.connect(gain).connect(pan)
    const noise = audioContext.createBufferSource()
    noise.buffer = impactNoise
    const filter = audioContext.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = racket ? 1700 + spot.speed * 24 : 1550 * bright
    filter.Q.value = racket ? .88 : .56
    const snap = audioContext.createGain()
    snap.gain.setValueAtTime(racket ? .31 : .13 * bright, now)
    snap.gain.exponentialRampToValueAtTime(.001, now + (racket ? .054 : .042))
    noise.connect(filter).connect(snap).connect(pan)
    body.start(now); noise.start(now)
    body.stop(now + .118); noise.stop(now + .072)
    body.onended = () => pan.disconnect()
    return
  }
  const pitches: Record<Sound, [number, number, number]> = {
    bounce: [128, 66, .078], hit: [222, 99, .093], good: [470, 680, .17], miss: [200, 128, .124], ready: [385, 425, .064],
  }
  const [frequency, end, length] = pitches[type]
  const oscillator = audioContext.createOscillator()
  const volume = audioContext.createGain()
  oscillator.type = type === 'hit' || type === 'bounce' ? 'triangle' : 'sine'
  oscillator.frequency.setValueAtTime(frequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(end, now + length)
  volume.gain.setValueAtTime(type === 'ready' ? .035 : type === 'bounce' ? .075 : .10, now)
  volume.gain.exponentialRampToValueAtTime(.001, now + length)
  oscillator.connect(volume)
  volume.connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + length)
}

function wakeAudio() {
  if (!audioEnabled || !('AudioContext' in window)) return
  audioContext ??= new AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {})
}

const game = new Game(playSound)
game.pace = saved.pace && Object.hasOwn(OPPONENTS, saved.pace) ? saved.pace : 'club'
let matchesPlayed = Math.max(0, Math.floor(Number(saved.matchesPlayed) || 0))
let matchesWon = Math.min(matchesPlayed, Math.max(0, Math.floor(Number(saved.matchesWon) || 0)))
let countedMatch: Tiebreak | null = null
let surface: Surface = saved.surface && Object.hasOwn(SURFACES, saved.surface) ? saved.surface : 'hard'
let wind: Wind = saved.wind && Object.hasOwn(WINDS, saved.wind) ? saved.wind : 'calm'
const display = {
  camera: 'baseline' as CameraMode, orbit: courtOrbit(), trail: saved.trail !== false,
  guides: saved.guides !== false, vectors: true, mode: 'flight' as ForceMode,
}
const best: Bests = saved.best && typeof saved.best === 'object' ? saved.best : {}
game.conditions = { surface, wind: WINDS[wind].speed }

const lab = {
  technique: 'forehand' as Technique, time: .02, joints: false, anatomy: true, vectors: true, angle: 'quarter' as LabAngle,
  orbit: athleteOrbit(), focus: 'legs' as MuscleGroup, follow: true, playing: false, speed: .5,
}
let replay: { clip: ShotReplay; time: number; playing: boolean } | null = null
let preview: Ball | undefined
let previewKey = ''
let chartSurface: Surface = surface
let chartWind: Wind = wind
let chartCustomized = false
const chart = new FlightChart(byId<HTMLCanvasElement>('flight-chart'), byId('flight-values'))
const help = byId<HTMLDialogElement>('controls-dialog')
const report = new SessionReview(clip => openReplay(clip))
const keys = new Set<string>()
const touches = new Map<number, Direction>()
let page: Page = 'training'
let dirty = true
let drillKey = ''
let settingsKey = ''
let scoreKey = ''
let actionKey = ''
let cueKey = ''
let lessonKey = ''
let currentLabPhase = -1
let boardKey = ''
let court: CourtView | undefined
let loadingCourt = false
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const skillPath = new SkillPath(saved.ntrpLevel, saved.ntrpRecords, {
  dirty: () => { dirty = true },
  save: savePreferences,
  practice: plan => {
    closeReplay()
    game.selectPlan(plan)
    closeDrawers()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    location.hash = 'training'
  },
  study: technique => {
    lab.technique = technique
    setLabPhase(0)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    location.hash = 'technique'
  },
})

const courtHost = (page: Exclude<Page, 'guide'>) =>
  byId(page === 'training' ? 'training-canvas' : page === 'ntrp' ? 'ntrp-canvas' : 'lab-canvas')

function attachCourt() {
  if (page === 'guide') return
  if (court) {
    court.attach(courtHost(page))
    return
  }
  if (loadingCourt) return
  loadingCourt = true
  void import('./court-view.ts').then(({ CourtView }) => {
    if (page === 'guide') return
    court = new CourtView(courtHost(page), () => { dirty = true })
    if (court.fallback) {
      byId('court-badge').querySelector('span')!.textContent = 'Tactical court'
      byId('ntrp-court-badge').querySelector('span')!.textContent = 'Tactical court'
      byId<HTMLSelectElement>('camera').disabled = true
      byId<HTMLSelectElement>('lab-angle').disabled = true
      byId<HTMLSelectElement>('ntrp-camera').disabled = true
    }
    wireCourtInput(court.canvas)
    dirty = true
  }).catch(error => {
    console.error('Court failed to load.', error)
    byId('court-badge').querySelector('span')!.textContent = 'Court unavailable'
    byId('feedback').textContent = 'The court failed to load. Reload the app to retry.'
  }).finally(() => { loadingCourt = false })
}

function savePreferences() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ surface, wind, trail: display.trail, guides: display.guides,
      audio: audioEnabled, best, ntrpLevel: skillPath.level, ntrpRecords: skillPath.records, pace: game.pace, matchesWon, matchesPlayed }))
  } catch {
    // Preferences are optional when storage is unavailable.
  }
}

function updateAudio() {
  const button = byId<HTMLButtonElement>('audio-toggle')
  button.innerHTML = icon(audioEnabled ? 'sound' : 'mute', 18)
  button.setAttribute('aria-pressed', String(audioEnabled))
  button.setAttribute('aria-label', audioEnabled ? 'Sound on' : 'Sound off')
}

type Readout = { name: string; value: string; color?: string; scale?: number }

function writeReadout(id: string, rows: Readout[]) {
  const container = byId(id)
  const key = JSON.stringify(rows)
  if (container.dataset.readout === key) return
  container.dataset.readout = key
  container.innerHTML = rows.map(({ name, value, color = '#8bdcf4', scale }) =>
    `<div class="readout-stat" style="--metric:${color}"><span class="stat-name"><i></i>${name}</span><strong>${value}</strong>${scale === undefined
      ? '' : `<span class="stat-gauge" aria-hidden="true"><i style="--value:${Math.round(clamp(scale, 0, 1) * 100)}%"></i></span>`}</div>`).join('')
}

function setText(id: string, value: string) {
  const element = byId(id)
  if (element.textContent !== value) element.textContent = value
}

function readTrainingView(playing: boolean): GameView {
  const key = [game.plan?.id, game.drill, game.shot, game.aim.x, game.aim.z, game.adSide].join()
  if (game.phase === 'idle' && (key !== previewKey || !preview)) {
    previewKey = key
    preview = game.previewBall
  }
  const frame = replay ? sampleReplay(replay.clip, replay.time) : undefined
  const event = replay?.clip.events.findLast(candidate => candidate.time <= replay!.time)
  const net = replay?.clip.events.findLast(e => e.time <= replay!.time && (e.contact.kind === 'net' || e.contact.kind === 'tape'))
  return {
    ...display, preview: game.phase === 'idle' ? preview : undefined, replay: frame,
    reviewTrail: replay ? replay.clip.frames.filter(record => record.time <= replay!.time).map(record => record.ball.position).slice(-140) : undefined,
    contact: replay ? event?.contact ?? null : game.lastContact,
    playing: playing || !!replay?.playing, leanMotion: reducedMotion.matches, replayScore: replay?.clip.score,
    netMotion: replay && net ? { contact: net.contact, age: replay.time - net.time } : null,
  }
}

const contactName = (kind: Contact['kind']) => ({ racket: 'Racket contact', court: 'Court bounce', net: 'Net impact', tape: 'Net cord' })[kind]
const newtons = (value: number) => `${Math.round(value)} N`

function updateForceReadout(view: GameView, renderedBody?: BodyState) {
  byId<HTMLButtonElement>('review-open').disabled = !game.replay || !!replay
  if (view.mode === 'flight') {
    const toss = game.opponentToss
    const ball = view.replay?.ball ?? game.ball ?? toss ?? view.preview
    const wind = view.replay?.conditions.wind ?? game.courtConditions.wind
    const forces = ball ? flightForces(ball, wind) : null
    const rows = (['gravity', 'drag', 'magnus'] as const).map(key => {
      const amount = forces ? magnitude(forces[key]) : 0
      return { name: { gravity: 'Weight', drag: 'Air drag', magnus: 'Magnus force' }[key], color: FORCE_COLORS[key],
        value: forces ? `${amount.toFixed(2)} N` : '—', scale: amount / 1.15 }
    })
    setText('force-source', view.replay ? 'Recorded flight' : game.ball ? 'Live flight' : toss ? 'Opponent toss' : view.preview ? 'Shot preview' : 'Awaiting feed')
    writeReadout('force-values', rows)
    setText('force-note', 'Weight, air resistance, and the force from spin act throughout the flight.')
  } else if (view.mode === 'contact') {
    const contact = view.contact
    setText('force-source', contact ? contactName(contact.kind) : 'Awaiting contact')
    if (contact) {
      const data = analyzeContact(contact)
      const transfer = data.afterEnergy - data.beforeEnergy
      writeReadout('force-values', [
        { name: 'Average force', value: newtons(magnitude(data.force)), color: FORCE_COLORS.impact },
        { name: 'Impulse', value: `${magnitude(data.impulse).toFixed(2)} N·s`, color: FORCE_COLORS.outgoing },
        { name: 'Ball energy change', value: `${transfer >= 0 ? '+' : '−'}${Math.abs(transfer).toFixed(1)} J`, color: FORCE_COLORS.incoming },
        { name: 'Contact duration', value: `${(contact.duration * 1000).toFixed(1)} ms` },
      ])
    } else writeReadout('force-values', [{ name: 'Average force', value: '—', color: FORCE_COLORS.impact },
      { name: 'Impulse', value: '—', color: FORCE_COLORS.outgoing }, { name: 'Ball energy change', value: '—', color: FORCE_COLORS.incoming }])
    setText('force-note', 'Cyan shows incoming velocity, lime shows outgoing velocity, and orange shows average force. Contact duration is assumed.')
  } else {
    const motion = view.replay?.pose ?? game.posture
    const body = renderedBody ?? analyzeMotion(motion.technique, motion.progress)
    setText('force-source', `${BODY_MASS} kg reference athlete`)
    writeReadout('force-values', [
      { name: 'Ground reaction', value: newtons(magnitude(body.ground)), color: MUSCLES.legs.color },
      { name: 'Right knee flexion', value: `${Math.round(body.knee)}°`, color: MUSCLES.legs.color },
      { name: 'Hip–shoulder separation', value: `${Math.round(body.separation)}°`, color: MUSCLES.core.color },
    ])
    setText('force-note', 'Body loads are estimates from the reference pose sequence. Study individual muscles in Technique Lab.')
  }
}

function updateBodyReadout() {
  const analysis = analyzeMotion(lab.technique, lab.time)
  const active = activeMuscle(lab.technique, lab.time)
  if (lab.follow) lab.focus = active
  const support = magnitude(analysis.ground)
  setText('body-source', support > 0 ? `${BODY_MASS} kg model · ground support` : `${BODY_MASS} kg model · airborne`)
  writeReadout('body-values', [
    { name: 'Right / left foot load', value: `${Math.round(analysis.right.y)} / ${Math.round(analysis.left.y)} N`, color: MUSCLES.legs.color },
    { name: 'Hip–shoulder separation', value: `${Math.round(analysis.separation)}°`, color: MUSCLES.core.color },
    { name: lab.technique === 'footwork' ? 'Right knee flexion' : 'Racket head speed',
      value: lab.technique === 'footwork' ? `${Math.round(analysis.knee)}°` : `${analysis.racketSpeed.toFixed(1)} m/s`,
      color: lab.technique === 'footwork' ? MUSCLES.legs.color : MUSCLES.arm.color },
  ])
  const notes = {
    legs: 'The hips and knees load, then extend. The arrows show estimated ground reaction at each planted foot.',
    core: 'The obliques turn and stabilize the trunk as the hips lead the shoulders through the stroke.',
    arm: 'The deltoid positions the arm. The triceps and forearm help extend and guide the racket into contact.',
  }
  setText('muscle-note', notes[lab.focus])
  all('[data-muscle]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.muscle === lab.focus)))
}

function updateCameraControls() {
  byId<HTMLSelectElement>('camera').value = display.camera
  byId<HTMLSelectElement>('lab-angle').value = lab.angle
  byId<HTMLSelectElement>('ntrp-camera').value = skillPath.camera
  for (const [panel, id, active, orbit] of [
    ['training-panel', 'court-orbit', display.camera === 'orbit', display.orbit],
    ['lab-panel', 'lab-orbit', lab.angle === 'orbit', lab.orbit],
    ['ntrp-panel', 'ntrp-orbit', skillPath.camera === 'orbit', skillPath.orbit],
  ] as const) {
    byId(panel).dataset.orbit = String(active)
    byId(`${id}-controls`).hidden = !active
    byId<HTMLInputElement>(`${id}-zoom`).value = String(Math.round(orbit.zoom * 100))
  }
  dirty = true
}

function closeDrawers() {
  for (const id of ['training-panel', 'lab-panel', 'ntrp-panel']) delete byId(id).dataset.drawer
  all('[data-drawer]').filter(element => element.tagName === 'BUTTON').forEach(button => button.setAttribute('aria-expanded', 'false'))
}

function openDrawer(drawer: string, panel: HTMLElement) {
  closeDrawers()
  panel.dataset.drawer = drawer
  panel.querySelector(`button[data-drawer="${drawer}"]`)?.setAttribute('aria-expanded', 'true')
}

function setForceMode(mode: ForceMode) {
  display.mode = mode
  all('[data-force]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.force === mode)))
  dirty = true
}

function openReplay(clip: ShotReplay | null = game.replay) {
  if (!clip) return
  game.paused = game.active
  replay = { clip, time: clip.events.at(-1)!.time, playing: false }
  closeDrawers()
  setForceMode('contact')
  byId('court-readout').hidden = true
  byId('review-console').hidden = false
  byId('review-events').innerHTML = clip.events.map((event, index) =>
    `<button type="button" data-event="${index}" aria-pressed="false">${contactName(event.contact.kind)}</button>`).join('')
  byId('review-play').focus({ preventScroll: true })
  updateReplay()
  dirty = true
}

function closeReplay() {
  if (!replay) return
  replay = null
  byId('court-readout').hidden = false
  byId('review-console').hidden = true
  dirty = true
}

function toggleReplay() {
  if (!replay) return
  const [start, end] = replayBounds(replay.clip)
  if (replay.time >= end - .015) replay.time = start
  replay.playing = !replay.playing
  updateReplay()
  dirty = true
}

function updateReplay() {
  if (!replay) return
  const [start, end] = replayBounds(replay.clip)
  const elapsed = replay.time - start
  const slider = byId<HTMLInputElement>('review-scrub')
  slider.value = String(Math.round(1000 * elapsed / Math.max(.001, end - start)))
  slider.setAttribute('aria-valuetext', `${elapsed.toFixed(2)} seconds`)
  setText('review-time', `${elapsed.toFixed(2)} s`)
  const action = replay.playing ? 'Pause replay' : 'Play replay'
  const play = byId('review-play')
  if (play.getAttribute('aria-label') !== action) {
    play.setAttribute('aria-label', action)
    play.innerHTML = icon(replay.playing ? 'pause' : 'play', 17)
  }
  all('[data-event]').forEach(button => {
    const event = replay?.clip.events[Number(button.dataset.event)]
    button.setAttribute('aria-pressed', String(!!event && Math.abs(replay!.time - event.time) <= .034))
  })
}

function openReport() {
  if (game.active) game.paused = true
  closeReplay()
  closeDrawers()
  keys.clear()
  touches.clear()
  report.open(game)
  dirty = true
}

function updateBoard() {
  const match = game.match
  const board = byId('match-board')
  board.hidden = !match || !!replay
  byId<HTMLButtonElement>('open-report').disabled = !game.shots.length && !match && game.phase !== 'finished'
  byId('finish-review').hidden = game.phase !== 'finished'
  if (!match) { boardKey = ''; return }
  if (match.finished && countedMatch !== match) {
    countedMatch = match
    matchesPlayed++
    if (match.you > match.rival) matchesWon++
    savePreferences()
  }
  const key = [match.you, match.rival, match.servingPoint, match.serve, match.ad, match.end, match.serviceBall,
    game.phase, game.paused, game.pace, matchesWon, matchesPlayed].join()
  if (key === boardKey) return
  boardKey = key
  setText('board-your-score', String(match.you))
  setText('board-rival-score', String(match.rival))
  setText('board-end', match.end ? 'South end' : 'North end')
  for (const [id, side] of [['board-you', 'you'], ['board-rival', 'rival']]) {
    byId(id).dataset.server = String(match.servingPoint === side && !match.finished)
    byId(id).title = match.servingPoint === side ? 'Serving this point' : 'Receiving this point'
  }
  const service = (match.servingPoint === 'you' ? 'You serve' : 'You receive') + ' · ' + (match.ad ? 'Ad' : 'Deuce')
  setText('board-state', match.finished ? 'Final · Match review' : game.phase === 'between' && game.result.title.includes('point') ? 'Point log · ' + match.you + ' – ' + match.rival
    : match.pointBall && game.phase !== 'between' ? match.pointBall
    : match.serve === 2 && match.serviceBall ? 'Second serve · ' + (match.ad ? 'Ad' : 'Deuce') : service)
  setText('compact-score', match.you + ' – ' + match.rival)
  setText('compact-score-label', 'Tiebreak')
  setText('open-report', 'Scorecard & shot chart')
  byId<HTMLSelectElement>('match-pace').disabled = game.active
  byId<HTMLSelectElement>('match-pace').value = game.pace
}

function updateTraining() {
  const drill = DRILLS[game.drill]
  const serve = game.serving
  const plan = game.plan
  const id = plan?.id ?? game.drill
  if (id !== drillKey) {
    drillKey = id
    all<HTMLButtonElement>('[data-drill]').forEach(button =>
      button.setAttribute('aria-pressed', String(!plan && button.dataset.drill === game.drill)))
    const goalLabel = plan ? { placement: 'Target hits', recovery: 'Recoveries', rally: 'Best rally streak', pattern: 'Patterns' }[plan.score] : drill.goalLabel
    byId('practice-heading').textContent = game.match ? 'Match court' : plan ? `NTRP ${plan.level} · ${plan.paceLabel}` : 'Practice session'
    byId('drill-title').textContent = plan?.title ?? drill.title
    byId('drill-description').textContent = plan?.objective ?? drill.description
    byId('score-label').textContent = goalLabel
    byId('compact-score-label').textContent = goalLabel
    byId('study-drill').title = plan?.cue ?? drill.coach
    byId('return-ntrp').querySelector('span')!.textContent = plan ? 'Back to Skill Path' : 'NTRP Skill Path'
    byId('score-goal').textContent = `/ ${game.goal}`
    byId('score-segments').innerHTML = '<i aria-hidden="true"></i>'.repeat(game.goal)
    byId('serve-settings').hidden = !serve || !!game.match
    byId('opponent-settings').hidden = !game.match
    byId('drill-score').hidden = !!game.match
    byId('training-panel').classList.toggle('match-court', !!game.match)
    document.querySelector<HTMLAnchorElement>('[data-nav="training"]')!.href = game.match ? '#match' : '#training'
    setText('open-report', game.match ? 'Scorecard & shot chart' : 'Session review')
    byId('reset-drill').setAttribute('aria-label', game.match ? 'Reset match' : 'Reset drill')
    byId('reset-drill').title = game.match ? 'Reset match' : 'Reset drill'
  }

  const configuration = [id, game.shot, game.adSide, display.guides].join()
  if (configuration !== settingsKey) {
    settingsKey = configuration
    all<HTMLButtonElement>('[data-shot]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.shot === game.shot)))
    all<HTMLButtonElement>('[data-serve]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.serve === 'ad') === game.adSide)))
    byId('aim-hint').querySelector('span')!.textContent = display.guides && game.showTarget
      ? 'Aim at the highlighted zone' : game.drill === 'footwork' ? 'Use the recovery ring' : 'Choose an aim point across the net'
  }

  if (!game.match && !plan && game.progress > Math.max(0, Number(best[game.drill]) || 0)) {
    best[game.drill] = game.progress
    savePreferences()
  }
  const currentBest = plan ? skillPath.record(plan, game.progress) : best[game.drill] ?? 0
  const score = [id, game.progress, game.attempts, game.streak, currentBest].join()
  if (score !== scoreKey) {
    scoreKey = score
    byId('score-current').textContent = String(game.progress)
    byId('compact-score').textContent = `${game.progress} / ${game.goal}`
    const segments = byId('score-segments')
    segments.setAttribute('aria-valuemax', String(game.goal))
    segments.setAttribute('aria-valuenow', String(game.progress))
    Array.from(segments.children).forEach((child, index) => (child as HTMLElement).dataset.hit = String(index < game.progress))
    byId('attempts').textContent = (plan?.score === 'rally' || !plan && game.drill === 'rally') && game.active
      ? `${game.streak} in a row` : `${game.attempts} attempt${game.attempts === 1 ? '' : 's'}`
    byId('best').textContent = `Best ${currentBest} / ${game.goal}`
  }

  updateBoard()
  const courtWind = replay ? sampleReplay(replay.clip, replay.time).conditions.wind : game.courtConditions.wind
  byId('court-wind').hidden = !courtWind
  if (courtWind) setText('court-wind', (courtWind > 0 ? 'Wind → ' : 'Wind ← ') + Math.abs(courtWind).toFixed(1) + ' m/s')
  const action = game.match ? !game.active ? game.phase === 'finished' ? 'Rematch' : 'Start Match' : game.paused ? 'Resume Match' : 'Pause Match' : !game.active
    ? game.phase === 'finished' ? 'Restart Drill' : 'Start Drill'
    : game.paused ? 'Resume Drill' : 'Pause Drill'
  if (actionKey !== action) {
    actionKey = action
    const content = `${icon(game.active && !game.paused ? 'pause' : 'play', 19)} <span>${action}</span>`
    byId('start-drill').innerHTML = content
    byId('quiet-play').innerHTML = icon(game.active && !game.paused ? 'pause' : 'play', 15)
    byId('quiet-play').setAttribute('aria-label', action.replace(/Drill|Match/g, 'practice'))
  }
  const finished = game.phase === 'finished'
  const success = finished && game.progress >= game.goal
  const cue = finished && game.match ? {
    title: game.match.you > game.match.rival ? 'Tiebreak won' : 'Tiebreak lost',
    detail: game.match.you + ' – ' + game.match.rival + ' · Match record ' + matchesWon + ' W / ' + (matchesPlayed - matchesWon) + ' L',
    tone: game.match.you > game.match.rival ? 'good' : 'neutral',
  } : finished ? {
    title: success ? 'Drill complete' : 'Session complete',
    detail: success ? `${game.goal} / ${game.goal} · Goal reached` : `${game.progress} / ${game.goal} · Restart for another set`,
    tone: success ? 'good' : 'neutral',
  } : game.cue()
  const signature = [game.phase, game.paused, cue.title, cue.detail, game.lastShot?.speed, game.lastShot?.clearance, game.lastShot?.timing].join()
  if (signature !== cueKey) {
    cueKey = signature
    const idle = game.phase === 'idle'
    byId('aim-hint').hidden = !idle
    const cueBox = byId('court-cue')
    cueBox.hidden = idle
    cueBox.dataset.tone = cue.tone
    byId('cue-title').textContent = cue.title
    byId('cue-detail').textContent = cue.detail
    byId('touch-swing').dataset.ready = String(cue.title === 'Swing now')
    if (!idle && (cue.tone !== 'good' || cue.title !== 'Swing now')) {
      byId('feedback').textContent = `${cue.title}. ${cue.detail}`
    }
    byId('timing-track').hidden = game.phase !== 'incoming' || game.paused
    const telemetry = game.lastShot
    byId('telemetry').hidden = !telemetry
    if (telemetry) {
      byId('telemetry-speed').textContent = `${Math.round(telemetry.speed * 3.6)} km/h`
      const clearance = telemetry.clearance === null ? '' : telemetry.clearance < 0 ? ' · net' : ` · ${telemetry.clearance.toFixed(2)} m net`
      const spin = telemetry.sideSpin ? `${telemetry.sideSpin} rpm side` : `${telemetry.spin} rpm`
      byId('telemetry-extra').textContent = spin + clearance
      byId('telemetry-timing').textContent = Math.abs(telemetry.timing) <= .025 ? 'Centered timing'
        : `${Math.round(Math.abs(telemetry.timing) * 1000)} ms ${telemetry.timing < 0 ? 'early' : 'late'}`
    }
  }
  if (game.phase === 'incoming' && !game.paused) {
    const track = byId('timing-track')
    track.style.setProperty('--timing', `${clamp((game.contactError + .52) / 1.04, 0, 1) * 100}%`)
    track.style.setProperty('--window-edge', `${50 - (game.plan ? game.plan.contactWindow - .035 : .125) / 1.04 * 100}%`)
  }
}

function labPhase() {
  const phases = TECHNIQUES[lab.technique].phases
  const next = phases.findIndex((phase, index) => index > 0 && lab.time < (phases[index - 1].time + phase.time) / 2)
  return next < 0 ? phases.length - 1 : next - 1
}

function updateLab() {
  const lesson = TECHNIQUES[lab.technique]
  if (lessonKey !== lab.technique) {
    lessonKey = lab.technique
    currentLabPhase = -1
    byId('lesson-title').textContent = lesson.label
    byId('lesson-summary').textContent = lesson.summary
    all('[data-technique]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.technique === lab.technique)))
    byId('timeline').innerHTML = lesson.phases.map((phase, index) =>
      `<button type="button" data-phase="${index}"><span>${String(index + 1).padStart(2, '0')}</span>${phase.label}</button>`).join('')
  }
  const index = labPhase()
  if (currentLabPhase !== index) {
    currentLabPhase = index
    const phase = lesson.phases[index]
    byId('phase-number').textContent = `Phase ${index + 1} of ${lesson.phases.length}`
    byId('phase-title').textContent = phase.title
    byId('phase-text').textContent = phase.text
    byId('phase-watch').textContent = phase.watch
    all('[data-phase]').forEach(button => {
      if (Number(button.dataset.phase) === index) button.setAttribute('aria-current', 'step')
      else button.removeAttribute('aria-current')
    })
    const nextLabel = index === lesson.phases.length - 1 ? 'Back to ready' : 'Next phase'
    byId('next-phase').setAttribute('aria-label', nextLabel)
    byId('next-phase').title = nextLabel
  }
  const scrub = byId<HTMLInputElement>('lab-scrub')
  scrub.value = String(Math.round(lab.time * 1000))
  scrub.setAttribute('aria-valuetext', `${(lab.time * lesson.duration).toFixed(1)} seconds, ${lesson.phases[index].label}`)
  byId('lab-time').textContent = `${(lab.time * lesson.duration).toFixed(1)} s`
  const play = byId('lab-play')
  const label = lab.playing ? 'Pause motion' : 'Play motion'
  if (play.getAttribute('aria-label') !== label) {
    play.setAttribute('aria-label', label)
    play.title = label
    play.innerHTML = `${icon(lab.playing ? 'pause' : 'play', 17)}<span>${lab.playing ? 'Pause' : 'Play'}</span>`
  }
}

function chartConditions() {
  if (!chartCustomized) {
    chartSurface = surface
    chartWind = wind
  }
  byId<HTMLSelectElement>('guide-surface').value = chartSurface
  byId<HTMLSelectElement>('guide-wind').value = chartWind
  chart.setConditions({ surface: chartSurface, wind: WINDS[chartWind].speed })
}

function route() {
  const hash = location.hash.slice(1)
  if (hash !== '' && hash !== 'match' && hash !== 'training' && hash !== 'ntrp' && hash !== 'technique' && hash !== 'guide') return
  if (hash === 'match' && !game.match) { closeReplay(); game.select('match') }
  if (hash !== 'match' && (hash === '' || hash === 'training') && game.match) { closeReplay(); game.select('forehand') }
  const next: Page = hash === 'match' ? 'training' : hash || 'training'
  if (next !== page) {
    if (replay) closeReplay()
    closeDrawers()
    if (page === 'training' && game.active) game.paused = true
    if (page === 'technique') lab.playing = false
    if (page === 'ntrp') skillPath.stopPreview()
    keys.clear()
    touches.clear()
    all('.court-panel.immersive').forEach(panel => panel.classList.remove('immersive'))
    page = next
    window.scrollTo(0, 0)
  }
  for (const id of ['training', 'ntrp', 'technique', 'guide'] as const) byId(`${id}-view`).hidden = id !== page
  all('[data-nav]').forEach(link => {
    if (link.dataset.nav === page) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  if (page === 'technique') {
    updateLab()
  } else if (page === 'training') {
    updateTraining()
  } else if (page === 'ntrp') {
    skillPath.show()
  } else chartConditions()
  attachCourt()
  dirty = true
}

function focusCourt() {
  if (!matchMedia('(pointer: coarse)').matches) byId('training-stage').focus({ preventScroll: true })
}

function toggleDrill() {
  wakeAudio()
  if (replay) closeReplay()
  if (game.active) game.paused = !game.paused
  else game.begin()
  if (!game.paused) closeDrawers()
  if (!game.paused) focusCourt()
  updateTraining()
  dirty = true
}

function selectDrill(drill: DrillId) {
  if (!game.plan && game.drill === drill) return
  if (replay) closeReplay()
  game.select(drill)
  if (page === 'training' && (drill === 'match' || location.hash === '#match')) location.hash = drill === 'match' ? 'match' : 'training'
  closeDrawers()
  updateTraining()
  dirty = true
}

function setLabPhase(index: number) {
  lab.time = TECHNIQUES[lab.technique].phases[index].time
  lab.playing = false
  lab.follow = true
  updateLab()
  dirty = true
}

function toggleLab() {
  lab.playing = !lab.playing
  if (lab.playing && lab.time >= 1) lab.time = 0
  updateLab()
  dirty = true
}

async function toggleFullscreen(id: string) {
  const panel = byId(id)
  const button = panel.querySelector('[data-fullscreen]')
  if (document.fullscreenElement === panel) {
    await document.exitFullscreen().catch(() => {})
  } else if (panel.classList.contains('immersive')) {
    panel.classList.remove('immersive')
  } else {
    try {
      if (!panel.requestFullscreen) throw new Error('Fullscreen unavailable')
      await panel.requestFullscreen()
    } catch {
      panel.classList.add('immersive')
    }
  }
  button?.setAttribute('aria-pressed', String(document.fullscreenElement === panel || panel.classList.contains('immersive')))
  dirty = true
}

function openHelp() {
  if (game.active && page === 'training') game.paused = true
  if (page === 'ntrp') skillPath.stopPreview()
  keys.clear()
  touches.clear()
  dirty = true
  help.showModal()
}

byId('show-help').onclick = openHelp
byId('start-drill').onclick = toggleDrill
byId('quiet-play').onclick = toggleDrill
byId('study-drill').onclick = () => {
  lab.technique = game.plan ? planMotion(game.plan) : game.match ? game.serving ? 'serve' : 'forehand' : game.drill === 'rally' || game.drill === 'match' ? 'backhand' : game.drill
  setLabPhase(0)
}
function resetDrill() { closeReplay(); game.reset(); updateTraining(); dirty = true }
byId('reset-drill').onclick = resetDrill
for (const id of ['open-report', 'board-details', 'finish-review']) byId(id).onclick = openReport
byId<HTMLSelectElement>('match-pace').onchange = event => {
  const pace = (event.currentTarget as HTMLSelectElement).value as Pace
  if (game.active || !Object.hasOwn(OPPONENTS, pace)) return
  game.pace = pace
  if (game.match && game.phase === 'idle') game.match.pace = pace
  savePreferences()
  dirty = true
}
all<HTMLButtonElement>('[data-drill]').forEach(button => button.onclick = () => {
  selectDrill(button.dataset.drill as DrillId)
})
all<HTMLAnchorElement>('[data-open-drill]').forEach(link => link.onclick = () => selectDrill(link.dataset.openDrill as DrillId))
all<HTMLButtonElement>('[data-shot]').forEach(button => button.onclick = () => {
  const shot = button.dataset.shot as Shot
  if (Object.hasOwn(SHOTS, shot)) game.shot = shot
  updateTraining()
  dirty = true
})
all<HTMLButtonElement>('[data-serve]').forEach(button => button.onclick = () => {
  const adSide = button.dataset.serve === 'ad'
  if (game.adSide !== adSide) { closeReplay(); game.setServeSide(adSide) }
  updateTraining()
  dirty = true
})
const surfaceInput = byId<HTMLSelectElement>('surface')
surfaceInput.value = surface
surfaceInput.onchange = () => {
  surface = surfaceInput.value as Surface
  game.setConditions({ surface, wind: WINDS[wind].speed })
  savePreferences()
  dirty = true
}
const windInput = byId<HTMLSelectElement>('wind')
windInput.value = wind
windInput.onchange = () => {
  wind = windInput.value as Wind
  game.setConditions({ surface, wind: WINDS[wind].speed })
  savePreferences()
  dirty = true
}
byId<HTMLSelectElement>('camera').onchange = event => {
  display.camera = (event.currentTarget as HTMLSelectElement).value as CameraMode
  updateCameraControls()
}
byId<HTMLSelectElement>('ntrp-camera').onchange = event => {
  skillPath.camera = (event.currentTarget as HTMLSelectElement).value as CameraMode
  updateCameraControls()
}
for (const key of ['trail', 'guides'] as const) {
  const input = byId<HTMLInputElement>(`${key}-toggle`)
  input.checked = display[key]
  input.onchange = () => {
    display[key] = input.checked
    savePreferences()
    dirty = true
  }
}
byId('audio-toggle').onclick = () => {
  audioEnabled = !audioEnabled
  wakeAudio()
  updateAudio()
  savePreferences()
}
function bindTouchAction(id: string, action: () => void) {
  const button = byId<HTMLButtonElement>(id)
  button.onpointerdown = event => { if (event.button === 0) action() }
  button.onclick = event => { if (event.detail === 0) action() }
}
bindTouchAction('touch-swing', () => { game.swing(); updateTraining(); dirty = true })
bindTouchAction('touch-split', () => { game.split(); dirty = true })
all<HTMLButtonElement>('[data-move]').forEach(button => {
  button.onpointerdown = event => {
    button.setPointerCapture(event.pointerId)
    touches.set(event.pointerId, button.dataset.move as Direction)
  }
  const release = (event: PointerEvent) => touches.delete(event.pointerId)
  button.onpointerup = release
  button.onpointercancel = release
  button.onlostpointercapture = release
})
function wireCourtInput(canvas: HTMLCanvasElement) {
  let drag: { id: number; x: number; y: number } | null = null
  const currentOrbit = () => page === 'technique' ? lab.orbit : page === 'ntrp' ? skillPath.orbit : display.orbit
  const usingOrbit = () => (page === 'technique' ? lab.angle : page === 'ntrp' ? skillPath.camera : display.camera) === 'orbit'
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !usingOrbit() || court?.fallback) return
    canvas.setPointerCapture(event.pointerId)
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
  })
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return
    const orbit = currentOrbit()
    orbit.yaw -= (event.clientX - drag.x) * .008
    orbit.elevation = clamp(orbit.elevation + (event.clientY - drag.y) * .007, page === 'technique' ? -.18 : .15, 1.16)
    drag.x = event.clientX
    drag.y = event.clientY
    dirty = true
  })
  canvas.addEventListener('pointerup', event => {
    if (drag || usingOrbit()) { drag = null; return }
    if (page !== 'training' || replay || event.button !== 0) return
    const point = court?.aimAt(event.clientX, event.clientY)
    if (point) {
      game.setAim(point.x, point.z)
      focusCourt()
      dirty = true
    }
  })
  canvas.addEventListener('lostpointercapture', () => { drag = null })
  canvas.addEventListener('wheel', event => {
    if (!usingOrbit()) return
    event.preventDefault()
    const orbit = currentOrbit()
    orbit.zoom = clamp(orbit.zoom + Math.sign(event.deltaY) * .055, .6, 1.55)
    updateCameraControls()
  }, { passive: false })
}
all<HTMLButtonElement>('[data-fullscreen]').forEach(button => button.onclick = () => { void toggleFullscreen(button.dataset.fullscreen!) })
all<HTMLButtonElement>('button[data-drawer]').forEach(button => button.onclick = () => {
  const panel = button.closest<HTMLElement>('.court-panel')!
  const drawer = button.dataset.drawer!
  if (panel.dataset.drawer === drawer) closeDrawers()
  else openDrawer(drawer, panel)
})
all<HTMLButtonElement>('[data-hud]').forEach(button => button.onclick = () => {
  const panel = byId(button.dataset.hud!)
  const hidden = panel.classList.toggle('quiet-hud')
  const label = hidden ? 'Show interface' : 'Hide interface'
  button.setAttribute('aria-pressed', String(hidden))
  button.setAttribute('aria-label', label)
  button.title = label
})
for (const [id, settings, makeOrbit] of [
  ['court-orbit', display, courtOrbit], ['lab-orbit', lab, athleteOrbit], ['ntrp-orbit', skillPath, courtOrbit],
] as const) {
  byId<HTMLInputElement>(`${id}-zoom`).oninput = event => {
    settings.orbit.zoom = Number((event.currentTarget as HTMLInputElement).value) / 100
    dirty = true
  }
  byId(`${id}-reset`).onclick = () => {
    settings.orbit = makeOrbit()
    updateCameraControls()
  }
}
all<HTMLButtonElement>('[data-force]').forEach(button => button.onclick = () => setForceMode(button.dataset.force as ForceMode))
byId<HTMLInputElement>('vectors-toggle').onchange = event => {
  display.vectors = (event.currentTarget as HTMLInputElement).checked
  dirty = true
}
byId('review-open').onclick = () => openReplay()
byId('review-close').onclick = () => { closeReplay(); focusCourt() }
byId('review-play').onclick = toggleReplay
byId<HTMLInputElement>('review-scrub').oninput = event => {
  if (!replay) return
  const [start, end] = replayBounds(replay.clip)
  replay.time = start + (end - start) * Number((event.currentTarget as HTMLInputElement).value) / 1000
  replay.playing = false
  dirty = true
}
byId('review-events').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-event]')
  if (!button || !replay) return
  replay.time = replay.clip.events[Number(button.dataset.event)].time
  replay.playing = false
  setForceMode('contact')
}
document.addEventListener('fullscreenchange', () => {
  all('[data-fullscreen]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fullscreen === document.fullscreenElement?.id)))
  if (page === 'training') focusCourt()
  dirty = true
})

all<HTMLButtonElement>('[data-technique]').forEach(button => button.onclick = () => {
  lab.technique = button.dataset.technique as Technique
  setLabPhase(0)
})
function selectMuscle(muscle: MuscleGroup) {
  lab.focus = muscle
  lab.follow = false
  updateBodyReadout()
  dirty = true
}
all<HTMLButtonElement>('[data-muscle]').forEach(button => button.onclick = () => selectMuscle(button.dataset.muscle as MuscleGroup))
for (const [id, key] of [['anatomy-toggle', 'anatomy'], ['lab-vectors', 'vectors']] as const) {
  byId<HTMLInputElement>(id).onchange = event => {
    lab[key] = (event.currentTarget as HTMLInputElement).checked
    dirty = true
  }
}
all('.world-labels').forEach(host => host.onclick = event => {
  const marker = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-marker]')?.dataset.marker
  if (!marker) return
  if (page === 'technique' && Object.hasOwn(MUSCLES, marker)) {
    selectMuscle(marker as MuscleGroup)
    openDrawer('body', byId('lab-panel'))
  } else if (page === 'ntrp') {
    openDrawer('exercise', byId('ntrp-panel'))
    byId('ntrp-skill-title').setAttribute('tabindex', '-1')
    byId('ntrp-skill-title').focus({ preventScroll: true })
  } else if (page === 'training') {
    if (marker === 'target') {
      const center = zoneCenter(game.zone)
      game.setAim(center.x, center.z)
      byId('feedback').textContent = 'Aim set to the center of the target.'
      dirty = true
      focusCourt()
    } else if (marker === 'landing') openReport()
    else if (marker === 'partner' || marker === 'recovery' || marker === 'stance' || marker === 'net-player') {
      openDrawer('session', byId('training-panel'))
      byId('feedback').textContent = game.plan?.cue ?? DRILLS[game.drill].coach
    } else {
      setForceMode(Object.hasOwn(MUSCLES, marker) ? 'body' : marker === 'impact' ? 'contact' : 'flight')
      openDrawer('forces', byId('training-panel'))
    }
  }
})
byId('timeline').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-phase]')
  if (button) setLabPhase(Number(button.dataset.phase))
}
byId('next-phase').onclick = () => setLabPhase((labPhase() + 1) % TECHNIQUES[lab.technique].phases.length)
byId('lab-play').onclick = toggleLab
byId<HTMLInputElement>('lab-scrub').oninput = event => {
  lab.time = Number((event.currentTarget as HTMLInputElement).value) / 1000
  lab.playing = false
  updateLab()
  dirty = true
}
byId<HTMLSelectElement>('lab-speed').onchange = event => { lab.speed = Number((event.currentTarget as HTMLSelectElement).value) }
byId<HTMLSelectElement>('lab-angle').onchange = event => {
  lab.angle = (event.currentTarget as HTMLSelectElement).value as LabAngle
  updateCameraControls()
}
byId<HTMLInputElement>('joints-toggle').onchange = event => {
  lab.joints = (event.currentTarget as HTMLInputElement).checked
  dirty = true
}
byId<HTMLSelectElement>('guide-surface').onchange = event => {
  chartCustomized = true
  chartSurface = (event.currentTarget as HTMLSelectElement).value as Surface
  chartConditions()
}
byId<HTMLSelectElement>('guide-wind').onchange = event => {
  chartCustomized = true
  chartWind = (event.currentTarget as HTMLSelectElement).value as Wind
  chartConditions()
}

const movement = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
}
const movementKeys = new Set(Object.values(movement).flat())
const aimKeys = new Set(['KeyQ', 'KeyE', 'KeyR', 'KeyF'])

window.addEventListener('keydown', event => {
  if (report.dialog.open) return
  if (event.key === 'Escape') {
    closeDrawers()
    if (replay) closeReplay()
    all('.court-panel.immersive').forEach(panel => {
      panel.classList.remove('immersive')
      panel.querySelector('[data-fullscreen]')?.setAttribute('aria-pressed', 'false')
    })
    return
  }
  if (page === 'guide' || help.open || byId<HTMLDialogElement>('ntrp-reference').open || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.matches('input, select, textarea, [contenteditable="true"]')) return
  if (event.code === 'KeyC' && !event.repeat && court && !court.fallback) {
    const options = page === 'technique' ? Object.keys(LAB_CAMERAS) : Object.keys(COURT_CAMERAS)
    const next = (options.indexOf(page === 'technique' ? lab.angle : page === 'ntrp' ? skillPath.camera : display.camera) + 1) % options.length
    if (page === 'technique') lab.angle = options[next] as LabAngle
    else if (page === 'ntrp') skillPath.camera = options[next] as CameraMode
    else display.camera = options[next] as CameraMode
    updateCameraControls()
    event.preventDefault()
    return
  }
  const orbit = page === 'technique' && lab.angle === 'orbit' ? lab.orbit
    : page === 'ntrp' && skillPath.camera === 'orbit' ? skillPath.orbit
    : page === 'training' && display.camera === 'orbit' && (!game.active || game.paused) ? display.orbit : null
  if (orbit && event.code.startsWith('Arrow')) {
    orbit.yaw += event.code === 'ArrowLeft' ? -.13 : event.code === 'ArrowRight' ? .13 : 0
    orbit.elevation = clamp(orbit.elevation + (event.code === 'ArrowUp' ? .095 : event.code === 'ArrowDown' ? -.095 : 0),
      page === 'technique' ? -.18 : .15, 1.16)
    dirty = true
    event.preventDefault()
    return
  }
  if (page !== 'training') return
  if (event.code === 'KeyT' && !event.repeat) {
    if (replay) closeReplay()
    else openReplay()
    return
  }
  if (event.code === 'Space' && target?.closest('button, a')) return
  if (replay && event.code === 'Space' && !event.repeat) {
    toggleReplay()
    event.preventDefault()
    return
  }
  if (replay && event.code !== 'KeyP') return
  if (movementKeys.has(event.code)) {
    if (!game.active || game.paused) return
    keys.add(event.code)
  } else if (aimKeys.has(event.code)) {
    const axis = event.code === 'KeyQ' ? [-.34, 0] : event.code === 'KeyE' ? [.34, 0]
      : event.code === 'KeyR' ? [0, -.38] : [0, .38]
    game.setAim(game.aim.x + axis[0], game.aim.z + axis[1])
    dirty = true
  } else if (event.code === 'Space' && !event.repeat) game.swing()
  else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    if (!event.repeat) game.split()
  } else if (event.code === 'KeyP' && !event.repeat) toggleDrill()
  else return
  event.preventDefault()
})
window.addEventListener('keyup', event => keys.delete(event.code))
window.addEventListener('blur', () => { keys.clear(); touches.clear() })
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.active) game.paused = true
  if (document.hidden) { lab.playing = false; skillPath.stopPreview(); if (replay) replay.playing = false }
  dirty = true
})
window.addEventListener('hashchange', route)

let installEvent: InstallEvent | undefined
let offlineReady = false
let workerFailed = false
function updateConnection() {
  const element = byId('connection')
  const message = !navigator.onLine ? offlineReady ? 'Playing offline' : 'Offline'
    : offlineReady ? 'Offline ready' : workerFailed ? 'Online' : 'Local session'
  element.dataset.state = navigator.onLine ? 'online' : 'offline'
  element.querySelector('span')!.textContent = message
  element.title = offlineReady ? 'The court and training tools are stored on this device.' : 'Offline play becomes available after the production app is cached.'
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  installEvent = event as InstallEvent
  byId('install-app').hidden = false
})
window.addEventListener('appinstalled', () => {
  installEvent = undefined
  byId('install-app').hidden = true
})
byId('install-app').onclick = async () => {
  const event = installEvent
  if (!event) return
  try {
    await event.prompt()
    await event.userChoice
  } catch {
    // The browser can invalidate a saved installation prompt.
  } finally {
    installEvent = undefined
    byId('install-app').hidden = true
  }
}
window.addEventListener('online', updateConnection)
window.addEventListener('offline', updateConnection)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const url = new URL('./sw.js', document.baseURI)
  void navigator.serviceWorker.ready.then(() => {
    offlineReady = true
    updateConnection()
  })
  void navigator.serviceWorker.register(url).catch(() => {
    workerFailed = true
    updateConnection()
  })
}

function stepAnimation(now: number) {
  const dt = clamp((now - previousFrame) / 1000, 0, .12)
  previousFrame = now
  const playing = page === 'training' && game.active && !game.paused
  const pathPlaying = page === 'ntrp' && skillPath.animating
  const wasPlaying = playing || (page === 'technique' && lab.playing) || pathPlaying || !!replay?.playing
  if (playing) {
    const touch = new Set(touches.values())
    const held = (direction: Direction) => Number(touch.has(direction) || movement[direction].some(key => keys.has(key)))
    const motion = { x: held('right') - held('left'), z: held('down') - held('up') }
    remainder += dt
    while (remainder >= STEP) {
      game.update(STEP, motion)
      remainder -= STEP
    }
  } else remainder = 0

  if (page === 'technique' && lab.playing) {
    lab.time = Math.min(1, lab.time + dt * lab.speed / TECHNIQUES[lab.technique].duration)
    if (lab.time >= 1) lab.playing = false
  }
  if (replay?.playing) {
    const [, end] = replayBounds(replay.clip)
    replay.time = Math.min(end, replay.time + dt * .42)
    if (replay.time >= end) replay.playing = false
  }
  if (pathPlaying) skillPath.advance(dt, game.conditions)
  const animating = (playing && game.active) || (page === 'technique' && lab.playing) || (pathPlaying && skillPath.animating) || !!replay?.playing
  const cameraMoving = !!court?.settling && !reducedMotion.matches
  const actionInterval = reducedMotion.matches ? 31 : 22
  if (page !== 'guide' && (dirty || (wasPlaying && !animating) || ((animating || cameraMoving) && now - lastRender >= actionInterval))) {
    const elapsed = Math.min(.1, (now - lastRender) / 1000)
    if (page === 'training') {
      updateTraining()
      const view = readTrainingView(playing)
      const body = court?.drawGame(game, view, elapsed)
      updateForceReadout(view, body)
      if (replay) updateReplay()
    } else if (page === 'ntrp') {
      court?.drawGame(skillPath.game, skillPath.view(game.conditions, reducedMotion.matches), elapsed)
    } else {
      updateLab()
      updateBodyReadout()
      court?.drawLab({ ...lab, leanMotion: reducedMotion.matches, conditions: game.conditions }, elapsed)
    }
    lastRender = now
    dirty = false
  }
  requestAnimationFrame(stepAnimation)
}

updateCameraControls()
updateAudio()
updateConnection()
route()
let previousFrame = performance.now()
let lastRender = previousFrame
let remainder = 0
requestAnimationFrame(stepAnimation)

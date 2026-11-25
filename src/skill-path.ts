import { courtOrbit, type CameraMode } from './cameras.ts'
import type { Technique, Vec3 } from './config.ts'
import type { GameView } from './court-view.ts'
import { Game } from './game.ts'
import { icon } from './icons.ts'
import { EXERCISES, NTRP, NTRP_SKILLS, isNtrpLevel, isNtrpSkill, type Exercise, type NtrpLevel, type NtrpSkill } from './ntrp.ts'
import { ntrpPlan, type NtrpPlan } from './ntrp-training.ts'
import { STEP, stepBall, type Ball, type Conditions } from './physics.ts'

const motions: Record<Exercise, Technique> = {
  forehand: 'forehand', backhand: 'backhand', serve: 'serve', spinServe: 'serve',
  return: 'forehand', pressureReturn: 'backhand', volley: 'volley', lowVolley: 'backhandVolley',
  lob: 'lob', drop: 'drop', approach: 'footwork', halfVolley: 'halfVolley', overhead: 'overhead',
  pass: 'forehand', recovery: 'footwork', rally: 'backhand', doubles: 'volley', pattern: 'forehand',
}

const node = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

interface Hooks {
  dirty: () => void
  save: () => void
  practice: (plan: NtrpPlan) => void
  study: (technique: Technique) => void
}

export function planMotion(plan: NtrpPlan): Technique { return motions[plan.exercise] }

export class SkillPath {
  readonly game = new Game()
  readonly records: Record<string, number> = {}
  level: NtrpLevel
  camera: CameraMode = 'baseline'
  orbit = courtOrbit()
  private skill: NtrpSkill = 'forehand'
  private exercise: Exercise = 'forehand'
  private sample?: Ball
  private demo?: Ball
  private elapsed = 0
  private remainder = 0
  private trail: Vec3[] = []
  private readonly hooks: Hooks
  private readonly levels = document.querySelectorAll<HTMLButtonElement>('[data-ntrp-level]')
  private readonly skills = document.querySelectorAll<HTMLButtonElement>('[data-ntrp-skill]')

  constructor(level: unknown, records: unknown, hooks: Hooks) {
    this.level = isNtrpLevel(level) ? level : '1.0'
    this.hooks = hooks
    if (records && typeof records === 'object' && !Array.isArray(records)) {
      for (const [key, score] of Object.entries(records)) {
        if (/^[1-4]\.[05]:[a-z]+:[A-Za-z]+$/.test(key) && Number.isInteger(score) && score > 0 && score <= 6) {
          this.records[key] = score
        }
      }
    }
    for (const button of this.levels) {
      button.onclick = () => {
        const level = button.dataset.ntrpLevel
        if (isNtrpLevel(level)) this.setLevel(level)
      }
    }
    for (const button of this.skills) {
      button.onclick = () => {
        const skill = button.dataset.ntrpSkill
        if (isNtrpSkill(skill)) {
          this.skill = skill
          this.chooseExercise()
          this.render()
        }
      }
    }
    const selector = node<HTMLSelectElement>('ntrp-exercise')
    selector.onchange = () => {
      const exercise = selector.value as Exercise
      if (!NTRP[this.level].skills[this.skill].exercises.includes(exercise)) return
      this.exercise = exercise
      this.render()
    }
    node('ntrp-practice').onclick = () => this.hooks.practice(this.plan)
    node('ntrp-watch-motion').onclick = () => this.hooks.study(planMotion(this.plan))
    node('ntrp-preview').onclick = () => this.togglePreview()
    const dialog = node<HTMLDialogElement>('ntrp-reference')
    node('ntrp-reference-open').onclick = () => {
      this.stopPreview()
      dialog.showModal()
    }
    dialog.onclick = event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-open-ntrp]')
      const level = button?.dataset.openNtrp
      if (isNtrpLevel(level)) {
        this.setLevel(level)
        dialog.close()
        node('ntrp-practice').focus({ preventScroll: true })
      }
    }
    this.render()
  }

  get plan(): NtrpPlan { return this.game.plan! }
  get animating() { return !!this.demo }

  record(plan: NtrpPlan, score: number): number {
    const previous = this.records[plan.id] ?? 0
    if (score > previous) {
      this.records[plan.id] = Math.min(score, plan.goal)
      this.hooks.save()
    }
    return this.records[plan.id] ?? 0
  }

  show() { this.render() }

  stopPreview() {
    if (!this.demo) return
    this.demo = undefined
    this.trail = []
    this.updatePlayButton()
    this.hooks.dirty()
  }

  private setLevel(level: NtrpLevel) {
    this.level = level
    this.chooseExercise()
    this.render()
    this.hooks.save()
  }

  private chooseExercise() {
    const available = NTRP[this.level].skills[this.skill].exercises
    if (!available.includes(this.exercise)) this.exercise = available[0]
  }

  private render() {
    const level = NTRP[this.level]
    const skill = level.skills[this.skill]
    const plan = ntrpPlan(this.level, this.skill, this.exercise)
    this.stopPreview()
    this.game.selectPlan(plan)
    this.sample = this.game.previewBall

    for (const button of this.levels) button.setAttribute('aria-pressed', String(button.dataset.ntrpLevel === this.level))
    let completed = 0
    let total = 0
    for (const button of this.skills) {
      const key = button.dataset.ntrpSkill as NtrpSkill
      button.setAttribute('aria-pressed', String(key === this.skill))
      const exercises = level.skills[key].exercises
      const count = exercises.filter(exercise => {
        const choice = ntrpPlan(this.level, key, exercise)
        return (this.records[choice.id] ?? 0) >= choice.goal
      }).length
      total += exercises.length
      completed += count
      button.querySelector('small')!.textContent = `${count}/${exercises.length}`
    }

    function set(id: string, text: string) { node(id).textContent = text }
    set('ntrp-eyebrow', `NTRP ${this.level}`)
    set('ntrp-stage-label', `NTRP ${this.level}`)
    set('ntrp-title', level.title)
    set('ntrp-overview', level.overview)
    set('ntrp-match', level.match)
    set('ntrp-skill-label', NTRP_SKILLS[this.skill].label)
    set('ntrp-skill-title', plan.title)
    set('ntrp-skill-description', skill.description)
    set('ntrp-focus', skill.focus)
    set('ntrp-pace', `NTRP ${this.level} · ${plan.paceLabel}`)
    set('ntrp-objective', plan.objective)
    set('ntrp-level-record', `${completed} / ${total} drills complete at NTRP ${this.level}`)
    const best = this.records[plan.id] ?? 0
    set('ntrp-exercise-record', `Practice best ${best} / ${plan.goal}${best >= plan.goal ? ' · Complete' : ''}`)
    const input = node<HTMLSelectElement>('ntrp-exercise')
    input.innerHTML = skill.exercises.map(exercise => `<option value="${exercise}">${EXERCISES[exercise].title}</option>`).join('')
    input.value = this.exercise
    this.hooks.dirty()
  }

  private togglePreview() {
    if (this.demo) {
      this.stopPreview()
      return
    }
    if (!this.sample) return
    this.demo = { ...this.sample, position: { ...this.sample.position }, velocity: { ...this.sample.velocity } }
    this.elapsed = this.remainder = 0
    this.trail = []
    this.updatePlayButton()
    this.hooks.dirty()
  }

  private updatePlayButton() {
    const button = node('ntrp-preview')
    const label = this.demo ? 'Stop shot preview' : 'Preview shot'
    button.setAttribute('aria-label', label)
    button.setAttribute('aria-pressed', String(!!this.demo))
    button.title = label
    button.innerHTML = icon(this.demo ? 'pause' : 'play', 19)
  }

  advance(dt: number, conditions: Conditions) {
    if (!this.demo) return
    this.remainder += dt * .70
    while (this.remainder >= STEP) {
      this.elapsed += STEP
      this.remainder -= STEP
      stepBall(this.demo, STEP, conditions)
      this.trail.push({ ...this.demo.position })
      if (this.trail.length > 140) this.trail.shift()
      if (this.demo.bounces >= 2 || this.elapsed >= 3.6) {
        this.stopPreview()
        return
      }
    }
  }

  view(conditions: Conditions, reducedMotion: boolean): GameView {
    this.game.conditions = conditions
    return {
      camera: this.camera, orbit: this.orbit, trail: true, guides: true, vectors: false, mode: 'flight',
      preview: this.sample, contact: null, playing: this.animating, leanMotion: reducedMotion,
      demo: this.demo ? { ball: this.demo, time: this.elapsed, trail: this.trail } : undefined,
    }
  }
}

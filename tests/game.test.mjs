import assert from 'node:assert/strict'
import test from 'node:test'
import { inZone } from '../src/config.ts'
import { Game } from '../src/game.ts'
import { STEP } from '../src/physics.ts'

const stopped = { x: 0, z: 0 }
const perfectWindow = game => game.cue().title === 'Swing now' && Math.abs(game.contactError) < .012

function advance(game, predicate, inputs = () => stopped, maxSeconds = 90) {
  for (let tick = 0; tick < maxSeconds / STEP; tick += 1) {
    if (predicate()) return
    game.update(STEP, inputs())
  }
  assert.fail(`Did not reach expected game state: ${game.drill}, ${game.phase}, ${game.result.title}`)
}

function hitOnTime(game) {
  if (perfectWindow(game)) game.swing()
  return stopped
}

test('the first-time baseline setup supports a full five-hit forehand drill', () => {
  const cues = []
  const game = new Game(cue => cues.push(cue))
  game.begin()
  advance(game, () => game.phase === 'finished', () => hitOnTime(game))
  assert.equal(game.attempts, 5)
  assert.equal(game.progress, 5)
  assert.equal(game.result.title, 'Target hit')
  assert.ok(inZone(game.lastShot.landing, game.zone))
  assert.equal(cues.filter(sound => sound === 'ready').length, 5)
})

test('the serve drill scores both diagonal boxes and all three serve types', () => {
  for (const adSide of [false, true]) {
    for (const shot of ['topspin', 'flat', 'slice']) {
      const game = new Game()
      game.select('serve')
      game.setServeSide(adSide)
      game.shot = shot
      game.begin()
      advance(game, () => game.phase === 'finished', () => hitOnTime(game))
      assert.equal(game.progress, 5, `${adSide ? 'Ad' : 'Deuce'} ${shot}`)
      assert.equal(game.attempts, 5)
      assert.ok(inZone(game.lastShot.landing, game.zone))
    }
  }
})

test('an early groundstroke and a baseline foot fault give actionable feedback', () => {
  const game = new Game()
  game.begin()
  advance(game, () => game.phase === 'incoming')
  game.swing()
  assert.equal(game.result.title, 'Too early')
  assert.equal(game.progress, 0)
  game.select('serve')
  game.begin()
  advance(game, () => game.phase === 'incoming', () => ({ x: 0, z: -1 }))
  advance(game, () => perfectWindow(game))
  game.swing()
  assert.equal(game.result.title, 'Foot fault')
  assert.equal(game.progress, 0)
})

test('footwork requires both contact and recovery after moving to the feed', () => {
  const game = new Game()
  game.select('footwork')
  game.begin()

  const moveTo = x => ({ x: Math.abs(x - game.player.x) > .075 ? Math.sign(x - game.player.x) : 0, z: 0 })
  advance(game, () => game.phase === 'recover', () => {
    if (game.phase === 'countdown' && game.phaseTime > .86) game.split()
    if (perfectWindow(game)) game.swing()
    return game.phase === 'incoming' ? moveTo(2.55) : stopped
  })
  assert.equal(game.splitTimed, true)
  assert.equal(game.progress, 0)
  advance(game, () => game.phase === 'between', () => moveTo(0))
  assert.equal(game.progress, 1)
  assert.equal(game.result.title, 'Recovered to center')

  advance(game, () => game.phase === 'finished', () => {
    if (game.phase === 'countdown' && game.phaseTime > .86) game.split()
    if (perfectWindow(game)) game.swing()
    if (game.phase === 'incoming') return moveTo(game.attempts % 2 === 0 ? 2.55 : -2.55)
    return moveTo(0)
  })
  assert.equal(game.attempts, 4)
  assert.equal(game.progress, 4)
})

test('rally returns generate consecutive live feeds across both sides', () => {
  const game = new Game()
  game.select('rally')
  game.begin()
  const techniques = new Set()
  advance(game, () => game.phase === 'finished', () => {
    if (perfectWindow(game)) {
      game.swing()
      techniques.add(game.technique)
    }
    if (game.phase !== 'incoming') return stopped
    const expected = game.forecast.find(point => point.z >= game.player.z - .65)
    if (!expected) return stopped
    const x = expected.x - Math.sign(expected.x) * .55
    return { x: Math.abs(x - game.player.x) > .10 ? Math.sign(x - game.player.x) : 0, z: 0 }
  })
  assert.equal(game.attempts, 6)
  assert.equal(game.bestStreak, 6)
  assert.deepEqual(techniques, new Set(['forehand', 'backhand']))
})

test('pause freezes the ball and reset keeps the selected conditions', () => {
  const game = new Game()
  game.setConditions({ surface: 'grass', wind: 4.5 })
  game.begin()
  advance(game, () => game.phase === 'incoming')
  const snapshot = structuredClone(game.ball)
  game.paused = true
  game.swing()
  game.update(STEP, { x: 1, z: 1 })
  assert.deepEqual(game.ball, snapshot)
  assert.equal(game.phaseTime, 0)
  game.reset()
  assert.equal(game.phase, 'idle')
  assert.equal(game.ball, null)
  assert.deepEqual(game.conditions, { surface: 'grass', wind: 4.5 })
})

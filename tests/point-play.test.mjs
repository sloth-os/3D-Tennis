import assert from 'node:assert/strict'
import test from 'node:test'
import { COURT, clamp } from '../src/config.ts'
import { Game } from '../src/game.ts'
import { STEP, makeBall, netHeight } from '../src/physics.ts'
import { OPPONENTS, Tiebreak, advanceFeet, callLanding, recoveryPosition } from '../src/point-play.ts'
import { sampleReplay } from '../src/replay.ts'
import { analyzeMotion, magnitude, samplePose } from '../src/motion.ts'

const still = { x: 0, z: 0 }
const toward = (a, b) => ({ x: clamp((b.x - a.x) * 3, -1, 1), z: clamp((b.z - a.z) * 3, -1, 1) })
function advance(game, until, limit = 6) {
  for (let step = 0; step < limit / STEP; step++) {
    if (until()) return
    game.update(STEP, still)
  }
  assert.fail('Did not reach expected state. ' + game.phase + ' / ' + game.result.title)
}
const centerSwing = g => g.phase === 'incoming' && Math.abs(g.contactError) < .009 && g.cue().title === 'Swing now'

test('tiebreak serves rotate after one then every two, changes ends at six, and continues past 7–6', () => {
  const m = new Tiebreak()
  const service = []
  for (let i = 0; i < 12; i++) {
    m.prepare()
    service.push(m.servingPoint)
    assert.equal(m.ad, i % 2 === 1)
    assert.equal(m.end, Math.floor(i / 6) % 2)
    m.award(i % 2 ? 'rival' : 'you', 'Clean winner')
  }
  assert.deepEqual(service.slice(0, 7), ['you', 'rival', 'rival', 'you', 'you', 'rival', 'rival'])
  m.award('you', 'Ace')
  assert.equal(m.finished, false)
  assert.equal(m.pointBall, 'Match point for you')
  m.award('rival', 'Clean winner')
  m.award('rival', 'Ace')
  m.award('rival', 'Ace')
  assert.equal(m.finished, true)
  assert.deepEqual([m.you, m.rival], [7, 9])
  m.award('you', 'Clean winner')
  assert.equal(m.you, 7)
})

test('the contact patch includes a touched line, the entire center service line and only the correct far or near box', () => {
  assert.equal(callLanding({ x: COURT.singles + .01, z: -10 }, false).inside, true)
  assert.equal(callLanding({ x: COURT.singles + .02, z: -10 }, false).inside, false)
  assert.equal(callLanding({ x: COURT.singles + .011, z: -COURT.halfLength - .011 }, false).inside, false)
  assert.equal(callLanding({ x: .027, z: -5 }, false, false).inside, true)
  assert.equal(callLanding({ x: .048, z: -5 }, false, false).inside, false)
  assert.equal(callLanding({ x: -2, z: 5 }, true, true).inside, true)
  assert.equal(callLanding({ x: -2, z: 5 }, true, false).inside, false)
  assert.equal(callLanding({ x: 4.6, z: -9 }, false, undefined, true).inside, true)
})

test('a let on the second serve retains that serve and the next fault awards exactly one point', () => {
  const g = new Game()
  g.select('match'); g.begin()
  advance(g, () => g.phase === 'incoming')
  g.swing()
  assert.equal(g.match.serve, 2)
  assert.equal(g.match.played, 0)
  advance(g, () => centerSwing(g))
  g.swing()
  g.ball = makeBall({ x: -1.5, y: netHeight(-1.5) + .017, z: .05 }, { x: 0, y: 0, z: -12 })
  advance(g, () => g.phase === 'between')
  assert.equal(g.result.title, 'Let · Replay the serve')
  assert.equal(g.match.serve, 2)
  assert.equal(g.match.played, 0)
  assert.equal(g.lastShot.result, 'Let')
  assert.deepEqual(g.replay.events.map(e => e.contact.kind), ['racket', 'tape', 'court'])
  advance(g, () => g.phase === 'incoming')
  g.swing()
  assert.equal(g.match.rival, 1)
  assert.equal(g.match.stats.you.doubles, 1)
  assert.equal(g.match.stats.you.firstTotal, 1)
})

test('an untouched toss can be repeated and an early air swing on a return leaves the ball live', () => {
  const g = new Game()
  g.select('match'); g.begin()
  advance(g, () => g.result.title === 'Toss reset')
  assert.equal(g.match.serve, 1)
  assert.equal(g.match.played, 0)
  for (let i = 0; i < 2; i++) { advance(g, () => g.phase === 'incoming'); g.swing() }
  advance(g, () => g.phase === 'incoming' && g.match.servingPoint === 'rival')
  g.swing()
  assert.equal(g.phase, 'incoming')
  assert.equal(g.match.played, 1)
})

test('surface braking changes stopping distance and live split unloads and replants both feet', () => {
  const distance = {}
  for (const surface of ['hard', 'clay', 'grass']) {
    const position = { x: 0, z: 0 }, velocity = { x: 4, z: 0 }
    for (let i = 0; i < 80; i++) advanceFeet(position, velocity, still, STEP, surface)
    distance[surface] = position.x
    assert.equal(velocity.x, 0)
  }
  assert.ok(distance.clay > distance.grass && distance.grass > distance.hard)
  const jump = samplePose('forehand', .025, { split: .135 })
  const land = samplePose('forehand', .025, { split: .27 })
  assert.ok(jump.legs.every(leg => !leg.planted))
  assert.ok(land.legs.every(leg => leg.planted))
  assert.equal(magnitude(analyzeMotion('forehand', .025, jump).ground), 0)
  assert.ok(recoveryPosition({ x: -3.8, z: -8.0 }).x > .3)
})

test('a full tiebreak is playable against every opponent on every surface and replay preserves both players', () => {
  for (const pace of Object.keys(OPPONENTS)) {
    for (const surface of ['hard', 'clay', 'grass']) {
      const game = new Game()
      game.pace = pace
      game.select('match')
      game.setConditions({ surface, wind: 2.2 })
      game.begin()
      let sawRally = false, archived, original, justEnded
      for (let i = 0; i < 120 * 480 && game.phase !== 'finished'; i++) {
        let move = still
        if (game.phase === 'incoming') {
          if (game.serving) game.setAim((game.adSide ? 1 : -1) * 3.36, -5.45)
          else {
            if (game.receiveMark) move = toward(game.player, game.receiveMark.feet)
            game.setAim(game.opponent.x >= 0 ? -3.76 : 3.76, -10.63)
          }
          if ((game.serving || game.ball.bounces === 1) && game.cue().title === 'Swing now' && Math.abs(game.contactError) < .034) game.swing()
        } else if (game.phase === 'outgoing' || game.phase === 'opponent') move = toward(game.player, game.recoverySpot)
        const far = { ...game.opponent }, phase = game.phase
        game.update(STEP, move)
        if (phase === 'opponent' || phase === 'outgoing') assert.ok(Math.hypot(game.opponent.x - far.x, game.opponent.z - far.z) < .06)
        if (game.match.strikes >= 3) sawRally = true
        if (!archived && game.lastShot?.landing) {
          archived = game.lastShot
          const t = archived.clip.events[0].time
          original = structuredClone(sampleReplay(archived.clip, t))
        }
        if (game.phase === 'between') justEnded = game.result.title
      }
      assert.equal(game.phase, 'finished', [pace, surface, game.match.you, game.match.rival, justEnded].join(' / '))
      assert.ok(game.match.played >= 7 && Math.abs(game.match.you - game.match.rival) >= 2)
      assert.ok(game.match.stats.rival.distance > 3 && sawRally)
      assert.ok(archived && archived.clip.frames.some(f => Math.hypot(f.opponent.feet.velocity.x, f.opponent.feet.velocity.z) > .5))
      assert.deepEqual(sampleReplay(archived.clip, archived.clip.events[0].time), original)
      assert.equal(game.courtConditions.wind, game.match.end ? -2.2 : 2.2)
    }
  }
})

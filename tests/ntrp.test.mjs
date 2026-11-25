import assert from 'node:assert/strict'
import test from 'node:test'
import { COURT, clamp, inZone, zoneCenter } from '../src/config.ts'
import { Game } from '../src/game.ts'
import { NTRP, NTRP_LEVELS, NTRP_SKILLS } from '../src/ntrp.ts'
import { ntrpPlan, practiceTarget } from '../src/ntrp-training.ts'
import { STEP } from '../src/physics.ts'

const steady = { x: 0, z: 0 }

// Follow the predicted feed until a playable contact point reaches the target stance.
function contactPosition(game) {
  const plan = game.plan
  if (plan.take === 'toss') return game.player
  const inAir = plan.take === 'beforeBounce' || plan.take === 'overhead'
  const low = plan.take === 'rising'
  const strikeZ = plan.home.z - .65
  let distance = Infinity
  let contact
  let bounced = false
  for (const point of game.forecast) {
    if (point.y <= COURT.ballRadius + .003) {
      if (bounced) break
      bounced = true
    }
    const minY = plan.take === 'overhead' ? 1.91 : low ? .105 : .175
    const maxY = plan.take === 'overhead' ? 3.16 : low ? .86 : 2.23
    if (point.z < 2.76 || point.z > 14.4 || point.y < minY || point.y > maxY || bounced === inAir) continue
    const offset = Math.abs(point.z - strikeZ)
    if (offset < distance) {
      distance = offset
      contact = point
    }
  }
  if (!contact) return null
  const side = plan.direction === 'forehand' ? 1 : plan.direction === 'backhand' ? -1 : Math.sign(contact.x - game.player.x) || 1
  return { x: contact.x - (plan.take === 'overhead' ? 0 : .56 * side), z: clamp(contact.z + .65, 3.4, 15.25) }
}

function moveToward(player, target) {
  return { x: clamp((target.x - player.x) * 3.6, -1, 1), z: clamp((target.z - player.z) * 3.6, -1, 1) }
}

function completeDrill(plan) {
  const game = new Game()
  game.selectPlan(plan)
  game.begin()
  let forecast
  let intercept
  for (let tick = 0; tick < 9000 && game.phase !== 'finished'; tick += 1) {
    if (game.phase === 'incoming' && game.forecast !== forecast) {
      forecast = game.forecast
      intercept = contactPosition(game)
    }
    if (game.cue().title === 'Swing now' && Math.abs(game.contactError) < .064) game.swing()
    const target = game.phase === 'incoming' ? intercept
      : game.phase === 'recover' ? game.recoverySpot : game.phase === 'between' ? plan.home : null
    game.update(STEP, target ? moveToward(game.player, target) : steady)
  }
  return game
}

test('all eight NTRP levels cover six skill areas with unique, playable drill plans', () => {
  assert.deepEqual(NTRP_LEVELS, ['1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5'])
  const known = new Set()
  for (const level of NTRP_LEVELS) {
    assert.deepEqual(Object.keys(NTRP[level].skills), Object.keys(NTRP_SKILLS))
    for (const [skill, profile] of Object.entries(NTRP[level].skills)) {
      assert.ok(profile.description && profile.focus && profile.exercises.length > 0)
      for (const exercise of profile.exercises) {
        const plan = ntrpPlan(level, skill, exercise)
        assert.ok(!known.has(plan.id), plan.id)
        known.add(plan.id)
        const game = completeDrill(plan)
        assert.equal(game.phase, 'finished', plan.id)
        assert.equal(game.progress, game.goal, `${plan.id} · ${game.result.title}`)
      }
    }
  }
  assert.equal(known.size, 104)
})

test('introductory timing is more forgiving and advanced placement switches direction and depth', () => {
  const first = ntrpPlan('1.0', 'forehand', 'forehand')
  const advanced = ntrpPlan('4.5', 'forehand', 'forehand')
  assert.ok(first.home.z < advanced.home.z)
  assert.ok(first.contactWindow > advanced.contactWindow)
  const short = practiceTarget(advanced, false, 1, false)
  const deep = practiceTarget(advanced, false, 0, false)
  assert.ok(zoneCenter(short).x > 0 && zoneCenter(deep).x < 0)
  assert.ok(zoneCenter(short).z > zoneCenter(deep).z)
})

test('serve placement alternates T and wide on both diagonals', () => {
  const plan = ntrpPlan('4.5', 'serve', 'spinServe')
  for (const ad of [false, true]) {
    const center = practiceTarget(plan, ad, 0, false)
    const wide = practiceTarget(plan, ad, 1, false)
    const sign = ad ? 1 : -1
    assert.equal(Math.sign(zoneCenter(center).x), sign)
    assert.equal(Math.sign(zoneCenter(wide).x), sign)
    assert.ok(Math.abs(zoneCenter(center).x) < Math.abs(zoneCenter(wide).x))
    assert.ok(!inZone(zoneCenter(center), wide))
    assert.ok(center.zMin >= -COURT.service && wide.zMax < 0)
  }
})

test('a volley after the first bounce is rejected rather than scoring as a groundstroke', () => {
  const game = new Game()
  game.selectPlan(ntrpPlan('2.5', 'volley', 'volley'))
  game.begin()
  for (let tick = 0; tick < 460; tick += 1) {
    if (game.phase === 'incoming' && game.ball.bounces === 1) {
      game.swing()
      assert.equal(game.result.title, 'Ball already bounced')
      assert.equal(game.progress, 0)
      return
    }
    game.update(STEP, { x: 0, z: game.phase === 'incoming' ? 1 : 0 })
  }
  assert.fail('Expected the ball to bounce before the retreating player tried the volley.')
})

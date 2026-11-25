import assert from 'node:assert/strict'
import test from 'node:test'
import { COURT, SHOTS, SURFACES } from '../src/config.ts'
import { STEP, makeBall, netHeight, shotBall, stepBall, traceBall } from '../src/physics.ts'

const contact = { x: .95, y: 1.08, z: 10.27 }
const target = { x: -2.15, z: -9.34 }
const hard = { surface: 'hard', wind: 0 }

test('each groundstroke reaches the same selected calm-air target with a distinct flight', () => {
  const results = {}
  for (const shot of Object.keys(SHOTS)) {
    const flight = traceBall(shotBall(contact, target, shot, false, 1), hard)
    assert.equal(flight.net, null)
    assert.ok(flight.landing)
    assert.ok(Math.hypot(flight.landing.x - target.x, flight.landing.z - target.z) < .025)
    results[shot] = flight
  }
  assert.ok(results.topspin.clearance > results.flat.clearance)
  assert.ok(results.flat.clearance > results.slice.clearance)
  assert.ok(results.topspin.bounceHeight > results.slice.bounceHeight)
})

test('the same launched ball drifts downwind in either direction', () => {
  const launch = shotBall(contact, target, 'topspin', false, 1)
  const right = traceBall(launch, { ...hard, wind: 4.5 }).landing
  const left = traceBall(launch, { ...hard, wind: -4.5 }).landing
  assert.ok(right.x > target.x + .2)
  assert.ok(left.x < target.x - .2)
  assert.deepEqual(launch.position, contact)
})

test('the court surface changes restitution and grip at impact', () => {
  const bounces = {}
  for (const surface of Object.keys(SURFACES)) {
    const ball = makeBall({ x: 1, y: .10, z: 2 }, { x: 0, y: -9, z: -16 })
    const impact = stepBall(ball, STEP, { surface, wind: 0 })
    assert.equal(impact.kind, 'bounce')
    assert.equal(ball.bounces, 1)
    assert.equal(ball.position.y, COURT.ballRadius)
    bounces[surface] = ball.velocity
  }
  assert.ok(bounces.clay.y > bounces.hard.y && bounces.hard.y > bounces.grass.y)
  assert.ok(Math.abs(bounces.clay.z) < Math.abs(bounces.hard.z))
  assert.ok(Math.abs(bounces.grass.z) > Math.abs(bounces.hard.z))
})

test('net collisions use the curved tape height and ball radius', () => {
  assert.equal(netHeight(0), COURT.netCenter)
  assert.equal(netHeight(COURT.stickX), COURT.netPost)
  const launch = makeBall({ x: 3, y: 1.0, z: .05 }, { x: 0, y: 0, z: -15 })
  assert.equal(stepBall(launch, STEP, hard).kind, 'net')
  assert.ok(launch.velocity.z > 0)
  const high = makeBall({ x: 3, y: 1.3, z: .05 }, { x: 0, y: 0, z: -15 })
  assert.equal(stepBall(high, STEP, hard), null)
})

test('a right-handed slice serve adds lateral curvature while keeping its selected landing', () => {
  const point = { x: 2.1, y: 2.76, z: 11.53 }
  const aim = { x: -2.2, z: -4.75 }
  const slice = shotBall(point, aim, 'slice', true, 1)
  assert.ok(slice.sideSpin > 0)
  const curled = traceBall(slice, hard, 2, true)
  const straight = traceBall({ ...slice, sideSpin: 0 }, hard, 2, true)
  assert.ok(Math.abs(curled.landing.x - aim.x) < .025)
  assert.ok(straight.landing.x > curled.landing.x + .7)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { COURT, SHOTS, SURFACES } from '../src/config.ts'
import { STEP, flightForces, makeBall, netHeight, shotBall, stepBall, traceBall } from '../src/physics.ts'

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
  const launch = makeBall({ x: 3, y: netHeight(3) - .04, z: .05 }, { x: 0, y: 0, z: -15 })
  assert.equal(stepBall(launch, STEP, hard).kind, 'net')
  assert.ok(launch.velocity.z > 0)
  const graze = makeBall({ x: 3, y: netHeight(3) + .018, z: .05 }, { x: 0, y: 0, z: -15 })
  const cord = stepBall(graze, STEP, hard)
  assert.equal(cord.kind, 'cord')
  assert.equal(cord.contact.kind, 'tape')
  assert.ok(graze.velocity.z < 0 && graze.velocity.z > cord.contact.before.z && graze.position.z < 0)
  assert.equal(stepBall(graze, STEP, hard), null)
  const high = makeBall({ x: 3, y: 1.3, z: .05 }, { x: 0, y: 0, z: -15 })
  assert.equal(stepBall(high, STEP, hard), null)
})

test('bounce friction exchanges spin and translation without adding mechanical energy', () => {
  const radius = COURT.ballRadius
  for (const surface of Object.keys(SURFACES)) {
    for (const spin of [-1750, 0, 1500, 9000]) {
      const ball = makeBall({ x: 1, y: .045, z: 4 }, { x: 0, y: -5, z: -13 }, spin)
      const { contact } = stepBall(ball, STEP, { surface, wind: 0 })
      const groundSpeed = (rpm) => radius * rpm * Math.PI / 30
      const slip = Math.abs(contact.before.z) - groundSpeed(spin)
      const after = Math.abs(contact.after.z) - groundSpeed(ball.spin)
      assert.ok(Math.abs(after) < Math.abs(slip))
      assert.ok(after * slip >= -1e-8)
      const energy = (v, rpm) => v.x ** 2 + v.y ** 2 + v.z ** 2 + 2 / 3 * groundSpeed(rpm) ** 2
      assert.ok(energy(contact.after, ball.spin) < energy(contact.before, spin))
      if (spin === 0) assert.ok(ball.spin > 0)
      if (spin === 9000) assert.ok(Math.abs(contact.after.z) > Math.abs(contact.before.z))
    }
  }
})

test('Magnus force does no work along the relative airflow for a rising or falling shot', () => {
  for (const vy of [-7, 5]) {
    const ball = makeBall({ x: 0, y: 3, z: 5 }, { x: -4, y: vy, z: -21 }, 1800, 530)
    const f = flightForces(ball, 4.5).magnus
    assert.ok(Math.abs(f.x * (ball.velocity.x - 4.5) + f.y * vy + f.z * ball.velocity.z) < 1e-9)
  }
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

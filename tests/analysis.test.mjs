import assert from 'node:assert/strict'
import test from 'node:test'
import { Game } from '../src/game.ts'
import { MOTION_DURATION, analyzeMotion, magnitude, samplePose, subtract } from '../src/motion.ts'
import { analyzeContact, BALL_MASS, flightForces, makeBall, STEP, stepBall } from '../src/physics.ts'
import { replayBounds, sampleReplay } from '../src/replay.ts'

const still = { x: 0, z: 0 }
const conditions = { surface: 'hard', wind: 4.5 }
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`)

test('the displayed air forces sum to the acceleration used by the simulator', () => {
  const ball = makeBall({ x: 0, y: 3, z: 5 }, { x: -1, y: 2, z: -20 }, 1600, 1100)
  const initial = { ...ball.velocity }
  const { gravity, drag, magnus } = flightForces(ball, conditions.wind)
  assert.equal(stepBall(ball, STEP, conditions), null)
  for (const key of ['x', 'y', 'z']) {
    close((ball.velocity[key] - initial[key]) / STEP * BALL_MASS, gravity[key] + drag[key] + magnus[key])
  }
  assert.ok(gravity.y < 0 && drag.z > 0 && magnus.y < 0 && magnus.x < 0)
})

test('recorded court impact yields normal impulse, grip loss and translational energy loss', () => {
  const ball = makeBall({ x: 0, y: .05, z: 4 }, { x: 0, y: -4, z: -19 })
  const result = stepBall(ball, STEP, conditions)
  assert.equal(result.kind, 'bounce')
  const { contact } = result
  const estimated = analyzeContact(contact)
  assert.equal(contact.kind, 'court')
  assert.ok(estimated.impulse.y > 0 && estimated.impulse.z > 0)
  close(estimated.force.y * contact.duration, BALL_MASS * (contact.after.y - contact.before.y))
  assert.ok(estimated.afterEnergy < estimated.beforeEnergy)
})

test('all motion sequences preserve upper and lower limb lengths', () => {
  for (const technique of Object.keys(MOTION_DURATION)) {
    for (let frame = 0; frame <= 20; frame += 1) {
      const pose = samplePose(technique, frame / 20)
      for (const arm of pose.arms) {
        close(magnitude(subtract(arm.shoulder, arm.elbow)), arm.lengths[0])
        close(magnitude(subtract(arm.elbow, arm.hand)), arm.lengths[1])
      }
      for (const leg of pose.legs) {
        close(magnitude(subtract(leg.hip, leg.knee)), leg.lengths[0])
        close(magnitude(subtract(leg.knee, leg.ankle)), leg.lengths[1])
      }
    }
  }
})

test('the split step model applies no ground reaction during its airborne phase', () => {
  const jumping = analyzeMotion('footwork', .22)
  const landing = analyzeMotion('footwork', .42)
  assert.equal(magnitude(jumping.ground), 0)
  assert.ok(landing.ground.y > 0)
  close(landing.right.y + landing.left.y, landing.ground.y)
  assert.ok(landing.knee > jumping.knee)
})

test('a shot replay preserves preparation, racket contact, court bounce and the original conditions', () => {
  const game = new Game()
  game.begin()
  for (let step = 0; step < 720; step += 1) {
    if (game.cue().title === 'Swing now' && Math.abs(game.contactError) < .012) game.swing()
    game.update(STEP, still)
    if (game.replay?.events.length === 2 && game.replay.frames.at(-1).time > game.replay.events[1].time + .35) break
  }
  const replay = game.replay
  const [start, end] = replayBounds(replay)
  const [strike, bounce] = replay.events
  assert.ok(start < strike.time && strike.time < bounce.time && bounce.time < end)
  assert.deepEqual(replay.events.map(event => event.contact.kind), ['racket', 'court'])
  assert.deepEqual(sampleReplay(replay, strike.time).ball.velocity, strike.contact.after)
  assert.equal(sampleReplay(replay, start - 2).time, start)
  assert.equal(sampleReplay(replay, end + 2).time, end)
  game.setConditions({ surface: 'clay', wind: -4.5 })
  assert.deepEqual(sampleReplay(replay, bounce.time).conditions, { surface: 'hard', wind: 0 })
})

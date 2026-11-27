import assert from 'node:assert/strict'
import test from 'node:test'
import { CONTACT_BALLS, CONTACT_START, moveToStance } from '../src/contact-training.ts'
import { buildContactDemo, demoPhase } from '../src/contact-demo.ts'
import { Game } from '../src/game.ts'
import { samplePose, magnitude, subtract } from '../src/motion.ts'
import { STEP } from '../src/physics.ts'
import { sampleReplay } from '../src/replay.ts'
import { orbitFromView, panOrbit, rotateOrbit, zoomOrbit } from '../src/cameras.ts'

test('every feed reaches its taught height on both wings and puts the strings on the ball in every condition', () => {
  for (const [ball, spec] of Object.entries(CONTACT_BALLS)) {
    for (const side of ['forehand', 'backhand']) for (const surface of ['hard', 'clay', 'grass']) {
      for (const wind of [-4.5, 0, 4.5]) for (const shot of ['topspin', 'flat', 'slice']) {
        const context = [ball, side, surface, wind, shot].join(' / ')
        const demo = buildContactDemo(ball, side, { surface, wind }, shot)
        assert.ok(demo, context)
        const frame = sampleReplay(demo.clip, demo.struck)
        assert.equal(frame.pose.technique, side)
        assert.equal(frame.pose.shot, shot)
        assert.ok(Math.abs(frame.ball.position.y - spec.height) < .09, context)
        assert.ok(Math.abs(frame.ball.position.x - (side === 'forehand' ? spec.x : -spec.x)) < .11, context)
        assert.ok(demo.mark.bounce.z < demo.mark.contact.z)
        assert.deepEqual(demo.mark.contact, frame.ball.position)
        assert.deepEqual(demo.times.map(t => demoPhase(demo, t)), [0, 1, 2, 3])
        assert.ok(demo.clip.frames.every((f, i, frames) => i === 0 || f.time > frames[i - 1].time))
        assert.deepEqual(demo.clip.events.slice(0, 2).map(e => e.contact.kind), ['court', 'racket'])
        const pose = samplePose(side, frame.pose.progress, { strike: frame.pose.strike, shot,
          movement: frame.feet.velocity.x / 6.5, depth: frame.feet.velocity.z / 6.5, run: frame.feet.stride, split: frame.feet.split })
        assert.ok(magnitude(subtract(pose.racketHead, frame.pose.strike)) < .006, context)
        assert.ok(demo.swingPath.length > 10)
      }
    }
  }
})

test('contact heights change the body load and the chosen spin changes preparation while maintaining contact', () => {
  for (const side of ['forehand', 'backhand']) {
    const strike = { x: side === 'forehand' ? .62 : -.62, y: .46, z: -.66 }
    const low = samplePose(side, .62, { strike })
    const high = samplePose(side, .62, { strike: { ...strike, y: 1.56 } })
    assert.ok(low.hips.y < high.hips.y - .2)
    const brush = samplePose(side, .43, { strike, shot: 'topspin' })
    const slice = samplePose(side, .43, { strike, shot: 'slice' })
    assert.ok(slice.racketHead.y > brush.racketHead.y + .22)
  }
  assert.equal(moveToStance(CONTACT_START, { x: -1.4, z: 12.4 }), 'back and left')
  assert.equal(moveToStance(CONTACT_START, { x: 1.4, z: 6.4 }), 'forward and right')
})

test('a real contact practice session requires the selected side, an in-court return and recovery over three feeds', () => {
  for (const ball of ['body', 'short', 'wide', 'deep']) {
    const g = new Game()
    g.selectContact(ball, 'backhand')
    g.begin()
    let sawRecovery = false
    for (let i = 0; i < 45 / STEP && g.phase !== 'finished'; i++) {
      const target = g.phase === 'incoming' && g.receiveMark ? g.receiveMark.feet
        : g.phase === 'outgoing' || g.phase === 'recover' ? g.recoverySpot : CONTACT_START
      const motion = { x: Math.max(-1, Math.min(1, (target.x - g.player.x) * .85)), z: Math.max(-1, Math.min(1, (target.z - g.player.z) * .85)) }
      if (g.phase === 'incoming' && g.cue().title === 'Swing now' && Math.abs(g.contactError) <= .024) g.swing()
      if (g.phase === 'recover') sawRecovery = true
      g.update(STEP, motion)
    }
    assert.equal(g.hits, 3, ball)
    assert.equal(g.phase, 'finished')
    assert.ok(sawRecovery)
    assert.ok(g.shots.every(s => s.stroke === 'backhand'))
  }
})

test('detaching a camera preserves its lens, eye and focus, with view-relative pan and bounded rotation and zoom', () => {
  for (const eye of [{ x: 3.1, y: 6.4, z: 23.65 }, { x: 0, y: 43, z: .001 }, { x: -2.2, y: 1.3, z: 7.2 }]) {
    const target = { x: .1, y: .4, z: 1.1 }, orbit = orbitFromView(eye, target, 47)
    const planar = Math.cos(orbit.elevation) * orbit.radius
    assert.ok(Math.hypot(target.x + Math.sin(orbit.yaw) * planar - eye.x,
      target.y + Math.sin(orbit.elevation) * orbit.radius - eye.y, target.z + Math.cos(orbit.yaw) * planar - eye.z) < .000001)
    assert.equal(orbit.fov, 47)
    const previous = { ...orbit.target }
    panOrbit(orbit, 26, 0, 600, false)
    assert.notDeepEqual(orbit.target, previous)
    assert.deepEqual(target, previous)
    zoomOrbit(orbit, .001); assert.equal(orbit.zoom, .30)
    zoomOrbit(orbit, 100); assert.equal(orbit.zoom, 2.5)
    rotateOrbit(orbit, .36, 20); assert.ok(orbit.elevation < Math.PI / 2)
  }
})

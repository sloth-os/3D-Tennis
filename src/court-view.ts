import * as THREE from 'three'
import { Athlete } from './athlete.ts'
import { COURT, SHOTS, SURFACES, clamp, type Aim, type Technique, type Vec3 } from './config.ts'
import { Game } from './game.ts'
import { analyzeContact, flightForces, shotBall, traceBall, type Ball, type Contact, type Conditions } from './physics.ts'
import { buildVenue, canvasTexture, floor } from './venue.ts'
import type { CameraMode, LabAngle, Orbit } from './cameras.ts'
import { activeMuscle, add, analyzeMotion, mix, samplePose, vec, MOTION_DURATION, type MuscleGroup } from './motion.ts'
import type { ReplayFrame } from './replay.ts'
import { WorldAnalysis, type BodyState, type WorldLabel } from './world-analysis.ts'
import type { ForceMode } from './analysis-colors.ts'

export type GameView = { camera: CameraMode; orbit: Orbit; trail: boolean; guides: boolean; vectors: boolean; mode: ForceMode;
  preview?: Ball; replay?: ReplayFrame; reviewTrail?: Vec3[]; contact: Contact | null; playing: boolean; leanMotion: boolean;
  demo?: { ball: Ball; time: number; trail: Vec3[] } }
export type LabView = { technique: Technique; time: number; joints: boolean; anatomy: boolean; vectors: boolean;
  focus: MuscleGroup; angle: LabAngle; orbit: Orbit; playing: boolean; leanMotion: boolean; conditions: Conditions }

const NEON = 0xdfff55
const field = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const intersect = new THREE.Vector3()

function ring(radius: number, width: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - width, radius, 48), material)
  mesh.rotateX(-Math.PI / 2)
  return mesh
}

function guideMaterial(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false })
}

function mark(color: number, size: number, opacity = 1) {
  const group = new THREE.Group()
  const mat = guideMaterial(color, opacity)
  const center = new THREE.Mesh(new THREE.CircleGeometry(size * .21, 22), mat)
  center.rotateX(-Math.PI / 2)
  group.add(ring(size, .022, mat), center)
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const tick = floor(.021, .09, mat, Math.sin(angle) * (size + .038), Math.cos(angle) * (size + .038), .002)
    tick.rotateZ(angle)
    group.add(tick)
  }
  return group
}

function buildTarget() {
  const texture = canvasTexture(256, 256, ctx => {
    ctx.fillStyle = 'rgba(211, 249, 68, .24)'
    ctx.fillRect(2, 2, 252, 252)
    ctx.save()
    ctx.beginPath()
    ctx.rect(2, 2, 252, 252)
    ctx.clip()
    ctx.strokeStyle = 'rgba(214, 252, 77, .16)'
    ctx.lineWidth = 2
    for (let x = -256; x <= 256; x += 19) {
      ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x + 256, 0); ctx.stroke()
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(218, 255, 92, .93)'
    ctx.lineWidth = 5
    ctx.setLineDash([11, 6])
    ctx.strokeRect(3, 3, 250, 250)
    ctx.setLineDash([])
    ctx.lineWidth = 5
    ctx.beginPath()
    for (const a of [3, 253]) {
      for (const b of [3, 253]) {
        ctx.moveTo(a + (a < 100 ? 22 : -22), b)
        ctx.lineTo(a, b)
        ctx.lineTo(a, b + (b < 100 ? 22 : -22))
      }
    }
    ctx.stroke()
  })
  return floor(1, 1, new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }))
}

function buildTrail(dashed: boolean) {
  const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 180 }, () => new THREE.Vector3()))
  geometry.setDrawRange(0, 0)
  const material = dashed
    ? new THREE.LineDashedMaterial({ color: 0xe5ff92, dashSize: .29, gapSize: .24, transparent: true, opacity: .53 })
    : new THREE.LineBasicMaterial({ color: 0xedff90, transparent: true, opacity: .91 })
  const distances = new THREE.BufferAttribute(new Float32Array(180), 1)
  geometry.setAttribute('lineDistance', distances)
  const line = new THREE.Line(geometry, material)
  line.frustumCulled = false
  return line
}

function fillTrail(line: THREE.Line, points: Vec3[]) {
  const positions = line.geometry.getAttribute('position')
  const distance = line.geometry.getAttribute('lineDistance')
  const count = Math.min(points.length, 180)
  let length = 0
  for (let i = 0; i < count; i += 1) {
    const point = points[i]
    if (i > 0) {
      const previous = points[i - 1]
      length += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z)
    }
    positions.setXYZ(i, point.x, Math.max(point.y, .046), point.z)
    distance.setX(i, length)
  }
  positions.needsUpdate = distance.needsUpdate = true
  line.geometry.setDrawRange(0, count)
}

class LiveCourt {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(41, 1, .1, 154)
  private readonly world = new WorldAnalysis(this.scene)
  private readonly focus = new THREE.Vector3()
  private labFlightKey = ''
  private labFlight: Vec3[] = []
  private readonly swingPath = buildTrail(false)
  settling = false
  private readonly renderer: THREE.WebGLRenderer
  private readonly ray = new THREE.Raycaster()
  private readonly viewLook = new THREE.Vector3()
  private readonly viewFrom = new THREE.Vector3()
  private readonly player: Athlete
  private readonly opponent: Athlete
  private readonly demonstrator: Athlete
  private partner?: Athlete
  private netPlayer?: Athlete
  private readonly ball: THREE.Mesh
  private readonly ballShadow: THREE.Mesh
  private readonly playerShadow: THREE.Mesh
  private readonly opponentShadow: THREE.Mesh
  private readonly labShadow: THREE.Mesh
  private readonly aim = mark(NEON, .44)
  private readonly recovery = mark(0x95e0ee, .85, .78)
  private readonly landing = mark(0xfbf6c6, .25, .77)
  private readonly target = buildTarget()
  private readonly trail = buildTrail(false)
  private readonly projected = buildTrail(true)
  private readonly setSurface: ReturnType<typeof buildVenue>
  private currentSurface = ''
  private currentForecast: Vec3[] | null = null
  private idleKey = ''
  private cameraKey = ''
  private run = 0
  private aspect = 1
  private width = 0
  private height = 0
  private readonly softwareRenderer: boolean
  private readonly nativePixelRatio = Math.min(window.devicePixelRatio || 1, 1.65)
  private lowResolution = false

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    const gl = this.renderer.getContext()
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const driver = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string : ''
    this.softwareRenderer = /swiftshader|llvmpipe|software rasterizer/i.test(driver)
    this.renderer.setPixelRatio(this.nativePixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.04
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = this.softwareRenderer ? THREE.BasicShadowMap : THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    this.setSurface = buildVenue(this.scene)
    this.player = new Athlete(this.scene)
    this.opponent = new Athlete(this.scene, true)
    this.demonstrator = new Athlete(this.scene)
    this.demonstrator.root.visible = false
    this.demonstrator.root.position.set(-.4, .012, 6.8)
    this.opponent.root.rotation.y = Math.PI

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(.068, 16, 11), new THREE.MeshStandardMaterial({
      color: 0xe1fb37, emissive: 0x819826, emissiveIntensity: .38, roughness: .82,
    }))
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.063, .0028, 5, 26), new THREE.MeshBasicMaterial({ color: 0xe6e8ad }))
    seam.rotation.x = .58
    seam.rotation.y = .29
    this.ball.add(seam)
    const shadowMap = canvasTexture(64, 64, ctx => {
      const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31)
      gradient.addColorStop(0, 'rgba(12,29,24,.45)')
      gradient.addColorStop(1, 'rgba(12,29,24,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 64, 64)
    })
    const shadow = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false })
    this.ballShadow = floor(.53, .53, shadow)
    this.playerShadow = floor(1.50, .91, shadow)
    this.opponentShadow = floor(1.50, .91, shadow)
    this.labShadow = floor(1.50, .91, shadow)
    this.target.renderOrder = 3
    this.swingPath.material = new THREE.LineBasicMaterial({ color: 0xffa079, transparent: true, opacity: .72 })
    this.swingPath.visible = false
    this.scene.add(this.swingPath)
    this.scene.add(this.target, this.aim, this.recovery, this.landing, this.ball, this.ballShadow,
      this.playerShadow, this.opponentShadow, this.labShadow, this.trail, this.projected)
    this.camera.position.set(6.9, 9.8, 20.8)
    this.camera.lookAt(0, 0, -1.1)
  }

  resize(width: number, height: number): void {
    if (!width || !height || (width === this.width && height === this.height)) return
    this.width = width
    this.height = height
    this.aspect = width / height
    this.renderer.setSize(width, height, false)
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
  }

  private renderAtSpeed(playing: boolean) {
    const limited = this.softwareRenderer && playing
    if (limited === this.lowResolution) return
    this.lowResolution = limited
    this.renderer.setPixelRatio(limited ? Math.min(this.width * this.height > 720_000 ? .56 : .73, this.nativePixelRatio) : this.nativePixelRatio)
  }

  attachLabels(host: HTMLElement) { this.world.attach(host) }

  private placeCamera(key: CameraMode | `lab-${LabAngle}`, orbit: Orbit, dt: number, snap: boolean, player?: Aim, ball?: Ball, highReach = false) {
    const narrow = this.aspect < 1.25
    const subject = this.demonstrator.root.position
    this.camera.up.set(0, 1, 0)
    let fov = narrow ? 57 : 43
    this.viewLook.set(0, .46, -1.25)
    switch (key) {
      case 'baseline':
        this.viewFrom.set(narrow ? 3.6 : 6.55, narrow ? 10.55 : 9.72, narrow ? 24.1 : 23.75)
        this.viewLook.set(-.21, .51, narrow ? -.3 : .48)
        break
      case 'player':
        this.viewFrom.set((player?.x ?? 0) + .77, 2.48, (player?.z ?? 11) + 2.85)
        this.viewLook.set((player?.x ?? 0) * .20, 1.30, -6.6)
        fov = narrow ? 77 : 64
        break
      case 'overhead':
        this.viewFrom.set(0, narrow ? 41 : 43, .001)
        this.viewLook.set(0, 0, 0)
        this.camera.up.set(0, 0, -1)
        fov = 46
        break
      case 'side':
        this.viewFrom.set(narrow ? 23.8 : 20.1, 10.2, 10.1)
        fov = narrow ? 60 : 48
        break
      case 'net':
        this.viewFrom.set(narrow ? 10.7 : 8.8, 3.1, 1.7)
        this.viewLook.set(-.45, .94, -1.2)
        fov = narrow ? 77 : 64
        break
      case 'chase':
        if (ball) {
          const p = ball.position
          const direction = Math.sign(ball.velocity.z || -1)
          this.viewFrom.set(p.x + 1.64, Math.max(2.15, p.y + 1.14), p.z - direction * 3.65)
          this.viewLook.set(p.x * .80, Math.max(.65, p.y - .24), p.z + direction * 2.7)
        } else {
          this.viewFrom.set((player?.x ?? 0) + 1.3, 3.05, (player?.z ?? 11) + 4.1)
          this.viewLook.set(0, 1, -4.5)
        }
        fov = narrow ? 73 : 65
        break
      case 'orbit': {
        const distance = (narrow ? 27 : 24) * orbit.zoom
        this.viewFrom.set(Math.sin(orbit.yaw) * Math.cos(orbit.elevation) * distance,
          .65 + Math.sin(orbit.elevation) * distance, Math.cos(orbit.yaw) * Math.cos(orbit.elevation) * distance - 1.25)
        fov = narrow ? 56 : 46
        break
      }
      default:
        this.viewLook.set(subject.x + .04, highReach ? 1.21 : 1.05, subject.z - .06)
        fov = (narrow ? 41 : 37) + (highReach ? 3 : 0)
        if (key === 'lab-front') this.viewFrom.set(subject.x - .38, 1.95, subject.z - 4.80)
        if (key === 'lab-quarter') this.viewFrom.set(subject.x + 2.40, 2.02, subject.z - 3.98)
        if (key === 'lab-side') this.viewFrom.set(subject.x + 4.50, 1.88, subject.z - .60)
        if (key === 'lab-rear') this.viewFrom.set(subject.x - .96, 1.92, subject.z + 4.67)
        if (key === 'lab-low') this.viewFrom.set(subject.x + 2.28, .42, subject.z - 4.51)
        if (key === 'lab-orbit') {
          const d = 4.75 * orbit.zoom
          this.viewFrom.set(subject.x + Math.sin(orbit.yaw) * Math.cos(orbit.elevation) * d,
            1.19 + Math.sin(orbit.elevation) * d, subject.z + Math.cos(orbit.yaw) * Math.cos(orbit.elevation) * d)
        }
        break
    }
    const modeJump = !this.cameraKey || this.cameraKey === 'overhead' || key === 'overhead'
      || key.startsWith('lab') !== this.cameraKey.startsWith('lab')
    const distance = this.camera.position.distanceTo(this.viewFrom) + this.focus.distanceTo(this.viewLook)
    const blend = snap || modeJump || distance < .033 ? 1 : 1 - Math.exp(-Math.max(dt, .016) * 10)
    this.cameraKey = key
    this.camera.position.lerp(this.viewFrom, blend)
    this.focus.lerp(this.viewLook, blend)
    this.camera.fov += (fov - this.camera.fov) * blend
    this.camera.updateProjectionMatrix()
    this.camera.lookAt(this.focus)
    this.camera.updateMatrixWorld(true)
    this.settling = blend < 1
  }

  drawGame(game: Game, display: GameView, dt: number) {
    this.renderAtSpeed(display.playing)
    const sample = display.replay
    const player = sample?.player ?? game.player
    const ball = sample?.ball ?? display.demo?.ball ?? game.ball
    const conditions = sample?.conditions ?? game.conditions
    this.placeCamera(display.camera, display.orbit, dt, display.leanMotion, player, ball ?? undefined)
    this.demonstrator.root.visible = false
    this.player.root.visible = true
    this.opponent.root.visible = game.drill !== 'serve'
    if (conditions.surface !== this.currentSurface) {
      this.currentSurface = conditions.surface
      this.setSurface(conditions.surface)
    }
    this.world.clear()
    this.swingPath.visible = false
    const labels: WorldLabel[] = []
    const moving = !sample && display.playing
    if (moving) this.run += Math.hypot(game.playerMotion.x, game.playerMotion.z) * dt * 3.2
    const { technique, progress } = display.demo
      ? { technique: game.posture.technique, progress: clamp(.62 + display.demo.time * .76, .62, 1) }
      : sample?.pose ?? game.posture
    const dip = moving && game.splitClock < .33 ? Math.sin(game.splitClock / .33 * Math.PI) * .11 : 0
    const onStrings = sample ? progress >= .62 && progress <= .66 : game.swingClock < .075
    const contact = onStrings && display.contact?.kind === 'racket' ? display.contact.position : null
    const pose = samplePose(technique, progress, {
      movement: moving ? game.playerMotion.x / 6.5 : 0, depth: moving ? game.playerMotion.z / 6.5 : 0,
      run: this.run, dip,
      racketTarget: contact ? vec(contact.x - player.x, contact.y - .014, contact.z - player.z) : undefined,
    })
    this.player.root.position.set(player.x, .014, player.z)
    const bodyView = display.mode === 'body' && display.vectors
    const emphasis = activeMuscle(technique, progress)
    this.player.guide.visible = bodyView
    this.player.applyPose(pose, bodyView ? { focus: emphasis, emphasis } : undefined)
    this.opponent.root.position.set(game.opponent.x, .012, game.opponent.z)
    this.opponent.pose('forehand', game.opponentSwing < .52 ? .62 + game.opponentSwing * .71 : .02)
    const partner = game.partner
    const netPlayer = game.netOpponent
    if (partner) {
      this.partner ??= new Athlete(this.scene)
      this.partner.root.position.set(partner.x, .014, partner.z)
      this.partner.pose('volley', .06)
      if (display.guides) labels.push({ key: 'partner', text: 'Your partner', position: vec(partner.x, 1.93, partner.z) })
    }
    if (netPlayer) {
      this.netPlayer ??= new Athlete(this.scene, true)
      this.netPlayer.root.rotation.y = Math.PI
      this.netPlayer.root.position.set(netPlayer.x, .014, netPlayer.z)
      this.netPlayer.pose('volley', .06)
      if (display.guides) labels.push({ key: 'net-player', text: 'Net player', position: vec(netPlayer.x, 1.87, netPlayer.z) })
    }
    if (this.partner) this.partner.root.visible = !!partner
    if (this.netPlayer) this.netPlayer.root.visible = !!netPlayer
    this.player.guide.visible = false
    this.labShadow.visible = false
    this.playerShadow.visible = true
    this.opponentShadow.visible = this.opponent.root.visible
    this.playerShadow.position.set(player.x + .21, .025, player.z - .10)
    this.opponentShadow.position.set(game.opponent.x + .21, .025, game.opponent.z - .10)

    const zone = game.zone
    this.target.visible = !sample && display.guides && game.showTarget
    this.target.position.set((zone.xMax + zone.xMin) / 2, .022, (zone.zMax + zone.zMin) / 2)
    this.target.scale.set(zone.xMax - zone.xMin, zone.zMax - zone.zMin, 1)
    this.aim.visible = !sample
    this.aim.position.set(game.aim.x, .027, game.aim.z)
    this.aim.scale.setScalar(display.camera === 'overhead' ? 1.45 : 1)
    this.recovery.visible = !sample && game.drill === 'footwork' && (display.guides || game.phase === 'recover')
    this.recovery.position.set(game.recoverySpot.x, .029, game.recoverySpot.z)
    this.recovery.scale.setScalar(game.plan ? game.recoverySize / .85 : 1)
    if (game.plan && this.recovery.visible) labels.push({ key: 'recovery', text: 'Recovery ring',
      position: vec(game.recoverySpot.x - .5, .09, game.recoverySpot.z + .18) })
    this.landing.visible = !sample && !!game.lastLanding && display.guides
    if (game.lastLanding) this.landing.position.set(game.lastLanding.x, .034, game.lastLanding.z)
    const idle = game.phase === 'idle'
    const activeBall = ball ?? (idle ? display.preview : undefined)
    this.ball.visible = !!activeBall
    this.ballShadow.visible = this.ball.visible
    if (activeBall) {
      const position = activeBall.position
      this.ball.position.set(position.x, Math.max(position.y, .068), position.z)
      if (sample) {
        this.ball.rotation.z = sample.time * activeBall.spin / 120
        this.ball.rotation.y = sample.time * activeBall.sideSpin / 120
      } else if (display.playing) {
        this.ball.rotation.z += dt * activeBall.spin / 120
        this.ball.rotation.y += dt * activeBall.sideSpin / 120
      }
      this.ballShadow.position.set(position.x, .026, position.z)
      this.ballShadow.scale.setScalar(1 + position.y * .39)
    }
    const trail = display.reviewTrail ?? display.demo?.trail ?? game.trail
    this.trail.visible = display.trail && trail.length > 1
    if (this.trail.visible) fillTrail(this.trail, trail)
    this.projected.visible = !sample && display.trail && (idle || game.forecast.length > 0)
    if (idle && display.preview && this.projected.visible) {
      const key = [game.plan?.id, game.drill, game.aim.x, game.aim.z, game.shot, game.adSide, conditions.surface, conditions.wind].join(',')
      if (key !== this.idleKey || this.currentForecast !== null) {
        this.idleKey = key
        this.currentForecast = null
        fillTrail(this.projected, traceBall(display.preview, conditions, 2.4, true).points)
      }
    } else if (this.currentForecast !== game.forecast) {
      this.currentForecast = game.forecast
      this.idleKey = ''
      fillTrail(this.projected, game.forecast)
    }

    if (this.target.visible) labels.push({ key: 'target', text: 'Landing target',
      position: vec((zone.xMin + zone.xMax) / 2, .25, zone.zMin + .22) })
    if (display.guides && idle && display.preview) labels.push({ key: 'contact', text: 'Contact point',
      position: add(display.preview.position, vec(.32, .30, 0)) })
    const body = display.mode === 'body' ? analyzeMotion(technique, progress, pose) : undefined
    if (display.vectors) {
      if (display.mode === 'flight' && activeBall) this.world.flight(activeBall.position, flightForces(activeBall, conditions.wind), !idle, labels)
      if (display.mode === 'contact' && display.contact) {
        const hit = display.contact
        const name = hit.kind === 'court' ? 'Court bounce' : hit.kind === 'racket' ? 'Racket contact' : 'Net impact'
        this.world.impact(hit.position, hit.before, hit.after, analyzeContact(hit).force, name, sample ? .18 : game.phaseTime, labels)
      }
      if (body) {
        this.world.body(vec(player.x, .014, player.z), pose.legs.map(leg => leg.ankle), body,
          { legs: add(pose.legs[0].knee, vec(.31, .05, 0)), core: add(pose.torso, vec(-.41, .15, 0)),
            arm: add(pose.racketHead, vec(.14, .16, 0)) }, labels)
      }
    }
    this.world.project(labels, this.camera, this.width, this.height)
    this.renderer.render(this.scene, this.camera)
    return body
  }

  drawLab(display: LabView, dt: number) {
    this.renderAtSpeed(display.playing)
    this.placeCamera(`lab-${display.angle}`, display.orbit, dt, display.leanMotion, undefined, undefined,
      display.technique === 'serve' || display.technique === 'overhead')
    this.demonstrator.root.visible = true
    const subject = this.demonstrator.root.position
    if (display.conditions.surface !== this.currentSurface) {
      this.currentSurface = display.conditions.surface
      this.setSurface(display.conditions.surface)
    }
    const origin = vec(subject.x, subject.y, subject.z)
    const pose = samplePose(display.technique, display.time)
    this.demonstrator.guide.visible = display.joints
    this.demonstrator.applyPose(pose, display.anatomy ? {
      focus: display.focus, emphasis: activeMuscle(display.technique, display.time),
    } : undefined)
    this.player.root.visible = this.opponent.root.visible = false
    if (this.partner) this.partner.root.visible = false
    if (this.netPlayer) this.netPlayer.root.visible = false
    this.playerShadow.visible = this.opponentShadow.visible = false
    this.labShadow.visible = true
    this.labShadow.position.set(subject.x + pose.hips.x + .21, .025, subject.z - .10)
    this.target.visible = this.aim.visible = this.recovery.visible = this.landing.visible = false
    this.trail.visible = this.projected.visible = this.ballShadow.visible = false
    const labels: WorldLabel[] = []
    this.world.clear()
    this.swingPath.visible = display.vectors && display.technique !== 'footwork'
    if (this.swingPath.visible) {
      const start = Math.max(.05, display.time - .27)
      const end = Math.min(.86, Math.max(.20, display.time + .095))
      const track = Array.from({ length: 25 }, (_, i) =>
        add(origin, samplePose(display.technique, start + (end - start) * i / 24).racketHead))
      fillTrail(this.swingPath, track)
    }
    if (display.vectors) {
      const state = analyzeMotion(display.technique, display.time, pose)
      this.world.body(origin, pose.legs.map(leg => leg.ankle), state,
        { legs: add(pose.legs[0].knee, vec(.39, .04, -.15)), core: add(pose.torso, vec(-.55, .17, -.07)),
          arm: add(pose.arms[0].elbow, vec(.57, .25, .05)) }, labels)
    }
    const hitTime = .62
    const serve = display.technique === 'serve'
    const overhead = display.technique === 'overhead'
    const halfVolley = display.technique === 'halfVolley'
    const volley = display.technique === 'volley' || display.technique === 'backhandVolley' || halfVolley
    const visibleFrom = serve || overhead ? .20 : .34
    const hasBall = display.technique !== 'footwork' && display.time >= visibleFrom
    this.ball.visible = hasBall
    if (hasBall) {
      const contact = add(origin, samplePose(display.technique, hitTime).racketHead)
      const key = [display.technique, display.conditions.surface, display.conditions.wind].join(',')
      if (key !== this.labFlightKey) {
        this.labFlightKey = key
        const drop = display.technique === 'drop'
        const trajectory = drop ? 'drop' : display.technique === 'lob' ? 'lob' : overhead ? 'smash' : volley ? 'volley' : 'drive'
        const initial = shotBall(contact, { x: -1.9, z: drop ? -2.39 : serve ? -4.70 : -9.3 },
          drop ? 'slice' : serve || volley || overhead ? 'flat' : 'topspin', serve, 1, trajectory)
        this.labFlight = traceBall(initial, display.conditions).points
      }
      let position: Vec3
      if (display.time < hitTime) {
        const stage = (display.time - visibleFrom) / (hitTime - visibleFrom)
        const start = serve ? add(origin, samplePose('serve', .20).arms[1].hand)
          : add(contact, vec(0, overhead ? 1.35 : halfVolley ? .08 : -.34, -3.4))
        if (halfVolley) {
          const bounce = { x: contact.x, y: COURT.ballRadius, z: contact.z - .46 }
          position = stage < .75 ? mix(start, bounce, stage / .75) : mix(bounce, contact, (stage - .75) / .25)
        } else position = add(mix(start, contact, stage), vec(0, Math.sin(stage * Math.PI) * (serve ? .60 : .27), 0))
      } else {
        const seconds = (display.time - hitTime) * MOTION_DURATION[display.technique]
        position = this.labFlight[Math.min(this.labFlight.length - 1, Math.round(seconds * 40))] ?? contact
      }
      this.ball.position.set(position.x, Math.max(.068, position.y), position.z)
    }
    this.world.project(labels, this.camera, this.width, this.height)
    this.renderer.render(this.scene, this.camera)
  }

  aimAt(x: number, y: number): Aim | null {
    this.ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), this.camera)
    const position = this.ray.ray.intersectPlane(field, intersect)
    return position && position.z < -.35 && position.z > -14 && Math.abs(position.x) < 7.3 ? { x: position.x, z: position.z } : null
  }
}

class TacticalCourt {
  private readonly ctx: CanvasRenderingContext2D
  private scale = 1
  private width = 1
  private height = 1

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(width: number, height: number) {
    if (!width || !height || (width === this.width && height === this.height)) return
    this.width = this.canvas.width = width
    this.height = this.canvas.height = height
    this.scale = Math.min(width / 14, height / 30)
  }

  private point(x: number, z: number): [number, number] {
    return [this.width / 2 + x * this.scale, this.height / 2 + z * this.scale]
  }

  drawGame(game: Game, display: GameView) {
    const { ctx, scale } = this
    const box = (x: number, z: number, width: number, depth: number, fill?: string) => {
      const [a, b] = this.point(x, z)
      if (fill) ctx.fillStyle = fill
      if (fill) ctx.fillRect(a, b, width * scale, depth * scale)
      else ctx.strokeRect(a, b, width * scale, depth * scale)
    }
    ctx.fillStyle = '#29493c'
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.strokeStyle = '#d3dfcf'
    ctx.lineWidth = 1.4
    const color = '#' + SURFACES[(display.replay?.conditions ?? game.conditions).surface].paint.toString(16)
    box(-COURT.doubles, -COURT.halfLength, COURT.doubles * 2, COURT.halfLength * 2, color)
    box(-COURT.doubles, -COURT.halfLength, COURT.doubles * 2, COURT.halfLength * 2)
    box(-COURT.singles, -COURT.halfLength, COURT.singles * 2, COURT.halfLength * 2)
    box(-COURT.singles, -COURT.service, COURT.singles, COURT.service * 2)
    box(0, -COURT.service, COURT.singles, COURT.service * 2)
    box(-COURT.postX, -.063, COURT.postX * 2, .126, '#e2e7d8')
    if (display.guides && game.showTarget) {
      const { xMin, xMax, zMin, zMax } = game.zone
      box(xMin, zMin, xMax - xMin, zMax - zMin, '#dfff5544')
      ctx.strokeStyle = '#dfff55'
      ctx.setLineDash([5, 4])
      box(xMin, zMin, xMax - xMin, zMax - zMin)
      ctx.setLineDash([])
    }
    const trail = display.reviewTrail ?? display.demo?.trail ?? game.trail
    if (display.trail && trail.length > 1) {
      ctx.beginPath()
      ctx.moveTo(...this.point(trail[0].x, trail[0].z))
      trail.forEach(p => ctx.lineTo(...this.point(p.x, p.z)))
      ctx.strokeStyle = SHOTS[game.shot].color
      ctx.stroke()
    }
    const dot = (x: number, z: number, r: number, color: string, outline = false) => {
      ctx.beginPath()
      ctx.arc(...this.point(x, z), r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.strokeStyle = color
      if (outline) ctx.stroke()
      else ctx.fill()
    }
    dot(game.aim.x, game.aim.z, 8, '#dcf971', true)
    const player = display.replay?.player ?? game.player
    dot(player.x, player.z, 7, '#eef3df')
    if (game.drill !== 'serve') dot(game.opponent.x, game.opponent.z, 6, '#dfb679')
    if (game.drill === 'footwork') dot(game.recoverySpot.x, game.recoverySpot.z, 13, '#8ad4ea', true)
    const partner = game.partner
    const netPlayer = game.netOpponent
    if (partner) dot(partner.x, partner.z, 7, '#8ad4ea')
    if (netPlayer) dot(netPlayer.x, netPlayer.z, 7, '#dfb679')
    const ball = display.replay?.ball ?? display.demo?.ball ?? game.ball ?? display.preview
    if (ball) dot(ball.position.x, ball.position.z, 3.8, '#e4ff4d')
  }

  drawLab(display: LabView) {
    const { ctx } = this
    ctx.fillStyle = '#244739'
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.fillStyle = '#e5ece1'
    ctx.font = '600 17px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('3D technique view requires WebGL 2', this.width / 2, this.height / 2)
    ctx.font = '13px sans-serif'
    const progress = Math.round(display.time * 100)
    ctx.fillText(`Use the technique panel · ${progress}% through the motion`, this.width / 2, this.height / 2 + 31)
  }

  aimAt(x: number, y: number): Aim | null {
    const position = { x: (x - .5) * this.width / this.scale, z: (y - .5) * this.height / this.scale }
    return position.z < -.35 && position.z > -14 && Math.abs(position.x) < 7.3 ? position : null
  }
}

export class CourtView {
  readonly fallback: boolean
  readonly canvas: HTMLCanvasElement
  private readonly view: LiveCourt | TacticalCourt
  private readonly observer: ResizeObserver

  constructor(host: HTMLElement, onResize: () => void) {
    let canvas = document.createElement('canvas')
    try {
      this.view = new LiveCourt(canvas)
      this.fallback = false
    } catch (error) {
      console.warn('WebGL court unavailable. Using the tactical view.', error)
      canvas = document.createElement('canvas')
      this.view = new TacticalCourt(canvas)
      this.fallback = true
    }
    canvas.className = 'court-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    this.canvas = canvas
    this.observer = new ResizeObserver(([entry]) => {
      this.view.resize(entry.contentRect.width, entry.contentRect.height)
      onResize()
    })
    this.attach(host)
  }

  attach(host: HTMLElement) {
    this.observer.disconnect()
    host.prepend(this.canvas)
    const labels = host.querySelector<HTMLElement>('.world-labels')
    if (labels && this.view instanceof LiveCourt) this.view.attachLabels(labels)
    this.observer.observe(host)
    this.view.resize(host.clientWidth, host.clientHeight)
  }

  drawGame(game: Game, display: GameView, dt: number): BodyState | undefined {
    if (this.view instanceof LiveCourt) return this.view.drawGame(game, display, dt)
    this.view.drawGame(game, display)
  }
  get settling() { return this.view instanceof LiveCourt && this.view.settling }
  drawLab(display: LabView, dt: number) {
    if (this.view instanceof LiveCourt) this.view.drawLab(display, dt)
    else this.view.drawLab(display)
  }

  aimAt(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect()
    return this.view.aimAt((clientX - bounds.left) / bounds.width, (clientY - bounds.top) / bounds.height)
  }
}

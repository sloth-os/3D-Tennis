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
import { lineDistance } from './point-play.ts'

export type GameView = { camera: CameraMode; orbit: Orbit; trail: boolean; guides: boolean; vectors: boolean; mode: ForceMode;
  preview?: Ball; replay?: ReplayFrame; reviewTrail?: Vec3[]; contact: Contact | null; playing: boolean; leanMotion: boolean;
  demo?: { ball: Ball; time: number; trail: Vec3[] }; replayScore?: { you: number; rival: number };
  netMotion?: { contact: Contact; age: number } | null }
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
  private readonly bounceGuide = mark(0xffc58c, .20, .86)
  private readonly feetGuide = new THREE.Group()
  private readonly contactGate = new THREE.Mesh(new THREE.RingGeometry(.147, .159, 32), guideMaterial(0xe7f7c4, .77))
  private readonly target = buildTarget()
  private readonly trail = buildTrail(false)
  private readonly projected = buildTrail(true)
  private readonly venue: ReturnType<typeof buildVenue>
  private readonly lanes = buildTrail(true)
  private sceneTime = 0
  private currentSurface = ''
  private currentForecast: Vec3[] | null = null
  private idleKey = ''
  private cameraKey = ''
  private aspect = 1
  private width = 0
  private height = 0
  private readonly softwareRenderer: boolean
  private readonly nativePixelRatio = Math.min(window.devicePixelRatio || 1, 1.65)
  private lowResolution = false

  constructor(readonly canvas: HTMLCanvasElement, onReady: () => void) {
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
    this.venue = buildVenue(this.scene, onReady)
    const shoeMark = new THREE.Shape()
    shoeMark.moveTo(-.046, -.14)
    shoeMark.bezierCurveTo(-.091, -.13, -.088, .14, -.049, .18)
    shoeMark.bezierCurveTo(.006, .22, .083, .17, .077, .04)
    shoeMark.bezierCurveTo(.064, -.04, .066, -.17, -.046, -.14)
    const imprint = new THREE.ShapeGeometry(shoeMark)
    for (const sign of [-1, 1]) {
      const shoe = new THREE.Mesh(imprint, guideMaterial(0x9be2ef, .80))
      shoe.rotation.set(-Math.PI / 2, 0, sign * .14)
      shoe.position.x = sign * .24
      this.feetGuide.add(shoe)
    }
    this.feetGuide.add(ring(.47, .014, guideMaterial(0x9be2ef, .48)))
    this.scene.add(this.bounceGuide, this.feetGuide, this.contactGate)
    this.lanes.material = new THREE.LineDashedMaterial({ color: 0x9ce3f0, transparent: true, opacity: .56, dashSize: .22, gapSize: .20 })
    this.lanes.visible = false
    this.scene.add(this.lanes)
    this.player = new Athlete(this.scene)
    this.opponent = new Athlete(this.scene, true)
    this.demonstrator = new Athlete(this.scene)
    this.demonstrator.root.visible = false
    this.demonstrator.root.position.set(-.4, .012, 6.8)
    this.opponent.root.rotation.y = Math.PI

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballRadius, 24, 16), new THREE.MeshStandardMaterial({
      color: 0xd9f43a, emissive: 0x728518, emissiveIntensity: .32, roughness: .98,
    }))
    const stitching = Array.from({ length: 97 }, (_, i) => {
      const t = i / 96 * Math.PI * 2
      const latitude = .71 * Math.sin(2 * t)
      return new THREE.Vector3(Math.cos(t) * Math.cos(latitude), Math.sin(latitude), Math.sin(t) * Math.cos(latitude)).multiplyScalar(COURT.ballRadius)
    })
    const seam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stitching), 80, .00095, 5, true),
      new THREE.MeshBasicMaterial({ color: 0xf3efd7 }))
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
        if (this.aspect < .86) {
          this.viewFrom.set(.65, 9.5, 28.8 + Math.max(0, .52 / this.aspect - 1) * 17)
          this.viewLook.set(0, .22, 4.05)
          fov = 58
        } else {
          this.viewFrom.set(3.1, 6.4, 23.65)
          this.viewLook.set(0, .55, 4.30)
          fov = narrow ? 51 : 45
        }
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
    const ball = sample?.ball ?? display.demo?.ball ?? game.ball ?? game.opponentToss
    const conditions = sample?.conditions ?? game.courtConditions
    const end = sample?.end ?? game.match?.end ?? 0
    this.setEnd(end)
    if (display.playing) this.sceneTime += dt
    this.venue.flag(conditions.wind * (end ? -1 : 1), sample?.time ?? this.sceneTime)
    this.venue.flex(sample ? display.netMotion : game.netMotion, end)
    this.venue.board(display.replayScore ?? game.match ?? undefined)
    this.placeCamera(display.camera, display.orbit, dt, display.leanMotion, player, ball ?? undefined)
    this.demonstrator.root.visible = false
    this.player.root.visible = true
    this.opponent.root.visible = game.drill !== 'serve'
    if (conditions.surface !== this.currentSurface) {
      this.currentSurface = conditions.surface
      this.venue.surface(conditions.surface)
    }
    this.world.clear()
    this.swingPath.visible = false
    const labels: WorldLabel[] = []
    const feet = sample?.feet ?? { velocity: game.playerMotion, stride: game.playerStride, split: game.splitClock }
    const { technique, progress } = display.demo
      ? { technique: game.posture.technique, progress: clamp(.62 + display.demo.time * .76, .62, 1) }
      : sample?.pose ?? game.posture
    const onStrings = sample ? progress >= .62 && progress <= .66 : game.swingClock < .075
    const contact = onStrings && display.contact?.kind === 'racket' ? display.contact.position : null
    const pose = samplePose(technique, progress, {
      movement: feet.velocity.x / 6.5, depth: feet.velocity.z / 6.5, run: feet.stride, split: feet.split,
      racketTarget: contact ? vec(contact.x - player.x, contact.y - .014, contact.z - player.z) : undefined,
    })
    this.player.root.position.set(player.x, .014, player.z)
    const bodyView = display.mode === 'body' && display.vectors
    const emphasis = activeMuscle(technique, progress)
    this.player.guide.visible = bodyView
    this.player.applyPose(pose, bodyView ? { focus: emphasis, emphasis } : undefined)
    const rival = sample?.opponent.position ?? game.opponent
    const rivalPose = sample?.opponent.pose ?? game.opponentPose
    const rivalMotion = sample?.opponent.feet.velocity ?? game.opponentMotion
    this.opponent.root.position.set(rival.x, .012, rival.z)
    const farContact = !sample && game.opponentSwing < .075 && game.lastContact?.kind === 'racket' ? game.lastContact.position : null
    this.opponent.applyPose(samplePose(rivalPose.technique, rivalPose.progress, {
      movement: -rivalMotion.x / 6.5, depth: -rivalMotion.z / 6.5, run: sample?.opponent.feet.stride ?? game.opponentStride,
      racketTarget: farContact ? vec(rival.x - farContact.x, farContact.y - .012, rival.z - farContact.z) : undefined,
    }))
    if (ball) {
      this.player.trackBall(vec(ball.position.x - player.x, ball.position.y, ball.position.z - player.z))
      this.opponent.trackBall(vec(rival.x - ball.position.x, ball.position.y, rival.z - ball.position.z))
    }
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
    this.labShadow.visible = false
    this.playerShadow.visible = true
    this.opponentShadow.visible = this.opponent.root.visible
    this.playerShadow.position.set(player.x + .21, .025, player.z - .10)
    this.opponentShadow.position.set(rival.x + .21, .025, rival.z - .10)

    const zone = game.zone
    const receive = game.receiveMark
    this.feetGuide.visible = !sample && display.guides && game.phase === 'incoming' && !!receive
    this.contactGate.visible = this.feetGuide.visible
    this.bounceGuide.visible = this.feetGuide.visible && !!receive?.bounce
    if (this.feetGuide.visible && receive) {
      this.feetGuide.position.set(receive.feet.x, .032, receive.feet.z)
      this.contactGate.position.set(receive.contact.x, receive.contact.y, receive.contact.z)
      this.contactGate.quaternion.copy(this.camera.quaternion)
      if (receive.bounce) this.bounceGuide.position.set(receive.bounce.x, .031, receive.bounce.z)
      if (Math.hypot(receive.feet.x - player.x, receive.feet.z - player.z) > .82)
        labels.push({ key: 'stance', text: receive.side + ' setup', position: vec(receive.feet.x, .15, receive.feet.z) })
    }
    this.target.visible = !sample && display.guides && game.showTarget
    this.target.position.set((zone.xMax + zone.xMin) / 2, .022, (zone.zMax + zone.zMin) / 2)
    this.target.scale.set(zone.xMax - zone.xMin, zone.zMax - zone.zMin, 1)
    this.aim.visible = !sample
    this.aim.position.set(game.aim.x, .027, game.aim.z)
    this.aim.scale.setScalar(display.camera === 'overhead' ? 1.45 : 1)
    const cover = !!game.match && display.guides && (game.phase === 'outgoing' || game.phase === 'opponent')
    this.recovery.visible = !sample && (cover || game.drill === 'footwork' && (display.guides || game.phase === 'recover'))
    this.recovery.position.set(game.recoverySpot.x, .029, game.recoverySpot.z)
    this.recovery.scale.setScalar(game.plan ? game.recoverySize / .85 : 1)
    this.lanes.visible = !sample && cover && !!game.intercept
    if (this.lanes.visible) {
      const hit = game.intercept!.ball
      fillTrail(this.lanes, [vec(-COURT.singles, .06, COURT.service), vec(hit.x, .06, hit.z), vec(COURT.singles, .06, COURT.service)])
    }
    if ((game.plan || cover) && this.recovery.visible) labels.push({ key: 'recovery', text: cover ? 'Cover the angle' : 'Recovery ring',
      position: vec(game.recoverySpot.x - .5, .09, game.recoverySpot.z + .18) })
    this.landing.visible = !sample && !!game.lastLanding && display.guides
    if (game.lastLanding) this.landing.position.set(game.lastLanding.x, .034, game.lastLanding.z)
    if (this.landing.visible && game.lastLanding && game.lastCall && (game.phase === 'between' || Math.abs(game.lastCall.margin) < .35))
      labels.push({ key: 'landing', text: (game.lastCall.inside ? 'In' : 'Out') + ' · ' + lineDistance(game.lastCall),
        position: vec(game.lastLanding.x, .29, game.lastLanding.z) })
    const idle = game.phase === 'idle'
    const activeBall = ball ?? (idle ? display.preview : undefined)
    this.ball.visible = !!activeBall
    this.ballShadow.visible = this.ball.visible
    if (activeBall) {
      const position = activeBall.position
      this.ball.position.set(position.x, position.y, position.z)
      // Keep a regulation ball in close views and a visible ball at broadcast distance.
      this.ball.scale.setScalar(clamp(this.camera.position.distanceTo(this.ball.position) / 10, 1, 2.15))
      this.ball.rotation.set(activeBall.rotation.x, activeBall.rotation.y, activeBall.rotation.z)
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
        const name = hit.kind === 'court' ? 'Court bounce' : hit.kind === 'racket' ? 'Racket contact' : hit.kind === 'tape' ? 'Net cord' : 'Net impact'
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
    this.setEnd(0)
    this.venue.board()
    this.venue.flex(null, 0)
    this.venue.flag(display.conditions.wind, display.time * MOTION_DURATION[display.technique])
    this.lanes.visible = false
    const subject = this.demonstrator.root.position
    if (display.conditions.surface !== this.currentSurface) {
      this.currentSurface = display.conditions.surface
      this.venue.surface(display.conditions.surface)
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
    this.feetGuide.visible = this.bounceGuide.visible = this.contactGate.visible = false
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
      this.ball.scale.setScalar(1)
      this.ball.position.set(position.x, position.y, position.z)
      this.ball.rotation.x = (display.time - hitTime) * MOTION_DURATION[display.technique] * (volley || serve ? 35 : 180)
      this.demonstrator.trackBall(vec(position.x - origin.x, position.y, position.z - origin.z))
    }
    this.world.project(labels, this.camera, this.width, this.height)
    this.renderer.render(this.scene, this.camera)
  }

  private setEnd(end: number) {
    if (this.venue.venue.rotation.y === end * Math.PI) return
    this.venue.venue.rotation.y = end * Math.PI
    this.renderer.shadowMap.needsUpdate = true
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
    if (!display.replay && display.guides && game.showTarget) {
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
    if (!display.replay) dot(game.aim.x, game.aim.z, 8, '#dcf971', true)
    const player = display.replay?.player ?? game.player
    if (display.guides && !display.replay && game.phase === 'incoming' && game.receiveMark) {
      const { feet, bounce } = game.receiveMark
      dot(feet.x, feet.z, 9, '#9be2ef', true)
      if (bounce) dot(bounce.x, bounce.z, 4, '#ffc58c', true)
    }
    dot(player.x, player.z, 7, '#eef3df')
    const rival = display.replay?.opponent.position ?? game.opponent
    if (game.drill !== 'serve') dot(rival.x, rival.z, 6, '#dfb679')
    if (!display.replay && (game.drill === 'footwork' || game.match && display.guides && (game.phase === 'outgoing' || game.phase === 'opponent')))
      dot(game.recoverySpot.x, game.recoverySpot.z, 13, '#8ad4ea', true)
    const partner = game.partner
    const netPlayer = game.netOpponent
    if (partner) dot(partner.x, partner.z, 7, '#8ad4ea')
    if (netPlayer) dot(netPlayer.x, netPlayer.z, 7, '#dfb679')
    const ball = display.replay?.ball ?? display.demo?.ball ?? game.ball ?? game.opponentToss ?? display.preview
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
      this.view = new LiveCourt(canvas, onResize)
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

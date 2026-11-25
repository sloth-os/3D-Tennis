import * as THREE from 'three'
import type { Technique, Vec3 } from './config.ts'
import { GRIP_TO_STRINGS, samplePose, type MuscleGroup, type Pose } from './motion.ts'
import { MuscleRig } from './muscle-rig.ts'
import { canvasTexture } from './venue.ts'

const UP = new THREE.Vector3(0, 1, 0)
const mid = new THREE.Vector3()
const direction = new THREE.Vector3()
const sphere = new THREE.SphereGeometry(1, 16, 12)
const cylinders = new Map<string, THREE.CylinderGeometry>()

function material(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.86 })
}

function mesh(geometry: THREE.BufferGeometry, coat: THREE.Material, parent: THREE.Object3D) {
  const item = new THREE.Mesh(geometry, coat)
  item.receiveShadow = true
  parent.add(item)
  return item
}

function oval(parent: THREE.Object3D, coat: THREE.Material, x: number, y: number, z: number) {
  const item = mesh(sphere, coat, parent)
  item.scale.set(x, y, z)
  return item
}

function segment(parent: THREE.Object3D, coat: THREE.Material, base: number, top: number) {
  const key = `${base},${top}`
  let geometry = cylinders.get(key)
  if (!geometry) {
    geometry = new THREE.CylinderGeometry(top, base, 1, 12)
    cylinders.set(key, geometry)
  }
  return mesh(geometry, coat, parent)
}

function putBetween(item: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): void {
  direction.subVectors(to, from)
  item.position.copy(mid.addVectors(from, to).multiplyScalar(0.5))
  item.scale.y = Math.max(0.001, direction.length())
  item.quaternion.setFromUnitVectors(UP, direction.normalize())
}

function point(v: Vec3) { return new THREE.Vector3(v.x, v.y, v.z) }

export class Athlete {
  readonly root = new THREE.Group()
  readonly guide = new THREE.Group()
  private readonly hips: THREE.Mesh
  private readonly shirt: THREE.Mesh
  private readonly neck: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly racket = new THREE.Group()
  private readonly arms: ReturnType<Athlete['makeArm']>[]
  private readonly legs: ReturnType<Athlete['makeLeg']>[]
  private readonly guideLines: THREE.LineSegments
  private readonly dots: THREE.Mesh[]
  private readonly skin: THREE.MeshStandardMaterial
  private readonly jersey: THREE.MeshStandardMaterial
  private readonly shorts: THREE.MeshStandardMaterial
  private readonly trim: THREE.MeshStandardMaterial
  private readonly shoes = material(0xe5eadd)
  private readonly muscleRig: MuscleRig
  private readonly sportsCoats: [THREE.MeshStandardMaterial, number][]

  constructor(scene: THREE.Object3D, opponent = false) {
    this.skin = material(opponent ? 0xac7558 : 0xc69670)
    this.jersey = material(opponent ? 0xd19261 : 0xe7eef2)
    this.shorts = material(opponent ? 0x474654 : 0x243249)
    this.trim = material(opponent ? 0xf0ac6c : 0xc2e341)
    this.sportsCoats = [this.skin, this.jersey, this.shorts].map(coat => [coat, coat.color.getHex()])
    this.root.add(this.head, this.racket, this.guide)
    scene.add(this.root)

    this.hips = oval(this.root, this.shorts, .213, .145, .12)
    const silhouette = [[.161, -.232], [.179, -.213], [.163, -.118], [.177, .007],
      [.222, .128], [.229, .181], [.181, .223], [.086, .242], [.07, .243]]
    this.shirt = mesh(new THREE.LatheGeometry(silhouette.map(([r, y]) => new THREE.Vector2(r, y)), 28), this.jersey, this.root)
    this.shirt.scale.z = .67
    this.neck = oval(this.root, this.skin, .064, .084, .057)
    const face = material(opponent ? 0xae785d : 0xc79676)
    oval(this.head, face, .106, .141, .099)
    const hair = oval(this.head, material(0x272e28), .112, .081, .102)
    hair.position.set(0, .075, .012)
    const nose = oval(this.head, face, .027, .036, .024)
    nose.position.set(0, -.016, -.092)
    const band = oval(this.head, this.trim, .114, .031, .105)
    band.position.y = .058
    for (const sign of [-1, 1]) {
      const ear = oval(this.head, face, .021, .031, .02)
      ear.position.set(.106 * sign, -.009, 0)
    }
    this.arms = [this.makeArm(), this.makeArm()]
    this.legs = [this.makeLeg(), this.makeLeg()]
    this.buildRacket()
    this.muscleRig = new MuscleRig(this.root)
    const facial = material(0x2a2330)
    for (const sign of [-1, 1]) {
      const eye = oval(this.head, material(0xcebaa4), .021, .009, .007)
      eye.position.set(sign * .039, .019, -.094)
      const pupil = oval(this.head, facial, .008, .007, .005)
      pupil.position.set(sign * .039, .018, -.102)
    }
    const mouth = oval(this.head, facial, .025, .004, .007)
    mouth.position.set(0, -.061, -.089)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.074, .008, 8, 24), this.trim)
    collar.rotateX(Math.PI / 2)
    collar.position.y = .239
    this.shirt.add(collar)
    const badge = canvasTexture(128, 64, ctx => {
      ctx.fillStyle = '#e2fb63'
      ctx.fillRect(10, 15, 20, 34)
      ctx.fillStyle = '#263142'
      ctx.font = 'bold 19px sans-serif'
      ctx.fillText('B/L', 41, 40)
    })
    const shirtLogo = new THREE.Mesh(new THREE.PlaneGeometry(.181, .081), new THREE.MeshBasicMaterial({ map: badge, transparent: true }))
    shirtLogo.position.set(0, .105, -.23)
    shirtLogo.rotation.y = Math.PI
    this.shirt.add(shirtLogo)

    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 2 * 3), 3))
    this.guideLines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({
      color: 0xe6ff69, depthTest: false, transparent: true, opacity: .72,
    }))
    this.guideLines.frustumCulled = false
    this.guideLines.renderOrder = 10
    this.guide.add(this.guideLines)
    const guideCoat = new THREE.MeshBasicMaterial({ color: 0xe9ff7e, depthTest: false })
    this.dots = Array.from({ length: 13 }, () => {
      const dot = new THREE.Mesh(sphere, guideCoat)
      dot.scale.setScalar(.029)
      dot.renderOrder = 11
      this.guide.add(dot)
      return dot
    })
    this.guide.visible = false
    this.pose('forehand', 0)
  }

  private makeArm() {
    return {
      shoulder: oval(this.root, this.jersey, .083, .085, .083),
      sleeve: segment(this.root, this.jersey, .076, .064),
      upper: segment(this.root, this.skin, .064, .047),
      elbow: oval(this.root, this.skin, .047, .047, .047),
      forearm: segment(this.root, this.skin, .046, .030),
      palm: oval(this.root, this.skin, .041, .052, .037),
    }
  }

  private makeLeg() {
    return {
      shorts: segment(this.root, this.shorts, .100, .082),
      thigh: segment(this.root, this.skin, .077, .054),
      knee: oval(this.root, this.skin, .058, .059, .055),
      calf: segment(this.root, this.skin, .061, .038),
      sock: segment(this.root, this.shoes, .044, .044),
      shoe: oval(this.root, this.shoes, .064, .054, .139),
      sole: oval(this.root, this.trim, .066, .022, .14),
    }
  }

  private buildRacket(): void {
    const hoopMaterial = material(0xb9d545)
    const grip = mesh(new THREE.CylinderGeometry(.021, .024, .17, 10), material(0x263630), this.racket)
    grip.position.y = .037
    const shaft = mesh(new THREE.CylinderGeometry(.012, .015, .192, 9), hoopMaterial, this.racket)
    shaft.position.y = .162
    const head = mesh(new THREE.TorusGeometry(.125, .0105, 8, 32), hoopMaterial, this.racket)
    head.scale.y = 1.30
    head.position.y = GRIP_TO_STRINGS
    const strings = []
    for (let x = -0.105; x <= .106; x += .02625) {
      const half = .158 * Math.sqrt(1 - (x / .125) ** 2)
      strings.push(x, GRIP_TO_STRINGS - half, 0, x, GRIP_TO_STRINGS + half, 0)
    }
    for (let y = -0.132; y <= .133; y += .0264) {
      const half = .121 * Math.sqrt(1 - (y / .163) ** 2)
      strings.push(-half, GRIP_TO_STRINGS + y, 0, half, GRIP_TO_STRINGS + y, 0)
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(strings, 3))
    this.racket.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xb7c7ac, transparent: true, opacity: .68 })))
  }

  pose(technique: Technique, progress: number): void {
    this.applyPose(samplePose(technique, progress))
  }

  applyPose(pose: Pose, anatomy?: { focus: MuscleGroup; emphasis: MuscleGroup }): void {
    const { chestYaw, hipYaw, lean } = pose
    this.hips.position.copy(point(pose.hips))
    this.hips.rotation.y = hipYaw
    this.shirt.position.copy(point(pose.torso))
    this.shirt.rotation.set(.08, chestYaw, -lean)
    this.neck.position.copy(point(pose.neck))
    this.head.position.copy(point(pose.head))
    this.head.rotation.y = chestYaw * .28

    this.muscleRig.root.visible = !!anatomy
    for (const [coat, uniform] of this.sportsCoats) coat.color.setHex(anatomy ? 0x59617a : uniform)
    if (anatomy) this.muscleRig.update(pose, anatomy.focus, anatomy.emphasis)

    const points = [this.hips.position, this.shirt.position, this.head.position]
    for (const [index, sign] of [1, -1].entries()) {
      const arm = this.arms[index]
      const { shoulder, elbow, hand } = pose.arms[index]
      const a = point(shoulder), b = point(elbow), c = point(hand)
      const sleeveEnd = a.clone().lerp(b, .44)
      arm.shoulder.position.copy(a)
      putBetween(arm.sleeve, a, sleeveEnd)
      putBetween(arm.upper, sleeveEnd, b)
      arm.elbow.position.copy(b)
      putBetween(arm.forearm, b, c)
      arm.palm.position.copy(c)
      points.push(a, b, c)

      const leg = this.legs[index]
      const hip = point(pose.legs[index].hip), knee = point(pose.legs[index].knee), ankle = point(pose.legs[index].ankle)
      const hem = hip.clone().lerp(knee, .69)
      putBetween(leg.shorts, hip, hem)
      putBetween(leg.thigh, hem, knee)
      leg.knee.position.copy(knee)
      const sock = ankle.clone().lerp(knee, .22)
      putBetween(leg.calf, knee, sock)
      putBetween(leg.sock, sock, ankle)
      leg.shoe.position.copy(ankle).add(new THREE.Vector3(0, -.064, -.067))
      leg.sole.position.copy(leg.shoe.position).y -= .035
      leg.shoe.rotation.y = sign * -.13 + hipYaw * .16
      leg.sole.rotation.y = leg.shoe.rotation.y
      points.push(knee, ankle)
    }
    this.racket.position.copy(point(pose.arms[0].hand))
    this.racket.quaternion.setFromUnitVectors(UP, point(pose.shaft))
    this.racket.rotateY(.3 + chestYaw * .56)
    if (this.guide.visible) {
      const links = [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [0, 6], [6, 7],
        [1, 8], [8, 9], [9, 10], [0, 11], [11, 12], [3, 8], [6, 11]]
      const positions = this.guideLines.geometry.getAttribute('position')
      for (const [index, link] of links.entries()) {
        link.forEach((key, side) => positions.setXYZ(index * 2 + side, points[key].x, points[key].y, points[key].z))
      }
      positions.needsUpdate = true
      this.dots.forEach((dot, index) => dot.position.copy(points[index]))
    }
  }
}

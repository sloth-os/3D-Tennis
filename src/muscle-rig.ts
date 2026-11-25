import * as THREE from 'three'
import { MUSCLES, add, mix, vec, type MuscleGroup, type Pose } from './motion.ts'
import type { Vec3 } from './config.ts'
import { canvasTexture } from './venue.ts'

const axis = new THREE.Vector3(0, 1, 0)
const direction = new THREE.Vector3()
const bare = new THREE.Color(0x402b35)
const groups = Object.keys(MUSCLES) as MuscleGroup[]

type Fiber = { mesh: THREE.Mesh; width: number; depth: number }

function shape() {
  const points = []
  for (let ring = 0; ring <= 16; ring += 1) {
    const t = ring / 16
    const width = .06 + .94 * Math.sin(t ** .87 * Math.PI) ** 1.20
    points.push(new THREE.Vector2(width, t - .5))
  }
  return new THREE.LatheGeometry(points, 16)
}

export class MuscleRig {
  readonly root = new THREE.Group()
  private readonly mats: Record<MuscleGroup, THREE.MeshStandardMaterial>
  private readonly fibers: Fiber[][]

  constructor(parent: THREE.Group) {
    parent.add(this.root)
    this.root.visible = false
    const texture = canvasTexture(128, 256, ctx => {
      ctx.fillStyle = '#c08694'
      ctx.fillRect(0, 0, 128, 256)
      for (let i = 0; i < 55; i += 1) {
        const x = i * 2.4
        ctx.strokeStyle = i % 3 === 0 ? '#ffe2d89a' : '#35213791'
        ctx.lineWidth = i % 5 === 0 ? 1.5 : .65
        ctx.beginPath()
        ctx.moveTo(x - 6, 0)
        ctx.bezierCurveTo(x + 16, 80, x - 12, 194, x + 5, 256)
        ctx.stroke()
      }
    })
    this.mats = Object.fromEntries(groups.map(group => [group, new THREE.MeshStandardMaterial({
      map: texture, color: MUSCLES[group].color, emissive: MUSCLES[group].color, emissiveIntensity: .15, roughness: .60,
    })])) as typeof this.mats
    const geometry = shape()
    const fiber = (group: MuscleGroup, width: number, depth: number) => {
      const mesh = new THREE.Mesh(geometry, this.mats[group])
      this.root.add(mesh)
      return { mesh, width, depth }
    }
    this.fibers = [1, -1].map(() => [
      fiber('legs', .080, .056), fiber('legs', .062, .050), fiber('legs', .067, .052), fiber('legs', .078, .056),
      fiber('core', .094, .058), fiber('core', .083, .042), fiber('core', .071, .050), fiber('core', .047, .041),
      fiber('arm', .059, .061), fiber('arm', .055, .045), fiber('arm', .043, .036),
    ])
  }

  update(pose: Pose, focus: MuscleGroup, emphasis: MuscleGroup): void {
    this.root.visible = true
    for (const group of groups) {
      const main = group === focus
      const working = group === emphasis
      this.mats[group].color.copy(bare).lerp(new THREE.Color(MUSCLES[group].color), main ? .90 : working ? .64 : .38)
      this.mats[group].emissiveIntensity = main ? .32 : working ? .19 : .055
    }
    for (const [side, sign] of [1, -1].entries()) {
      const { hip, knee, ankle } = pose.legs[side]
      const { shoulder, elbow, hand } = pose.arms[side]
      const parts = this.fibers[side]
      const trunk = (point: Vec3, angle: number) => add(pose.torso, vec(
        point.x * Math.cos(angle) + point.z * Math.sin(angle), point.y,
        point.z * Math.cos(angle) - point.x * Math.sin(angle)))
      const twist = pose.chestYaw
      const attach = (i: number, a: Vec3, b: Vec3, stretch = 1) => {
        const fiber = parts[i]
        direction.set(b.x - a.x, b.y - a.y, b.z - a.z)
        const mid = mix(a, b, .5)
        fiber.mesh.position.set(mid.x, mid.y, mid.z)
        fiber.mesh.scale.set(fiber.width * stretch, direction.length(), fiber.depth * stretch)
        fiber.mesh.quaternion.setFromUnitVectors(axis, direction.normalize())
      }
      const front = vec(0, 0, -.067)
      const back = vec(0, 0, .045)
      attach(0, add(mix(hip, knee, .08), front), add(mix(hip, knee, .98), vec(sign * -.024, 0, -.041)), emphasis === 'legs' ? 1.12 : 1)
      attach(1, add(mix(hip, knee, .13), back), add(mix(hip, knee, .92), back))
      attach(2, add(knee, vec(sign * .016, -.015, .052)), add(mix(knee, ankle, .82), vec(0, 0, .025)))
      attach(3, add(hip, vec(sign * -.044, .12, .069)), add(mix(hip, knee, .26), vec(sign * .04, 0, .031)))
      attach(4, trunk(vec(sign * .044, .13, -.116), twist), add(shoulder, vec(0, -.034, -.062)))
      attach(5, trunk(vec(sign * .115, -.19, -.10), twist * .64), trunk(vec(sign * .213, .05, -.041), twist), emphasis === 'core' ? 1.12 : 1)
      attach(6, trunk(vec(sign * .085, -.17, .10), twist * .63), trunk(vec(sign * .193, .15, .083), twist))
      attach(7, trunk(vec(sign * .055, -.22, -.103), twist * .62), trunk(vec(sign * .052, .075, -.137), twist))
      attach(8, add(shoulder, vec(sign * .024, .045, .013)), add(mix(shoulder, elbow, .53), vec(sign * .022, 0, 0)), emphasis === 'arm' ? 1.1 : 1)
      attach(9, add(mix(shoulder, elbow, .22), vec(sign * .020, 0, .032)), add(elbow, vec(sign * .011, 0, .018)))
      attach(10, add(mix(elbow, hand, .05), vec(0, 0, -.020)), mix(elbow, hand, .89))
    }
  }
}

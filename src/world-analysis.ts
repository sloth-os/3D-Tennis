import * as THREE from 'three'
import type { Vec3 } from './config.ts'
import { MUSCLES, magnitude, type MuscleGroup } from './motion.ts'

import { FORCE_COLORS } from './analysis-colors.ts'
export type LabelKey = 'target' | 'contact' | 'height' | 'gravity' | 'drag' | 'magnus' | 'impact' | 'partner' | 'recovery' | 'stance' | 'landing' | 'net-player' | MuscleGroup
export interface WorldLabel { key: LabelKey; text: string; position: Vec3 }
export type BodyState = ReturnType<typeof import('./motion.ts').analyzeMotion>
export type FlightForces = ReturnType<typeof import('./physics.ts').flightForces>


class VectorArrow {
  readonly root = new THREE.Group()
  private readonly shaft: THREE.Mesh
  private readonly head: THREE.Mesh
  private readonly paint = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  private readonly axis = new THREE.Vector3(0, 1, 0)
  private readonly direction = new THREE.Vector3()

  constructor(parent: THREE.Group, stem: THREE.BufferGeometry, cone: THREE.BufferGeometry) {
    this.shaft = new THREE.Mesh(stem, this.paint)
    this.head = new THREE.Mesh(cone, this.paint)
    this.root.add(this.shaft, this.head)
    parent.add(this.root)
  }

  place(origin: Vec3, direction: Vec3, length: number, width: number, color: string) {
    const size = magnitude(direction)
    this.root.visible = size > .000001 && length > .035
    if (!this.root.visible) return
    this.paint.color.setStyle(color)
    this.root.position.set(origin.x, origin.y, origin.z)
    this.direction.set(direction.x / size, direction.y / size, direction.z / size)
    this.root.quaternion.setFromUnitVectors(this.axis, this.direction)
    const arrowhead = Math.min(length * .38, width * 5.7)
    this.shaft.scale.set(width, length - arrowhead, width)
    this.shaft.position.y = (length - arrowhead) / 2
    this.head.scale.set(width * 2.8, arrowhead, width * 2.8)
    this.head.position.y = length - arrowhead / 2
  }
}

export class WorldAnalysis {
  private readonly root = new THREE.Group()
  private readonly arrows: VectorArrow[]
  private readonly pads: THREE.Mesh[]
  private readonly central: THREE.Mesh
  private readonly connector: THREE.Line
  private readonly ping: THREE.Mesh
  private readonly labelNodes = new Map<LabelKey, HTMLButtonElement>()
  private readonly projection = new THREE.Vector3()
  private labelHost: HTMLElement | null = null

  constructor(scene: THREE.Scene) {
    scene.add(this.root)
    const tube = new THREE.CylinderGeometry(1, 1, 1, 9)
    const cone = new THREE.ConeGeometry(1, 1, 12)
    this.arrows = Array.from({ length: 6 }, () => new VectorArrow(this.root, tube, cone))
    this.pads = [1, -1].map(() => {
      const pad = new THREE.Mesh(new THREE.RingGeometry(.84, 1, 48), new THREE.MeshBasicMaterial({
        color: MUSCLES.legs.color, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: .81, depthWrite: false,
      }))
      pad.rotation.x = -Math.PI / 2
      this.root.add(pad)
      return pad
    })
    this.central = new THREE.Mesh(new THREE.SphereGeometry(.034, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xfbe387, toneMapped: false, depthTest: false }))
    this.central.renderOrder = 8
    this.connector = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(6).fill(0), 3)),
      new THREE.LineDashedMaterial({ color: 0xfbe387, transparent: true, opacity: .57, dashSize: .045, gapSize: .052 }))
    this.connector.frustumCulled = false
    this.ping = new THREE.Mesh(new THREE.RingGeometry(.91, 1, 48), new THREE.MeshBasicMaterial({
      color: FORCE_COLORS.impact, toneMapped: false, transparent: true, opacity: .8, depthWrite: false,
    }))
    this.ping.rotation.x = -Math.PI / 2
    this.root.add(this.central, this.connector, this.ping)
    this.clear()
  }

  attach(host: HTMLElement) {
    this.labelHost = host
    for (const button of this.labelNodes.values()) host.append(button)
  }

  clear() {
    this.arrows.forEach(arrow => { arrow.root.visible = false })
    this.pads.forEach(pad => { pad.visible = false })
    this.central.visible = this.connector.visible = this.ping.visible = false
  }

  flight(origin: Vec3, forces: FlightForces, loud: boolean, labels: WorldLabel[]) {
    const keys = ['gravity', 'drag', 'magnus'] as const
    const shift = loud ? .16 : .11
    for (const [i, key] of keys.entries()) {
      const force = forces[key]
      const length = Math.min(1.8, Math.sqrt(magnitude(force)) * 1.65)
      const offset = { x: origin.x + (i - 1) * shift, y: origin.y + .035 * i, z: origin.z }
      this.arrows[i].place(offset, force, length, .021, FORCE_COLORS[key])
      if (length < .16 || !loud) continue
      const scale = length / magnitude(force)
      const position = { x: offset.x + force.x * scale + (i - 1) * .32, y: Math.max(.13, offset.y + force.y * scale), z: offset.z + force.z * scale }
      labels.push({ key, text: `${{ gravity: 'Weight', drag: 'Drag', magnus: 'Magnus' }[key]} ${magnitude(force).toFixed(2)} N`, position })
    }
  }

  impact(origin: Vec3, before: Vec3, after: Vec3, average: Vec3, kind: string, time: number, labels: WorldLabel[]) {
    this.arrows[0].place({ ...origin, x: origin.x - .15 }, before, Math.min(2.8, magnitude(before) * .078), .024, FORCE_COLORS.incoming)
    this.arrows[1].place({ ...origin, x: origin.x + .16 }, after, Math.min(3, magnitude(after) * .078), .030, FORCE_COLORS.outgoing)
    this.arrows[2].place({ ...origin, y: origin.y + .08 }, average, Math.min(3.1, Math.sqrt(magnitude(average)) * .15), .035, FORCE_COLORS.impact)
    this.ping.visible = true
    this.ping.position.set(origin.x, .036, origin.z)
    this.ping.scale.setScalar(.34 + Math.min(time, .58) * 1.35)
    const position = { ...origin, y: Math.max(.42, origin.y + .47) }
    labels.push({ key: 'impact', text: `${kind} · ${Math.round(magnitude(average))} N avg`, position })
  }

  body(origin: Vec3, feet: readonly Vec3[], state: BodyState, roles: Record<MuscleGroup, Vec3>, labels: WorldLabel[]) {
    const stage = (v: Vec3) => ({ x: v.x + origin.x, y: v.y + origin.y, z: v.z + origin.z })
    for (const [i, force] of [state.right, state.left].entries()) {
      const start = stage(feet[i])
      if (force.y > 10) {
        const length = Math.min(1.36, force.y / 570)
        this.arrows[i].place({ ...start, y: .043, z: start.z + .06 }, force, length, .017, MUSCLES.legs.color)
        this.pads[i].visible = true
        this.pads[i].position.set(start.x, .031, start.z)
        this.pads[i].scale.setScalar(.097 + Math.min(.13, force.y / 4900))
      }
    }
    this.central.position.set(...Object.values(stage(state.center)) as [number, number, number])
    this.central.visible = this.connector.visible = true
    const line = this.connector.geometry.getAttribute('position')
    line.setXYZ(0, this.central.position.x, .032, this.central.position.z)
    line.setXYZ(1, this.central.position.x, this.central.position.y, this.central.position.z)
    line.needsUpdate = true
    this.connector.computeLineDistances()
    const names: Record<MuscleGroup, string> = {
      legs: `Knee ${Math.round(state.knee)}°`,
      core: `Turn ${Math.round(state.separation)}°`,
      arm: `Elbow ${Math.round(state.elbow)}°`,
    }
    for (const key of Object.keys(names) as MuscleGroup[]) labels.push({ key, text: names[key], position: stage(roles[key]) })
  }

  project(labels: WorldLabel[], camera: THREE.Camera, width: number, height: number) {
    const used = new Set<LabelKey>()
    const placed: { x: number; y: number; half: number }[] = []
    for (const { key, text, position } of labels) {
      if (used.has(key)) continue
      used.add(key)
      const projected = this.projection.set(position.x, position.y, position.z).project(camera)
      let node = this.labelNodes.get(key)
      if (!node && this.labelHost) {
        node = document.createElement('button')
        node.type = 'button'
        node.className = 'world-label'
        node.dataset.marker = key
        this.labelHost.append(node)
        this.labelNodes.set(key, node)
      }
      if (!node) continue
      const x = (projected.x + 1) * width / 2
      const y = (1 - projected.y) * height / 2
      node.hidden = projected.z < -1 || projected.z > 1 || x < 34 || x > width - 34 || y < 32 || y > height - 100
      if (!node.hidden) {
        if (node.textContent !== text) node.textContent = text
        const half = Math.min(width / 2 - 4, text.length * (width < 650 ? 2.55 : 2.95) + 12)
        const left = Math.min(width - half - 4, Math.max(half + 4, x))
        let top = y
        for (let count = 0; count < placed.length && placed.some(other => Math.abs(other.x - left) < other.half + half + 4 && Math.abs(other.y - top) < 22); count++) top -= 23
        if (top < 24) { node.hidden = true; continue }
        placed.push({ x: left, y: top, half })
        node.style.setProperty('--leader', Math.round(y - top + 9) + 'px')
        node.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0) translate(-50%,-100%)`
      }
    }
    for (const [key, node] of this.labelNodes) if (!used.has(key)) node.hidden = true
  }
}

import * as THREE from 'three'
import { COURT, SURFACES, type Surface } from './config.ts'
import { netHeight, type Contact } from './physics.ts'
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js'
import parkURL from './assets/northwood-park.webp'
import grassURL from './assets/grass-ground.webp'

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function floor(width: number, depth: number, material: THREE.Material, x = 0, z = 0, y = 0) {
  const item = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
  item.rotation.x = -Math.PI / 2
  item.position.set(x, y, z)
  item.receiveShadow = true
  return item
}

function coat(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .91, ...options })
}

function volume(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

const n = seeded(8731)
const range = (min: number, max: number) => min + n() * (max - min)
const pose = new THREE.Object3D()

function createPark(scene: THREE.Group, onReady: () => void) {
  const panorama = new THREE.TextureLoader().load(parkURL, onReady)
  panorama.colorSpace = THREE.SRGBColorSpace
  panorama.anisotropy = 4
  const dome = new GroundedSkybox(panorama, 4.6, 96, 48)
  dome.position.y = 4.49
  dome.rotation.y = 1.82
  dome.material.toneMapped = false
  dome.material.fog = false
  dome.renderOrder = -100
  scene.add(dome)
  const grass = new THREE.TextureLoader().load(grassURL, onReady)
  grass.colorSpace = THREE.SRGBColorSpace
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping
  grass.repeat.set(29, 37)
  grass.anisotropy = 8
  const lawn = new THREE.PlaneGeometry(66, 85, 16, 18)
  const positions = lawn.getAttribute('position')
  const colors: number[] = []
  for (let i = 0; i < positions.count; i++) {
    const edge = Math.min(33 - Math.abs(positions.getX(i)), 42.5 - Math.abs(positions.getY(i)))
    colors.push(1, 1, 1, Math.min(1, edge / 8))
  }
  lawn.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  const verge = new THREE.Mesh(lawn, coat(0xd6dfa6, { map: grass, vertexColors: true, transparent: true, depthWrite: false }))
  verge.position.y = -.092
  verge.rotation.x = -Math.PI / 2
  verge.renderOrder = -1
  verge.receiveShadow = true
  scene.add(verge)
}

function noiseTexture(x: number, y: number) {
  const texture = canvasTexture(128, 128, ctx => {
    const noise = seeded(602)
    const data = ctx.createImageData(128, 128)
    for (let i = 0; i < data.data.length; i += 4) {
      const random = noise()
      const grain = random > .994 ? 164 : Math.floor(222 + random * 31)
      data.data[i] = grain
      data.data[i + 1] = grain
      data.data[i + 2] = grain
      data.data[i + 3] = 255
    }
    ctx.putImageData(data, 0, 0)
  })
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(x, y)
  return texture
}

function createGround(scene: THREE.Group) {
  const gravel = coat(0x62705c, { map: noiseTexture(13, 24) })
  scene.add(floor(21.8, 41.9, gravel, 0, -.35, -.067))
  scene.add(floor(2.8, 48, coat(0x7f806a, { map: noiseTexture(3, 20) }), 10.3, -4, -.066))
  scene.add(floor(30, 2.8, gravel, 0, -20.9, -.065))
  const edge = coat(0x758173)
  scene.add(volume(17.55, .117, 37.8, edge, 0, -.07, 0))
  const apron = coat(SURFACES.hard.apron, { map: noiseTexture(12, 24) })
  const grit = noiseTexture(8, 18)
  const turf = canvasTexture(256, 768, ctx => {
    const random = seeded(177)
    const data = ctx.createImageData(256, 768)
    for (let y = 0; y < 768; y += 1) {
      const stripe = Math.floor(y / 48) % 2
      for (let x = 0; x < 256; x += 1) {
        const intensity = 213 + stripe * 17 + Math.round(random() * 23)
        const wear = Math.exp(-(((x - 128) / 70) ** 2 + (Math.min(y, 767 - y) / 19) ** 2)) * (.43 + .52 * random())
        const offset = (y * 256 + x) * 4
        data.data.set([Math.min(255, intensity + 43 * wear), intensity - 40 * wear, intensity - 91 * wear, 255], offset)
      }
    }
    ctx.putImageData(data, 0, 0)
  })
  const clay = canvasTexture(384, 1024, ctx => {
    const random = seeded(575)
    ctx.fillStyle = '#eee4dc'; ctx.fillRect(0, 0, 384, 1024)
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = i % 3 ? '#75493216' : '#fff7d842'
      ctx.fillRect(random() * 384, random() * 1024, 1 + random() * 2, .8)
    }
    for (let i = 0; i < 105; i++) {
      const y = random() * 1024, x = random() * 384
      ctx.strokeStyle = i % 3 ? '#7d51370e' : '#fff6df48'; ctx.lineWidth = .7 + random()
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 12, y - 1, x + 23 + random() * 15, y + 2); ctx.stroke()
    }
  })
  const paint = coat(SURFACES.hard.paint, { map: grit })
  const alley = coat(SURFACES.hard.paint, { map: grit })
  alley.color.multiplyScalar(.88)
  scene.add(floor(17.4, 37.6, apron, 0, 0, -.005))
  scene.add(floor(COURT.doubles * 2, COURT.halfLength * 2, alley, 0, 0, .002))
  scene.add(floor(COURT.singles * 2, COURT.halfLength * 2, paint, 0, 0, .007))
  const line = coat(0xe5eadb)
  const w = .0508
  for (const sign of [-1, 1]) {
    scene.add(floor(COURT.doubles * 2, .076, line, 0, sign * (COURT.halfLength - .038), .012))
    scene.add(floor(w, COURT.halfLength * 2, line, sign * (COURT.doubles - w / 2), 0, .012))
    scene.add(floor(w, COURT.halfLength * 2, line, sign * (COURT.singles - w / 2), 0, .012))
    scene.add(floor(COURT.singles * 2, w, line, 0, sign * (COURT.service - w / 2), .012))
    scene.add(floor(w, .13, line, 0, sign * (COURT.halfLength - .11), .013))
  }
  scene.add(floor(w, COURT.service * 2, line, 0, 0, .012))
  return (surface: Surface) => {
    paint.color.setHex(SURFACES[surface].paint)
    paint.map = alley.map = surface === 'grass' ? turf : surface === 'clay' ? clay : grit
    alley.color.copy(paint.color).multiplyScalar(.88)
    apron.color.setHex(SURFACES[surface].apron)
  }
}

function createNet(scene: THREE.Group) {
  const netTexture = canvasTexture(1024, 96, ctx => {
    ctx.strokeStyle = '#162d2a'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < 1024; x += 8) { ctx.moveTo(x, 0); ctx.lineTo(x, 96) }
    for (let y = 1; y < 96; y += 6) { ctx.moveTo(0, y); ctx.lineTo(1024, y) }
    ctx.stroke()
  })
  const uv: number[] = []
  const indices: number[] = []
  const tape: number[] = []
  for (let i = 0; i <= 64; i += 1) {
    const x = (i / 64 * 2 - 1) * COURT.postX
    const height = netHeight(x)
    tape.push(x, height - .061, -.013, x, height + .006, -.013)
    uv.push(i / 64, 0, i / 64, 1)
    if (i > 0) indices.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2, i * 2 + 1, i * 2 - 1)
  }
  const sheet = (position: number[]) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }
  const netting = new THREE.PlaneGeometry(COURT.postX * 2, 1, 64, 8)
  const knots = netting.getAttribute('position')
  for (let i = 0; i < knots.count; i++) knots.setY(i, .02 + (knots.getY(i) + .5) * (netHeight(knots.getX(i)) - .02))
  const mesh = new THREE.Mesh(netting, new THREE.MeshBasicMaterial({
    map: netTexture, side: THREE.DoubleSide, alphaTest: .32, transparent: true, opacity: .84,
  }))
  mesh.renderOrder = 2
  scene.add(mesh)
  const edge = new THREE.Mesh(sheet(tape), coat(0xe2e2d0, { side: THREE.DoubleSide }))
  edge.receiveShadow = true
  scene.add(edge)
  const top = tape.filter((_, index) => index % 6 >= 3)
  const thread = new THREE.Line(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute(top, 3)), new THREE.LineBasicMaterial({ color: 0xf4f0d8 }))
  scene.add(thread)
  const posts = coat(0x304b42, { metalness: .36, roughness: .55 })
  for (const sign of [-1, 1]) {
    scene.add(volume(.15, 1.145, .155, posts, sign * COURT.postX, .572, 0))
    scene.add(volume(.192, .054, .192, coat(0xbdc4a6), sign * COURT.postX, 1.13, 0))
    scene.add(volume(.25, .031, .25, posts, sign * COURT.postX, .017, 0))
    scene.add(volume(.036, COURT.netPost, .039, posts, sign * COURT.stickX, COURT.netPost / 2, .019))
  }
  scene.add(volume(.047, .914, .029, coat(0xe2e2ce), 0, .457, .003))
  const parts = [mesh, edge, thread].map(part => {
    const positions = part.geometry.getAttribute('position')
    return { positions, rest: positions.clone() }
  })
  let flexed = false
  return (strike: { contact: Contact; age: number } | null | undefined, end: number) => {
    const active = !!strike && strike.age >= 0 && strike.age < .57
    if (!active && !flexed) return
    flexed = active
    const direction = end ? -1 : 1
    for (const { positions, rest } of parts) {
      for (let i = 0; i < rest.count; i++) {
        let bend = 0
        if (active && strike) {
          const dx = rest.getX(i) - strike.contact.position.x * direction
          const dy = rest.getY(i) - strike.contact.position.y
          const t = Math.max(0, strike.age - Math.abs(dx) / 17)
          const kick = Math.min(.37, Math.abs(strike.contact.before.z) / 55)
          bend = Math.sin(39 * t) * Math.exp(-t * 9 - dx * dx * 1.2 - dy * dy * 3)
            * kick * Math.sign(strike.contact.before.z) * direction
        }
        positions.setZ(i, rest.getZ(i) + bend)
      }
      positions.needsUpdate = true
    }
  }
}

function createFence(scene: THREE.Group) {
  const pipe = coat(0x394f45, { metalness: .42 })
  const panel = canvasTexture(128, 128, ctx => {
    ctx.strokeStyle = '#294638'
    ctx.lineWidth = 1.0
    for (let offset = -128; offset <= 128; offset += 8) {
      ctx.beginPath()
      ctx.moveTo(offset, 0)
      ctx.lineTo(offset + 128, 128)
      ctx.moveTo(offset + 128, 0)
      ctx.lineTo(offset, 128)
      ctx.stroke()
    }
  })
  const screen = (width: number, height: number) => {
    const texture = panel.clone()
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(width * .46, height * .46)
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
      map: texture, alphaTest: .30, opacity: .52, transparent: true, side: THREE.DoubleSide,
    }))
  }
  const farEnd = -18.05
  const side = 8.74
  const cloth = canvasTexture(512, 128, ctx => {
    const shade = ctx.createLinearGradient(0, 0, 0, 128)
    shade.addColorStop(0, '#25483e'); shade.addColorStop(.46, '#33594c'); shade.addColorStop(1, '#23483f')
    ctx.fillStyle = shade; ctx.fillRect(0, 0, 512, 128)
    for (let x = 0; x < 512; x += 3) {
      ctx.fillStyle = x % 2 ? '#cbd4b70a' : '#142b261a'; ctx.fillRect(x, 0, 1, 128)
    }
    for (const y of [4, 123]) {
      ctx.fillStyle = '#96a595'; ctx.fillRect(0, y, 512, 1)
      for (let x = 6; x < 512; x += 48) {
        ctx.fillStyle = '#a1aca0'; ctx.fillRect(x, y - 1, 3, 3)
        ctx.fillStyle = '#273d34'; ctx.fillRect(x + 1, y, 1, 1)
      }
    }
  })
  const scrim = new THREE.Mesh(new THREE.PlaneGeometry(16.98, 1.74),
    coat(0xe0e7db, { map: cloth, side: THREE.DoubleSide, roughness: .99 }))
  scrim.position.set(0, 1.20, farEnd + .035)
  scene.add(scrim)
  const rear = screen(side * 2, 3.55)
  rear.position.set(0, 1.82, farEnd)
  scene.add(rear)
  scene.add(volume(side * 2, .05, .064, pipe, 0, 3.60, farEnd))
  scene.add(volume(side * 2, .055, .064, pipe, 0, .10, farEnd))
  for (let x = -side; x <= side + .01; x += side / 3) {
    scene.add(volume(.092, 3.68, .091, pipe, x, 1.83, farEnd))
  }
  for (const sign of [-1, 1]) {
    const last = sign === 1 ? 10.5 : 17.75
    const span = last - farEnd
    const fence = screen(span, 2.6)
    fence.rotateY(Math.PI / 2)
    fence.position.set(sign * side, 1.33, (farEnd + last) / 2)
    scene.add(fence)
    scene.add(volume(.067, .065, span, pipe, sign * side, 2.65, (farEnd + last) / 2))
    scene.add(volume(.05, .05, span, pipe, sign * side, .10, (farEnd + last) / 2))
    for (let z = farEnd + 4.5; z <= last + .2; z += 4.5) {
      scene.add(volume(.087, 2.69, .091, pipe, sign * side, 1.345, Math.min(z, last)))
    }
  }

  const signMap = canvasTexture(768, 156, ctx => {
    ctx.fillStyle = '#1c3a34'
    ctx.fillRect(0, 0, 768, 156)
    ctx.strokeStyle = '#739080'
    ctx.lineWidth = 3
    ctx.strokeRect(10, 10, 748, 136)
    ctx.fillStyle = '#d9f36f'
    ctx.font = 'bold 57px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('BASELINE', 384, 78)
    ctx.font = '19px Arial, sans-serif'
    ctx.letterSpacing = '7px'
    ctx.fillStyle = '#b9c9ab'
    ctx.fillText('TRAINING COURTS', 384, 120)
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 1.037), new THREE.MeshBasicMaterial({
    map: signMap, side: THREE.DoubleSide,
  }))
  sign.position.set(-.7, 1.76, farEnd + .064)
  scene.add(sign)
  const courtTag = canvasTexture(256, 168, ctx => {
    ctx.fillStyle = '#829976'
    ctx.fillRect(0, 0, 256, 168)
    ctx.fillStyle = '#203b33'
    ctx.textAlign = 'center'
    ctx.font = 'bold 104px Arial, sans-serif'
    ctx.fillText('01', 128, 123)
  })
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(.91, .59), new THREE.MeshBasicMaterial({ map: courtTag }))
  tag.position.set(5.55, 2.03, farEnd + .07)
  scene.add(tag)
  const boardCanvas = signMap.image as HTMLCanvasElement
  const ctx = boardCanvas.getContext('2d')!
  const club = ctx.getImageData(0, 0, boardCanvas.width, boardCanvas.height)
  let last = ''
  return (score?: { you: number; rival: number }) => {
    const key = score ? score.you + '/' + score.rival : ''
    if (key === last) return
    last = key
    if (!score) ctx.putImageData(club, 0, 0)
    else {
      ctx.fillStyle = '#112f2e'; ctx.fillRect(0, 0, 768, 156)
      ctx.fillStyle = '#8ca391'; ctx.fillRect(383, 18, 2, 122)
      ctx.letterSpacing = '2px'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'
      ctx.fillStyle = '#dbedbc'; ctx.fillText('YOU', 190, 40); ctx.fillText('OPPONENT', 578, 40)
      ctx.font = 'bold 84px monospace'; ctx.fillStyle = '#e1fa84'; ctx.fillText(String(score.you), 190, 126)
      ctx.fillStyle = '#f8f3de'; ctx.fillText(String(score.rival), 578, 126)
    }
    signMap.needsUpdate = true
  }
}

function props(scene: THREE.Group) {
  const steel = coat(0x283e37, { metalness: .4 })
  const timber = coat(0x897455)
  const bin = coat(0x62816d)
  for (const z of [-8.3, 7.4]) {
    const group = new THREE.Group()
    group.position.set(7.53, 0, z)
    group.rotation.y = -Math.PI / 2
    for (const x of [-.92, .92]) {
      group.add(volume(.07, .47, .54, steel, x, .235, 0))
      group.add(volume(.07, .89, .07, steel, x, .45, -.23))
    }
    for (const z of [-.19, -.06, .07, .20]) group.add(volume(2.22, .058, .108, timber, 0, .47, z))
    for (const y of [.68, .82, .96]) group.add(volume(2.22, .113, .058, timber, 0, y, -.24))
    scene.add(group)
  }
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.043, .047, .22, 9), coat(0xe0b274))
  bottle.position.set(7.48, .611, 7.95)
  scene.add(bottle)
  const stand = volume(.51, .62, .51, bin, 7.75, .31, -6.38)
  scene.add(stand, volume(.57, .075, .57, steel, 7.75, .64, -6.38))

  const hopper = new THREE.Group()
  hopper.position.set(-5.94, 0, -10.2)
  hopper.rotation.y = -.16
  for (const x of [-.20, .20]) {
    for (const z of [-.17, .17]) {
      hopper.add(volume(.026, .81, .025, steel, x, .405, z))
    }
  }
  hopper.add(volume(.47, .035, .37, steel, 0, .66, 0))
  for (let i = 0; i < 3; i += 1) {
    hopper.add(volume(.46, .021, .022, steel, 0, .71 + i * .06, .19))
    hopper.add(volume(.46, .021, .022, steel, 0, .71 + i * .06, -.19))
    hopper.add(volume(.022, .021, .36, steel, .22, .71 + i * .06, 0))
    hopper.add(volume(.022, .021, .36, steel, -.22, .71 + i * .06, 0))
  }
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(.046, 9, 7), coat(0xcbe93e), 18)
  for (let i = 0; i < 18; i += 1) {
    pose.position.set(range(-.17, .17), range(.714, .814), range(-.14, .14))
    pose.updateMatrix()
    balls.setMatrixAt(i, pose.matrix)
  }
  hopper.add(balls)
  scene.add(hopper)
}

function courtLighting(scene: THREE.Group) {
  const pole = coat(0x52606a, { metalness: .46, roughness: .48 })
  const casework = coat(0x202b3e, { metalness: .35 })
  const lens = new THREE.MeshBasicMaterial({ color: 0xd1edff, toneMapped: false })
  for (const [x, z] of [[-9.65, -13.8], [9.70, -13.8], [-9.68, 8.90], [9.68, 8.90]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.053, .106, 6.7, 12), pole)
    post.position.set(x, 3.32, z)
    post.castShadow = true
    scene.add(post, volume(.33, .15, .35, casework, x, .07, z))
    const units = new THREE.Group()
    units.position.set(x, 6.65, z)
    units.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2
    units.rotation.x = -.19
    units.add(volume(1.37, .04, .045, pole, 0, -.13, 0))
    for (const offset of [-.48, 0, .48]) {
      units.add(volume(.37, .21, .17, casework, offset, 0, 0))
      units.add(volume(.31, .148, .03, lens, offset, 0, -.093))
    }
    scene.add(units)
  }
}

function windFlag(venue: THREE.Group) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.026, .032, 4.2, 10), coat(0xa2aaa4))
  pole.position.set(-8.63, 2.10, -17.9)
  venue.add(pole)
  const cloth = new THREE.CylinderGeometry(.15, .055, 1.03, 10, 9, true)
  cloth.translate(0, -.515, 0)
  cloth.rotateZ(Math.PI / 2)
  const rest = cloth.getAttribute('position').clone()
  const stripe = canvasTexture(16, 128, ctx => {
    ctx.fillStyle = '#eeb066'; ctx.fillRect(0, 0, 16, 128)
    ctx.fillStyle = '#eeeada'
    for (const y of [18, 61, 102]) ctx.fillRect(0, y, 16, 16)
  })
  const sock = new THREE.Mesh(cloth, coat(0xffffff, { map: stripe, side: THREE.DoubleSide }))
  sock.position.set(-8.63, 4.12, -17.9)
  venue.add(sock)
  return (wind: number, time: number) => {
    const strength = Math.min(1, Math.abs(wind) / 4.5)
    sock.rotation.y = wind < 0 ? Math.PI : 0
    const pos = cloth.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = rest.getX(i)
      pos.setXYZ(i, x * (.24 + .76 * strength), rest.getY(i) - x * x * (.82 - .70 * strength),
        rest.getZ(i) + x * x * (.045 + .075 * strength) * Math.sin(7 * time - 5 * x))
    }
    pos.needsUpdate = true
  }
}

export function buildVenue(scene: THREE.Scene, onReady: () => void) {
  scene.background = new THREE.Color(0xa8b7bf)
  const venue = new THREE.Group()
  scene.add(venue)
  createPark(venue, onReady)
  scene.add(new THREE.HemisphereLight(0xd4e6ff, 0x90987c, 1.40))
  const sunlight = new THREE.DirectionalLight(0xffe1b9, 2.55)
  sunlight.position.set(-24, 24, -12)
  sunlight.target.position.set(0, 0, -2)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  Object.assign(sunlight.shadow.camera, { left: -23, right: 23, top: 25, bottom: -26, near: 2, far: 72 })
  sunlight.shadow.bias = -.0002
  sunlight.shadow.normalBias = .022
  sunlight.shadow.intensity = .52
  venue.add(sunlight, sunlight.target)
  const fill = new THREE.DirectionalLight(0xb2d3ef, .83)
  fill.position.set(9, 10, 19)
  venue.add(fill)
  const surface = createGround(venue)
  const flex = createNet(venue)
  const board = createFence(venue)
  props(venue)
  courtLighting(venue)
  const flag = windFlag(venue)
  return { surface, board, flag, flex, venue }
}

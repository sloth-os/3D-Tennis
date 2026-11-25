import * as THREE from 'three'
import { COURT, SURFACES, type Surface } from './config.ts'
import { netHeight } from './physics.ts'

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

function createSky(scene: THREE.Scene) {
  scene.background = new THREE.Color(0xc6a59e)
  scene.fog = new THREE.Fog(0x9c9eab, 32, 117)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      low: { value: new THREE.Color(0xcdaa9f) },
      high: { value: new THREE.Color(0x57769c) },
      glow: { value: new THREE.Color(0xffcc8f) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 low;
      uniform vec3 high;
      uniform vec3 glow;
      void main() {
        vec3 v = normalize(vDirection);
        vec3 c = mix(low, high, smoothstep(-0.035, 0.39, v.y));
        float sun = pow(max(dot(v, normalize(vec3(-0.63, 0.13, -0.8))), 0.0), 23.0);
        float clouds = sin(v.x * 22.0 + sin(v.z * 17.0) * 1.8 + v.y * 83.0);
        float haze = smoothstep(0.45, 0.85, clouds) * smoothstep(0.012, 0.07, v.y) * (1.0 - smoothstep(0.09, 0.25, v.y));
        gl_FragColor = vec4(mix(c, glow, sun * 0.68 + haze * 0.07), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(138, 30, 16), material)
  sky.renderOrder = -100
  scene.add(sky)
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

function createGround(scene: THREE.Scene) {
  const gravel = coat(0x62705c, { map: noiseTexture(13, 24) })
  scene.add(floor(240, 240, coat(0x4c694b, { map: noiseTexture(45, 45) }), 0, -10, -.09))
  scene.add(floor(21.8, 41.9, gravel, 0, -.35, -.067))
  scene.add(floor(2.8, 48, coat(0x7f806a, { map: noiseTexture(3, 20) }), 10.3, -4, -.066))
  scene.add(floor(30, 2.8, gravel, 0, -20.9, -.065))
  const edge = coat(0x758173)
  scene.add(volume(17.55, .117, 37.8, edge, 0, -.07, 0))
  const apron = coat(SURFACES.hard.apron, { map: noiseTexture(12, 24) })
  const grit = noiseTexture(8, 18)
  const turf = canvasTexture(128, 512, ctx => {
    const random = seeded(177)
    const data = ctx.createImageData(128, 512)
    for (let y = 0; y < 512; y += 1) {
      const stripe = Math.floor(y / 32) % 2
      for (let x = 0; x < 128; x += 1) {
        const intensity = 217 + stripe * 12 + Math.round(random() * 22)
        const offset = (y * 128 + x) * 4
        data.data.set([intensity, intensity, intensity, 255], offset)
      }
    }
    ctx.putImageData(data, 0, 0)
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
    paint.map = alley.map = surface === 'grass' ? turf : grit
    alley.color.copy(paint.color).multiplyScalar(.88)
    apron.color.setHex(SURFACES[surface].apron)
  }
}

function createNet(scene: THREE.Scene) {
  const netTexture = canvasTexture(1024, 96, ctx => {
    ctx.strokeStyle = '#162d2a'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < 1024; x += 8) { ctx.moveTo(x, 0); ctx.lineTo(x, 96) }
    for (let y = 1; y < 96; y += 6) { ctx.moveTo(0, y); ctx.lineTo(1024, y) }
    ctx.stroke()
  })
  const vertices: number[] = []
  const uv: number[] = []
  const indices: number[] = []
  const tape: number[] = []
  for (let i = 0; i <= 64; i += 1) {
    const x = (i / 64 * 2 - 1) * COURT.postX
    const height = netHeight(x)
    vertices.push(x, .02, 0, x, height, 0)
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
  const mesh = new THREE.Mesh(sheet(vertices), new THREE.MeshBasicMaterial({
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
}

function createFence(scene: THREE.Scene) {
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
}

function props(scene: THREE.Scene) {
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

function courtLighting(scene: THREE.Scene) {
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

function crownGeometry(seed: number, spokes: number) {
  const random = seeded(seed)
  const position = [0, .91, 0]
  const rings = [[.26, .5], [.57, .07], [.50, -.12], [.23, -.18]]
  for (const [radius, height] of rings) {
    for (let i = 0; i < spokes; i += 1) {
      const angle = i / spokes * Math.PI * 2
      const width = radius * (.76 + random() * .43)
      position.push(Math.cos(angle) * width, height + (random() - .5) * .19, Math.sin(angle) * width)
    }
  }
  position.push(0, -.19, 0)
  const triangles = []
  for (let i = 0; i < spokes; i += 1) {
    const next = (i + 1) % spokes
    triangles.push(0, next + 1, i + 1)
    for (let row = 0; row < rings.length - 1; row += 1) {
      const start = row * spokes + 1
      triangles.push(start + i, start + next, start + i + spokes, start + next, start + next + spokes, start + i + spokes)
    }
    triangles.push(rings.length * spokes + 1, (rings.length - 1) * spokes + i + 1, (rings.length - 1) * spokes + next + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setIndex(triangles)
  geometry.computeVertexNormals()
  return geometry
}

function landscaping(scene: THREE.Scene) {
  const locations: { x: number; z: number; height: number; type: number }[] = []
  for (let i = 0; i < 265; i += 1) {
    const z = range(-91, -18.8)
    const x = range(-70, 70)
    if (Math.abs(x) < 11 && z > -23) continue
    locations.push({ x, z, height: range(3.6, 12.6), type: i % 3 })
  }
  for (let i = 0; i < 106; i += 1) {
    const side = i % 2 === 0 ? -1 : 1
    const x = side * range(side < 0 ? 14 : 24, 66)
    const z = range(-17, 59)
    locations.push({ x, z, height: range(4.3, 12.8), type: i % 3 })
  }
  for (let i = 0; i < 74; i += 1) {
    const x = range(-39, 46)
    const z = range(24, 68)
    locations.push({ x, z, height: range(4.5, 11.5), type: i % 3 })
  }
  const sides = [[-13, -17, 12], [-14.4, -9, 10], [-13.5, -2, 14], [-15.5, 6, 7.5],
    [12, -16, 10.5], [14.9, -12.2, 11], [14.8, -4.3, 13], [16.8, 1.5, 8.1],
    [-10.4, -20.1, 7.8], [5.5, -23.1, 12], [-3.2, -23.8, 10], [1.7, -25.7, 12.2]]
  sides.forEach(([x, z, height], i) => locations.push({ x, z, height, type: i % 3 }))
  const foliage = coat(0xffffff)
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.071, .16, 1, 7), coat(0x685e46), locations.length)
  trunk.castShadow = true
  trunk.receiveShadow = true
  locations.forEach((location, index) => {
    const { x, z, height } = location
    pose.position.set(x, height * .35, z)
    pose.scale.setScalar(height * .14).setY(height * .7)
    pose.rotation.set(0, 0, range(-.04, .04))
    pose.updateMatrix()
    trunk.setMatrixAt(index, pose.matrix)
  })
  scene.add(trunk)
  const colors = [0x315350, 0x4a6955, 0x53735e, 0x3f5c4d, 0x657253, 0x345350, 0x577762, 0x435e58]
  for (let type = 0; type < 3; type += 1) {
    const trees = locations.filter(location => location.type === type)
    const crowns = new THREE.InstancedMesh(crownGeometry(972 + type * 42, 11 + type), foliage, trees.length * 5)
    crowns.castShadow = true
    crowns.receiveShadow = true
    trees.forEach(({ x, z, height }, index) => {
      const base = new THREE.Color(colors[Math.floor(range(0, colors.length))])
      const width = height * (type === 0 ? .48 : type === 1 ? .39 : .34)
      for (let level = 0; level < 5; level += 1) {
        const radius = width * (1 - level * .152)
        pose.position.set(x + range(-.22, .22), height * (.28 + level * .14), z + range(-.2, .2))
        pose.scale.set(radius, height * (.26 + level * .014), radius * range(.89, 1.15))
        pose.rotation.set(range(-.04, .04), range(0, 6.28), range(-.05, .05))
        pose.updateMatrix()
        const position = index * 5 + level
        crowns.setMatrixAt(position, pose.matrix)
        crowns.setColorAt(position, base.clone().multiplyScalar(range(.72, 1.03) + level * .082))
      }
    })
    scene.add(crowns)
  }

  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), foliage, 194)
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), coat(0xa5a189, { flatShading: true }), 81)
  for (let i = 0; i < 194; i += 1) {
    const sign = i % 2 === 0 ? 1 : -1
    const x = i > 130 ? range(-22, 22) : sign * range(9.15, 17.4)
    const z = i > 130 ? range(-27, -20.8) : range(-21, 12)
    const height = range(.18, .73)
    pose.position.set(x, height * .52 - .04, z)
    pose.rotation.set(range(0, 3), range(0, 3), 0)
    pose.scale.set(height * range(1.05, 1.7), height * .89, height * range(.8, 1.7))
    pose.updateMatrix()
    shrubs.setMatrixAt(i, pose.matrix)
    shrubs.setColorAt(i, new THREE.Color(colors[i % colors.length]).multiplyScalar(range(.85, 1.32)))
    if (i < 81) {
      pose.position.set(x + .26, .035, z + .36)
      pose.scale.set(height * .42, height * .21, height * .29)
      pose.updateMatrix()
      rocks.setMatrixAt(i, pose.matrix)
    }
  }
  shrubs.castShadow = true
  shrubs.receiveShadow = true
  rocks.receiveShadow = true
  scene.add(shrubs, rocks)
}

export function buildVenue(scene: THREE.Scene) {
  createSky(scene)
  scene.add(new THREE.HemisphereLight(0xc0d9ff, 0x767083, 1.48))
  const sunlight = new THREE.DirectionalLight(0xffd4aa, 2.45)
  sunlight.position.set(-24, 21, -12)
  sunlight.target.position.set(0, 0, -2)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  Object.assign(sunlight.shadow.camera, { left: -23, right: 23, top: 25, bottom: -26, near: 2, far: 68 })
  sunlight.shadow.bias = -.0002
  sunlight.shadow.normalBias = .022
  sunlight.shadow.intensity = .72
  scene.add(sunlight, sunlight.target)
  const fill = new THREE.DirectionalLight(0xa8d2ff, 1.20)
  fill.position.set(9, 10, 19)
  scene.add(fill)
  const setSurface = createGround(scene)
  createNet(scene)
  createFence(scene)
  props(scene)
  courtLighting(scene)
  landscaping(scene)
  return setSurface
}

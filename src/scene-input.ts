import { panOrbit, rotateOrbit, zoomOrbit, type Orbit } from './cameras.ts'

type Finger = { x: number; y: number; startX: number; startY: number; pan: boolean; tap: boolean; marker: Element | null }
type ViewInput = {
  orbit: () => Orbit | null
  closeup: () => boolean
  aim: (x: number, y: number) => void
  changed: () => void
}

export function bindSceneInput(host: HTMLElement, canvas: HTMLCanvasElement, threeD: boolean, input: ViewInput) {
  const fingers = new Map<number, Finger>()
  const suppressClick = new WeakSet<Element>()
  const onScene = (target: EventTarget | null): target is Element =>
    target instanceof Element && (target === canvas || !!target.closest('[data-marker]') && !!canvas.parentElement?.contains(target))
  canvas.classList.toggle('scene-gestures', threeD)
  host.addEventListener('pointerdown', e => {
    if (!onScene(e.target) || e.button !== 0 && !(threeD && e.button === 2)) return
    const marker = e.target.closest('[data-marker]')
    if (marker) suppressClick.delete(marker)
    const pan = e.shiftKey || e.altKey || e.button === 2
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, pan, tap: !pan, marker })
    if (fingers.size > 1) for (const f of fingers.values()) f.tap = false
    e.target.setPointerCapture(e.pointerId)
  })
  host.addEventListener('pointermove', e => {
    const f = fingers.get(e.pointerId)
    if (!f) return
    const dx = e.clientX - f.x, dy = e.clientY - f.y
    if (f.tap && Math.hypot(e.clientX - f.startX, e.clientY - f.startY) < (e.pointerType === 'touch' ? 8 : 5)) return
    f.tap = false
    const orbit = threeD && fingers.size <= 2 && (dx || dy) ? input.orbit() : null
    if (orbit) {
      if (fingers.size === 2) {
        const other = [...fingers.values()].find(p => p !== f)!
        const before = Math.hypot(f.x - other.x, f.y - other.y)
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y)
        if (before > 3 && after > 3) zoomOrbit(orbit, before / after)
        panOrbit(orbit, dx / 2, dy / 2, canvas.clientHeight, input.closeup())
      } else if (f.pan || e.shiftKey || e.altKey) {
        panOrbit(orbit, dx, dy, canvas.clientHeight, input.closeup())
      } else rotateOrbit(orbit, dx * .007, dy * .006)
      input.changed()
    }
    f.x = e.clientX
    f.y = e.clientY
  })
  host.addEventListener('pointerup', e => {
    const f = fingers.get(e.pointerId)
    fingers.delete(e.pointerId)
    if (!f) return
    const tap = f.tap && e.button === 0 && Math.hypot(e.clientX - f.startX, e.clientY - f.startY) < (e.pointerType === 'touch' ? 8 : 5)
    if (!tap && f.marker) suppressClick.add(f.marker)
    if (tap && !f.marker) input.aim(e.clientX, e.clientY)
  })
  host.addEventListener('click', e => {
    const marker = e.target instanceof Element ? e.target.closest('[data-marker]') : null
    if (e.detail && marker && suppressClick.delete(marker)) { e.preventDefault(); e.stopImmediatePropagation() }
  }, true)
  const forget = (e: PointerEvent) => fingers.delete(e.pointerId)
  host.addEventListener('pointercancel', forget)
  host.addEventListener('lostpointercapture', forget)
  window.addEventListener('blur', () => fingers.clear())
  window.addEventListener('hashchange', () => fingers.clear())
  if (!threeD) return
  host.addEventListener('contextmenu', e => { if (onScene(e.target)) e.preventDefault() })
  host.addEventListener('wheel', e => {
    if (!onScene(e.target)) return
    e.preventDefault()
    if (!e.deltaY) return
    const orbit = input.orbit()
    if (!orbit) return
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1)
    zoomOrbit(orbit, Math.exp(Math.max(-1, Math.min(1, pixels * (e.ctrlKey ? .012 : .0018)))))
    input.changed()
  }, { passive: false })
}

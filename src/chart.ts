import { COURT, SHOTS, type Shot } from './config.ts'
import { shotBall, traceBall, type Conditions } from './physics.ts'

const CONTACT = { x: .95, y: 1.08, z: 10.27 }
const TARGET = { x: -2.15, z: -9.34 }

export class FlightChart {
  private readonly ctx: CanvasRenderingContext2D
  private conditions: Conditions = { surface: 'hard', wind: 0 }
  private series = this.compare()

  constructor(private readonly canvas: HTMLCanvasElement, private readonly values: HTMLElement) {
    this.ctx = canvas.getContext('2d')!
    new ResizeObserver(() => this.draw()).observe(canvas)
  }

  setConditions(conditions: Conditions) {
    if (this.conditions.surface !== conditions.surface || this.conditions.wind !== conditions.wind) {
      this.conditions = conditions
      this.series = this.compare()
    }
    this.values.innerHTML = this.series.map(({ config, flight, drift }) => `<tr>
      <th scope="row"><i class="legend-dot" style="--series:${config.color}"></i>${config.label}</th>
      <td>${config.spin.toLocaleString('en-US')}<span class="rebound-spin">${flight.reboundSpin === null ? '—' : '→ ' + Math.round(flight.reboundSpin).toLocaleString('en-US')} rpm</span></td>
      <td>${flight.net ? 'Net' : flight.clearance === null ? '—' : `${flight.clearance.toFixed(2)} m`}</td>
      <td>${flight.bounceHeight.toFixed(2)} m</td>
      <td>${drift === null ? '—' : `${Math.abs(drift).toFixed(2)} m${Math.abs(drift) >= .005 ? drift > 0 ? ' right' : ' left' : ''}`}</td>
    </tr>`).join('')
    this.draw()
  }

  private compare() {
    return (Object.keys(SHOTS) as Shot[]).map(shot => {
      const start = shotBall(CONTACT, TARGET, shot, false, 1)
      const flight = traceBall(start, this.conditions, 2.6)
      const calm = this.conditions.wind ? traceBall(start, { ...this.conditions, wind: 0 }, 2.6, true) : flight
      const drift = flight.landing && calm.landing ? flight.landing.x - calm.landing.x : null
      return { config: SHOTS[shot], flight, drift }
    })
  }

  draw() {
    const { ctx, canvas } = this
    const { width, height } = canvas.getBoundingClientRect()
    if (!width || !height) return
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    const narrow = width < 490
    const start = narrow ? 38 : 57
    const end = width - (narrow ? 18 : 32)
    const top = 26
    const bottom = height - 38
    const maxDistance = 30
    const maxHeight = Math.max(2, Math.ceil(Math.max(...this.series.map(line => line.flight.apex)) + .15))
    const x = (distance: number) => start + distance / maxDistance * (end - start)
    const y = (elevation: number) => bottom - elevation / maxHeight * (bottom - top)
    const row = (startX: number, startY: number, endX: number, endY: number) => {
      ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke()
    }
    const tint = ctx.createLinearGradient(0, top, 0, bottom)
    tint.addColorStop(0, '#152319')
    tint.addColorStop(1, '#18291e')
    ctx.fillStyle = tint
    ctx.fillRect(start, top, end - start, bottom - top)
    ctx.font = '11px DM Sans, sans-serif'
    ctx.fillStyle = '#a1b4a0'
    ctx.strokeStyle = '#334438'
    ctx.textAlign = 'right'
    for (let h = 0; h <= maxHeight; h += 1) {
      row(start, y(h), end, y(h))
      ctx.fillText(`${h} m`, start - 7, y(h) + 4)
    }
    ctx.textAlign = 'center'
    const interval = narrow ? 10 : 5
    for (let d = 0; d <= maxDistance; d += interval) {
      row(x(d), top, x(d), bottom)
      ctx.fillText(`${d} m`, x(d), bottom + 18)
    }
    ctx.strokeStyle = '#d6dfc2'
    ctx.lineWidth = 2
    row(x(CONTACT.z), y(.035), x(CONTACT.z), y(COURT.netCenter))
    ctx.fillStyle = '#c2d0b9'
    ctx.fillText('NET', x(CONTACT.z), y(COURT.netCenter) + 14)
    ctx.save()
    ctx.beginPath()
    ctx.rect(start, top, end - start, bottom - top + 1)
    ctx.clip()
    for (const { config, flight } of this.series) {
      ctx.strokeStyle = config.color
      ctx.lineWidth = 2.1
      ctx.lineJoin = 'round'
      const px = (z: number) => x(CONTACT.z - z)
      const landingIndex = flight.landing ? flight.points.findIndex(point => point.y <= COURT.ballRadius + .001) : -1
      const line = (lo: number, hi: number) => {
        if (hi <= lo) return
        ctx.beginPath()
        ctx.moveTo(px(flight.points[lo].z), y(flight.points[lo].y))
        for (let i = lo + 1; i <= hi; i += 1) ctx.lineTo(px(flight.points[i].z), y(flight.points[i].y))
        ctx.stroke()
      }
      ctx.setLineDash([])
      line(0, landingIndex >= 0 ? landingIndex : flight.points.length - 1)
      if (landingIndex >= 0 && flight.landing) {
        ctx.setLineDash([5, 4])
        line(landingIndex, flight.points.length - 1)
        ctx.setLineDash([])
        ctx.fillStyle = config.color
        ctx.beginPath()
        ctx.arc(px(flight.landing.z), y(flight.landing.y), 3.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
    ctx.fillStyle = '#a1b4a0'
    ctx.fillText('Distance along the court', (start + end) / 2, height - 6)
  }
}

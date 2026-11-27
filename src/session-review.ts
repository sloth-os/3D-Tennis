import { COURT, DRILLS } from './config.ts'
import { TECHNIQUES } from './coaching.ts'
import type { Game, ShotMetrics } from './game.ts'
import { icon } from './icons.ts'
import { lineDistance, OPPONENTS, type Tiebreak } from './point-play.ts'
import { sampleReplay, type ShotReplay } from './replay.ts'

export function reportMarkup() {
  return `<dialog class="report-dialog" id="session-report" aria-labelledby="report-title">
    <div class="report-head"><div><p class="section-kicker" id="report-context"></p><h2 id="report-title">Session review</h2></div>
      <form method="dialog"><button class="icon-button" aria-label="Close session review">${icon('close', 19)}</button></form></div>
    <div id="match-summary"></div>
    <div class="report-grid"><section class="shot-map"><h3>Landing chart</h3>
      <canvas id="report-map" width="620" height="570" role="img" aria-label="Far court showing recorded shot landings and the aim of the selected shot"></canvas>
      <div class="map-key"><span><i></i> In</span><span><b>×</b> Miss</span><span><b>＋</b> Aim</span></div></section>
      <section class="shot-inspector"><h3><label for="report-shot">Shot breakdown</label></h3>
        <div id="shot-empty">Strike a ball to record its flight.</div>
        <div id="shot-detail"><span class="select-shell"><select id="report-shot"></select>${icon('chevron', 14)}</span>
          <div class="shot-data" id="report-values"></div>
          <p id="report-line"></p><button type="button" id="report-replay" class="report-action">${icon('advance', 16)} Replay this shot</button>
        </div></section></div>
    <section class="coach-recap"><div class="section-kicker">${icon('racket', 15)} Coach’s note</div><p id="report-coach"></p></section>
    <details id="point-history" class="point-history"><summary>Point log</summary><ol id="report-log"></ol></details>
  </dialog>`
}

const recorded = (game: Game) => game.shots.filter(shot => shot.result !== 'In flight')
const colorIn = '#dff576', colorOut = '#ffae83'
const miss = (s: ShotMetrics) => s.result === 'Out' || s.result === 'Net'
const pointOnMap = (s: ShotMetrics) => s.landing ?? s.clip.events.find(e => e.contact.kind === 'net')?.contact.position

function chartProjection(shots: ShotMetrics[]) {
  let far = COURT.halfLength + .74, wide = COURT.doubles + .78
  for (const shot of shots) {
    for (const p of [shot.aim, pointOnMap(shot)]) {
      if (p) { far = Math.max(far, -p.z + .4); wide = Math.max(wide, Math.abs(p.x) + .4) }
    }
  }
  const scale = Math.min(494 / far, 290 / wide)
  return { mapX: (x: number) => 310 + x * scale, mapZ: (z: number) => 522 + z * scale, scale }
}

function drawMap(canvas: HTMLCanvasElement, shots: ShotMetrics[], selected?: ShotMetrics) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { mapX, mapZ, scale } = chartProjection(shots)
  const field = { x: mapX(-COURT.doubles), y: mapZ(-COURT.halfLength), width: COURT.doubles * 2 * scale, height: COURT.halfLength * scale }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#152b31'; ctx.fillRect(0, 0, 620, 570)
  ctx.fillStyle = '#24434a'; ctx.fillRect(field.x, field.y, field.width, field.height)
  ctx.fillStyle = '#294a51'; ctx.fillRect(mapX(-COURT.singles), field.y, COURT.singles * 2 * scale, field.height)
  ctx.strokeStyle = '#a6c3bc'; ctx.lineWidth = 2
  ctx.strokeRect(field.x, field.y, field.width, field.height)
  ctx.strokeRect(mapX(-COURT.singles), field.y, COURT.singles * 2 * scale, field.height)
  ctx.beginPath(); ctx.moveTo(mapX(-COURT.singles), mapZ(-COURT.service)); ctx.lineTo(mapX(COURT.singles), mapZ(-COURT.service))
  ctx.moveTo(310, mapZ(-COURT.service)); ctx.lineTo(310, mapZ(0)); ctx.stroke()
  ctx.strokeStyle = '#d6e5df'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(field.x - 27, mapZ(0)); ctx.lineTo(field.x + field.width + 27, mapZ(0)); ctx.stroke()
  ctx.fillStyle = '#adc4c2'; ctx.font = '600 16px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('FAR BASELINE', 310, field.y - 13); ctx.fillText('NET', 310, 551)
  if (selected) {
    const actual = pointOnMap(selected)
    const ax = mapX(selected.aim.x), az = mapZ(selected.aim.z)
    if (actual) {
      ctx.strokeStyle = '#c4d7ed'; ctx.lineWidth = 2; ctx.setLineDash([4, 5])
      ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(mapX(actual.x), mapZ(actual.z)); ctx.stroke(); ctx.setLineDash([])
    }
    ctx.strokeStyle = '#f1f5ff'; ctx.beginPath()
    ctx.moveTo(ax - 10, az); ctx.lineTo(ax + 10, az); ctx.moveTo(ax, az - 10); ctx.lineTo(ax, az + 10); ctx.stroke()
  }
  for (const s of [...shots.filter(s => s !== selected), ...(selected ? [selected] : [])]) {
    const p = pointOnMap(s)
    if (!p) continue
    const x = mapX(p.x), y = mapZ(p.z)
    ctx.globalAlpha = s === selected ? 1 : .64
    ctx.strokeStyle = ctx.fillStyle = miss(s) ? colorOut : colorIn
    ctx.lineWidth = 3
    ctx.beginPath()
    if (miss(s)) { ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke() }
    else { ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill() }
    if (s === selected) { ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke() }
  }
  ctx.globalAlpha = 1
}

function coachNote(game: Game, shots: ShotMetrics[]) {
  if (game.match && game.match.stats.you.doubles > 1) return 'Double faults cost you ' + game.match.stats.you.doubles + ' points. Give the second serve more room inside the box and repeat an awkward toss before swinging.'
  if (!shots.length) return game.serving ? 'Pick a spot well inside the diagonal service box before starting the toss.' : 'Split as the opponent strikes and move early enough to leave room beside your body.'
  const net = shots.filter(s => s.result === 'Net').length
  const out = shots.filter(s => s.result === 'Out').length
  const serve = shots.filter(s => s.stroke === 'serve').length > shots.length / 2
  const volley = shots.filter(s => ['volley', 'backhandVolley', 'halfVolley'].includes(s.stroke)).length > shots.length / 2
  if (net >= shots.length / 3) return serve ? 'The serve caught the net. Reach to a high contact and move the aim deeper into the service box.'
    : volley ? 'The volley caught the net. Keep the racket in front, open the face a little and give the low ball extra clearance.'
    : 'The ball caught the net. Aim deeper and try topspin, then compare the clearance of your next two drives.'
  if (out >= shots.length / 3) return 'Give the boundary more room. Bring your aim a step inside the court and compare the white cross with the next landing.'
  const early = shots.filter(s => s.timing < -.045).length, late = shots.filter(s => s.timing > .045).length
  if (early >= shots.length * .5) return serve ? 'Contact came early on the toss. Let it rise into your reach before swinging.'
    : 'Contact came early. Finish the unit turn, keep adjusting the feet, and let the ball enter your strike zone.'
  if (late >= shots.length * .5) return serve ? 'The toss was falling at contact. Start the upward reach sooner or let an awkward toss drop during a match.'
    : 'Contact came late. Turn the shoulders as the ball crosses the net so the racket can meet it in front.'
  if (game.match) return 'Your timing is holding up. After a wide ball, find the blue recovery ring and watch which lane opens on the next reply.'
  return game.plan?.cue ?? DRILLS[game.drill].coach
}

function matchSummary(match: Tiebreak) {
  const title = match.finished ? match.you > match.rival ? 'Tiebreak won' : 'Tiebreak lost' : 'Tiebreak in progress'
  const percent = (v: { firstIn: number; firstTotal: number }) => v.firstTotal ? Math.round(v.firstIn / v.firstTotal * 100) + '%' : '—'
  const rows = [
    ['First serves in', percent(match.stats.you), percent(match.stats.rival)],
    ['Aces', match.stats.you.aces, match.stats.rival.aces], ['Rally winners', match.stats.you.winners, match.stats.rival.winners],
    ['Double faults', match.stats.you.doubles, match.stats.rival.doubles],
    ['Court covered', Math.round(match.stats.you.distance) + ' m', Math.round(match.stats.rival.distance) + ' m'],
  ]
  return `<div class="result-strip"><div><strong>${title}</strong><small>${OPPONENTS[match.pace].label} · Longest rally ${Math.max(match.longest, match.strikes)} strokes</small></div>
    <b>${match.you} <em>–</em> ${match.rival}</b></div>
    <details class="report-stats"><summary>Match statistics</summary><table><thead><tr><th>Statistic</th><th>You</th><th>Opponent</th></tr></thead>
    <tbody>${rows.map(([name, you, rival]) => `<tr><th scope="row">${name}</th><td>${you}</td><td>${rival}</td></tr>`).join('')}</tbody></table></details>`
}

export class SessionReview {
  readonly dialog = document.getElementById('session-report') as HTMLDialogElement
  private readonly select = document.getElementById('report-shot') as HTMLSelectElement
  private readonly canvas = document.getElementById('report-map') as HTMLCanvasElement
  private shots: ShotMetrics[] = []
  private get selected() { return this.shots.find(s => s.number === Number(this.select.value)) }

  constructor(onReplay: (clip: ShotReplay) => void) {
    this.select.onchange = () => this.draw()
    document.getElementById('report-replay')!.onclick = () => {
      const shot = this.selected
      if (shot) { this.dialog.close(); onReplay(shot.clip) }
    }
    this.canvas.onclick = event => {
      const { mapX, mapZ } = chartProjection(this.shots)
      const rect = this.canvas.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width * 620, y = (event.clientY - rect.top) / rect.height * 570
      let nearest = 24
      for (const s of this.shots) {
        const p = pointOnMap(s)
        if (!p) continue
        const d = Math.hypot(x - mapX(p.x), y - mapZ(p.z))
        if (d <= nearest) { this.select.value = String(s.number); nearest = d }
      }
      this.draw()
    }
  }

  open(game: Game) {
    this.shots = recorded(game)
    const match = game.match
    document.getElementById('report-title')!.textContent = match?.finished ? 'Match review' : 'Session review'
    document.getElementById('report-context')!.textContent = game.plan?.title ?? DRILLS[game.drill].title
    document.getElementById('match-summary')!.innerHTML = match ? matchSummary(match) : ''
    const history = document.getElementById('point-history') as HTMLDetailsElement
    history.hidden = !match?.played
    history.open = false
    document.getElementById('report-log')!.innerHTML = match?.lastPoints.map(note =>
      `<li><b>${note.you} – ${note.rival}</b><span>${note.winner === 'you' ? 'You' : 'Opponent'} · ${note.reason}</span><small>${note.shots} strokes</small></li>`).join('') ?? ''
    document.getElementById('shot-empty')!.hidden = this.shots.length > 0
    document.getElementById('shot-detail')!.hidden = !this.shots.length
    this.select.innerHTML = this.shots.slice().reverse().map(s => `<option value="${s.number}">#${s.number} · ${TECHNIQUES[s.stroke].label} · ${s.result}</option>`).join('')
    document.getElementById('report-coach')!.textContent = coachNote(game, this.shots)
    this.draw()
    this.dialog.showModal()
  }

  private draw() {
    const s = this.selected
    drawMap(this.canvas, this.shots, s)
    if (!s) return
    const timing = Math.abs(s.timing) < .025 ? 'Centered' : Math.round(Math.abs(s.timing) * 1000) + ' ms ' + (s.timing < 0 ? 'early' : 'late')
    const error = s.landing ? Math.hypot(s.landing.x - s.aim.x, s.landing.z - s.aim.z).toFixed(2) + ' m' : '—'
    const rows = [['Ball speed', Math.round(s.speed * 3.6) + ' km/h'], ['Timing', timing], ['Spin', s.spin + ' rpm'],
      ['Net clearance', s.clearance === null ? '—' : s.clearance.toFixed(2) + ' m'], ['Distance from aim', error]]
    const hit = s.clip.events.find(e => e.contact.kind === 'racket')
    if (hit) {
      const { player } = sampleReplay(s.clip, hit.time)
      const point = hit.contact.position, ahead = player.z - point.z
      rows.push(['Contact height', point.y.toFixed(2) + ' m'],
        ['Beside the stance', Math.abs(point.x - player.x).toFixed(2) + ' m ' + (point.x >= player.x ? 'right' : 'left')],
        [ahead >= 0 ? 'In front of stance' : 'Behind stance', Math.abs(ahead).toFixed(2) + ' m'])
    }
    document.getElementById('report-values')!.innerHTML = rows.map(([name, value]) => `<div><span>${name}</span><strong>${value}</strong></div>`).join('')
    document.getElementById('report-line')!.textContent = s.call ? lineDistance(s.call) + '.' : 'The ball struck the net before landing.'
  }
}

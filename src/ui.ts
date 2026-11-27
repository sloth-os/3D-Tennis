import { DRILLS, DRILL_ORDER, SHOTS, SURFACES, WINDS } from './config.ts'
import { icon } from './icons.ts'
import { REFERENCES, TECHNIQUES } from './coaching.ts'
import { COURT_CAMERAS, LAB_CAMERAS } from './cameras.ts'
import { MUSCLES } from './motion.ts'
import { ntrpMarkup, ntrpReferenceMarkup } from './ntrp-ui.ts'
import { reportMarkup } from './session-review.ts'
import { OPPONENTS } from './point-play.ts'

const options = (labels: Record<string, string>) => Object.entries(labels).map(([key, value]) =>
  `<option value="${key}">${value}</option>`).join('')
const shotOptions = Object.entries(SHOTS).map(([value, option]) =>
  `<button type="button" data-shot="${value}" aria-pressed="false" title="${option.tip}">${option.label}</button>`).join('')
const surfaceOptions = options(Object.fromEntries(Object.entries(SURFACES).map(([key, setting]) => [key, setting.label])))
const windOptions = options(Object.fromEntries(Object.entries(WINDS).map(([key, setting]) => [key, setting.label])))
const toggle = (id: string, label: string, selected = true) => `<label class="switch-label" for="${id}">
  <input id="${id}" type="checkbox"${selected ? ' checked' : ''}><span class="switch-track" aria-hidden="true"></span><span>${label}</span>
</label>`
const tools = (id: string, cameraLabel: string, values: Record<string, string>, panel: string) => `
  <div class="stage-tools">
    <label class="stage-select" for="${id}">
      ${icon('camera', 17)}<span class="sr-only">${cameraLabel}</span><select id="${id}">${options(values)}</select>${icon('chevron', 13)}
    </label>
    <button class="glass-button" type="button" data-hud="${panel}" aria-pressed="false" aria-label="Hide interface" title="Hide interface">${icon('layers', 17)}</button>
    <button class="glass-button" type="button" data-fullscreen="${panel}" aria-label="Toggle fullscreen" title="Fullscreen">${icon('fullscreen', 17)}</button>
  </div>`
const orbit = (id: string) => `<div class="orbit-controls" id="${id}-controls" hidden>
  <span>Drag to orbit</span>
  <label for="${id}-zoom"><span class="sr-only">Camera distance</span><input type="range" id="${id}-zoom" min="60" max="155" value="100"></label>
  <button class="glass-button" type="button" id="${id}-reset" aria-label="Recenter camera" title="Recenter camera">${icon('reset', 15)}</button>
</div>`

const drillTitles = { forehand: 'Forehand', serve: 'Serve', footwork: 'Footwork', rally: 'Rally', match: 'Tiebreak' } as const
const drillCards = DRILL_ORDER.map(id => {
  const drill = DRILLS[id]
  return `<button class="drill-card theme-${drill.theme}" data-drill="${id}" type="button" aria-pressed="false" title="${drill.title}">
    <span class="drill-icon">${icon(drill.icon, 23)}</span><strong>${drillTitles[id]}</strong>
  </button>`
}).join('')

const training = `
  <section class="page-view" id="training-view" aria-label="Training court">
    <div class="court-panel" id="training-panel">
      <div class="court-stage" id="training-stage" tabindex="0" role="region" aria-label="Playable tennis court" aria-describedby="court-input-hint">
        <div class="court-viewport" id="training-canvas"><div class="world-labels" aria-label="Interactive court markers"></div></div>
      </div>
      <div class="stage-top">
        <div class="stage-id"><span class="court-badge" id="court-badge"><i></i> <span>Live court</span></span><span class="court-location">Northwood Court</span><span class="wind-readout" id="court-wind" hidden></span></div>
        ${tools('camera', 'Court camera', COURT_CAMERAS, 'training-panel')}
      </div>
      ${orbit('court-orbit')}
      <div class="match-board" id="match-board" role="group" aria-label="Tiebreak scoreboard" hidden>
        <div class="board-caption"><span>Singles tiebreak</span><span id="board-end"></span></div>
        <div class="board-team" id="board-you"><i></i><span>You</span><strong id="board-your-score">0</strong></div>
        <div class="board-team" id="board-rival"><i></i><span>Opponent</span><strong id="board-rival-score">0</strong></div>
        <button type="button" id="board-details" title="Open scoreboard and point log"><span id="board-state"></span>${icon('chart', 13)}</button>
      </div>
      <div class="mobile-drawers">
        <button type="button" data-drawer="session" aria-expanded="false" aria-controls="session-rail">${icon('target', 16)} Session</button>
        <button type="button" data-drawer="forces" aria-expanded="false" aria-controls="force-rail">${icon('chart', 16)} Forces</button>
      </div>

      <aside class="hud-panel hud-left session-panel" id="session-rail" aria-labelledby="drill-title">
        <div class="section-kicker">${icon('target', 16)} <span id="practice-heading">Practice session</span></div>
        <h1 id="drill-title">Forehand Fundamentals</h1>
        <p class="hud-copy" id="drill-description"></p>
        <div class="session-score" id="drill-score">
          <div class="score-heading"><span id="score-label">Target hits</span><span class="score-value"><strong id="score-current">0</strong><span id="score-goal"> / 5</span></span></div>
          <div class="progress-segments" id="score-segments" role="progressbar" aria-labelledby="score-label" aria-valuemin="0" aria-valuenow="0" aria-valuemax="5"></div>
          <div class="score-meta"><span id="attempts">0 attempts</span><span id="best">Best 0 / 5</span></div>
        </div>
        <div class="session-settings">
          <label class="setting-label match-opponent" for="match-pace" id="opponent-settings" hidden>Opponent
            <span class="select-shell"><select id="match-pace">${options(Object.fromEntries(Object.entries(OPPONENTS).map(([key, value]) => [key, value.label])))}</select>${icon('chevron', 13)}</span></label>
          <div class="setting-row"><span class="setting-label" id="shot-label">Stroke</span>
            <div class="segmented" role="group" aria-labelledby="shot-label">${shotOptions}</div>
          </div>
          <div class="condition-fields">
            <label class="setting-label" for="surface">Surface<span class="select-shell"><select id="surface">${surfaceOptions}</select>${icon('chevron', 13)}</span></label>
            <label class="setting-label" for="wind">Wind<span class="select-shell"><select id="wind">${windOptions}</select>${icon('chevron', 13)}</span></label>
          </div>
          <div class="setting-row" id="serve-settings" hidden>
            <span class="setting-label" id="serve-label">Serve side</span>
            <div class="segmented" role="group" aria-labelledby="serve-label">
              <button type="button" data-serve="deuce" aria-pressed="true">Deuce</button><button type="button" data-serve="ad" aria-pressed="false">Ad</button>
            </div>
          </div>
        </div>
        <a class="quiet-link" id="study-drill" href="#technique">Study the motion ${icon('right', 15)}</a>
        <a class="quiet-link" id="return-ntrp" href="#ntrp"><span>NTRP Skill Path</span> ${icon('right', 15)}</a>
        <button class="report-action" id="open-report" type="button" disabled>${icon('chart', 16)} Session review</button>
      </aside>

      <aside class="hud-panel hud-right force-panel" id="force-rail" aria-labelledby="force-title">
        <div class="section-kicker">${icon('chart', 16)} Telemetry</div>
        <h2 id="force-title">Force Analysis</h2>
        <div class="segmented analysis-tabs" role="group" aria-label="Force analysis channel">
          <button type="button" data-force="flight" aria-pressed="true">Flight</button>
          <button type="button" data-force="contact" aria-pressed="false">Impact</button>
          <button type="button" data-force="body" aria-pressed="false">Body</button>
        </div>
        <p class="readout-source" id="force-source"></p>
        <div class="readout-rows" id="force-values"></div>
        <p class="readout-note" id="force-note"></p>
        <div class="panel-footer">${toggle('vectors-toggle', '3D vectors')}<button class="text-button" id="review-open" type="button" disabled>${icon('advance', 15)} Replay</button></div>
      </aside>

      <div class="court-readout" id="court-readout">
        <div class="court-hint" id="aim-hint">${icon('crosshair', 16)} <span>Aim at the highlighted zone</span></div>
        <div class="court-cue" id="court-cue" hidden>
          <div class="court-cue-text"><strong id="cue-title"></strong><span id="cue-detail"></span></div>
          <div id="timing-track" class="timing-track" aria-hidden="true" hidden><span></span><i></i></div>
          <button type="button" id="finish-review" class="text-button" hidden>Review session ${icon('right', 14)}</button>
        </div>
      </div>
      <div class="shot-telemetry" id="telemetry" hidden><span>Last shot</span><strong id="telemetry-speed"></strong><small id="telemetry-extra"></small><small id="telemetry-timing"></small></div>
      <div class="replay-console" id="review-console" hidden>
        <div class="replay-head"><div class="section-kicker">${icon('advance', 16)} Shot replay</div>
          <button type="button" class="glass-button" id="review-close" aria-label="Exit replay">${icon('close', 16)}</button></div>
        <div class="replay-scrubber"><button type="button" class="glass-button" id="review-play" aria-label="Play replay">${icon('play', 17)}</button>
          <input type="range" id="review-scrub" min="0" max="1000" value="0" aria-label="Replay timeline"><output id="review-time"></output>
        </div>
        <div class="replay-events" id="review-events" aria-label="Recorded impacts"></div>
      </div>

      <div class="game-console">
        <div class="touch-controls" aria-label="Touch controls">
          <div class="touch-direction">
            <button data-move="left" type="button" aria-label="Move left">${icon('left', 19)}</button>
            <button data-move="up" type="button" aria-label="Move forward">${icon('up', 19)}</button>
            <button data-move="down" type="button" aria-label="Move back">${icon('down', 19)}</button>
            <button data-move="right" type="button" aria-label="Move right">${icon('next', 19)}</button>
          </div>
          <div class="touch-actions"><button id="quiet-play" type="button" aria-label="Start practice">${icon('play', 15)}</button><button id="touch-split" type="button">Split</button><button id="touch-swing" class="touch-swing" type="button">Swing</button></div>
        </div>
        <div class="training-dock">
          <div class="session-actions">
            <div class="compact-score"><span id="compact-score-label"></span><strong id="compact-score"></strong></div>
            <button type="button" class="primary-button" id="start-drill">${icon('play', 19)} <span>Start Drill</span></button>
            <button type="button" class="icon-button reset-button" id="reset-drill" title="Reset drill" aria-label="Reset drill">${icon('reset', 17)}</button>
          </div>
          <div class="drill-gallery" role="group" aria-label="Choose a drill">${drillCards}</div>
          <div class="court-options">${toggle('trail-toggle', 'Trail')}${toggle('guides-toggle', 'Guides')}</div>
        </div>
        <div class="input-hints" id="court-input-hint">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Space</kbd> Swing</span>
          <span><kbd>Shift</kbd> Split</span><span>${icon('pointer', 14)} Aim with pointer</span><span><kbd>C</kbd> Camera</span>
        </div>
      </div>
      ${reportMarkup()}
    </div>
  </section>`

const techniques = `
  <section class="page-view" id="technique-view" aria-label="Technique Lab" hidden>
    <div class="court-panel lab-panel" id="lab-panel">
      <div class="court-stage lab-stage"><div class="court-viewport" id="lab-canvas"><div class="world-labels" aria-label="Interactive body markers"></div></div></div>
      <div class="stage-top"><div class="stage-id"><span class="court-badge"><i></i> Motion study</span><span class="court-location">Technique Lab</span></div>
        ${tools('lab-angle', 'Technique camera', LAB_CAMERAS, 'lab-panel')}
      </div>
      ${orbit('lab-orbit')}
      <div class="mobile-drawers">
        <button type="button" data-drawer="lesson" aria-expanded="false" aria-controls="lesson-rail">${icon('book', 16)} Technique</button>
        <button type="button" data-drawer="body" aria-expanded="false" aria-controls="body-rail">${icon('body', 16)} Anatomy</button>
      </div>
      <aside class="hud-panel hud-left lesson-panel" id="lesson-rail" aria-labelledby="lesson-title">
        <div class="section-kicker">${icon('body', 16)} Stroke sequence</div>
        <h1 id="lesson-title"></h1><p class="hud-copy" id="lesson-summary"></p>
        <div class="lesson-selector" role="group" aria-label="Select a technique">
          ${Object.entries(TECHNIQUES).map(([key, lesson]) => `<button type="button" data-technique="${key}" aria-pressed="false">${lesson.label}</button>`).join('')}
        </div>
        <div class="lesson-detail">
          <p class="section-kicker" id="phase-number"></p><h3 id="phase-title"></h3><p class="hud-copy" id="phase-text"></p>
          <div class="watch-box"><span>${icon('crosshair', 16)} Watch for</span><p id="phase-watch"></p></div>
        </div>
      </aside>

      <aside class="hud-panel hud-right body-panel" id="body-rail" aria-labelledby="body-title">
        <div class="section-kicker">${icon('chart', 16)} Biomechanics</div>
        <h2 id="body-title">Body Analysis</h2>
        <p class="readout-source" id="body-source"></p>
        <div class="readout-rows" id="body-values"></div>
        <div class="muscle-list" role="group" aria-label="Focus a muscle group">
          ${Object.entries(MUSCLES).map(([key, group]) => `<button class="muscle-option" type="button" data-muscle="${key}" style="--group:${group.color}" aria-pressed="false">
            <i></i><span><strong>${group.label}</strong><small>${group.detail}</small></span>${icon('next', 15)}
          </button>`).join('')}
        </div>
        <p class="readout-note" id="muscle-note"></p>
        <div class="panel-footer">${toggle('anatomy-toggle', 'Muscles')}${toggle('joints-toggle', 'Joints', false)}${toggle('lab-vectors', 'Vectors')}</div>
      </aside>
      <div class="game-console lab-console">
        <div id="timeline" class="timeline" role="group" aria-label="Motion phases"></div>
        <div class="lab-toolbar">
          <button id="lab-play" class="primary-button lab-play" type="button" aria-label="Play motion" title="Play motion">${icon('play')}<span>Play</span></button>
          <input id="lab-scrub" type="range" min="0" max="1000" value="20" step="1" aria-label="Motion timeline">
          <output for="lab-scrub" id="lab-time">0.0 s</output>
          <label class="select-shell speed-select" for="lab-speed"><span class="sr-only">Playback speed</span>
            <select id="lab-speed"><option value=".25">0.25×</option><option value=".5" selected>0.5×</option><option value="1">1×</option></select>${icon('chevron', 13)}
          </label>
          <button id="next-phase" class="glass-button" type="button" aria-label="Next phase" title="Next phase">${icon('advance', 17)}</button>
        </div>
      </div>
    </div>
  </section>`
const guide = `
  <section class="page-view" id="guide-view" aria-labelledby="guide-title" hidden>
    <div class="intro">
      <p class="eyebrow"><span></span> The Science of Tennis</p>
      <h1 id="guide-title">Field Guide<span>.</span></h1>
      <p class="intro-deck">Explore how spin, the court surface, and your position shape each point.</p>
    </div>
    <section class="guide-card flight-card" aria-labelledby="flight-title">
      <div class="guide-head">
        <div>
          <div class="section-kicker">${icon('chart', 17)} Interactive Experiment</div>
          <h2 id="flight-title">Flight &amp; bounce</h2>
          <p>Compare three shots from the same contact point toward the same calm-air target.</p>
        </div>
        <div class="guide-selects">
          <label class="setting-label" for="guide-surface">Court surface<span class="select-shell">${icon('layers', 16)}<select id="guide-surface">${surfaceOptions}</select>${icon('chevron', 14)}</span></label>
          <label class="setting-label" for="guide-wind">Wind<span class="select-shell">${icon('wind', 16)}<select id="guide-wind">${windOptions}</select>${icon('chevron', 14)}</span></label>
        </div>
      </div>
      <div class="chart-shell">
        <canvas id="flight-chart" role="img" aria-label="Side view of the modeled tennis ball trajectories. The comparison table below lists the values."></canvas>
      </div>
      <div class="chart-table-shell"><table class="chart-table">
        <caption class="sr-only">Modeled flight and bounce comparison</caption>
        <thead><tr><th scope="col">Shot</th><th scope="col">Spin at launch → bounce</th><th scope="col">Net clearance</th><th scope="col">Bounce height</th><th scope="col">Wind drift</th></tr></thead>
        <tbody id="flight-values"></tbody>
      </table></div>
      <p class="model-note">Solid lines show the first flight. Dashed lines show the bounce. Crosswinds are 4.5 m/s. The surface and aerodynamic coefficients are illustrative, and the model treats the ball as rigid.</p>
      <details class="flight-explanation">
        <summary>Why the flight paths differ</summary>
        <p>Gravity pulls every ball downward. Topspin adds a downward Magnus force, so a higher launch can still dip into court. Backspin adds lift. The slice shown here launches lower and slower, which gives it a low, skidding bounce.</p>
        <p>Drag opposes the ball’s motion through the air. Spin force acts across that airflow. At a bounce, friction acts against the slip where the ball meets the ground. A skidding ball loses forward speed and gains topspin. A ball with strong forward spin can kick ahead. Compare the spin before and after a bounce on clay and grass.</p>
      </details>
      <details class="flight-explanation">
        <summary>How the force readouts are calculated</summary>
        <p>The flight arrows use the 57 g ball’s weight, air drag, and Magnus force. The impact readout divides the change in momentum by an assumed contact duration. The energy readout compares translational kinetic energy before and after the impact.</p>
        <p>The body readout estimates ground reaction from the acceleration of a 75 kg reference athlete’s center of mass. Foot-load sharing and muscle highlights illustrate the motion. The vectors are scaled for visibility.</p>
      </details>
    </section>
    <div class="guide-grid">
      <section class="guide-card guide-topic"><span class="topic-icon theme-lime">${icon('court', 22)}</span><h2>Read the court</h2>
        <p>A singles court measures <strong>23.77 × 8.23 m</strong>. The doubles alleys take it to 10.97 m wide. The net is 0.914 m high at center and 1.07 m at its supports. The service line sits 6.40 m from the net.</p>
        <p>Serve behind the baseline into the diagonal box. A ball touching the line is in. A serve that clips the tape and lands in the correct box is a let. Replay the same serve.</p>
        <a class="quiet-link" href="#match" data-open-drill="match">Play a singles tiebreak ${icon('right', 16)}</a>
      </section>
      <section class="guide-card guide-topic"><span class="topic-icon theme-blue">${icon('steps', 22)}</span><h2>Move before you swing</h2>
        <p>Split as the opponent strikes, push in the direction of the ball, and use small adjustment steps to get the spacing right. For a groundstroke, give the racket room beside you and in front.</p>
        <p>Recover between the opponent’s likely replies. In a tiebreak the two blue lines show the available angles. The ring marks a baseline position between them. Clay takes longer to brake on than hard court.</p>
        <a class="quiet-link" href="#training" data-open-drill="footwork">Try Footwork &amp; Recovery ${icon('right', 16)}</a>
      </section>
      <section class="guide-card guide-topic"><span class="topic-icon theme-amber">${icon('wind', 22)}</span><h2>Play the conditions</h2>
        <p>Clay generally reduces forward speed and can produce a higher bounce. Grass tends to keep the ball lower. Hard courts vary with their coating, and often sit between those extremes.</p>
        <p>Wind acts throughout the flight. Compare the drift values above, then aim upwind on the court. Try a slice serve to see how sidespin can also bend the path.</p>
        <a class="quiet-link" href="#training" data-open-drill="rally">Try Rally Builder ${icon('right', 16)}</a>
      </section>
    </div>
    <section class="guide-card sources" aria-labelledby="sources-title">
      <h2 id="sources-title">Further reading</h2>
      <div class="source-list">${REFERENCES.map(source =>
        `<a href="${source.url}" target="_blank" rel="noopener noreferrer">
          <span><strong>${source.title}</strong><small>${source.detail}</small></span>${icon('external', 16)}
        </a>`).join('')}</div>
    </section>
  </section>`

export function appMarkup(): string {
  return `
    <header class="topbar">
      <div class="header-inner">
        <a href="#training" class="brand" aria-label="Baseline Tennis Lab home">
          <span class="brand-mark">${icon('court', 22)}</span><span class="wordmark"><strong>BASELINE</strong><small>TENNIS LAB</small></span>
        </a>
        <nav class="main-nav" aria-label="Main navigation">
          <a href="#training" data-nav="training">${icon('court', 17)}<span>Training</span></a>
          <a href="#ntrp" data-nav="ntrp">${icon('layers', 17)}<span>Skill Path</span></a>
          <a href="#technique" data-nav="technique">${icon('body', 17)}<span>Technique Lab</span></a>
          <a href="#guide" data-nav="guide">${icon('book', 17)}<span>Field Guide</span></a>
        </nav>
        <div class="header-actions">
          <span class="connection" id="connection" title="Offline play is available after the production app is cached"><i></i><span>Local session</span></span>
          <button class="icon-button" type="button" id="install-app" title="Install Baseline" aria-label="Install Baseline" hidden>${icon('download', 18)}</button>
          <button class="icon-button" type="button" id="audio-toggle" aria-label="Sound off" aria-pressed="false" title="Toggle sound">${icon('mute', 18)}</button>
          <button class="icon-button" type="button" id="show-help" title="Controls and keyboard shortcuts" aria-label="Controls and keyboard shortcuts">${icon('help', 18)}</button>
        </div>
      </div>
    </header>
    <main id="main-content" class="main-shell" tabindex="-1">${training}
      ${ntrpMarkup(tools('ntrp-camera', 'Skill path camera', COURT_CAMERAS, 'ntrp-panel'), orbit('ntrp-orbit'))}
      ${techniques}${guide}</main>
    ${ntrpReferenceMarkup()}
    <dialog id="controls-dialog" class="controls-dialog" aria-labelledby="controls-title">
      <form method="dialog">
        <div class="dialog-head"><div><p class="section-kicker">${icon('court', 16)} Practice controls</p><h2 id="controls-title">Take the court</h2></div>
          <button class="icon-button" type="submit" aria-label="Close controls">${icon('close', 20)}</button></div>
        <dl>
          <div><dt>Move around the court</dt><dd><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrow keys</dd></div>
          <div><dt>Swing in the green contact window</dt><dd><kbd>Space</kbd></dd></div>
          <div><dt>Split-step as the feeder hits</dt><dd><kbd>Shift</kbd></dd></div>
          <div><dt>Aim across the far court</dt><dd>Click / tap, <kbd>Q</kbd> <kbd>E</kbd></dd></div>
          <div><dt>Adjust aim depth</dt><dd><kbd>R</kbd> <kbd>F</kbd></dd></div>
          <div><dt>Start, pause or resume a drill</dt><dd><kbd>P</kbd></dd></div>
          <div><dt>Cycle camera angles</dt><dd><kbd>C</kbd></dd></div>
          <div><dt>Open the last shot replay</dt><dd><kbd>T</kbd></dd></div>
          <div><dt>Look around in Free orbit</dt><dd>Drag or use arrow keys while paused</dd></div>
        </dl>
        <p>On a touchscreen, use the direction buttons, Split, and Swing. Tap the far court to aim.</p>
        <p>In a tiebreak, serve twice if needed and let the opponent’s serve bounce. Shoe marks show a receiving stance. The blue ring covers the next reply. Select the scoreboard to review a point or replay a shot.</p>
        <button class="primary-button close-help" type="submit">Back to court ${icon('right', 16)}</button>
      </form>
    </dialog>
    <div id="feedback" class="sr-only" role="status" aria-live="polite"></div>`
}

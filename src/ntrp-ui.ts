import { icon } from './icons.ts'
import { NTRP, NTRP_LEVELS, NTRP_REFERENCES, NTRP_SKILLS, type NtrpSkill } from './ntrp.ts'

const levelButtons = NTRP_LEVELS.map(level => `<button type="button" data-ntrp-level="${level}" aria-pressed="false" aria-label="NTRP ${level}, ${NTRP[level].title}">
  <strong>${level}</strong><small>${NTRP[level].title}</small>
</button>`).join('')
const skillButtons = (Object.entries(NTRP_SKILLS) as [NtrpSkill, (typeof NTRP_SKILLS)[NtrpSkill]][]).map(([key, skill]) =>
  `<button type="button" class="ntrp-skill theme-${skill.tone}" data-ntrp-skill="${key}" aria-pressed="false">
    <span class="drill-icon">${icon(skill.icon, 18)}</span><span>${skill.label}</span><small data-skill-record="${key}"></small>
  </button>`).join('')

export function ntrpMarkup(camera: string, orbit: string): string {
  return `<section class="page-view" id="ntrp-view" aria-label="NTRP Skill Path" hidden>
    <div class="court-panel ntrp-panel" id="ntrp-panel">
      <div class="court-stage ntrp-stage">
        <div id="ntrp-canvas" class="court-viewport"><div class="world-labels" aria-label="Interactive practice markers"></div></div>
      </div>
      <div class="stage-top">
        <div class="stage-id"><span class="court-badge" id="ntrp-court-badge"><i></i> <span>Skill Path</span></span><span class="court-location" id="ntrp-stage-label">NTRP 1.0</span></div>
        ${camera}
      </div>
      ${orbit}
      <div class="mobile-drawers">
        <button type="button" data-drawer="skills" aria-expanded="false" aria-controls="ntrp-level-rail">${icon('layers', 16)} Skills</button>
        <button type="button" data-drawer="exercise" aria-expanded="false" aria-controls="ntrp-exercise-rail">${icon('target', 16)} Drill details</button>
      </div>

      <aside class="hud-panel hud-left ntrp-profile" id="ntrp-level-rail" aria-labelledby="ntrp-title">
        <div class="section-kicker">${icon('layers', 16)} <span id="ntrp-eyebrow">NTRP 1.0</span></div>
        <h1 id="ntrp-title">First Ball</h1>
        <p class="hud-copy" id="ntrp-overview"></p>
        <p class="ntrp-match" id="ntrp-match"></p>
        <div class="ntrp-skills" role="group" aria-label="Practice area">${skillButtons}</div>
        <button class="text-button ntrp-reference-button" id="ntrp-reference-open" type="button">${icon('book', 15)} Full level guide</button>
      </aside>

      <aside class="hud-panel hud-right ntrp-exercise" id="ntrp-exercise-rail" aria-labelledby="ntrp-skill-title">
        <div class="section-kicker">${icon('target', 16)} <span id="ntrp-skill-label"></span></div>
        <h2 id="ntrp-skill-title"></h2>
        <p class="hud-copy" id="ntrp-skill-description"></p>
        <p class="ntrp-focus" id="ntrp-focus"></p>
        <label class="setting-label ntrp-exercise-select" for="ntrp-exercise">Exercise
          <span class="select-shell"><select id="ntrp-exercise"></select>${icon('chevron', 13)}</span>
        </label>
        <div class="ntrp-objective"><span id="ntrp-pace"></span><p id="ntrp-objective"></p><small id="ntrp-exercise-record"></small></div>
        <button class="text-button" id="ntrp-watch-motion" type="button">${icon('body', 16)} Study this motion</button>
      </aside>

      <div class="game-console ntrp-console">
        <div class="ntrp-dock">
          <div class="ntrp-levels" role="group" aria-label="NTRP practice level">${levelButtons}</div>
          <div class="ntrp-actions">
            <button class="icon-button" type="button" id="ntrp-preview" aria-label="Preview shot" title="Preview shot">${icon('play', 19)}</button>
            <button class="primary-button" type="button" id="ntrp-practice">${icon('play', 19)} Practice drill</button>
          </div>
        </div>
        <div class="ntrp-record" id="ntrp-level-record"></div>
      </div>
    </div>
  </section>`
}

export function ntrpReferenceMarkup(): string {
  return `<dialog id="ntrp-reference" class="controls-dialog ntrp-reference" aria-labelledby="ntrp-reference-title">
    <form method="dialog">
      <div class="dialog-head">
        <div><p class="section-kicker">${icon('book', 16)} National Tennis Rating Program</p><h2 id="ntrp-reference-title">Level Guide · 1.0–4.5</h2></div>
        <button class="icon-button" type="submit" aria-label="Close level guide">${icon('close', 19)}</button>
      </div>
      <p>These summaries use USTA’s level characteristics, which include 1.0 as a starting stage. USTA’s current adult ratings start at 1.5. The stroke breakdowns, drills, and progress scores are Baseline practice material.</p>
      <div class="ntrp-reference-levels">
        ${NTRP_LEVELS.map(level => {
          const profile = NTRP[level]
          return `<details><summary><strong>${level}</strong><span>${profile.title}</span></summary>
            <p>${profile.overview}</p><p>${profile.match}</p>
            <dl>${Object.entries(profile.skills).map(([key, skill]) =>
              `<div><dt>${NTRP_SKILLS[key as NtrpSkill].label}</dt><dd>${skill.description}</dd></div>`).join('')}</dl>
            <button type="button" class="text-button" data-open-ntrp="${level}">View level ${level} on court ${icon('right', 15)}</button>
          </details>`
        }).join('')}
      </div>
      <div class="ntrp-source-links">
        <a class="quiet-link" href="${NTRP_REFERENCES.characteristics}" target="_blank" rel="noopener noreferrer">USTA general characteristics ${icon('external', 13)}</a>
        <a class="quiet-link" href="${NTRP_REFERENCES.ratings}" target="_blank" rel="noopener noreferrer">About official NTRP ratings ${icon('external', 13)}</a>
        <a class="quiet-link" href="${NTRP_REFERENCES.faqs}" target="_blank" rel="noopener noreferrer">USTA rating FAQs ${icon('external', 13)}</a>
        <a class="quiet-link" href="${NTRP_REFERENCES.selfRate}" target="_blank" rel="noopener noreferrer">Experienced-player self-rating guidance ${icon('external', 13)}</a>
      </div>
    </form>
  </dialog>`
}

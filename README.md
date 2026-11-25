# Baseline Tennis Lab

Baseline is a 3D tennis practice game with a court-first interface. The training controls, force readouts, and motion timeline surround the 3D scene. Players can select markers on the court or the athlete while keeping the action visible. The production app is installable and can run offline after its first successful load.

## Run the app

Use Node.js 24 and npm from the repository root.

```sh
npm ci
npm run dev
```

For the installable, offline production version, build and serve the generated site on localhost or over HTTPS.

```sh
npm run check
npm test
npm run build
npm run preview
```

Open the production site while online and wait for **Offline ready**. Reload while offline to practice from the cached application. To install it, use the download button when your browser offers one, or use the browser’s **Install** or **Add to Home Screen** command. The simulation, lessons, fonts, and diagrams are included in the cache. The Field Guide’s external reading links require a connection.

## NTRP Skill Path

Open **Skill Path** and choose any of the eight levels from **1.0 through 4.5**. Each level covers forehand, backhand, serve and return, volleys, special shots, and movement and match play. **Full level guide** contains all eight profiles and their skill breakdowns.

Select a skill and exercise to see the feed’s intended contact position, landing zone, and any partner or recovery position on the court. Preview the shot, study its motion in Technique Lab, or choose **Practice drill** to load it into the playable court. There are 104 level-and-skill drill choices across 18 exercise types. Easier drills use slower feeds and wider timing windows. Advanced drills ask for changing depth and direction, tighter placement, faster returns, two-ball point patterns, and coordinated doubles positions. Progress is saved locally per drill and remains available offline.

The 1.0 starting stage follows the USTA characteristics chart. The USTA’s current adult rating scale starts at 1.5. The practice records show drill completion in Baseline. [USTA characteristics](https://www.usta.com/content/dam/usta/sections/eastern/pdfs/NTRP%20Characteristics.pdf) · [USTA rating information](https://www.usta.com/en/home/play/adult-tennis/programs/national/about-ntrp-ratings.html)

## Practice

| Drill | Goal |
| --- | --- |
| Forehand Fundamentals | Land five drives in the highlighted deep cross-court lane. |
| Serve Placement | Time the toss near its apex and put five serves in the target. Switch between deuce and ad courts. |
| Footwork & Recovery | Split as the feeder hits, move to the ball, return it in bounds, and recover into the center ring. |
| Rally Builder | Keep six consecutive shots in the singles court against the moving feeder. |

- Move with **W A S D** or the arrow keys. Swing with **Space** when the contact indicator turns green. Use **Shift** to split-step and **P** to start or pause.
- Click or tap the far court to aim. Use **Q / E** to adjust left and right or **R / F** to adjust depth.
- On a touchscreen, use the direction, Swing, and Split buttons below the court. Start and pause from the same panel.
- Press **C** to cycle cameras, or select baseline, player, sideline, overhead, net, ball chase, or free orbit from the camera menu. Drag around the scene in free orbit and use the distance slider or wheel to zoom. The arrow keys also orbit while practice is paused. Hide the interface and enter fullscreen independently.
- Press **T** or select **Replay** after a shot. Scrub from preparation through contact and landing, play the clip at reduced speed, or jump directly to a racket, net, or court impact. The replay preserves the original surface and wind. Drill bests and preferences are stored locally.

**Technique Lab** shows the forehand, two-handed backhand, serve, split-step, forehand and backhand volleys, half-volley, overhead, topspin lob, and drop shot in five stages each. Scrub through the stroke or use slow motion. Fixed-length arm and leg segments follow a joint-constrained pose path. Select the leg, trunk, or racket-arm marker to see the relevant muscle groups. The 3D overlays show foot load, center of mass, knee and elbow flexion, hip–shoulder separation, and the racket head path. Switch between front, rear, profile, three-quarter, court-level, or free-orbit views.

**Force Analysis** shows the same gravity, air drag, and Magnus forces used by the flight solver. The impact channel calculates impulse from the ball’s change in momentum. Average force divides that impulse by the modeled contact duration. Energy change refers to translational kinetic energy. The body view estimates ground reaction from the acceleration of a pose-defined center of mass for a 75 kg reference athlete. Muscle highlights illustrate functional roles through the stroke. The body model and contact durations are illustrative.

**Field Guide** compares flight and rebound under different surfaces and crosswinds. The game integrates ball flight at 120 steps per second in SI units. Bounce uses separate restitution and horizontal grip values. Slice serves add sidespin.

## Research basis

- Regulation court geometry and diagonal service rules follow the ITF rules reproduced in *Friend at Court*. [USTA](https://www.usta.com/content/dam/usta/2024-pdfs/friend-at-court.pdf)
- The motion lessons use stroke preparation and kinetic-chain concepts from Bruce Elliott’s review. [Biomechanics and Tennis](https://pubmed.ncbi.nlm.nih.gov/16632567/)
- The ball-flight demonstration uses Rod Cross’s discussion of spin and the racket–ball interaction. [Physics of Tennis](https://www.physics.usyd.edu.au/~cross/tennis.html)
- The split-step lesson uses observed timing around the opponent’s stroke. [Split-Step Timing of Professional and Junior Tennis Players](https://doi.org/10.1515/hukin-2017-0009)

## Publish to GitHub Pages

1. In the GitHub repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Push the project to `main`. The workflow type-checks, tests, builds, and deploys the site. It can also be run manually from the **Actions** tab on `main`.
3. Open the URL shown by the workflow’s `github-pages` deployment. The build uses relative paths so the manifest, service worker, and assets resolve from the project subdirectory.

The production build precaches a content-versioned list of the deployed files. After a deployment update, close the existing app tabs and reopen the site to let a waiting worker replace the previous version consistently.

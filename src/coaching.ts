import type { Technique } from './config.ts'

type Chapter = { label: string; title: string; text: string; watch: string; time: number }
type Lesson = { label: string; summary: string; duration: number; phases: Chapter[] }

export const TECHNIQUES: Record<Technique, Lesson> = {
  forehand: {
    label: 'Forehand', duration: 2.2,
    summary: 'A right-handed topspin drive from the baseline. Watch how the legs and torso help move the racket from low to high.',
    phases: [
      { label: 'Ready', title: 'Start balanced', text: 'Set your feet comfortably apart with soft knees and the racket in front. Leave room on either side to move.',
        watch: 'Weight stays between the feet.', time: .02 },
      { label: 'Turn', title: 'Turn as a unit', text: 'Turn the shoulders and hips as you prepare. Keep the non-hitting arm out to help judge the distance to the ball.',
        watch: 'The chest begins to turn before the hitting arm accelerates.', time: .24 },
      { label: 'Load', title: 'Load the outside leg', text: 'Use small adjustment steps to space the ball. Bend through the hips and knees and let the racket head drop below contact height.',
        watch: 'The right hip and knee sit lower as the racket drops.', time: .43 },
      { label: 'Contact', title: 'Brush up through contact', text: 'Push from the ground, then let the hips and trunk rotate through. Meet the ball on the hitting side, slightly ahead of the body.',
        watch: 'The racket rises through the hitting zone with the torso opening.', time: .62 },
      { label: 'Finish', title: 'Let the racket travel', text: 'Allow the arm to decelerate across your body. Regain your balance and get your racket back in front.',
        watch: 'The torso turns through as the arm finishes across the chest.', time: .82 },
    ],
  },
  backhand: {
    label: 'Two-handed Backhand', duration: 2.25,
    summary: 'A right-handed two-handed backhand. The supporting hand helps guide the racket through the ball.',
    phases: [
      { label: 'Ready', title: 'Prepare both hands', text: 'Bring both hands onto the handle early and keep the racket in front while judging the incoming ball.',
        watch: 'The feet stay light and the hands stay connected.', time: .02 },
      { label: 'Turn', title: 'Show the shoulder', text: 'Turn your right shoulder toward the ball. Use adjustment steps to make room for both arms.',
        watch: 'The chest turns while the head stays oriented toward the ball.', time: .24 },
      { label: 'Load', title: 'Lower the racket head', text: 'Set a stable base with bent knees. The hands stay near the body while the racket head drops.',
        watch: 'The hands move together as the knees load.', time: .43 },
      { label: 'Contact', title: 'Drive through with both hands', text: 'Let the legs and trunk initiate the forward motion. Meet the ball slightly ahead of the lead hip.',
        watch: 'The left arm helps extend the racket toward the ball.', time: .62 },
      { label: 'Finish', title: 'Finish over the shoulder', text: 'Let both arms travel up and across as the torso completes the turn. Rebalance before moving.',
        watch: 'The racket keeps moving as the upper body slows.', time: .83 },
    ],
  },
  serve: {
    label: 'Serve', duration: 2.4,
    summary: 'An overhand serve from a right-handed stance. Follow the toss, loading, upward reach, and landing.',
    phases: [
      { label: 'Set', title: 'Set behind the baseline', text: 'Stand sideways with a comfortable stagger. Pick a target in the diagonal service box before beginning the motion.',
        watch: 'The feet start behind the baseline and the shoulders are turned.', time: .02 },
      { label: 'Toss', title: 'Place a quiet toss', text: 'Lift with a steady tossing arm. Place the ball within comfortable overhead reach and slightly into the court.',
        watch: 'The lead arm extends while the hitting arm moves into preparation.', time: .25 },
      { label: 'Load', title: 'Build the upward drive', text: 'Bend through the knees while the racket moves behind the body. Keep the motion smooth so the legs and trunk can extend in sequence.',
        watch: 'The knees sink while the racket head drops behind the hitting shoulder.', time: .43 },
      { label: 'Reach', title: 'Strike at full, comfortable reach', text: 'Extend upward and let the shoulder and arm accelerate the racket. Find the ball at the top of your reach.',
        watch: 'The hitting arm extends while the tossing arm folds down.', time: .62 },
      { label: 'Land', title: 'Land in balance', text: 'Allow the arm to continue across the body. Land softly and prepare for the return.',
        watch: 'The trunk moves forward as the racket slows across the body.', time: .82 },
    ],
  },
  footwork: {
    label: 'Split-Step', duration: 1.85,
    summary: 'A small preparatory hop followed by a directional push and a return to ready position.',
    phases: [
      { label: 'Ready', title: 'Stay on the balls of your feet', text: 'Start with a relaxed, athletic base. Watch the opponent and prepare to move either way.',
        watch: 'The center of mass sits between the feet.', time: .02 },
      { label: 'Hop', title: 'Time a small hop', text: 'Start a small split as the opponent is about to strike. Keep it low so you can land as you read the direction.',
        watch: 'The body rises just enough to unload both feet.', time: .22 },
      { label: 'Land', title: 'Land with soft knees', text: 'Land at about shoulder width and absorb through the ankles, knees, and hips. Load the leg that can push you toward the ball.',
        watch: 'The knees flex under the hips as the feet separate.', time: .43 },
      { label: 'Push', title: 'Push toward the ball', text: 'Drive sideways from the loaded foot, then use shorter steps near the ball to get the spacing right.',
        watch: 'The hips lead the first step as the racket stays in front.', time: .65 },
      { label: 'Recover', title: 'Return toward your next position', text: 'Recover after the hit, then split again for the next shot. In a neutral rally, start back toward the middle.',
        watch: 'The upper body returns to an even, ready position.', time: .84 },
    ],
  },
}

export const REFERENCES = [
  { title: 'ITF Rules of Tennis · USTA edition', detail: 'Court dimensions, net heights, and service rules.', url: 'https://www.usta.com/content/dam/usta/2024-pdfs/friend-at-court.pdf' },
  { title: 'Bruce Elliott · Biomechanics and tennis', detail: 'A review of stroke mechanics and the kinetic chain.', url: 'https://pubmed.ncbi.nlm.nih.gov/16632567/' },
  { title: 'Rod Cross · Physics of Tennis', detail: 'How spin and ball–racket contact shape a shot.', url: 'https://www.physics.usyd.edu.au/~cross/tennis.html' },
  { title: 'Filipčič et al. · Split-step timing', detail: 'How experienced players time their split-step around contact.', url: 'https://doi.org/10.1515/hukin-2017-0009' },
] as const

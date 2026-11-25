export const NTRP_LEVELS = ['1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5'] as const
export type NtrpLevel = (typeof NTRP_LEVELS)[number]

export const NTRP_SKILLS = {
  forehand: { label: 'Forehand', icon: 'racket', tone: 'lime' },
  backhand: { label: 'Backhand', icon: 'racket', tone: 'lavender' },
  serve: { label: 'Serve & return', icon: 'serve', tone: 'amber' },
  volley: { label: 'Volleys', icon: 'crosshair', tone: 'blue' },
  special: { label: 'Special shots', icon: 'route', tone: 'amber' },
  play: { label: 'Movement & match play', icon: 'steps', tone: 'blue' },
} as const
export type NtrpSkill = keyof typeof NTRP_SKILLS

export const EXERCISES = {
  forehand: { title: 'Forehand Drive', cue: 'Turn early, move to the bounce, and meet the ball out in front.' },
  backhand: { title: 'Backhand Drive', cue: 'Turn your shoulders early and make room for the racket before contact.' },
  serve: { title: 'First Serve', cue: 'Set behind the baseline and reach up as the toss enters your strike zone.' },
  spinServe: { title: 'Spin Second Serve', cue: 'Use spin and a comfortable margin. Find the requested part of the diagonal box.' },
  return: { title: 'Serve Return', cue: 'Split as the server strikes. Shorten the preparation and meet the bounce in front.' },
  pressureReturn: { title: 'Attack a Second Serve', cue: 'Move inside the baseline for the slower serve. Drive through the highlighted lane.' },
  volley: { title: 'Volley Before the Bounce', cue: 'Keep the racket out front. Block the feed in the air with a compact motion.' },
  lowVolley: { title: 'Low & Wide Volleys', cue: 'Lower through your knees and move your feet to the ball. Lift it with the racket face.' },
  lob: { title: 'Lob Over the Net Player', cue: 'Send the ball above the net player and bring the first bounce down inside the baseline.' },
  drop: { title: 'Drop Shot', cue: 'Use a soft backspin touch to land near the net and take pace off the bounce.' },
  approach: { title: 'Approach and Close', cue: 'Move in on the short ball, aim deep, then close to the service-line recovery ring.' },
  halfVolley: { title: 'Half-Volley Pickup', cue: 'Bend your knees and catch the ball just as it rises off the court.' },
  overhead: { title: 'Overhead Smash', cue: 'Turn sideways, get behind the lob, and reach to meet it high in front.' },
  pass: { title: 'Pass the Net Player', cue: 'Use the open lane. Clear the player at net without giving up the singles line.' },
  recovery: { title: 'Split-Step & Recover', cue: 'Split as the feed starts, move to the bounce, then recover inside the center ring.' },
  rally: { title: 'Sustain a Rally', cue: 'Allow space on both sides and build a streak of legal shots.' },
  doubles: { title: 'Doubles Positioning', cue: 'Watch your partner’s position. Cover your lane and recover to the marked space after contact.' },
  pattern: { title: 'Build the Point', cue: 'Move the opponent with a deep drive, then use the open lane on the next ball.' },
} as const
export type Exercise = keyof typeof EXERCISES

type Skill = { description: string; focus: string; exercises: readonly Exercise[] }
type Level = { title: string; overview: string; match: string; skills: Record<NtrpSkill, Skill> }

function skill(description: string, focus: string, ...exercises: Exercise[]): Skill {
  return { description, focus, exercises }
}

export const NTRP: Record<NtrpLevel, Level> = {
  '1.0': {
    title: 'First Ball',
    overview: 'This is the starting point for someone new to tennis. Learn where to stand, how the ball bounces, and how to make contact.',
    match: 'Start with cooperative short-court feeds and learn the court markings.',
    skills: {
      forehand: skill('Discover a natural forehand grip and a comfortable contact point beside the body.', 'Let a slow ball bounce, then guide it over the net from the short court.', 'forehand'),
      backhand: skill('Try the backhand side with two hands on the racket. Get used to turning your shoulders.', 'Find the bounce in front of your lead hip and guide the ball back.', 'backhand'),
      serve: skill('Learn the baseline, the opposite service box, and the difference between serving and returning.', 'Rehearse a comfortable toss and aim into the diagonal box. Try blocking a slow serve back.', 'serve', 'return'),
      volley: skill('Experiment with meeting the ball before it bounces. Start close to the net with a soft feed.', 'Keep the racket head visible in front and make a short block.', 'volley'),
      special: skill('Explore what happens when you lift the ball higher over the net.', 'Aim a gentle, high ball toward the middle of the court.', 'lob'),
      play: skill('Learn ready position, singles boundaries, and where a doubles partner stands.', 'Take a step to the ball, then come back to the recovery ring.', 'recovery', 'doubles'),
    },
  },
  '1.5': {
    title: 'Ball Into Play',
    overview: 'With limited experience, the main goal is getting the ball into play. Strokes are beginning to develop, and cooperative practice is the next step before competition.',
    match: 'Try several playable balls at a slow pace. Rehearse service order and deuce/ad positioning.',
    skills: {
      forehand: skill('Forehand timing is developing. A friendly pace gives time to turn and find the strings.', 'Send a sequence of slow feeds back through a large in-court window.', 'forehand'),
      backhand: skill('A backhand grip and shoulder turn are still new. Repeating gentle feeds helps make contact reliable.', 'Set both hands early and finish a short swing toward the middle.', 'backhand'),
      serve: skill('Getting the first ball into play matters most. The toss, reach, and diagonal direction are still being learned.', 'Use a repeatable toss and guide the serve in. On return, aim into the middle of the far court.', 'serve', 'return'),
      volley: skill('Net contact feels unfamiliar. A compact block is easier to repeat than a full swing.', 'Set the racket in front and direct a soft feed into a large target.', 'volley'),
      special: skill('A high ball can buy time to recover. At this stage, explore the arc and landing together.', 'Lift with an open face and give yourself a generous target.', 'lob'),
      play: skill('Starting positions are becoming familiar. Ready position and resetting between shots still need repetition.', 'Return to the marked space after a hit, then try a short exchange.', 'recovery', 'rally', 'doubles'),
    },
  },
  '2.0': {
    title: 'Find Contact',
    overview: 'More on-court experience is needed. Finding the right contact point is difficult, basic singles and doubles positions are still unfamiliar, and strokes benefit from instruction.',
    match: 'Use simple feeds to recognize forehand or backhand and recover after each ball.',
    skills: {
      forehand: skill('Timing, spacing, and a repeatable swing are developing. Direction can vary even on an easy feed.', 'Adjust your feet so contact is outside your front hip.', 'forehand'),
      backhand: skill('Late preparation, grip changes, or crowding can disrupt the backhand. Players may favor the forehand side.', 'Turn before the bounce and use two hands for a simple drive.', 'backhand'),
      serve: skill('The service motion and toss are still inconsistent. Returns become harder when the serve changes height or direction.', 'Build a steady motion to a large service target. Block a moderate feed with a short return.', 'serve', 'return'),
      volley: skill('Net play is still unfamiliar. Reaching and taking too large a swing can unsettle both sides.', 'Step toward the feed with the racket already in front.', 'volley'),
      special: skill('A deliberate high ball is an approachable way to begin specialty-shot practice.', 'Compare a lifted ball with a drive and keep the lob in a broad target.', 'lob'),
      play: skill('Court positions and finding the right distance from the bounce are still new in singles and doubles.', 'Recognize where the ball is going, move, then find your home position again.', 'recovery', 'rally', 'doubles'),
    },
  },
  '2.5': {
    title: 'Keep a Rally',
    overview: 'Players begin to read the incoming ball and judge how much swing they need. A short, slow baseline rally is possible. Recovery is often inefficient, and grips or the serving toss can still limit play.',
    match: 'Basic singles and doubles positions are becoming familiar. Social matches and entry-level competition can fit this stage.',
    skills: {
      forehand: skill('The basic swing is forming and a slow, cooperative feed can be returned consistently for short stretches.', 'Read the bounce, pick a wide target, and keep the ball in front.', 'forehand'),
      backhand: skill('Routine feeds are playable, while high or fast balls expose late preparation and grip issues.', 'Turn early, then use adjustment steps to keep a comfortable strike height.', 'backhand'),
      serve: skill('A fuller service motion is developing. An inconsistent toss and limited swing can reduce serve reliability.', 'Repeat the toss and serve to the big part of the box. Start returns with a short block.', 'serve', 'return'),
      volley: skill('Moving from the baseline to the net is still difficult. Backhand volleys and low feeds can be uncomfortable.', 'Use a short volley with your weight moving forward.', 'volley', 'lowVolley'),
      special: skill('Lifted balls can be intentional, though placement and depth are still developing.', 'Land a lob in the far court with room inside the baseline.', 'lob'),
      play: skill('Players can sustain a slow exchange but can take extra steps to reach the ball or get back into position.', 'Try a slow rally, return to the center after a feed, and rehearse one-up, one-back in doubles.', 'rally', 'recovery', 'doubles'),
    },
  },
  '3.0': {
    title: 'Build Consistency',
    overview: 'Medium-paced balls can be hit fairly consistently. Direction, depth, pace changes, and shots outside the preferred strike zone still cause errors.',
    match: 'One-up, one-back is a common doubles starting formation. Net play can still feel uncomfortable.',
    skills: {
      forehand: skill('The forehand handles moderate pace. Direction has some intent, while depth and changes of pace are still inconsistent.', 'Aim cross-court with margin and repeat the same contact height.', 'forehand'),
      backhand: skill('A prepared backhand can handle a moderate ball. Height, width, and forced pace can make it less reliable.', 'Turn before the bounce and send a neutral backhand through a wide lane.', 'backhand'),
      serve: skill('First-serve rhythm is forming. Adding speed can break consistency, and the second serve may be predictable.', 'Build a repeatable first serve and add spin for margin. Return a moderate serve with a compact swing.', 'serve', 'spinServe', 'return'),
      volley: skill('A routine forehand volley is becoming dependable. Backhand, low, and wide volleys are more demanding.', 'Split and use footwork to reach alternating sides before the bounce.', 'volley', 'lowVolley'),
      special: skill('Players can start to use a high defensive ball or basic spin in a neutral exchange.', 'Use a lob to gain time and try a short, controlled approach to the net.', 'lob', 'approach'),
      play: skill('Reliable contact at moderate pace supports a rally. Changing depth or handling balls outside the strike zone can break it.', 'Sustain the rally, restore the neutral position in singles, and cover your lane in one-up, one-back doubles.', 'rally', 'recovery', 'doubles'),
    },
  },
  '3.5': {
    title: 'Direct the Ball',
    overview: 'Groundstrokes are dependable with directional control at moderate pace. Depth and variety are still developing, including the ability to change how far shots travel.',
    match: 'Court awareness and net comfort improve. Doubles teamwork, concentration, and point tactics are developing.',
    skills: {
      forehand: skill('The forehand can direct a moderate rally ball. Depth, spin choices, and movement off a difficult feed are developing.', 'Alternate cross-court and down-the-line targets. Keep the same balance as the direction changes.', 'forehand'),
      backhand: skill('The backhand can sustain a moderate exchange and change direction. High or heavy feeds and fine depth changes are less comfortable.', 'Use a balanced turn and get to the ball early enough to choose your lane.', 'backhand'),
      serve: skill('Players can vary placement and are developing a more dependable second serve. Faster or higher returns still test the preparation.', 'Alternate placement, use a spin second serve, and return to a chosen lane.', 'serve', 'spinServe', 'return'),
      volley: skill('Net play is more comfortable. Direction is possible on a routine volley, while low and wide feeds make depth and variety harder.', 'Close under control, split, and use a compact block on either side.', 'volley', 'lowVolley'),
      special: skill('Lobs, overheads, approaches and volleys are available, but their use under pressure is still limited.', 'Choose a high reset, step through an approach, or find space to reach the overhead. Rehearse the early pickup separately.', 'lob', 'overhead', 'approach', 'halfVolley', 'drop'),
      play: skill('Coverage and doubles teamwork improve. Players can rally from the baseline against a net player and begin to choose patterns intentionally.', 'Recover to the likely reply, keep the ball in a safe lane, and move with your partner when taking the net.', 'rally', 'recovery', 'doubles', 'pattern'),
    },
  },
  '4.0': {
    title: 'Control Depth',
    overview: 'Both groundstroke sides are dependable on moderate balls. Players can direct them and vary depth, and they can use lobs, overheads, approaches, and volleys successfully.',
    match: 'A dependable second serve can create opportunities. Partners work together in doubles, and impatience can still end points early.',
    skills: {
      forehand: skill('The forehand can control both direction and depth at a moderate pace. A short ball can set up an attacking position.', 'Find the requested deep or shorter landing zone, then recover for the next ball.', 'forehand', 'approach'),
      backhand: skill('The backhand handles moderate rally pace and can be directed or varied in depth.', 'Keep the preparation consistent while changing the launch and target depth.', 'backhand'),
      serve: skill('First- and second-serve patterns are more dependable, and a serve can sometimes force an error. A return can be directed with intent.', 'Mix first-serve targets, commit to a spin second serve, and redirect the return.', 'serve', 'spinServe', 'return'),
      volley: skill('Volleys on either side can be placed and can finish a favorable ball. More difficult feeds still test control and variety.', 'Read the height, choose a deep or shorter target, and expect another ball.', 'volley', 'lowVolley'),
      special: skill('Lob, overhead, and approach are usable choices in a point. Drop shots, passes, and half-volleys add options for different court positions.', 'Recognize when to buy time, close forward, pass the net player, or finish an overhead.', 'lob', 'overhead', 'approach', 'drop', 'halfVolley', 'pass'),
      play: skill('Players recognize opportunities to finish but may rush the decision. Doubles partners cover for each other and coordinate at net.', 'Shape the point with depth first. Move as a team and recover to your assigned lane.', 'pattern', 'doubles', 'rally', 'recovery'),
    },
  },
  '4.5': {
    title: 'Construct Points',
    overview: 'Players vary pace and spin, cover the court effectively, and control depth. They can build a game plan around strengths and weaknesses and adapt it to the opponent.',
    match: 'A powerful, accurate first serve and a placed second serve can create advantages. Players may overhit difficult balls, and aggressive net play is common in doubles.',
    skills: {
      forehand: skill('A dependable forehand can vary pace, spin, direction, and depth to set up a winning pattern.', 'Move the opponent with a deep ball, then attack the opening while leaving a margin on the difficult feed.', 'forehand', 'approach', 'pattern'),
      backhand: skill('The backhand can change depth and mix spins under pressure. It can hold the rally, redirect, or find the open court.', 'Respond to the selected depth and placement instead of forcing speed from a poor position.', 'backhand', 'pass'),
      serve: skill('The first serve combines power and accuracy. A second serve can be placed with spin. Strong returns can claim control of the point.', 'Hit different first-serve lanes, place the spin second serve, and step in when a return can be attacked.', 'serve', 'spinServe', 'return', 'pressureReturn'),
      volley: skill('Footwork and direction support aggressive net play. The player can manage a series of volleys and has a choice between depth and touch.', 'Move through alternating feeds with a stable racket face, then recover to cover the next angle.', 'volley', 'lowVolley', 'doubles'),
      special: skill('Special shots are tactical choices. A lob can reset or attack, a pass can evade the net player, and a short ball can invite an approach, drop shot, or overhead finish.', 'Choose the landing zone and stroke for the situation, then prepare for the reply. Keep defensive shots within a safe margin.', 'lob', 'overhead', 'approach', 'drop', 'halfVolley', 'pass'),
      play: skill('Court coverage and planning let a player build around a strength or protect a weaker shot. Partners anticipate together and pressure the net.', 'Alternate depth and angle to open the court. In doubles, guard the middle with your partner and recover after cutting off a ball.', 'pattern', 'doubles', 'rally', 'recovery'),
    },
  },
}

export const NTRP_REFERENCES = {
  characteristics: 'https://www.usta.com/content/dam/usta/sections/eastern/pdfs/NTRP%20Characteristics.pdf',
  ratings: 'https://www.usta.com/en/home/play/adult-tennis/programs/national/about-ntrp-ratings.html',
  faqs: 'https://www.usta.com/en/home/play/adult-tennis/programs/national/usta-ntrp-ratings-faqs.html',
  selfRate: 'https://www.usta.com/content/dam/usta/pdfs/10013_experience_player_ntrp_guidelines.pdf',
} as const

export function isNtrpLevel(value: unknown): value is NtrpLevel {
  return typeof value === 'string' && Object.hasOwn(NTRP, value)
}

export function isNtrpSkill(value: unknown): value is NtrpSkill {
  return typeof value === 'string' && Object.hasOwn(NTRP_SKILLS, value)
}

export const COURT = {
  halfLength: 11.885,
  singles: 4.115,
  doubles: 5.485,
  service: 6.4,
  postX: 6.4,
  stickX: 5.029,
  netCenter: 0.914,
  netPost: 1.07,
  ballRadius: 0.0335,
} as const

export const SURFACES = {
  hard: { label: 'Hard Court', restitution: 0.74, friction: .27, paint: 0x38689b, apron: 0x3e7169 },
  clay: { label: 'Clay Court', restitution: 0.78, friction: .39, paint: 0xac5333, apron: 0x80573b },
  grass: { label: 'Grass Court', restitution: 0.57, friction: .185, paint: 0x627d48, apron: 0x4c653b },
} as const

export const SHOTS = {
  topspin: { label: 'Topspin', spin: 2450, duration: 1.06, serveDuration: 0.69, color: '#d9fe52',
    tip: 'Brush low to high. A dipping arc buys clearance above the net.' },
  flat: { label: 'Flat', spin: 250, duration: 0.95, serveDuration: 0.62, color: '#e6ecdf',
    tip: 'Drive through the ball. The fast, direct path leaves less margin.' },
  slice: { label: 'Slice', spin: -1550, duration: 1.20, serveDuration: 0.74, color: '#79d4df',
    tip: 'Carve under the ball. Backspin makes this flight float longer.' },
} as const

export const WINDS = {
  calm: { label: 'Calm', speed: 0 },
  right: { label: 'Toward right', speed: 4.5 },
  left: { label: 'Toward left', speed: -4.5 },
} as const

export type Surface = keyof typeof SURFACES
export type Shot = keyof typeof SHOTS
export type Trajectory = 'drive' | 'lob' | 'drop' | 'volley' | 'smash'
export type Wind = keyof typeof WINDS
export type DrillId = keyof typeof DRILLS
export type Technique = 'forehand' | 'backhand' | 'serve' | 'footwork' | 'volley' | 'backhandVolley' | 'overhead' | 'halfVolley' | 'lob' | 'drop'
export type Vec3 = { x: number; y: number; z: number }
export type Aim = { x: number; z: number }
export type Zone = { xMin: number; xMax: number; zMin: number; zMax: number }

export const DRILLS = {
  forehand: {
    title: 'Forehand Fundamentals', icon: 'racket', theme: 'lime',
    description: 'Build a reliable drive with clean timing and deep cross-court placement.',
    cardDescription: 'Find your timing and drive cross-court.', goal: 5, goalLabel: 'Target hits', shot: 'topspin',
    coach: 'Meet the ball out in front. Swing low to high and finish across your body.',
  },
  serve: {
    title: 'Serve Placement', icon: 'serve', theme: 'amber',
    description: 'Time the toss at full reach and land your serve in the opposite service box.',
    cardDescription: 'Time the toss and hit your spots.', goal: 5, goalLabel: 'Serves in target', shot: 'flat',
    coach: 'Reach up to contact and let your arm follow through after the hit.',
  },
  footwork: {
    title: 'Footwork & Recovery', icon: 'steps', theme: 'blue',
    description: 'Split as the feeder hits, move out to the ball, then recover to the center mark.',
    cardDescription: 'Split, move, hit, and recover.', goal: 4, goalLabel: 'Hit + recover', shot: 'topspin',
    coach: 'Time your split as the feeder strikes. Start back toward center as soon as you hit.',
  },
  rally: {
    title: 'Rally Builder', icon: 'rally', theme: 'lavender',
    description: 'Keep a live exchange going against the feeder. Move for both forehands and backhands.',
    cardDescription: 'Build a streak with a live opponent.', goal: 6, goalLabel: 'Best rally streak', shot: 'topspin',
    coach: 'Aim through the big part of the court. Recover toward the middle between shots.',
  },
  match: {
    title: 'Singles Tiebreak', icon: 'trophy', theme: 'amber',
    description: 'Serve, return and play out each point against a moving opponent. First to seven, win by two.',
    cardDescription: 'Play a singles tiebreak.', goal: 7, goalLabel: 'Your points', shot: 'topspin',
    coach: 'Push your opponent wide, recover across the likely replies, then change direction into the open court.',
  },
} as const

export const DRILL_ORDER: DrillId[] = ['forehand', 'serve', 'footwork', 'rally', 'match']

export function targetFor(drill: DrillId, adSide: boolean): Zone {
  if (drill === 'serve') {
    return adSide
      ? { xMin: 0.6, xMax: 3.85, zMin: -6.2, zMax: -3.35 }
      : { xMin: -3.85, xMax: -0.6, zMin: -6.2, zMax: -3.35 }
  }
  if (drill === 'forehand') return { xMin: -3.85, xMax: -0.65, zMin: -11.60, zMax: -8.0 }
  return { xMin: -COURT.singles, xMax: COURT.singles, zMin: -COURT.halfLength, zMax: -0.05 }
}

export function zoneCenter(zone: Zone): Aim {
  return { x: (zone.xMin + zone.xMax) / 2, z: (zone.zMin + zone.zMax) / 2 }
}

export function inZone(position: Aim, zone: Zone): boolean {
  return position.x >= zone.xMin && position.x <= zone.xMax
    && position.z >= zone.zMin && position.z <= zone.zMax
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

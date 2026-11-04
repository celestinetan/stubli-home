import { useEffect, useRef, useState } from 'preact/hooks'

// Little stick figures that dance on the bottom bar while music plays. Every time the music
// starts, a new crew turns up: usually one dancer, sometimes a friend or two. On each beat every
// dancer picks a move at random; now and then the whole crew does the same move together. They
// leave when the music stops, and stand still if the tablet asks for reduced motion.

// A pose is a set of joint angles in degrees (0 = limb hanging straight down; positive turns the
// figure's left limbs outwards), plus a hop (dy) and a lean (tilt).
//            lS    lE   rS    rE   lH   lK   rH   rK  dy  tilt
const MOVES = {
  stand:    [10,    0,  -10,    0,   4,   0,  -4,   0,  0,  0],
  armsUp:   [160,  10, -160,  -10,   8,   0,  -8,   0, -1,  0],
  disco:    [150,   0,  -35,  -95,  14,   0,  -4,  25,  0, -6],
  discoR:   [35,   95, -150,    0,   4, -25, -14,   0,  0,  6],
  swayL:    [55,   55,  -70,  -50,  12,   0, -16,   0,  0, -10],
  swayR:    [70,   50,  -55,  -55,  16,   0, -12,   0,  0, 10],
  jump:     [125,  20, -125,  -20,  32, -55, -32,  55, -5,  0],
  kickR:    [85,    0,  -85,    0,   2,   0, -75,   0, -1,  4],
  kickL:    [85,    0,  -85,    0,  75,   0,  -2,   0, -1, -4],
  robot:    [90,   90,  -90,  -90,   8,   0,  -8,   0,  0,  0],
  robotUp:  [90,  -90,  -90,   90,   8,   0,  -8,   0,  0,  0],
  wave:     [165,  35,  -20,    0,  10,   0, -10,   0,  0, -3],
  squat:    [95,  -60,  -95,   60,  45, -80, -45,  80,  5,  0],
  twist:    [45,   95,  -45,  -95,  22, -35,  -4,   0,  1,  8],
  clap:     [60,  120,  -60, -120,   6,   0,  -6,   0,  0,  0],
  point:    [10,    0, -135,    0,   6,   0, -18,  20,  0,  5],
}
const NAMES = Object.keys(MOVES).filter((m) => m !== 'stand')
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const BEAT = 480 // ms, a relaxed tempo

function newCrew() {
  const r = Math.random()
  const n = r < 0.55 ? 1 : r < 0.85 ? 2 : 3
  // Each crew has a favourite handful of moves, so every dance looks a little different.
  const repertoire = [...NAMES].sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 4))
  return { n, repertoire, tones: ['var(--ink)', 'var(--accent)', 'var(--muted)'].sort(() => Math.random() - 0.5) }
}

export function Dancers({ on }) {
  const [crew, setCrew] = useState(null)
  const [poses, setPoses] = useState([])
  const still = useRef(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (!on) { setCrew(null); return }
    const c = newCrew()
    setCrew(c)
    setPoses(Array.from({ length: c.n }, () => 'stand'))
    if (still.current) return
    let beat = 0
    const t = setInterval(() => {
      beat++
      // Every so often the crew moves in sync; otherwise each dancer does their own thing,
      // sometimes holding a move for an extra beat.
      if (c.n > 1 && beat % 8 < 2) {
        const m = pick(c.repertoire)
        setPoses(Array.from({ length: c.n }, () => m))
      } else {
        setPoses((p) => p.map((old) => (Math.random() < 0.2 ? old : pick(c.repertoire))))
      }
    }, BEAT)
    return () => clearInterval(t)
  }, [on])

  if (!on || !crew) return null
  return (
    <span class={`dancers n${crew.n}`} aria-hidden="true">
      {poses.map((m, i) => <Figure key={i} pose={MOVES[m]} tone={crew.tones[i]} />)}
    </span>
  )
}

// One figure, drawn standing (arms and legs straight down) and turned at its joints.
function Figure({ pose, tone }) {
  const [lS, lE, rS, rE, lH0, lK, rH0, rK, dy, tilt] = pose
  // Legs get a little extra swing and a wider stance, so the moves read from across the room.
  const lH = lH0 * 1.5 + 7, rH = rH0 * 1.5 - 7
  const r = (deg, x, y) => ({ transform: `rotate(${deg}deg)`, transformOrigin: `${x}px ${y}px` })
  return (
    <svg class="dancer" viewBox="0 0 24 40" style={{ color: tone }}>
      <g class="dancer-body" style={{ transform: `translateY(${dy}px) rotate(${tilt}deg)`, transformOrigin: '12px 38px' }}>
        <circle cx="12" cy="6" r="3.6" />
        <path d="M12 10v14" />
        <g style={r(lS, 12, 13)}><path d="M12 13v6.5" /><g style={r(lE, 12, 19.5)}><path d="M12 19.5v6" /></g></g>
        <g style={r(rS, 12, 13)}><path d="M12 13v6.5" /><g style={r(rE, 12, 19.5)}><path d="M12 19.5v6" /></g></g>
        <g style={r(lH, 12, 24)}><path d="M12 24v7" /><g style={r(lK, 12, 31)}><path d="M12 31v7" /></g></g>
        <g style={r(rH, 12, 24)}><path d="M12 24v7" /><g style={r(rK, 12, 31)}><path d="M12 31v7" /></g></g>
      </g>
    </svg>
  )
}

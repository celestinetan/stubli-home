import { useEffect, useRef, useState } from 'preact/hooks'

// Little stick figures that groove on the bottom bar while music plays, with music notes rising
// and fading behind them. The style follows a simple outline figure: a ring for the head, a
// narrow box for the body, and arms and legs that bend at the elbows and knees.
//
// Every time the music starts a new crew turns up: usually one dancer, sometimes a friend or two,
// all the same size. Each beat every dancer eases into a move picked at random (now and then the
// whole crew moves together), with a soft bounce in between, drawn frame by frame so it's smooth.
// They leave when the music stops, and stand still if the tablet asks for reduced motion.

// A move is a set of joint angles in degrees (0 = hanging straight down; positive turns a limb
// towards the figure's left, our left), plus a bob (dy), a lean (tilt) and a hip shift (dx).
//              lS    lE   rS    rE   lH   lK   rH   rK   dy  tilt  dx
const MOVES = {
  stand:     [ 8,    0,   -8,    0,   3,   0,  -3,   0,  0,   0,   0],
  groove:    [12,  -45,  -10,   35,   5,  -8,  -3,   6,  1,  -3,  -1],
  grooveR:   [10,  -35,  -12,   45,   3,  -6,  -5,   8,  1,   3,   1],
  pumpL:     [35, -115,  -15,   30,   4,  -6,  -4,   4,  0,  -2,   0],
  pumpR:     [15,  -30,  -35,  115,   4,  -4,  -4,   6,  0,   2,   0],
  shimmy:    [22,  -95,  -22,   95,   4,  -4,  -4,   4,  0,  -2,   0],
  shimmyR:   [22,  -95,  -22,   95,   4,  -4,  -4,   4,  0,   2,   0],
  point:     [18,  -60, -125,   -8,   5,  -6, -10,  14,  0,   4,   1],
  pointL:    [125,   8,  -18,   60,  10, -14,  -5,   6,  0,  -4,  -1],
  swayL:     [ 6,  -20,  -14,   20,  12, -10,  -2,   0,  1,  -6,  -2],
  swayR:     [14,  -20,   -6,   20,   2,   0, -12,  10,  1,   6,   2],
  step:      [20,  -40,  -20,   40,  18, -22,  -4,   4,  0,   0,   0],
  stepR:     [20,  -40,  -20,   40,   4,  -4, -18,  22,  0,   0,   0],
  clap:      [28, -100,  -28,  100,   5,  -8,  -5,   8,  2,   0,   0],
  armsUp:    [160,  12, -160,  -12,   6,  -6,  -6,   6, -1,   0,   0],
  wave:      [150,  40,  -14,   30,   4,  -4,  -4,   4,  0,  -2,   0],
}
const NAMES = Object.keys(MOVES).filter((m) => m !== 'stand')
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const BEAT = 620 // ms per move: an easy, groovy tempo
const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2 // ease in and out

function newCrew() {
  const r = Math.random()
  const n = r < 0.55 ? 1 : r < 0.85 ? 2 : 3
  // Each crew has a favourite handful of moves, so every dance looks a little different.
  const repertoire = [...NAMES].sort(() => Math.random() - 0.5).slice(0, 6 + Math.floor(Math.random() * 4))
  return { n, repertoire, id: Math.random() }
}

export function Dancers({ on }) {
  const [crew, setCrew] = useState(null)
  const figures = useRef([])

  useEffect(() => {
    if (!on) { setCrew(null); return }
    setCrew(newCrew())
  }, [on])

  useEffect(() => {
    if (!crew) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const state = Array.from({ length: crew.n }, (_, i) => ({ from: MOVES.stand, to: MOVES[pick(crew.repertoire)], phase: i * 0.17 }))
    let start = performance.now(), beat = 0, raf = 0
    const draw = (now) => {
      let t = (now - start) / BEAT
      if (t >= 1) {
        start = now; t = 0; beat++
        // Every so often the crew moves in sync; otherwise each dancer does their own thing,
        // sometimes holding a move for another beat.
        const together = crew.n > 1 && beat % 8 < 2 ? MOVES[pick(crew.repertoire)] : null
        state.forEach((s) => { s.from = s.to; s.to = together ?? (Math.random() < 0.2 ? s.to : MOVES[pick(crew.repertoire)]) })
      }
      state.forEach((s, i) => {
        const f = figures.current[i]
        if (!f) return
        const k = ease(Math.min(1, t + s.phase * 0.2))
        const p = s.from.map((a, j) => a + (s.to[j] - a) * k)
        // A soft bounce on every half beat: knees give a little and the body dips.
        const bounce = Math.sin((t + s.phase) * Math.PI * 2) * 0.5 + 0.5
        pose(f, p, bounce)
      })
      if (!still) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [crew])

  if (!on || !crew) return null
  return (
    <span class={`dancers n${crew.n}`} aria-hidden="true" key={crew.id}>
      <span class="notes">{[0, 1, 2, 3].map((i) => <Note key={i} i={i} />)}</span>
      {Array.from({ length: crew.n }, (_, i) => <Figure key={i} onJoints={(el) => { figures.current[i] = el }} />)}
    </span>
  )
}

// Sets one figure's joints. Angles are SVG rotations around each joint, so nested limbs follow.
function pose(f, [lS, lE, rS, rE, lH, lK, rH, rK, dy, tilt, dx], bounce) {
  const set = (el, deg, x, y) => el.setAttribute('transform', `rotate(${deg.toFixed(2)} ${x} ${y})`)
  const b = bounce * 1.2
  f.body.setAttribute('transform', `translate(${dx.toFixed(2)} ${(dy + b).toFixed(2)}) rotate(${tilt.toFixed(2)} 15 31)`)
  set(f.lS, lS, 12.5, 15); set(f.lE, lE, 12.5, 23)
  set(f.rS, rS, 17.5, 15); set(f.rE, rE, 17.5, 23)
  // The legs bend a touch more on the bounce, so the feet stay down while the body dips.
  set(f.lH, lH + b * 3, 13.5, 31.5); set(f.lK, lK - b * 6, 13.5, 41.5)
  set(f.rH, rH - b * 3, 16.5, 31.5); set(f.rK, rK + b * 6, 16.5, 41.5)
}

// One outline figure, drawn standing, with handles on each joint for pose().
function Figure({ onJoints }) {
  const j = {}
  const g = (name) => (el) => { if (!el) return; j[name] = el; if (Object.keys(j).length === 9) onJoints(j) }
  return (
    <svg class="dancer" viewBox="0 0 30 56">
      <g ref={g('body')}>
        <circle cx="15" cy="7.5" r="4.6" />
        <rect x="11.5" y="13.5" width="7" height="18" rx="1.2" />
        <g ref={g('lS')}><path d="M12.5 15v8" /><g ref={g('lE')}><path d="M12.5 23v7" /></g></g>
        <g ref={g('rS')}><path d="M17.5 15v8" /><g ref={g('rE')}><path d="M17.5 23v7" /></g></g>
        <g ref={g('lH')}><path d="M13.5 31.5v10" /><g ref={g('lK')}><path d="M13.5 41.5v10" /></g></g>
        <g ref={g('rH')}><path d="M16.5 31.5v10" /><g ref={g('rK')}><path d="M16.5 41.5v10" /></g></g>
      </g>
    </svg>
  )
}

// A music note that rises and fades behind the dancers, in a loop; each starts at its own time.
function Note({ i }) {
  const double = i % 2 === 1
  return (
    <svg class={`note n${i}`} viewBox="0 0 16 20">
      {double
        ? <path d="M5 15.5a2.6 2.1 0 1 1-1-1.7V4l9-2v11.5a2.6 2.1 0 1 1-1-1.7V5.2L5 6.8z" />
        : <path d="M7 15.5a2.6 2.1 0 1 1-1-1.7V2h1.2c.4 2 2.8 2.6 3.6 4.8-1.2-1-2.6-1.3-3.8-1.3z" />}
    </svg>
  )
}

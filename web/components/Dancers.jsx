import { useEffect, useRef, useState } from 'preact/hooks'

// Little stick figures on the bottom bar. While music plays they groove, with music notes rising
// and fading behind them; when it stops they get on with other things: scrolling their phones,
// reading, sipping a coffee, stretching, checking the time, or dozing off with a few z's.
// The style follows a simple outline figure: a ring for the head, a narrow box for the body, and
// arms and legs that bend at the elbows and knees.
//
// Every time the music starts a new crew turns up: usually one figure, sometimes a friend or two,
// all the same size. Each beat every dancer eases into a move picked at random (now and then the
// whole crew moves together), with a soft bounce in between, drawn frame by frame so it's smooth.
// Between songs each figure picks its own pastime and changes it every half a minute or so. They
// stand still if the tablet asks for reduced motion.

// A pose is a set of joint angles in degrees (0 = hanging straight down; positive turns a limb
// towards the figure's left, our left), plus a bob (dy), a lean (tilt), a hip shift (dx) and a
// head tilt (positive leans the head to our right).
//              lS    lE   rS    rE   lH   lK   rH   rK  dy  tilt  dx  head
const MOVES = {
  stand:     [ 8,    0,   -8,    0,   3,   0,  -3,   0,  0,   0,   0],
  groove:    [12,  -45,  -10,   35,   5,  -8,  -3,   6,  1,  -3,  -1, -4],
  grooveR:   [10,  -35,  -12,   45,   3,  -6,  -5,   8,  1,   3,   1,  4],
  pumpL:     [35, -115,  -15,   30,   4,  -6,  -4,   4,  0,  -2,   0],
  pumpR:     [15,  -30,  -35,  115,   4,  -4,  -4,   6,  0,   2,   0],
  shimmy:    [22,  -95,  -22,   95,   4,  -4,  -4,   4,  0,  -2,   0, -6],
  shimmyR:   [22,  -95,  -22,   95,   4,  -4,  -4,   4,  0,   2,   0,  6],
  point:     [18,  -60, -125,   -8,   5,  -6, -10,  14,  0,   4,   1,  6],
  pointL:    [125,   8,  -18,   60,  10, -14,  -5,   6,  0,  -4,  -1, -6],
  swayL:     [ 6,  -20,  -14,   20,  12, -10,  -2,   0,  1,  -6,  -2],
  swayR:     [14,  -20,   -6,   20,   2,   0, -12,  10,  1,   6,   2],
  step:      [20,  -40,  -20,   40,  18, -22,  -4,   4,  0,   0,   0],
  stepR:     [20,  -40,  -20,   40,   4,  -4, -18,  22,  0,   0,   0],
  clap:      [28, -100,  -28,  100,   5,  -8,  -5,   8,  2,   0,   0],
  armsUp:    [160,  12, -160,  -12,   6,  -6,  -6,   6, -1,   0,   0],
  wave:      [150,  40,  -14,   30,   4,  -4,  -4,   4,  0,  -2,   0, -5],
}
const NAMES = Object.keys(MOVES).filter((m) => m !== 'stand')

// Poses for the pastimes between songs.
const STILL = {
  stand:       [ 8,    0,   -8,    0,   3,    0,  -3,    0,  0,    0, 0,   0],
  phone:       [ 8,    0,  -40,  150,   3,    0,  -3,    0,  0,    0, 0,  10],
  phoneScroll: [ 8,    0,  -40,  142,   3,    0,  -3,    0,  0,    0, 0,  12],
  phoneLaugh:  [ 8,    0,  -42,  146,   3,    0,  -3,    0, -1,   -4, 0,  -2],
  read:        [20, -120,  -20,  120,   3,    0,  -3,    0,  0,    0, 0,  -4],
  readTurn:    [20, -120,  -34,  145,   3,    0,  -3,    0,  0,    0, 0,  -4],
  sleep:       [40,  -15,  -40,   15,  60, -120, -60,  120, 10,    0, 0,  24],
  sleepBreath: [40,  -18,  -40,   18,  60, -120, -60,  120, 10.7,  0, 0,  27],
  cup:         [ 8,    0,  -30,   10,   3,    0,  -3,    0,  0,    0, 0,   0],
  sip:         [ 8,    0,  -40,  150,   3,    0,  -3,    0,  0,   -2, 0,  10],
  stretch:     [160,  12, -160,  -12,   6,   -6,  -6,    6, -1.5,  0, 0,   0],
  yawn:        [150,  30, -150,  -30,   4,   -4,  -4,    4, -1,    0, 0,  -9],
  hips:        [45, -100,  -45,  100,   4,    0,  -4,    0,  0,    0, 0,   0],
  lookL:       [45, -100,  -45,  100,   4,    0,  -4,    0,  0,   -2, 0, -14],
  lookR:       [45, -100,  -45,  100,   4,    0,  -4,    0,  0,    2, 0,  14],
  watch:       [20, -110,   -8,    0,   3,    0,  -3,    0,  0,    0, 0, -12],
  tap:         [ 8,    0,   -8,    0,   3,    0, -10,   14,  0,    0, 0,   0],
}
// Each pastime loops through its poses, holding each for a number of slow beats.
const PASTIMES = {
  phone:   { prop: 'phone', steps: [['phone', 4], ['phoneScroll', 1], ['phone', 3], ['phoneScroll', 1], ['phoneLaugh', 2]] },
  read:    { prop: 'book', steps: [['read', 7], ['readTurn', 1]] },
  sleep:   { zz: true, steps: [['sleep', 3], ['sleepBreath', 3]] },
  coffee:  { prop: 'cup', steps: [['cup', 4], ['sip', 3]] },
  stretch: { steps: [['stretch', 3], ['yawn', 3], ['stand', 4], ['tap', 1], ['stand', 2]] },
  wait:    { steps: [['hips', 3], ['lookL', 2], ['hips', 2], ['lookR', 2]] },
  watch:   { steps: [['watch', 3], ['stand', 2], ['tap', 1], ['stand', 1], ['tap', 1], ['stand', 2]] },
}
const PASTIME_NAMES = Object.keys(PASTIMES)
// `?pastime=read` (or phone, sleep, …) previews one pastime for every figure.
const FORCED = PASTIMES[new URLSearchParams(location.search).get('pastime')] ? new URLSearchParams(location.search).get('pastime') : null

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const BEAT = 620 // ms per dance move: an easy, groovy tempo
const SLOW = 900 // ms per beat between songs
const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2 // ease in and out
const full = (p) => (p.length < 12 ? [...p, ...Array(12 - p.length).fill(0)] : p)

function newCrew() {
  const r = Math.random()
  const n = r < 0.55 ? 1 : r < 0.85 ? 2 : 3
  // Each crew has a favourite handful of moves, so every dance looks a little different.
  const repertoire = [...NAMES].sort(() => Math.random() - 0.5).slice(0, 6 + Math.floor(Math.random() * 4))
  return { n, repertoire, id: Math.random() }
}

export function Dancers({ on }) {
  const [crew, setCrew] = useState(newCrew)
  const figures = useRef([])
  const mode = useRef(on)
  const started = useRef(false)

  // A new crew turns up when the music starts; between songs the same friends hang around.
  useEffect(() => {
    if (on && started.current) setCrew(newCrew())
    started.current = true
  }, [on])
  useEffect(() => { mode.current = on }, [on])

  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const stand = full(MOVES.stand)
    const state = Array.from({ length: crew.n }, (_, i) => ({ cur: stand, from: stand, to: stand, phase: i * 0.17, at: 0, len: 0, act: null, step: 0, until: 0, dancing: null }))
    let beatStart = performance.now(), beat = 0, raf = 0

    // Between songs: each figure picks a pastime unlike its friends' and keeps it for a while.
    const startPastime = (s, now) => {
      const taken = state.map((x) => x.act)
      s.act = FORCED ?? pick(PASTIME_NAMES.filter((a) => !taken.includes(a)))
      s.step = 0
      s.until = now + 20_000 + Math.random() * 25_000
      goTo(s, STILL[PASTIMES[s.act].steps[0][0]], now, PASTIMES[s.act].steps[0][1])
    }
    const goTo = (s, pose, now, beats) => { s.from = s.cur; s.to = pose; s.at = now; s.len = beats * SLOW }

    const draw = (now) => {
      const dancing = mode.current
      if (dancing) {
        let t = (now - beatStart) / BEAT
        if (t >= 1) {
          beatStart = now; t = 0; beat++
          // Every so often the crew moves in sync; otherwise each dancer does their own thing,
          // sometimes holding a move for another beat.
          const together = crew.n > 1 && beat % 8 < 2 ? full(MOVES[pick(crew.repertoire)]) : null
          state.forEach((s) => { s.from = s.cur; s.to = together ?? (Math.random() < 0.2 ? s.to : full(MOVES[pick(crew.repertoire)])) })
        }
        state.forEach((s, i) => {
          if (s.dancing !== true) { s.dancing = true; s.act = null; s.from = s.cur; s.to = full(MOVES[pick(crew.repertoire)]) }
          const k = ease(Math.min(1, t + s.phase * 0.2))
          s.cur = s.from.map((a, j) => a + (s.to[j] - a) * k)
          // A soft bounce on every half beat: knees give a little and the body dips.
          const bounce = Math.sin((t + s.phase) * Math.PI * 2) * 0.5 + 0.5
          if (figures.current[i]) pose(figures.current[i], s.cur, bounce, null)
        })
      } else {
        state.forEach((s, i) => {
          if (s.dancing !== false) { s.dancing = false; s.act = null; startPastime(s, now + i * 1200) }
          if (now >= s.until) startPastime(s, now)
          else if (now - s.at >= s.len) {
            const steps = PASTIMES[s.act].steps
            s.step = (s.step + 1) % steps.length
            goTo(s, STILL[steps[s.step][0]], now, steps[s.step][1])
          }
          const k = still ? 1 : ease(Math.max(0, Math.min(1, (now - s.at) / Math.min(s.len, 800))))
          s.cur = s.from.map((a, j) => a + (s.to[j] - a) * k)
          if (figures.current[i]) pose(figures.current[i], s.cur, 0, PASTIMES[s.act])
        })
      }
      if (!still) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    // With reduced motion the figures hold one pose, but still change pastime now and then.
    const slow = still ? setInterval(() => requestAnimationFrame(draw), 30_000) : 0
    return () => { cancelAnimationFrame(raf); clearInterval(slow) }
  }, [crew])

  return (
    <span class={`dancers n${crew.n}`} aria-hidden="true" key={crew.id}>
      {on && <span class="notes">{[0, 1, 2, 3].map((i) => <Note key={i} i={i} />)}</span>}
      {Array.from({ length: crew.n }, (_, i) => <Figure key={i} onJoints={(el) => { figures.current[i] = el }} />)}
    </span>
  )
}

// Where a hand is, from the shoulder and elbow angles (upper arm 8, forearm 7).
function hand(x, a, b) {
  const r = Math.PI / 180
  return [x - 8 * Math.sin(a * r) - 7 * Math.sin((a + b) * r), 15 + 8 * Math.cos(a * r) + 7 * Math.cos((a + b) * r)]
}

// Sets one figure's joints. Angles are SVG rotations around each joint, so nested limbs follow.
function pose(f, [lS, lE, rS, rE, lH, lK, rH, rK, dy, tilt, dx, head], bounce, pastime) {
  const set = (el, deg, x, y) => el.setAttribute('transform', `rotate(${deg.toFixed(2)} ${x} ${y})`)
  const b = bounce * 1.2
  f.body.setAttribute('transform', `translate(${dx.toFixed(2)} ${(dy + b).toFixed(2)}) rotate(${tilt.toFixed(2)} 15 31)`)
  set(f.head, head, 15, 12.5)
  set(f.lS, lS, 12.5, 15); set(f.lE, lE, 12.5, 23)
  set(f.rS, rS, 17.5, 15); set(f.rE, rE, 17.5, 23)
  // The legs bend a touch more on the bounce, so the feet stay down while the body dips.
  set(f.lH, lH + b * 3, 13.5, 31.5); set(f.lK, lK - b * 6, 13.5, 41.5)
  set(f.rH, rH - b * 3, 16.5, 31.5); set(f.rK, rK + b * 6, 16.5, 41.5)
  // The phone, book or cup sits in the hand (a book between both hands); z's float while dozing.
  const prop = pastime?.prop
  for (const name of ['phone', 'book', 'cup']) f[name].style.display = prop === name ? '' : 'none'
  if (prop) {
    const [rx, ry] = hand(17.5, rS, rE)
    const [x, y] = prop === 'book' ? hand(12.5, lS, lE).map((v, i) => (v + [rx, ry][i]) / 2) : [rx, ry]
    f[prop].setAttribute('transform', `translate(${x.toFixed(2)} ${(y - (prop === 'book' ? 1.5 : 1)).toFixed(2)})`)
  }
  f.zz.style.display = pastime?.zz ? '' : 'none'
}

// One outline figure, drawn standing, with handles on each joint and prop for pose().
const PARTS = ['body', 'head', 'lS', 'lE', 'rS', 'rE', 'lH', 'lK', 'rH', 'rK', 'phone', 'book', 'cup', 'zz']
function Figure({ onJoints }) {
  const j = {}
  const g = (name) => (el) => { if (!el) return; j[name] = el; if (Object.keys(j).length === PARTS.length) onJoints(j) }
  return (
    <svg class="dancer" viewBox="0 0 30 56">
      <g ref={g('body')}>
        <g ref={g('head')}><circle cx="15" cy="7.5" r="4.6" /></g>
        <rect x="11.5" y="13.5" width="7" height="18" rx="1.2" />
        <g ref={g('lH')}><path d="M13.5 31.5v10" /><g ref={g('lK')}><path d="M13.5 41.5v10" /></g></g>
        <g ref={g('rH')}><path d="M16.5 31.5v10" /><g ref={g('rK')}><path d="M16.5 41.5v10" /></g></g>
        <g ref={g('lS')}><path d="M12.5 15v8" /><g ref={g('lE')}><path d="M12.5 23v7" /></g></g>
        <g ref={g('rS')}><path d="M17.5 15v8" /><g ref={g('rE')}><path d="M17.5 23v7" /></g></g>
        <g ref={g('phone')} class="prop" style="display:none"><rect x="-1.7" y="-2.8" width="3.4" height="5.6" rx="0.8" /></g>
        <g ref={g('book')} class="prop" style="display:none"><path d="M-5 -2.6 0 -1.6 5 -2.6V2.6L0 3.6-5 2.6Z M0 -1.6V3.6" /></g>
        <g ref={g('cup')} class="prop" style="display:none"><rect x="-2" y="-2.2" width="4" height="4.4" rx="0.7" /><path d="M2 -1a1.3 1.3 0 0 1 0 2.4" /></g>
        <g ref={g('zz')} class="zz" style="display:none"><text x="21" y="6">z</text><text x="25" y="1">z</text></g>
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

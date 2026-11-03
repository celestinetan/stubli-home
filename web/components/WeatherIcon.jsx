// Weather icons in Stubli's style: chunky rounded shapes on a 60 px grid. The big "now" icon gets
// Stubli's ü face (two dot eyes, a U smile) and plays a short animation a few times, then rests,
// like the Stubli logo's wink. `play` changes to replay it. Colours come from CSS variables.

const Face = ({ x = 30, y = 30, sleepy = false }) => (
  <g class="wi-face">
    {sleepy
      ? <><path d={`M${x - 8} ${y - 2}q2.5 2.5 5 0`} /><path d={`M${x + 3} ${y - 2}q2.5 2.5 5 0`} /></>
      : <><circle cx={x - 5} cy={y - 2} r="2.4" /><circle class="wi-wink" cx={x + 5} cy={y - 2} r="2.4" /></>}
    <path class="wi-smile" d={`M${x - 4.5} ${y + 3.5}a4.5 4.5 0 0 0 9 0`} />
  </g>
)

const Sun = ({ face }) => (
  <g class="wi-sun">
    <g class="wi-rays">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="30" y1="6" x2="30" y2="10.5" transform={`rotate(${a} 30 30)`} />)}</g>
    <circle cx="30" cy="30" r="13.5" />
    {face && <Face />}
  </g>
)
const Moon = ({ face }) => (
  <g class="wi-moonwrap">
    <path class="wi-moon" d="M36 9a21 21 0 1 0 15 30A17 17 0 0 1 36 9z" />
    {face && <Face x={27} y={32} sleepy />}
  </g>
)
const CLOUD = 'M17 47h27a10.5 10.5 0 0 0 1.3-20.9A15 15 0 0 0 17.4 28.6 9.3 9.3 0 0 0 17 47z'
const Cloud = ({ face, y = 0, back }) => (
  <g class={`wi-cloudwrap${back ? ' back' : ''}`} transform={y ? `translate(0 ${y})` : undefined}>
    <path class="wi-cloud" d={CLOUD} />
    {face && <Face x={31} y={37} />}
  </g>
)

export function kindOf(code, isDay = true) {
  if (code === 0) return isDay ? 'sun' : 'moon'
  if (code === 1 || code === 2) return isDay ? 'partly' : 'partly-night'
  if (code === 3) return 'cloud'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  return 'cloud'
}

export function WeatherIcon({ code, isDay = true, size = 32, face = false, play }) {
  const k = kindOf(code, isDay)
  let body
  if (k === 'sun') body = <Sun face={face} />
  else if (k === 'moon') body = <Moon face={face} />
  else if (k === 'partly' || k === 'partly-night') body = (
    <>
      <g class="wi-peek" transform="translate(-9 -9) scale(0.72)">{k === 'partly' ? <Sun /> : <Moon />}</g>
      <Cloud face={face} y={3} />
    </>
  )
  else if (k === 'cloud') body = <><Cloud back y={-7} /><Cloud face={face} y={2} /></>
  else if (k === 'fog') body = (
    <><Cloud face={face} y={-6} /><g class="wi-fog">{[48, 55].map((y, i) => <line key={y} x1={12 + i * 6} y1={y} x2={48 - i * 4} y2={y} />)}</g></>
  )
  else if (k === 'rain') body = (
    <><Cloud face={face} y={-7} /><g class="wi-rain">{[20, 30, 40].map((x, i) => <line class="wi-bit" key={x} style={{ animationDelay: `${i * 0.3}s` }} x1={x} y1={46 + (i % 2) * 2} x2={x - 2} y2={51 + (i % 2) * 2} />)}</g></>
  )
  else if (k === 'snow') body = (
    <><Cloud face={face} y={-7} /><g class="wi-snow">{[20, 30, 40].map((x, i) => <circle class="wi-bit" key={x} style={{ animationDelay: `${i * 0.5}s` }} cx={x} cy={49 + (i % 2) * 3} r="2.6" />)}</g></>
  )
  else body = <><Cloud face={face} y={-7} /><path class="wi-bolt" d="M32 40l-6 9h5l-3 9 9-12h-5l3-6z" /></>

  return (
    <svg key={play} class={`wi wi-${k}${face ? ' wi-big' : ''}`} width={size} height={size} viewBox="0 0 60 60" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {body}
    </svg>
  )
}

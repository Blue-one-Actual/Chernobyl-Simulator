// Vereinfachte pädagogische Simulation des Kontrollraums
const state = {
  // Removed rod-based control; placeholder `manualControl` for future control implementation
  manualControl: 50, // 0..100, currently unused
  cooling: true,
  running: false,
  power: 0, // 0-100%
  temp: 20, // °C
  pressure: 101.3 // kPa
}

const el = id => document.getElementById(id)
const logBox = el('log')
function log(msg){
  const t = new Date().toLocaleTimeString()
  logBox.innerHTML = `<div>[${t}] ${msg}</div>` + logBox.innerHTML
}

// DOM refs
const cooling = el('cooling')
const startBtn = el('start-btn')
const stopBtn = el('stop-btn')
const scramBtn = el('scram-btn')
const powerEl = el('power')
const tempEl = el('temperature')
const pressureEl = el('pressure')
const coreGlow = el('core-glow')
const rodsGroup = el('control-rods')

cooling.addEventListener('change', e => {
  state.cooling = e.target.checked
  log(`Kühlung ${state.cooling? 'an' : 'aus'}`)
})

startBtn.addEventListener('click', ()=>{
  state.running = true
  log('Reaktorbetrieb: START')
})
stopBtn.addEventListener('click', ()=>{
  state.running = false
  log('Reaktorbetrieb: STOP')
})

scramBtn.addEventListener('click', ()=>{
  // Emergency SCRAM: sofort drosseln und stoppen
  state.running = false
  state.power = Math.min(state.power, 20) // reduce power rapidly
  log('EMERGENCY SCRAM: Reaktor gestoppt und Leistung gedrosselt')
})

// draw control rods (visual only)
// control rods removed; visual will be reworked separately

function updateUI(){
  powerEl.textContent = Math.round(state.power)
  tempEl.textContent = Math.round(state.temp)
  pressureEl.textContent = state.pressure.toFixed(1)
  coreGlow.setAttribute('opacity', Math.min(0.9, 0.12 + state.power/110))
  // shift color from yellow -> orange -> red as power rises
  if(state.power > 80) coreGlow.setAttribute('fill', '#ff3b3b')
  else if(state.power > 50) coreGlow.setAttribute('fill', '#ff8a00')
  else coreGlow.setAttribute('fill', '#ffd54f')
  
  // rotate power gauge needle: map 0..100 -> -90..+90
  const needle = document.getElementById('power-needle')
  if(needle){
    const angle = (state.power/100) * 180 - 90
    needle.setAttribute('transform', `rotate(${angle} 100 140)`)
  }
  // no control rods to render
}

// --- Mosaic rendering (161 cores) ---
function renderMosaic(count = 161){
  const svg = document.getElementById('reactor-mosaic')
  if(!svg) return
  while(svg.firstChild) svg.removeChild(svg.firstChild)
  const w = 200, h = 240
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  const cx = w/2, cy = h*0.48
  const R = 78 // max radius for mosaic
  const golden = Math.PI * (3 - Math.sqrt(5)) // ~2.39996
  const scale = R / Math.sqrt(count)

  for(let i=0;i<count;i++){
    const r = scale * Math.sqrt(i)
    const theta = i * golden
    const x = cx + r * Math.cos(theta)
    const y = cy + r * Math.sin(theta)
    const core = document.createElementNS('http://www.w3.org/2000/svg','circle')
    core.setAttribute('cx', x.toFixed(2))
    core.setAttribute('cy', y.toFixed(2))
    core.setAttribute('r', 5)
    // color varies slightly by position and power
    const hue = 45 + (i % 20)
    const powerFactor = Math.min(1, state.power/120)
    const light = 45 + Math.round(powerFactor * 40)
    core.setAttribute('fill', `hsl(${hue} ${90}% ${light}%)`)
    core.setAttribute('class','mosaic-core')
    core.dataset.index = i+1
    core.addEventListener('click', ()=>{
      log(`Kern #${i+1} ausgewählt`)
      // flash selected core
      core.setAttribute('stroke','#fff')
      setTimeout(()=>core.removeAttribute('stroke'),300)
    })
    svg.appendChild(core)
  }
}

// call mosaic on load and when power changes
renderMosaic(161)

// simple physics loop
setInterval(()=>{
  // control rod effect: more insertion => less reactivity
  const reactivity = (100 - state.rod)/100 // 0..1
  if(state.running){
    // power tends toward reactivity*100
    state.power += (reactivity*100 - state.power) * 0.03
  } else {
    state.power += (0 - state.power) * 0.08
  }

  // temperature responds to power, cooling reduces temp
  const ambient = 20
  const heatFromPower = state.power * 0.12
  const coolingFactor = state.cooling ? 0.7 : 1.0
  state.temp += ((ambient + heatFromPower) - state.temp) * 0.04 * coolingFactor

  // pressure increases with temp
  const targetPressure = 101.3 + Math.max(0, (state.temp - 20)) * 0.5
  state.pressure += (targetPressure - state.pressure) * 0.02

  // safety checks
  if(state.temp > 600){
    // catastrophic threshold — force SCRAM and warn
    state.rod = 100
    state.running = false
    log('ALARM: Temperatur kritisch — SCRAM ausgelöst')
  } else if(state.temp > 400){
    log('WARNUNG: Temperatur über 400°C')
  }

  // update UI
  updateUI()
}, 500)

// initial render
cooling.checked = state.cooling
updateUI()
log('Simulator geladen (ohne Regelstab-UI)')

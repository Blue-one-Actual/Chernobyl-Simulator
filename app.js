// Vereinfachte pädagogische Simulation des Kontrollraums
const state = {
  rod: 100, // 100% eingezogen = max abgesichert
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
const rodSlider = el('rod-slider')
const rodVal = el('rod-val')
const cooling = el('cooling')
const startBtn = el('start-btn')
const stopBtn = el('stop-btn')
const scramBtn = el('scram-btn')
const powerEl = el('power')
const tempEl = el('temperature')
const pressureEl = el('pressure')
const coreGlow = el('core-glow')
const rodsGroup = el('control-rods')

rodSlider.addEventListener('input', e => {
  state.rod = Number(e.target.value)
  rodVal.textContent = state.rod
})

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
  // Emergency SCRAM: regeln vollständig einfahren
  state.rod = 100
  rodSlider.value = 100
  rodVal.textContent = 100
  state.running = false
  log('EMERGENCY SCRAM: Alle Regelstäbe voll eingefahren')
})

// draw control rods (visual only)
function renderRods(){
  const g = []
  rodsGroup.innerHTML = ''
  for(let i=0;i<6;i++){
    const x = 30 + i*26
    const insertion = state.rod/100 // 0..1, 1 = fully inserted
    const y = 30 + (1-insertion)*120
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect')
    rect.setAttribute('x', x)
    rect.setAttribute('y', y)
    rect.setAttribute('width', 12)
    rect.setAttribute('height', 140 - (1-insertion)*120)
    rect.setAttribute('fill','#bdbdbd')
    rect.setAttribute('stroke','#888')
    rodsGroup.appendChild(rect)
  }
}

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
  renderRods()
}

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
rodVal.textContent = state.rod
rodSlider.value = state.rod
cooling.checked = state.cooling
updateUI()
log('Simulator geladen')

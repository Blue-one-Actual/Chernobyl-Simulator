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

  // Create a square grid larger than needed, then pick the `count` cells closest to center.
  const base = Math.ceil(Math.sqrt(count))
  const n = base + 6 // padding to allow a circular crop
  const tile = 8
  const gap = 2
  const step = tile + gap
  const grid = []
  const startX = cx - (n-1)/2 * step
  const startY = cy - (n-1)/2 * step

  for(let row=0; row<n; row++){
    for(let col=0; col<n; col++){
      const x = startX + col * step
      const y = startY + row * step
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx*dx + dy*dy)
      grid.push({x,y,dist,row,col})
    }
  }

  // sort by distance to center and take the nearest `count` cells
  grid.sort((a,b)=>a.dist-b.dist)
  const chosen = grid.slice(0, count)

  // render chosen tiles (as small squares to mimic tiled core mosaic)
  chosen.forEach((cell,i)=>{
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect')
    rect.setAttribute('x', (cell.x - tile/2).toFixed(2))
    rect.setAttribute('y', (cell.y - tile/2).toFixed(2))
    rect.setAttribute('width', tile)
    rect.setAttribute('height', tile)
    const hue = 48 + (i % 18)
    const powerFactor = Math.min(1, state.power/120)
    const light = 44 + Math.round(powerFactor * 44)
    rect.setAttribute('fill', `hsl(${hue} ${85}% ${light}%)`)
    rect.setAttribute('class','mosaic-core')
    rect.dataset.index = i+1
    rect.addEventListener('click', ()=>{
      log(`Kern #${i+1} ausgewählt`)
      rect.setAttribute('stroke','#fff')
      setTimeout(()=>rect.removeAttribute('stroke'),300)
    })
    svg.appendChild(rect)
  })
}

// call mosaic on load and when power changes
renderMosaic(161)

// --- View switching logic ---
function switchView(name){
  // menu
  document.querySelectorAll('.side-menu li').forEach(li=>{
    if(li.dataset.view === name) li.classList.add('active')
    else li.classList.remove('active')
  })
  // views
  document.querySelectorAll('.view').forEach(v=>{
    if(v.id === `view-${name}`) v.classList.add('active')
    else v.classList.remove('active')
  })
  // trigger specific updates
  if(name === 'reactor') renderMosaic(161)
  if(name === 'security') updateSecurityView()
  if(name === 'turbine') updateTurbineView()
}

document.querySelectorAll('.side-menu li').forEach(li=>{
  li.addEventListener('click', ()=>{
    const name = li.dataset.view
    if(name) switchView(name)
  })
})

function updateSecurityView(){
  // placeholder: add dynamic status updates here
}

let turbineRunning = false
function updateTurbineView(){
  const rpmEl = document.getElementById('rpm')
  if(!rpmEl) return
  const target = turbineRunning ? 3600 : 0
  // smooth approach
  const current = Number(rpmEl.textContent || 0)
  const next = current + (target - current) * 0.12
  rpmEl.textContent = Math.round(next)
}

document.getElementById('turbine-start')?.addEventListener('click', ()=>{ turbineRunning = true; log('Turbine startet') })
document.getElementById('turbine-stop')?.addEventListener('click', ()=>{ turbineRunning = false; log('Turbine gestoppt') })
document.getElementById('raise-alarm')?.addEventListener('click', ()=>{ log('Security Alarm manuell ausgelöst') })

// periodically update turbine rpm while view is visible
setInterval(()=>{
  const active = document.querySelector('.view.active')?.id
  if(active === 'view-turbine') updateTurbineView()
}, 500)

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

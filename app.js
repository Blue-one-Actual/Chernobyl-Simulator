// Vereinfachte pädagogische Simulation des Kontrollraums
const state = {
  // Kontrollstäbe (0..100) - 0 = komplett heraus, 100 = komplett eingefahren
  rods: 50,
  manualMode: false,
  cooling: true,
  running: false,
  power: 0, // 0-100%
  temp: 20, // °C
  pressure: 101.3, // kPa
  dosage: 0.2 // Sv/h (radiation dose)
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
  try{
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = audioContext

    // master gain (volume controllable) - make alarm notably loud
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, ctx.currentTime)
    master.connect(ctx.destination)
    const targetVol = Math.max(0.12, alarmVolume/100 * 1.2)
    master.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.02)

    // CORE: two main oscillators for soviet-style wail + low sub for weight
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(40, ctx.currentTime)
    const main1 = ctx.createOscillator(); main1.type = 'triangle'; main1.frequency.setValueAtTime(220, ctx.currentTime)
    const main2 = ctx.createOscillator(); main2.type = 'sawtooth'; main2.frequency.setValueAtTime(320, ctx.currentTime)

    const subG = ctx.createGain(); subG.gain.value = 0.0001
    const m1G = ctx.createGain(); m1G.gain.value = 0.0001
    const m2G = ctx.createGain(); m2G.gain.value = 0.0001

    sub.connect(subG); main1.connect(m1G); main2.connect(m2G)

    // slight waveshaper for gritty industrial tone
    function makeDistortion(amount){
      const curve = new Float32Array(44100)
      const k = typeof amount === 'number' ? amount : 50
      const deg = Math.PI / 180
      for (let i = 0; i < 44100; ++i) {
        const x = i * 2 / 44100 - 1
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x))
      }
      const sh = ctx.createWaveShaper(); sh.curve = curve; sh.oversample = '2x'
      return sh
    }
    const shaper = makeDistortion(8)

    // filtering and compression for a large PA feel
    const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 4000
    const comp = ctx.createDynamicsCompressor(); comp.threshold.setValueAtTime(-10, ctx.currentTime); comp.ratio.setValueAtTime(10, ctx.currentTime); comp.attack.setValueAtTime(0.005, ctx.currentTime); comp.release.setValueAtTime(0.2, ctx.currentTime)

    subG.connect(shaper); m1G.connect(shaper); m2G.connect(shaper)
    shaper.connect(lowpass); lowpass.connect(comp); comp.connect(master)

    // noise layer (metallic) for realism
    const bufferSize = Math.floor(ctx.sampleRate * 0.6)
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const ndata = noiseBuffer.getChannelData(0)
    for(let i=0;i<bufferSize;i++) ndata[i] = (Math.random()*2 - 1) * 0.5
    const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuffer; noiseSrc.loop = true
    const noiseF = ctx.createBiquadFilter(); noiseF.type = 'bandpass'; noiseF.frequency.value = 1400; noiseF.Q.value = 0.8
    const noiseG = ctx.createGain(); noiseG.gain.value = 0.0001
    noiseSrc.connect(noiseF); noiseF.connect(noiseG); noiseG.connect(master)

    // start oscillators
    sub.start(); main1.start(); main2.start(); noiseSrc.start()

    sirenNodes = {sub, main1, main2, subG, m1G, m2G, shaper, lowpass, comp, noiseSrc, noiseG, master}

    // Sweep LFO to create wail (modulates frequencies)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.setValueAtTime(0.45, ctx.currentTime)
    const lfoG = ctx.createGain(); lfoG.gain.value = 65
    lfo.connect(lfoG)
    lfoG.connect(main1.frequency); lfoG.connect(main2.frequency)
    lfo.start()

    // Pulsed gate using scheduled gain automation for a martial pattern
    const pulseInterval = 1000
    sirenTimer = setInterval(()=>{
      try{
        const now = ctx.currentTime
        const vol = Math.max(0.12, alarmVolume/100 * 1.2)
        const attack = 0.02
        const sustain = 0.7
        const release = 0.18

        ;[subG, m1G, m2G].forEach((g, idx)=>{
          g.gain.cancelScheduledValues(now)
          g.gain.setValueAtTime(0.0001, now)
          const mult = idx===0 ? 1.8 : (idx===1 ? 1.2 : 1.0)
          g.gain.exponentialRampToValueAtTime(Math.max(0.002, vol * mult), now + attack)
          g.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + release)
        })

        noiseG.gain.cancelScheduledValues(now)
        noiseG.gain.setValueAtTime(0.0001, now)
        noiseG.gain.exponentialRampToValueAtTime(Math.max(0.002, vol * 0.12), now + 0.02)
        noiseG.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + release)
      }catch(e){ console.error('soviet pulse failed', e) }
    }, pulseInterval)
  }catch(e){
    console.error('Audio failed', e)
  }

function updateAnalogNeedles(){
  const needle = document.getElementById('power-needle')
  if(!needle) return
  const angle = Math.max(-90, Math.min(90, (state.power/100)*180 - 90))
  needle.setAttribute('transform', `rotate(${angle} 100 140)`)
}

function updateRodsVisual(){
  const rodsEl = document.getElementById('control-rods')
  const rodValue = document.getElementById('rod-value')
  if(rodValue) rodValue.textContent = `${Math.round(state.rods)}%`
  if(rodsEl){
    // height represents how far the rods are inserted (100% -> fully inserted)
    rodsEl.style.height = `${state.rods}%`
  }
}

// --- DOSIMETER: update radiation readout based on power & temperature ---
function updateDosimeter(){
  // Dosage increases with power and temperature
  const baseDosage = 0.2
  const powerDose = (state.power / 100) * 0.8
  const tempDose = Math.max(0, (state.temp - 100) / 500) * 1.5
  state.dosage = baseDosage + powerDose + tempDose
  
  const dosEl = el('dosimeter-value')
  const dosBar = el('dosimeter-bar')
  if(dosEl) dosEl.textContent = state.dosage.toFixed(1)
  if(dosBar){
    const fillPercent = Math.min(100, (state.dosage / 5) * 100)
    dosBar.style.width = fillPercent + '%'
  }
  
  // Warn if dosage gets high
  if(state.dosage > 2.5 && state.temp > 300){
    setAnnunciator('SEC', 'blink')
  }
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
updateRodsVisual()

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
  // right panels: show corresponding right panel only
  document.querySelectorAll('.right-panel').forEach(p=>{
    if(p.id === `right-${name}`) p.removeAttribute('hidden')
    else p.setAttribute('hidden','')
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

// --- ANNUNCIATOR: manage lamps and monotone alarm ---
const annunciators = {
  WATER: {state: 'ok'},
  PRESS: {state: 'ok'},
  TEMP: {state: 'ok'},
  PUMP: {state: 'ok'},
  SCRAM: {state: 'ok'},
  SEC: {state: 'ok'}
}
let annAudio = null
let annOsc = null
function setAnnunciator(key, mode){
  if(!annunciators[key]) return
  annunciators[key].state = mode // 'ok' | 'blink' | 'on'
  const el = document.querySelector(`.annunciator .lamp[data-key="${key}"]`)
  if(!el) return
  el.classList.remove('active','blink')
  if(mode === 'on') el.classList.add('active')
  if(mode === 'blink') el.classList.add('blink','active')
  // audio: if any lamp is blink or on, start monotone
  const any = Object.values(annunciators).some(a=>a.state==='blink' || a.state==='on')
  if(any) startAnnunciatorTone()
  else stopAnnunciatorTone()
}

function startAnnunciatorTone(){
  if(annAudio) return
  try{
    annAudio = new (window.AudioContext || window.webkitAudioContext)()
    annOsc = annAudio.createOscillator()
    const g = annAudio.createGain()
    annOsc.type = 'sine'
    annOsc.frequency.value = 720
    g.gain.value = 0.0001
    annOsc.connect(g); g.connect(annAudio.destination)
    annOsc.start()
    g.gain.exponentialRampToValueAtTime(0.06, annAudio.currentTime + 0.02)
  }catch(e){console.error('ann audio failed',e)}
}
function stopAnnunciatorTone(){
  if(!annAudio) return
  try{ annAudio.close() }catch(e){}
  annAudio = null; annOsc = null
}

// init annunciator visuals
Object.keys(annunciators).forEach(k=> setAnnunciator(k,'ok'))

// --- AZ-5 emergency (glass cover + heavy button) ---
const az5Cover = document.getElementById('az5-cover-large')
const az5Button = document.getElementById('az5-button-large')
let az5Open = false
if(az5Cover) az5Cover.addEventListener('click', ()=>{ az5Open = !az5Open; az5Cover.classList.toggle('open', az5Open) })
if(az5Button){
  az5Button.addEventListener('click', ()=>{
    if(!az5Open){ log('AZ-5: Glasabdeckung ist geschlossen! Öffnen zuerst.') ; return }
    triggerAZ5()
  })
}

function triggerAZ5(){
  log('AZ-5 gedrückt! Notabschaltung aktiv.')
  // mechanical click
  try{
    const c = new (window.AudioContext || window.webkitAudioContext)()
    const o = c.createOscillator(); const g = c.createGain()
    o.type='square'; o.frequency.value = 120
    g.gain.value = 0.0001; o.connect(g); g.connect(c.destination)
    o.start(); g.gain.exponentialRampToValueAtTime(0.6, c.currentTime + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.15)
    o.stop(c.currentTime + 0.16)
    setTimeout(()=>{ try{ c.close() }catch(e){} }, 300)
  }catch(e){console.error(e)}

  // immediate SCRAM behavior: cut power, stop reactor, play insertion hum
  state.running = false
  state.rods = 100
  // animate rapid power drop
  const startP = state.power
  const callBus = {
    // mapping: dial number -> array of room keys
    mapping: {
      '100': ['security'],
      '117': ['reactor'],
      '118': ['turbine'],
      '119': ['generator'],
      '120': ['chemlab'],
      '121': ['kantine'],
      '122': ['umkleiden'],
      '123': ['reactorhall'],
      '124': ['pumpenhaus'],
      '125': ['brennstofflager']
    },
    activeCalls: {},
    call(number, meta = {}){
      const targets = this.mapping[number] || []
      if(!targets.length) return null
      const callId = Date.now() + '-' + Math.random().toString(36).slice(2,8)
      this.activeCalls[callId] = { number, targets, meta }
      targets.forEach(room => window.dispatchEvent(new CustomEvent('incomingCall', { detail: { callId, number, room, meta } })))
      return callId
    },
    end(callId){
      const call = this.activeCalls[callId]
      if(!call) return
      call.targets.forEach(room => window.dispatchEvent(new CustomEvent('callEnded', { detail: { callId, number: call.number, room } })))
      delete this.activeCalls[callId]
    }
  }
  const temp = state.temp
  const press = state.pressure
  const tNeedle = document.getElementById('needle-temp')
  const pNeedle = document.getElementById('needle-press')
  if(!tNeedle || !pNeedle) return
  // map temp 0..800 -> -60..60 degrees
  const tAngle = Math.max(-60, Math.min(60, (temp/800)*120 - 60))
  const pAngle = Math.max(-60, Math.min(60, ((press-80)/120)*120 - 60))
  // jitter if high temp
  let jitter = 0
  if(temp > 350 && temp < 500 && Math.random() < 0.15) jitter = (Math.random()-0.5)*4
  // stuck behaviour
  if(temp > 580){
    // set annunciator and freeze needles
    setAnnunciator('TEMP','on')
  } else {
    setAnnunciator('TEMP', temp>400? 'blink' : 'ok')
    tNeedle.setAttribute('transform', `rotate(${tAngle + jitter} 110 90)`)
    pNeedle.setAttribute('transform', `rotate(${pAngle} 110 90)`)
  }
}

// --- Telephone system and global call bus ---
// keep legacy security phone API but add multi-room support
let phoneState = 'idle' // legacy single security phone state
let phoneAudioCtx = null
let phoneOscs = []

// per-room phone state and audio
const roomPhoneState = {}

const callBus = {
  mapping: { '117': ['reactor'], '118': ['turbine'] },
  activeCalls: {},
  call(number, meta = {}){
    const targets = this.mapping[number] || []
    if(!targets.length) return null
    const callId = Date.now() + '-' + Math.random().toString(36).slice(2,8)
    this.activeCalls[callId] = { number, targets, meta }
    targets.forEach(room => window.dispatchEvent(new CustomEvent('incomingCall', { detail: { callId, number, room, meta } })))
    return callId
  },
  end(callId){
    const call = this.activeCalls[callId]
    if(!call) return
    call.targets.forEach(room => window.dispatchEvent(new CustomEvent('callEnded', { detail: { callId, number: call.number, room } })))
    delete this.activeCalls[callId]
  }
}

function startPhoneRing(){
  // legacy security phone rings locally (keeps backwards compatibility)
  if(phoneState !== 'idle') return
  phoneState = 'ringing'
  document.getElementById('phone-status') && (document.getElementById('phone-status').textContent = 'Klingelt...')
  document.getElementById('phone-answer')?.removeAttribute('hidden')
  document.getElementById('phone-hang')?.removeAttribute('hidden')
  try{
    phoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const now = phoneAudioCtx.currentTime
    const g = phoneAudioCtx.createGain(); g.gain.value = 0.0001; g.connect(phoneAudioCtx.destination); g.gain.exponentialRampToValueAtTime(0.06, now + 0.02)
    const f1 = phoneAudioCtx.createOscillator(); f1.type='sine'; f1.frequency.value = 440
    const f2 = phoneAudioCtx.createOscillator(); f2.type='sine'; f2.frequency.value = 480
    f1.connect(g); f2.connect(g)
    f1.start(now); f2.start(now)
    phoneOscs = [f1,f2,g]
    let on = true
    const alt = setInterval(()=>{
      if(!phoneAudioCtx) { clearInterval(alt); return }
      const t = phoneAudioCtx.currentTime
      if(on){ g.gain.setValueAtTime(0.06, t); } else { g.gain.setValueAtTime(0.0001, t) }
      on = !on
    }, 600)
    phoneOscs.alt = alt
  }catch(e){console.error('phone ring failed',e)}
}

function stopPhoneAudio(){
  if(phoneOscs.alt) { clearInterval(phoneOscs.alt); phoneOscs.alt = null }
  try{ if(phoneOscs[0]) phoneOscs[0].stop(); if(phoneOscs[1]) phoneOscs[1].stop() }catch(e){}
  try{ if(phoneOscs[2]) phoneOscs[2].disconnect() }catch(e){}
  phoneOscs = []
  try{ if(phoneAudioCtx) phoneAudioCtx.close() }catch(e){}
  phoneAudioCtx = null
}

function answerPhone(){
  // legacy security answer
  if(phoneState !== 'ringing') return
  stopPhoneAudio()
  phoneState = 'incall'
  document.getElementById('phone-status') && (document.getElementById('phone-status').textContent = 'Im Gespräch')
  document.getElementById('phone-answer')?.setAttribute('hidden','')
  document.getElementById('phone-call')?.setAttribute('hidden','')
  try{
    phoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const g = phoneAudioCtx.createGain(); g.gain.value = 0.0001; g.connect(phoneAudioCtx.destination); g.gain.exponentialRampToValueAtTime(0.02, phoneAudioCtx.currentTime + 0.02)
    const nbuf = phoneAudioCtx.createBuffer(1, phoneAudioCtx.sampleRate*1, phoneAudioCtx.sampleRate)
    const data = nbuf.getChannelData(0); for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1)*0.02
    const src = phoneAudioCtx.createBufferSource(); src.buffer = nbuf; src.loop = true
    const lp = phoneAudioCtx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = 800
    src.connect(lp); lp.connect(g); src.start()
    phoneOscs = [src, lp, g]
  }catch(e){console.error('phone in-call failed',e)}
  log('Telefon: Gespräch begonnen')
}

function hangPhone(){
  // legacy hang
  stopPhoneAudio()
  phoneState = 'idle'
  document.getElementById('phone-status') && (document.getElementById('phone-status').textContent = 'Bereit')
  document.getElementById('phone-answer')?.setAttribute('hidden','')
  document.getElementById('phone-hang')?.setAttribute('hidden','')
  document.getElementById('phone-call')?.removeAttribute('hidden')
  log('Telefon: Gespräch beendet')
}

// per-room ring/answer/hang
function startRoomRing(room){
  roomPhoneState[room] = roomPhoneState[room] || {}
  if(roomPhoneState[room].ringing) return
  roomPhoneState[room].ringing = true
  const statusEl = document.getElementById('phone-status-' + room)
  if(statusEl) statusEl.textContent = 'RING'
  document.querySelectorAll('.phone-answer-room[data-room="'+room+'"]')?.forEach(b=>b.hidden = false)
  document.querySelectorAll('.phone-hang-room[data-room="'+room+'"]')?.forEach(b=>b.hidden = true)
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ctx.destination); g.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.02)
    const f = ctx.createOscillator(); f.type='sine'; f.frequency.value = 520
    f.connect(g); f.start()
    const alt = setInterval(()=>{ try{ g.gain.setValueAtTime(g.gain.value>0.001?0.0001:0.04, ctx.currentTime) }catch(e){} }, 600)
    roomPhoneState[room].audio = { ctx, osc: f, gain: g, alt }
  }catch(e){console.error('room ring failed',e)}
}

function answerRoom(room){
  const st = roomPhoneState[room]
  if(!st || !st.ringing) return
  // stop ring
  if(st.audio){ try{ clearInterval(st.audio.alt); st.audio.osc.stop(); st.audio.gain.disconnect(); st.audio.ctx.close() }catch(e){} }
  roomPhoneState[room].ringing = false
  roomPhoneState[room].incall = true
  const statusEl = document.getElementById('phone-status-' + room)
  if(statusEl) statusEl.textContent = 'Im Gespräch'
  document.querySelectorAll('.phone-answer-room[data-room="'+room+'"]')?.forEach(b=>b.hidden = true)
  document.querySelectorAll('.phone-hang-room[data-room="'+room+'"]')?.forEach(b=>b.hidden = false)
  log(`Telefon (${room}): Gespräch begonnen`)
}

function hangRoom(room){
  const st = roomPhoneState[room]
  if(st && st.audio){ try{ clearInterval(st.audio.alt); st.audio.osc.stop(); st.audio.gain.disconnect(); st.audio.ctx.close() }catch(e){} }
  roomPhoneState[room] = {}
  const statusEl = document.getElementById('phone-status-' + room)
  if(statusEl) statusEl.textContent = 'Bereit'
  document.querySelectorAll('.phone-answer-room[data-room="'+room+'"]')?.forEach(b=>b.hidden = false)
  document.querySelectorAll('.phone-hang-room[data-room="'+room+'"]')?.forEach(b=>b.hidden = true)
  log(`Telefon (${room}): Gespräch beendet`)
}

// global incoming call events -> ring room phones
window.addEventListener('incomingCall', (e)=>{
  const { callId, number, room } = e.detail
  // attach callId to buttons for later reference
  document.querySelectorAll('.phone-answer-room[data-room="'+room+'"]')?.forEach(b=>b.dataset.callId = callId)
  document.querySelectorAll('.phone-hang-room[data-room="'+room+'"]')?.forEach(b=>b.dataset.callId = callId)
  startRoomRing(room)
})

window.addEventListener('callEnded', (e)=>{
  const { callId, room } = e.detail
  hangRoom(room)
})

// security dial button -> route via callBus
document.getElementById('phone-call')?.addEventListener('click', ()=>{
  const num = document.getElementById('phone-number')?.value.trim()
  if(!num) return
  try{ if(window.AudioContext && window.AudioContext.state === 'suspended') window.AudioContext.resume && window.AudioContext.resume() }catch(e){}
  const callId = callBus.call(num, { from: 'security' })
  if(!callId){ alert('Unbekannte Nummer: ' + num); return }
  const status = document.getElementById('phone-status')
  if(status) status.textContent = 'Wählt ' + num
  log('Telefon: Anruf initiiert ' + num)
})

// room answer/hang buttons
document.querySelectorAll('.phone-answer-room').forEach(b=>{
  b.addEventListener('click', (ev)=>{
    const room = ev.target.dataset.room
    const callId = ev.target.dataset.callId
    answerRoom(room)
    if(callId){ const call = callBus.activeCalls[callId]; if(call) call.targets.forEach(r=>{ if(r!==room) hangRoom(r) }) }
  })
})

document.querySelectorAll('.phone-hang-room').forEach(b=>{
  b.addEventListener('click', (ev)=>{
    const room = ev.target.dataset.room
    const callId = ev.target.dataset.callId
    hangRoom(room)
    if(callId) callBus.end(callId)
  })
})

// --- Security slips (stampable documents) ---
document.querySelectorAll('.btn-approve').forEach(btn => {
  btn.addEventListener('click', (ev) => {
    const slip = ev.target.closest('.slip')
    if(!slip) return
    stampSlip(slip, 'approved')
  })
})
document.querySelectorAll('.btn-deny').forEach(btn => {
  btn.addEventListener('click', (ev) => {
    const slip = ev.target.closest('.slip')
    if(!slip) return
    stampSlip(slip, 'denied')
  })
})

// Short stamp sound generator (plays a quick percussive/noise thud)
function playStampSound(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime
    const master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination)

    // short noise burst for the cloth/paper sound
    const len = Math.floor(ctx.sampleRate * 0.06)
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for(let i=0;i<len;i++){
      // decaying noise
      data[i] = (Math.random()*2 - 1) * (1 - i/len) * 0.6
    }
    const src = ctx.createBufferSource(); src.buffer = buffer
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    src.connect(lp); lp.connect(g); g.connect(master)
    src.start(now)
    // small low-frequency thud (body)
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, now)
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, now); og.gain.exponentialRampToValueAtTime(0.25, now + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    o.connect(og); og.connect(master); o.start(now)

    // stop and close after short time
    setTimeout(()=>{ try{ src.stop(); o.stop(); ctx.close() }catch(e){} }, 300)
  }catch(e){ console.error('stamp audio failed', e) }
}

function stampSlip(slipEl, status){
  if(slipEl.classList.contains('approved') || slipEl.classList.contains('denied')) return
  const id = slipEl.dataset.id || '??'
  slipEl.classList.remove('approved','denied')
  slipEl.classList.add(status)
  const stamp = slipEl.querySelector('.stamp')
  if(stamp){
    stamp.classList.remove('approved','denied')
    stamp.classList.add(status)
    stamp.textContent = status === 'approved' ? 'APPROVED' : 'DENIED'
  }
  // play a short stamp sound (triggered by user click)
  try{ playStampSound() }catch(e){ console.error('play stamp failed', e) }
  // disable buttons
  slipEl.querySelectorAll('button').forEach(b=>b.disabled = true)
  log(`Security: Slip #${id} ${status.toUpperCase()}`)
}

// Drag-and-drop for slips
let draggingSlip = null
document.querySelectorAll('.slip[draggable="true"]').forEach(s => {
  s.addEventListener('dragstart', ev => {
    draggingSlip = s
    ev.dataTransfer.setData('text/plain', s.dataset.id || '')
    s.classList.add('dragging')
  })
  s.addEventListener('dragend', ev => {
    draggingSlip = null
    s.classList.remove('dragging')
  })
})

const slipBoard = document.getElementById('slip-board')
const slipSource = document.getElementById('slip-source')
;[slipBoard, slipSource].forEach(el => {
  if(!el) return
  el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('highlight') })
  el.addEventListener('dragleave', ev => { el.classList.remove('highlight') })
  el.addEventListener('drop', ev => {
    ev.preventDefault(); el.classList.remove('highlight')
    const id = ev.dataTransfer.getData('text/plain')
    // find the element by data-id (prefer draggingSlip)
    const node = draggingSlip || document.querySelector(`.slip[data-id="${id}"]`)
    if(node && el !== node.parentElement){
      el.appendChild(node)
      // if dropped into target, show actions; if moved back to source, hide
      const actions = node.querySelector('.slip-actions')
      if(el.id === 'slip-board'){
        if(actions) actions.style.display = 'flex'
      } else {
        if(actions) actions.style.display = 'none'
      }
    }
  })
})


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

  // global volume slider handler: update `alarmVolume` and adjust live gain if siren running
  const volElGlobal = document.getElementById('alarm-volume')
  if(volElGlobal){
    alarmVolume = Number(volElGlobal.value)
    volElGlobal.addEventListener('input', (e)=>{
      alarmVolume = Number(e.target.value)
      if(sirenNodes && sirenNodes.master && audioContext){
        try{
          const mapped = Math.max(0, alarmVolume/100 * 0.7)
          const now = audioContext.currentTime
          sirenNodes.master.gain.cancelScheduledValues(now)
          sirenNodes.master.gain.linearRampToValueAtTime(mapped, now + 0.06)
        }catch(e){ console.error('volume adjust failed', e) }
      }
    })
  }

document.getElementById('turbine-start')?.addEventListener('click', ()=>{ turbineRunning = true; log('Turbine startet') })
document.getElementById('turbine-stop')?.addEventListener('click', ()=>{ turbineRunning = false; log('Turbine gestoppt') })
// --- Security alarm (visual + audio) ---
let alarmActive = false
let alarmVisualInterval = null
let sirenTimer = null
let audioContext = null
let sirenNodes = null
let originalTitle = document.title
let titleFlashTimer = null
let vibrateTimer = null

function startAlarm(){
  if(alarmActive) return
  alarmActive = true
  log('Security Alarm ausgelöst')
  const banner = document.getElementById('security-alarm-right')
  if(banner){ banner.hidden = false; banner.classList.add('active') }
  alarmVisualInterval = setInterval(()=>{ const b = document.getElementById('security-alarm-right'); if(b) b.classList.toggle('active') }, 700)

  try{
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = audioContext

    // master gain (volume controllable)
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, ctx.currentTime)
    master.connect(ctx.destination)
    const targetVol = Math.max(0.08, alarmVolume/100 * 1.25)
    master.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.02)

    // create weighted multi-oscillator stack for a powerful, authoritative tone
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(55, ctx.currentTime)
    const low = ctx.createOscillator(); low.type = 'sine'; low.frequency.setValueAtTime(110, ctx.currentTime)
    const body = ctx.createOscillator(); body.type = 'sawtooth'; body.frequency.setValueAtTime(220, ctx.currentTime)
    // high treble layer to add a shrill edge
    const screech = ctx.createOscillator(); screech.type = 'triangle'; screech.frequency.setValueAtTime(1200, ctx.currentTime)

    const subG = ctx.createGain(); subG.gain.value = 0.0001
    const lowG = ctx.createGain(); lowG.gain.value = 0.0001
    const bodyG = ctx.createGain(); bodyG.gain.value = 0.0001
    const screechG = ctx.createGain(); screechG.gain.value = 0.0001

    sub.connect(subG); low.connect(lowG); body.connect(bodyG); screech.connect(screechG)

    // mild punch filter and gentle compression for 'mighty' presence
    const punch = ctx.createBiquadFilter(); punch.type = 'lowpass'; punch.frequency.value = 4000
    const comp = ctx.createDynamicsCompressor(); comp.threshold.setValueAtTime(-12, ctx.currentTime); comp.ratio.setValueAtTime(8, ctx.currentTime); comp.attack.setValueAtTime(0.01, ctx.currentTime); comp.release.setValueAtTime(0.25, ctx.currentTime)

    subG.connect(punch); lowG.connect(punch); bodyG.connect(punch); screechG.connect(punch)
    punch.connect(comp); comp.connect(master)

    // subtle noise layer for realism
    const bufferSize = Math.floor(ctx.sampleRate * 0.5)
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2 - 1) * 0.3
    const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuffer; noiseSrc.loop = true
    const noiseF = ctx.createBiquadFilter(); noiseF.type = 'bandpass'; noiseF.frequency.value = 1500; noiseF.Q.value = 0.7
    const noiseG = ctx.createGain(); noiseG.gain.value = 0.0001
    noiseSrc.connect(noiseF); noiseF.connect(noiseG); noiseG.connect(master)

    sub.start(); low.start(); body.start(); noiseSrc.start()

    sirenNodes = {sub, low, body, screech, subG, lowG, bodyG, screechG, noiseSrc, noiseG, punch, comp, master}

    // pulsed pattern: stronger pulse (~500ms) every ~600ms (faster)
    const pulseInterval = 600
    sirenTimer = setInterval(()=>{
      try{
        const now = ctx.currentTime
        const vol = Math.max(0.08, alarmVolume/100 * 1.25)
        // quick attack, sustain, then release (slightly longer sustain for gravity)
        const attack = 0.02
        const sustain = 0.44
        const release = 0.24

        ;[subG, lowG, bodyG].forEach((g, idx)=>{
          g.gain.cancelScheduledValues(now)
          g.gain.setValueAtTime(0.0001, now)
          // stronger weighting for sub and low for power
          const mult = idx===0? 1.6 : (idx===1? 1.0 : 0.9)
          g.gain.exponentialRampToValueAtTime(Math.max(0.002, vol * mult), now + attack)
          g.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + release)
        })

        // shrill treble pulse
        try{
          screechG.gain.cancelScheduledValues(now)
          screechG.gain.setValueAtTime(0.0001, now)
          screechG.gain.exponentialRampToValueAtTime(Math.max(0.002, vol * 0.8), now + attack)
          screechG.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + release)
        }catch(e){}

        // slight body frequency modulation for urgency
        try{ body.frequency.cancelScheduledValues(now); body.frequency.setValueAtTime(220, now); body.frequency.linearRampToValueAtTime(260, now + attack + sustain*0.5); body.frequency.linearRampToValueAtTime(220, now + attack + sustain + release) }catch(e){}

        noiseG.gain.cancelScheduledValues(now)
        noiseG.gain.setValueAtTime(0.0001, now)
        noiseG.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.09), now + 0.01)
        noiseG.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + release)
      }catch(e){ console.error('pulse failed', e) }
    }, pulseInterval)

    // Desktop/Mobile: request/resume audio on first user gesture if suspended
    if (audioContext && audioContext.state === 'suspended'){
      const resumeOnUserGesture = ()=> audioContext.resume().catch(()=>{})
      // use once:true so listener is removed automatically and won't interfere with clicks
      window.addEventListener('pointerdown', resumeOnUserGesture, { once: true })
    }

    // Desktop notifications (silent) to alert if tab not visible
    try{
      if('Notification' in window){
        if(Notification.permission === 'granted'){
          new Notification('Security Alarm', { body: 'Sicherheitsalarm ausgelöst!', silent: true })
        } else if(Notification.permission === 'default'){
          Notification.requestPermission().then(p=>{ if(p === 'granted') new Notification('Security Alarm', { body: 'Sicherheitsalarm ausgelöst!', silent: true }) })
        }
      }
    }catch(e){}

    // flash document title to draw attention
    try{
      if(!titleFlashTimer){
        originalTitle = document.title || 'Simulator'
        titleFlashTimer = setInterval(()=>{
          document.title = document.title === '!!! ALARM !!!' ? originalTitle : '!!! ALARM !!!'
        }, 1000)
      }
      // ensure the banner doesn't capture pointer events and block the UI
      try{ const b = document.getElementById('security-alarm-right'); if(b) b.style.pointerEvents = 'none' }catch(e){}
    }catch(e){}

    // vibration pattern where supported; use interval to repeat pattern
    try{
      if(navigator && typeof navigator.vibrate === 'function'){
        navigator.vibrate([400,200,400])
        if(!vibrateTimer) vibrateTimer = setInterval(()=>{ navigator.vibrate([400,200,400]) }, 1200)
      }
    }catch(e){}
  }catch(e){
    console.error('Audio failed', e)
  }
}

function stopAlarm(){
  if(!alarmActive) return
  alarmActive = false
  log('Security Alarm gestoppt')
  const banner = document.getElementById('security-alarm-right')
  if(banner){ banner.hidden = true; banner.classList.remove('active'); try{ banner.style.pointerEvents = '' }catch(e){} }
  if(alarmVisualInterval){ clearInterval(alarmVisualInterval); alarmVisualInterval = null }
  if(sirenTimer){ clearInterval(sirenTimer); sirenTimer = null }
  if(titleFlashTimer){ clearInterval(titleFlashTimer); titleFlashTimer = null; try{ document.title = originalTitle }catch(e){} }
  if(vibrateTimer){ clearInterval(vibrateTimer); vibrateTimer = null; try{ if(navigator && typeof navigator.vibrate === 'function') navigator.vibrate(0) }catch(e){} }
  if(sirenNodes){
    try{
      Object.values(sirenNodes).forEach(n=>{
        if(!n) return
        try{ if(typeof n.stop === 'function') n.stop() }catch(e){}
        try{ if(typeof n.disconnect === 'function') n.disconnect() }catch(e){}
      })
    }catch(e){}
    sirenNodes = null
  }
  if(audioContext){ audioContext.close(); audioContext = null }
}

// Snooze the alarm for a number of seconds (default 60)
function snoozeAlarm(seconds = 60){
  if(!alarmActive) return
  stopAlarm()
  log(`Alarm schlummert für ${seconds} Sekunden`)
  setTimeout(()=>{ startAlarm() }, Number(seconds) * 1000)
}

document.getElementById('raise-alarm')?.addEventListener('click', ()=> startAlarm())
document.getElementById('stop-alarm')?.addEventListener('click', ()=> stopAlarm())
document.getElementById('snooze-alarm')?.addEventListener('click', ()=> snoozeAlarm(60))

// apply manual control: set manual mode and apply slider to control rods
const applyBtn = document.getElementById('apply-manual')
if(applyBtn){
  applyBtn.addEventListener('click', ()=>{
    const manualCheckbox = document.getElementById('manual-mode')
    const slider = document.getElementById('manual-slider')
    if(!manualCheckbox || !slider) return
    state.manualMode = manualCheckbox.checked
    const val = Number(slider.value)
    // only apply rods position when manual mode enabled
    if(state.manualMode){
      state.rods = Math.max(0, Math.min(100, val))
      log(`Manuelle Steuerung: Kontrollstäbe auf ${Math.round(state.rods)}% gesetzt`)
      updateRodsVisual()
      updateUI()
    } else {
      log('Manuelle Steuerung ist deaktiviert. Aktivieren, um Änderungen anzuwenden.')
    }
  })
}

// periodically update turbine rpm while view is visible
setInterval(()=>{
  const active = document.querySelector('.view.active')?.id
  if(active === 'view-turbine') updateTurbineView()
}, 500)

// simple physics loop
setInterval(()=>{
  // determine reactivity: manual mode uses control rod position (less reactivity when rods inserted)
  let reactivity = 0
  if(state.manualMode){
    reactivity = (100 - state.rods) / 100
  } else {
    reactivity = state.running ? 0.85 : 0
  }
  if(state.running || state.manualMode){
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
    state.rods = 100
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
log('Simulator geladen')

// --- DEBUG: Click troubleshooting helper ---
function enableClickDebug(){
  if(window._clickDebugEnabled) return
  window._clickDebugEnabled = true
  window.enableClickDebug = enableClickDebug
  window.queryTopElementAt = (x,y)=> document.elementFromPoint(x,y)
  window.addEventListener('click', function _globalClickDebug(e){
    try{
      console.groupCollapsed('Click Debug')
      console.log('event.target:', e.target)
      const pt = { x: e.clientX, y: e.clientY }
      console.log('client coords:', pt)
      const top = document.elementFromPoint(pt.x, pt.y)
      console.log('elementFromPoint:', top)
      // log computed styles that affect pointer events/visibility
      if(top){
        const cs = window.getComputedStyle(top)
        console.log('computed pointer-events:', cs.pointerEvents, 'visibility:', cs.visibility, 'display:', cs.display, 'z-index:', cs.zIndex)
      }
      console.groupEnd()
      // highlight briefly
      highlightElement(top)
    }catch(err){ console.error('click debug failed', err) }
  }, true)
  console.log('Click debug enabled — click anywhere to inspect the top element (captures during bubble/capture).')
}

function highlightElement(el){
  if(!el || !el.style) return
  const prev = el.style.outline
  el.style.outline = '3px solid magenta'
  setTimeout(()=>{ try{ el.style.outline = prev }catch(e){} }, 700)
}

// Auto-enable if debug flag present in URL or localStorage
try{
  const params = new URLSearchParams(window.location.search)
  if(params.get('debugClicks') === '1' || localStorage.getItem('debugClicks') === '1') enableClickDebug()
}catch(e){}

// --- RESET Button with password (4532) ---
document.getElementById('reset-btn')?.addEventListener('click', ()=>{
  const pwd = prompt('⚠️ RESET-PASSWORT (Anlagenleiter):', '')
  if(pwd !== '4532'){
    alert('❌ Falsches Passwort!')

// --- Generate many slips placed on the table center (not in the panel) ---
function setupSlipInteractions(slip){
  slip.setAttribute('draggable','true')
  slip.classList.remove('dragging')
  slip.addEventListener('dragstart', ev => {
    draggingSlip = slip
    try{ ev.dataTransfer.setData('text/plain', slip.dataset.id || '') }catch(e){}
    slip.classList.add('dragging')
  })
  slip.addEventListener('dragend', ev => {
    draggingSlip = null
    slip.classList.remove('dragging')
  })
  // wire approve/deny if present
  const a = slip.querySelector('.btn-approve')
  const d = slip.querySelector('.btn-deny')
  if(a) a.addEventListener('click', ()=> stampSlip(slip,'approved'))
  if(d) d.addEventListener('click', ()=> stampSlip(slip,'denied'))
}

function createTableCenterIfMissing(){
  const secPanel = document.querySelector('#view-security .security-panel')
  if(!secPanel) return null
  let table = document.getElementById('table-center')
  if(table) return table
  table = document.createElement('div')
  table.id = 'table-center'
  table.className = 'table-center'
  const note = document.createElement('div'); note.className = 'note'; note.textContent = 'Tischmitte: Lege die Blätter hier ab';
  table.appendChild(note)
  // insert table before the existing slip-board-wrap so UI still shows right box
  const slipsWrap = secPanel.querySelector('.slip-board-wrap')
  if(slipsWrap) secPanel.insertBefore(table, slipsWrap)
  else secPanel.appendChild(table)
  return table
}

function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)] }

function generateRandomSlipContent(i){
  const names = ['Ivanov','Petrov','Sidorov','Kovalenko','Novik','Mikhailov','Borisov','Sergeev','Alexeev','Dmitriev']
  const reasons = [
    'Wartung beantragt','Zugang zur Halle','Ersatzteilbestellung','Maskenausgabe','Kontrollmessung','Schichtwechsel','Reinigung','Materialtransport','Kurzzeit-Einsatz','Temperaturkontrolle'
  ]
  const extras = ['Dringend','Routine','Genehmigt auf Zeit','Antrag ohne Unterschrift','Mit Begleitung','Sicherheitsprüfung']
  const name = randomFrom(names)
  const reason = randomFrom(reasons)
  const extra = randomFrom(extras)
  return `<strong>Anfrage ${i}:</strong> ${reason}. Name: ${name}. ${extra}.` 
}

function generateTableSlips(count = 100){
  const table = createTableCenterIfMissing()
  if(!table) return
  // clear existing slips in table
  Array.from(table.querySelectorAll('.slip')).forEach(s=>s.remove())
  // also clear original slip-source so we don't duplicate
  const slipSource = document.getElementById('slip-source')
  if(slipSource) slipSource.innerHTML = '<div class="source-title">Alte Zettel (leer)</div>'

  const placedRects = []
  const maxAttempts = 200
  // container size
  const rect = table.getBoundingClientRect()
  const W = Math.max(300, rect.width || 700)
  const H = Math.max(220, rect.height || 320)

  for(let i=1;i<=count;i++){
    const slip = document.createElement('div')
    slip.className = 'slip'
    slip.dataset.id = 'T' + i
    slip.innerHTML = `
      <div class="slip-body">${generateRandomSlipContent(i)}</div>
      <div class="slip-actions" style="display:none">
        <button class="btn-approve">Approve</button>
        <button class="btn-deny">Deny</button>
      </div>
      <div class="stamp" aria-hidden="true"></div>
    `
    // temporarily append invisibly to measure
    slip.style.visibility = 'hidden'
    table.appendChild(slip)
    // measure
    const srect = slip.getBoundingClientRect()
    const sw = Math.min(220, srect.width || 170)
    const sh = Math.min(120, srect.height || 80)

    // find a non-overlapping position
    let placed = false
    for(let attempt=0; attempt<maxAttempts && !placed; attempt++){
      const x = Math.floor(Math.random() * Math.max(1, W - sw - 20)) + 10
      const y = Math.floor(Math.random() * Math.max(1, H - sh - 20)) + 30
      // check overlap
      let ok = true
      for(const r of placedRects){
        if(!(x + sw < r.x || x > r.x + r.w || y + sh < r.y || y > r.y + r.h)){ ok = false; break }
      }
      if(ok){ slip.style.left = x + 'px'; slip.style.top = y + 'px'; placedRects.push({x,y,w:sw,h:sh}); placed = true }
    }
    if(!placed){ // fallback: push to grid
      const gx = 12 + (i%8) * (sw + 8)
      const gy = 40 + Math.floor(i/8) * (sh + 8)
      slip.style.left = gx + 'px'; slip.style.top = gy + 'px'
      placedRects.push({x:gx,y:gy,w:sw,h:sh})
    }
    // small random rotation for realism
    const rot = (Math.random()*30 - 15).toFixed(1)
    slip.style.transform = `rotate(${rot}deg)`
    slip.style.visibility = 'visible'
    // ensure actions hidden initially (only show when dropped into board)
    const actions = slip.querySelector('.slip-actions')
    if(actions) actions.style.display = 'none'
    // wire interactions
    setupSlipInteractions(slip)
  }
}

// generate 100 slips on load for the security table
generateTableSlips(100)
    log('SICHERHEIT: Reset-Versuch mit falschem Passwort')
    return
  }
  // Reset all systems
  state.power = 0
  state.temp = 20
  state.pressure = 101.3
  state.dosage = 0.2
  state.running = false
  state.manualMode = false
  state.rods = 50
  state.cooling = true
  cooling.checked = true
  document.getElementById('manual-mode').checked = false
  document.getElementById('manual-slider').value = 50
  document.getElementById('knob-pump').value = 50
  document.getElementById('knob-turbine').value = 50
  // Stop turbine
  turbineRunning = false
  // Clear annunciators
  Object.keys(annunciators).forEach(k => setAnnunciator(k, 'ok'))
  // Close AZ-5 cover
  az5Open = false
  if(az5Cover) az5Cover.classList.remove('open')
  // Stop alarm if active
  if(alarmActive) stopAlarm()
  // Stop phone rings
  hangPhone()
  Object.keys(roomPhoneState).forEach(room => hangRoom(room))
  // Update UI
  updateUI()
  log('✓ SYSTEM ZURÜCKGESETZT (Anlagenleiter)')
})
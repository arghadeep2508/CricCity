'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { fetchPlayers } from '@/lib/api'

/* ═══════════════════════════════════════════════════════
   TYPES & CONSTANTS
═══════════════════════════════════════════════════════ */
type Format   = 'test' | 'odi' | 't20'
type BldShape = 'tower' | 'stepped' | 'cylinder' | 'slab' | 'cruciform' | 'pyramid'
type Pal      = { border:number; emissive:number; ground:number; batsman:number; bowler:number; allrounder:number }
type AllMax   = { runs:Record<Format,number>; wkts:Record<Format,number>; avg:Record<Format,number>; sr:Record<Format,number>; eco:Record<Format,number> }

const TEAM_LAYOUT = [
  { key:'sri lanka',    angle: Math.PI/2,         label:'SRI LANKA'    },
  { key:'afghanistan', angle: Math.PI/4,          label:'AFGHANISTAN'  },
  { key:'england',     angle: 0,                  label:'ENGLAND'      },
  { key:'australia',   angle:-Math.PI/4,          label:'AUSTRALIA'    },
  { key:'india',       angle:-Math.PI/2,          label:'INDIA'        },
  { key:'south africa',angle:-(3*Math.PI)/4,      label:'SOUTH AFRICA' },
  { key:'west indies', angle: Math.PI,            label:'WEST INDIES'  },
  { key:'new zealand', angle: (3*Math.PI)/4,      label:'NEW ZEALAND'  },
] as const

const PALETTE: Record<string,Pal> = {
  india:         {border:0x38bdf8,emissive:0x0369a1,ground:0x020c1a,batsman:0x38bdf8,bowler:0xf97316,allrounder:0x34d399},
  australia:     {border:0xfbbf24,emissive:0xb45309,ground:0x130b00,batsman:0xfbbf24,bowler:0xef4444,allrounder:0xa3e635},
  england:       {border:0xf87171,emissive:0x991b1b,ground:0x150000,batsman:0xf87171,bowler:0xc026d3,allrounder:0xfbbf24},
  'south africa':{border:0x4ade80,emissive:0x166534,ground:0x001409,batsman:0x4ade80,bowler:0xfbbf24,allrounder:0x22d3ee},
  'new zealand': {border:0xb0c4de,emissive:0x334155,ground:0x080d11,batsman:0xb0c4de,bowler:0x818cf8,allrounder:0x86efac},
  afghanistan:   {border:0xfb923c,emissive:0x9a3412,ground:0x130700,batsman:0xfb923c,bowler:0xa78bfa,allrounder:0x34d399},
  'sri lanka':   {border:0xfde047,emissive:0x854d0e,ground:0x110e00,batsman:0xfde047,bowler:0xf472b6,allrounder:0x67e8f9},
  'west indies': {border:0xf472b6,emissive:0x9d174d,ground:0x130010,batsman:0xf472b6,bowler:0xfb923c,allrounder:0xa78bfa},
}
const FALLBACK: Pal = {border:0x60a5fa,emissive:0x1e40af,ground:0x050d1a,batsman:0x60a5fa,bowler:0xf97316,allrounder:0x34d399}
const getPal = (t: string): Pal => PALETTE[t] ?? FALLBACK

const FLAG: Record<string,string> = {
  india:'🇮🇳', australia:'🇦🇺', england:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'south africa':'🇿🇦',
  'new zealand':'🇳🇿', afghanistan:'🇦🇫', 'sri lanka':'🇱🇰', 'west indies':'🏝️',
}

/* district geometry */
const DDIST   = 165   // centre→district (closer = bigger-looking)
const RLEN    = 145   // road length
const BSLOT   = 7.0   // slot per building (wider = more city feel)
const BBLK    = 4     // buildings per block
const BSTR    = 8.0   // street width
const IROAD   = 5     // half-width inner cross roads
const DPAD    = 18    // platform padding

/* ═══════════════════════════════════════════════════════
   FIX #5  SCORING — best-format bonus so Sachin > Virat in TEST
═══════════════════════════════════════════════════════ */
function computeAllMax(players: any[]): AllMax {
  const r: AllMax = {
    runs:{test:1,odi:1,t20:1}, wkts:{test:1,odi:1,t20:1},
    avg:{test:1,odi:1,t20:1},  sr:{test:1,odi:1,t20:1}, eco:{test:0.01,odi:0.01,t20:0.01}
  }
  players.forEach(p => {
    ;(['test','odi','t20'] as Format[]).forEach(f => {
      const b = p.stats?.batting?.[f] ?? {}, w = p.stats?.bowling?.[f] ?? {}
      r.runs[f] = Math.max(r.runs[f], b.runs        || 0)
      r.wkts[f] = Math.max(r.wkts[f], w.wickets     || 0)
      r.avg[f]  = Math.max(r.avg[f],  b.average     || 0)
      r.sr[f]   = Math.max(r.sr[f],   b.strike_rate || 0)
      r.eco[f]  = Math.max(r.eco[f],  w.economy     || 0)
    })
  })
  return r
}

function fmtScore(p: any, f: Format, mx: AllMax): number {
  const role = (p.personal_info?.role || p.role || '').toLowerCase()
  const b = p.stats?.batting?.[f]  ?? {}
  const w = p.stats?.bowling?.[f]  ?? {}
  const bR  = (b.runs          || 0) / mx.runs[f]
  const bAv = (b.average       || 0) / mx.avg[f]
  const bSR = (b.strike_rate   || 0) / mx.sr[f]
  const wW  = (w.wickets       || 0) / mx.wkts[f]
  const wE  = w.economy > 0 ? Math.min(1, (mx.eco[f] * 0.4) / w.economy) : 0
  if (role.includes('bowl'))
    return f==='t20'?wW*0.45+wE*0.55:f==='odi'?wW*0.52+wE*0.48:wW*0.65+wE*0.35
  if (role.includes('all')) {
    const bs = f==='t20'?bR*0.30+bAv*0.35+bSR*0.35:f==='odi'?bR*0.40+bAv*0.35+bSR*0.25:bR*0.40+bAv*0.60
    const ws = f==='t20'?wW*0.45+wE*0.55:f==='odi'?wW*0.52+wE*0.48:wW*0.65+wE*0.35
    return (bs + ws) / 2
  }
  return f==='t20'?bR*0.30+bAv*0.35+bSR*0.35:f==='odi'?bR*0.40+bAv*0.35+bSR*0.25:bR*0.40+bAv*0.60
}

// Career height = weighted average + 40% weight on best single format → Sachin dominates TEST view
function careerScore(p: any, mx: AllMax): number {
  const t = fmtScore(p,'test',mx), o = fmtScore(p,'odi',mx), t20 = fmtScore(p,'t20',mx)
  const weighted = t*0.40 + o*0.35 + t20*0.25
  const best     = Math.max(t, o, t20)
  return weighted * 0.60 + best * 0.40
}

/* ═══════════════════════════════════════════════════════
   COUNTRY NORMALISER
═══════════════════════════════════════════════════════ */
function normalizeCountry(p: any): string {
  const raw = (p.country||p.team||p.personal_info?.country||p.personal_info?.team||p.nationality||'')
    .toString().toLowerCase().trim()
  if (!raw) return 'world'
  if (raw.includes('india')  ||raw==='ind')                       return 'india'
  if (raw.includes('eng')    ||raw==='eng')                       return 'england'
  if (raw.includes('aus')    ||raw==='aus')                       return 'australia'
  if (raw.includes('south')  ||raw==='sa'||raw==='rsa')           return 'south africa'
  if (raw.includes('zealand')||raw.includes('nz')||raw==='nzl')  return 'new zealand'
  if (raw.includes('afghan') ||raw==='afg')                       return 'afghanistan'
  if (raw.includes('sri')    ||raw==='slc'||raw==='sl')           return 'sri lanka'
  if (raw.includes('west')   ||raw.includes('windies')||raw==='wi')return 'west indies'
  return 'world'
}

/* ═══════════════════════════════════════════════════════
   FIX #3  BUILDING SHAPES — variety, no overlap
   Each slot = 5.2 units. Building width capped at 4.6.
═══════════════════════════════════════════════════════ */
function pickShape(role: string, idx: number, ns: number): BldShape {
  const seed = (idx * 137 + ~~(ns * 89)) % 6
  if (role.includes('bowl'))
    return (['cylinder','slab','pyramid'] as BldShape[])[seed % 3]
  if (role.includes('all'))
    return (['cruciform','stepped','slab'] as BldShape[])[seed % 3]
  if (ns > 0.75) return seed < 3 ? 'tower' : 'stepped'
  if (ns > 0.50) return seed < 3 ? 'stepped' : 'tower'
  return (['cylinder','slab','pyramid','tower'] as BldShape[])[seed % 4]
}

function buildingGroup(shape: BldShape, w: number, h: number, mat: THREE.Material): THREE.Group {
  const g  = new THREE.Group()
  const sw = Math.min(w, 5.8)  // slot is 6.0 — 0.2 gap each side
  switch (shape) {
    case 'tower': {
      // Thick central shaft + narrower setback + spire tip
      const s = new THREE.Mesh(new THREE.BoxGeometry(sw*0.88, h*0.72, sw*0.88), mat)
      s.position.y = h*0.36; g.add(s)
      const m = new THREE.Mesh(new THREE.BoxGeometry(sw*0.55, h*0.20, sw*0.55), mat)
      m.position.y = h*0.72+h*0.10; g.add(m)
      const tip = new THREE.Mesh(new THREE.ConeGeometry(sw*0.16, h*0.14, 6), mat)
      tip.position.y = h*0.92+h*0.07; g.add(tip)
      break
    }
    case 'stepped': {
      // 3 wide tiers stepping inward — Empire State style
      [[1.00,0.45,0.00],[0.75,0.32,0.45],[0.50,0.23,0.77]].forEach(([wf,hf,yb]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sw*wf, h*hf, sw*wf), mat)
        m.position.y = h*yb + h*hf/2; g.add(m)
      })
      break
    }
    case 'cylinder': {
      // Fat cylinder body + dome top
      const b = new THREE.Mesh(new THREE.CylinderGeometry(sw*0.46, sw*0.48, h*0.85, 10), mat)
      b.position.y = h*0.425; g.add(b)
      const d = new THREE.Mesh(new THREE.SphereGeometry(sw*0.46, 10, 6, 0, Math.PI*2, 0, Math.PI/2), mat)
      d.position.y = h*0.85; g.add(d)
      break
    }
    case 'slab': {
      // Wide block body + cylindrical tower on top
      const body = new THREE.Mesh(new THREE.BoxGeometry(sw, h*0.52, sw*0.90), mat)
      body.position.y = h*0.26; g.add(body)
      const top = new THREE.Mesh(new THREE.CylinderGeometry(sw*0.36, sw*0.40, h*0.44, 8), mat)
      top.position.y = h*0.52+h*0.22; g.add(top)
      break
    }
    case 'cruciform': {
      // Plus-shaped floor plan — wide arms
      const hz = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sw*0.70), mat)
      hz.position.y = h/2; g.add(hz)
      const vt = new THREE.Mesh(new THREE.BoxGeometry(sw*0.70, h, sw), mat)
      vt.position.y = h/2; g.add(vt)
      break
    }
    case 'pyramid': {
      // Tapered obelisk
      const body = new THREE.Mesh(new THREE.CylinderGeometry(sw*0.28, sw*0.48, h, 6), mat)
      body.position.y = h/2; g.add(body)
      break
    }
  }
  return g
}

/* ═══════════════════════════════════════════════════════
   GRID HELPERS
═══════════════════════════════════════════════════════ */
function slotPos(col: number, row: number) {
  return { x: col*BSLOT + Math.floor(col/BBLK)*BSTR, z: row*BSLOT + Math.floor(row/BBLK)*BSTR }
}
function axisSpan(n: number) {
  if (n <= 0) return 0
  return (n-1)*BSLOT + Math.max(0, Math.ceil(n/BBLK)-1)*BSTR
}

/* ═══════════════════════════════════════════════════════
   TEXTURES
═══════════════════════════════════════════════════════ */
function mkWinTex(hex: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width=128; cv.height=256
  const cx = cv.getContext('2d')!
  cx.fillStyle='#010810'; cx.fillRect(0,0,128,256)
  const c = new THREE.Color(hex), rgb = `${~~(c.r*255)},${~~(c.g*255)},${~~(c.b*255)}`
  for (let ci=0; ci<4; ci++) for (let ri=0; ri<14; ri++) {
    const r = Math.random()
    if (r > 0.28) {
      cx.fillStyle = r>0.90?'#ffffff':r>0.65?`rgba(${rgb},0.9)`:`rgba(${rgb},0.42)`
      cx.fillRect(ci*32+2, ri*18+2, 28, 14)
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,2); return t
}

function mkGoldTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width=128; cv.height=256
  const cx = cv.getContext('2d')!
  cx.fillStyle='#080400'; cx.fillRect(0,0,128,256)
  for (let ci=0; ci<4; ci++) for (let ri=0; ri<14; ri++) {
    const r = Math.random()
    if (r > 0.22) {
      const rr = ~~(200+Math.random()*55), gg = ~~(130+Math.random()*80)
      cx.fillStyle = r>0.90?'#ffffff':r>0.60?`rgb(${rr},${gg},0)`:`rgba(255,165,0,0.5)`
      cx.fillRect(ci*32+2, ri*18+2, 28, 14)
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,3); return t
}

function mkLabel(text: string, colorHex: number, sz = 1): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width=480; cv.height=88
  const cx = cv.getContext('2d')!
  const hex = '#'+new THREE.Color(colorHex).getHexString()
  cx.clearRect(0,0,480,88)
  cx.fillStyle='rgba(0,4,18,0.93)'; cx.beginPath(); cx.roundRect(2,4,476,80,10); cx.fill()
  cx.strokeStyle=hex; cx.lineWidth=2.5; cx.beginPath(); cx.roundRect(2,4,476,80,10); cx.stroke()
  cx.fillStyle=hex; cx.font='bold 26px "Courier New",monospace'; cx.textAlign='center'; cx.textBaseline='middle'
  cx.fillText(text, 240, 46)
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv), transparent:true, depthTest:false}))
  spr.scale.set(28*sz, 7*sz, 1); return spr
}

/* ═══════════════════════════════════════════════════════
   FIX #1 — MEGA ICC HEADQUARTER
═══════════════════════════════════════════════════════ */
function buildHQ(
  diamondRef: React.MutableRefObject<THREE.Mesh|null>,
  hqHitRef:   React.MutableRefObject<THREE.Mesh|null>
): THREE.Group {
  const g = new THREE.Group()

  const baseMat   = new THREE.MeshStandardMaterial({color:0x050e22,emissive:0x1d4ed8,emissiveIntensity:0.9})
  const spireMat  = new THREE.MeshStandardMaterial({color:0x020c1e,emissive:0x38bdf8,emissiveIntensity:1.4})
  const accentMat = new THREE.MeshStandardMaterial({color:0x041030,emissive:0x60a5fa,emissiveIntensity:1.0})
  const goldMat   = new THREE.MeshStandardMaterial({color:0xffd700,emissive:0xffaa00,emissiveIntensity:3.5})
  const whiteMat  = new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x7dd3fc,emissiveIntensity:8,transparent:true,opacity:0.95})
  const glassMat  = new THREE.MeshStandardMaterial({color:0x071a3e,emissive:0x1d4ed8,emissiveIntensity:0.7,transparent:true,opacity:0.60})
  const ringFn    = (e: number) => new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x38bdf8,emissiveIntensity:e})

  // ── 7-tier grand octagonal podium ──
  const tiers = [
    {r:42,h:5.5,y:2.75},{r:36,h:4.5,y:7.75},{r:30,h:4.0,y:12.0},
    {r:24,h:3.5,y:15.8},{r:19,h:3.0,y:19.1},{r:14,h:2.5,y:21.9},{r:10,h:2.0,y:24.2}
  ]
  tiers.forEach(({r,h,y}) => {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r+4, h, 8), baseMat)
    tier.position.y = y; g.add(tier)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r+0.3, 0.6, 8, 48), ringFn(5.0))
    ring.rotation.x = Math.PI/2; ring.position.y = y+h/2+0.4; g.add(ring)
  })

  // ── Ground plinth ──
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(48,54,2.2,8),baseMat); plinth.position.y=1.1; g.add(plinth)
  const plinthRing = new THREE.Mesh(new THREE.TorusGeometry(49,1.4,8,64),ringFn(3.0))
  plinthRing.rotation.x=Math.PI/2; plinthRing.position.y=2.2; g.add(plinthRing)

  // ── Central mega spire ──
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(13,140,13),spireMat); shaft.position.y=25.2+70; g.add(shaft)

  // ── Glass observation drum at mid-height ──
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(9,9,16,10),glassMat); drum.position.y=148; g.add(drum)
  const drumRing = new THREE.Mesh(new THREE.TorusGeometry(9.3,0.6,8,44),ringFn(6.0))
  drumRing.rotation.x=Math.PI/2; drumRing.position.y=156; g.add(drumRing)

  // ── Upper section tapers ──
  const taper1 = new THREE.Mesh(new THREE.CylinderGeometry(5,8,38,8),accentMat); taper1.position.y=183; g.add(taper1)
  const taper2 = new THREE.Mesh(new THREE.CylinderGeometry(2,5,26,8),accentMat); taper2.position.y=215; g.add(taper2)
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.8,2,20,6),goldMat); needle.position.y=238; g.add(needle)
  const tip    = new THREE.Mesh(new THREE.ConeGeometry(0.8,16,6),goldMat); tip.position.y=256; g.add(tip)

  // ── 3 observation deck rings ──
  ;[60,100,145].forEach(y => {
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(22,22,2,8),
      new THREE.MeshStandardMaterial({color:0x0c1e3c,emissive:0x38bdf8,emissiveIntensity:0.6}))
    deck.position.y = y; g.add(deck)
    const dRing = new THREE.Mesh(new THREE.TorusGeometry(22.3,0.6,8,48),ringFn(6.0))
    dRing.rotation.x=Math.PI/2; dRing.position.y=y+1.1; g.add(dRing)
    for (let i=0; i<8; i++) {
      const a = (i/8)*Math.PI*2
      const pp = new THREE.Mesh(new THREE.BoxGeometry(0.9,4,0.9),accentMat)
      pp.position.set(Math.cos(a)*21.5, y+3, Math.sin(a)*21.5); g.add(pp)
    }
  })

  // ── 20 outer mega-towers forming iconic skyline silhouette ──
  for (let i=0; i<20; i++) {
    const angle = (i/20)*Math.PI*2
    const rx = Math.cos(angle)*24, rz = Math.sin(angle)*24
    const isMajor = i%4===0, isMid = i%2===0
    const hh  = isMajor ? 80+Math.sin(i)*8 : isMid ? 58+Math.sin(i*0.9)*6 : 38
    const tw  = isMajor ? 4.0 : isMid ? 3.0 : 2.0

    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw,hh,tw),accentMat)
    tower.position.set(rx, hh/2+26.2, rz); g.add(tower)

    const ts = new THREE.Mesh(new THREE.ConeGeometry(tw*0.45,hh*0.22,4),goldMat)
    ts.position.set(rx, hh+26.2+hh*0.11, rz); g.add(ts)

    if (isMajor || isMid) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(isMajor?1.2:0.8,8,8),whiteMat)
      orb.position.set(rx, hh+26.2+hh*0.24, rz); g.add(orb)
    }
    // Crossbrace on major pillars to spire
    if (isMajor) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,28),
        new THREE.MeshStandardMaterial({color:0x0d1f40,emissive:0x60a5fa,emissiveIntensity:1.8}))
      brace.position.set(rx*0.5, hh*0.55+26.2, rz*0.5)
      brace.lookAt(new THREE.Vector3(0, hh*0.55+26.2, 0)); g.add(brace)
    }
  }

  // ── 6 search-light beams ──
  ;[[20,20],[20,-20],[-20,20],[-20,-20],[28,0],[0,28]].forEach(([x,z]) => {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6,3.5,130,6),
      new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x38bdf8,emissiveIntensity:2.0,transparent:true,opacity:0.09}))
    beam.position.set(x, 89, z); g.add(beam)
  })

  // ── Animated diamond topper ──
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(8,0),whiteMat)
  diamond.position.y = 244; g.add(diamond); diamondRef.current = diamond

  // ── Epic nameplate ──
  const sc = document.createElement('canvas'); sc.width=1000; sc.height=160
  const sx = sc.getContext('2d')!
  const sg = sx.createLinearGradient(0,0,1000,0)
  sg.addColorStop(0,'rgba(0,8,32,0)'); sg.addColorStop(0.08,'rgba(0,10,42,0.98)')
  sg.addColorStop(0.92,'rgba(0,10,42,0.98)'); sg.addColorStop(1,'rgba(0,8,32,0)')
  sx.fillStyle=sg; sx.fillRect(0,0,1000,160)
  sx.shadowColor='#38bdf8'; sx.shadowBlur=36
  sx.strokeStyle='#38bdf8'; sx.lineWidth=3.5; sx.strokeRect(9,9,982,142)
  sx.strokeStyle='rgba(56,189,248,0.2)'; sx.lineWidth=16; sx.strokeRect(9,9,982,142)
  sx.shadowBlur=0
  ;[[9,9],[964,9],[9,123],[964,123]].forEach(([cx,cy]) => {
    sx.strokeStyle='#7dd3fc'; sx.lineWidth=3; sx.strokeRect(cx,cy,28,28)
    sx.fillStyle='#7dd3fc'; sx.fillRect(cx+9,cy+9,10,10)
  })
  sx.fillStyle='#e0f2fe'; sx.font='bold 78px "Courier New",monospace'
  sx.textAlign='center'; sx.textBaseline='middle'
  sx.shadowColor='#38bdf8'; sx.shadowBlur=32; sx.fillText('HEADQUARTER',500,60); sx.shadowBlur=0
  sx.fillStyle='rgba(125,211,252,0.65)'; sx.font='17px "Courier New",monospace'
  sx.fillText('ICC  ·  INTERNATIONAL CRICKET COUNCIL  ·  EST. 1909', 500, 118)
  const sSpr = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthTest:false}))
  sSpr.scale.set(68,11,1); sSpr.position.set(0,60,0); g.add(sSpr)

  // invisible hitbox
  const hb = new THREE.Mesh(new THREE.BoxGeometry(55,265,55),new THREE.MeshBasicMaterial({visible:false}))
  hb.position.y = 132; g.add(hb); hqHitRef.current = hb
  return g
}

/* ═══════════════════════════════════════════════════════
   FIX #2 — TALL OUTER RING: pylons + triple torus
═══════════════════════════════════════════════════════ */
function buildOuterRing(scene: THREE.Scene) {
  const R = 285, PC = 32

  // Triple torus rings at different heights
  ;[{r:R,t:4.0,e:1.4,y:3.5},{r:R-18,t:1.8,e:0.6,y:1.2},{r:R+18,t:1.2,e:0.4,y:1.8}].forEach(({r,t,e,y}) => {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(r,t,12,128),
      new THREE.MeshStandardMaterial({color:0x1e3a5f,emissive:0x38bdf8,emissiveIntensity:e}))
    torus.rotation.x=Math.PI/2; torus.position.y=y; scene.add(torus)
  })
  // Wide ground glow
  const glow = new THREE.Mesh(new THREE.RingGeometry(R-26,R+26,128),
    new THREE.MeshStandardMaterial({color:0x1e3a5f,emissive:0x1d4ed8,emissiveIntensity:0.4,side:THREE.DoubleSide}))
  glow.rotation.x=-Math.PI/2; glow.position.y=0.4; scene.add(glow)

  // Pylons
  for (let i=0; i<PC; i++) {
    const a = (i/PC)*Math.PI*2
    const px = Math.cos(a)*R, pz = Math.sin(a)*R
    const isMajor = i%4===0, isMid = i%2===0
    const hh = isMajor ? 32 : isMid ? 20 : 12
    const tw = isMajor ? 3.5 : isMid ? 2.2 : 1.4

    const pylMat = new THREE.MeshStandardMaterial({
      color:0x060e24, emissive:isMajor?0x38bdf8:isMid?0x1e3a5f:0x0d1f40,
      emissiveIntensity:isMajor?1.8:isMid?0.7:0.4
    })
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(tw, hh, tw), pylMat)
    pylon.position.set(px, hh/2, pz); scene.add(pylon)

    const orbMat = new THREE.MeshStandardMaterial({
      color:0xffffff, emissive:isMajor?0x38bdf8:0x1e3a5f,
      emissiveIntensity:isMajor?12:isMid?6:3
    })
    const orb = new THREE.Mesh(new THREE.SphereGeometry(isMajor?2.6:isMid?1.5:0.9,8,8), orbMat)
    orb.position.set(px, hh+2.6, pz); scene.add(orb)

    if (isMajor) {
      // Cross arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(16,0.8,0.8),
        new THREE.MeshStandardMaterial({color:0x0d1f40,emissive:0x38bdf8,emissiveIntensity:4.0}))
      arm.position.set(px, hh-8, pz); arm.rotation.y=a; scene.add(arm)
      ;[-6.5,6.5].forEach(off => {
        const eo = new THREE.Mesh(new THREE.SphereGeometry(1.0,6,6),orbMat)
        const bp = new THREE.Vector3(off,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),a)
        eo.position.set(px+bp.x, hh-8, pz+bp.z); scene.add(eo)
      })
      // Vertical glow strips
      ;[-2.5,2.5].forEach(d => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.4,hh,0.4),
          new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x38bdf8,emissiveIntensity:3.0}))
        strip.position.set(px+Math.cos(a+Math.PI/2)*d, hh/2, pz+Math.sin(a+Math.PI/2)*d); scene.add(strip)
      })
      // Cone tip
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.0,16,4),
        new THREE.MeshStandardMaterial({color:0xffd700,emissive:0xffaa00,emissiveIntensity:4}))
      tip.position.set(px, hh+6, pz); scene.add(tip)
    }
  }
}

/* ═══════════════════════════════════════════════════════
   CYBERPUNK DISTRICT BORDER
═══════════════════════════════════════════════════════ */
function addBorder(parent: THREE.Group, w: number, d: number, color: number) {
  const c = new THREE.Color(color)
  const WH=14, WT=2.4
  const wallMat  = new THREE.MeshStandardMaterial({color:0x0a1020,emissive:c,emissiveIntensity:2.2})
  const glowMat  = new THREE.MeshStandardMaterial({color,emissive:c,emissiveIntensity:6.0})
  const pilMat   = new THREE.MeshStandardMaterial({color:0x050c18,emissive:c,emissiveIntensity:3.5})
  ;[d/2,-d/2].forEach(z => {
    const w1=new THREE.Mesh(new THREE.BoxGeometry(w+WT,WH,WT),wallMat); w1.position.set(0,WH/2,z); parent.add(w1)
    const g1=new THREE.Mesh(new THREE.BoxGeometry(w+WT,0.65,WT*0.9),glowMat); g1.position.set(0,WH+0.33,z); parent.add(g1)
  })
  ;[w/2,-w/2].forEach(x => {
    const w2=new THREE.Mesh(new THREE.BoxGeometry(WT,WH,d+WT),wallMat); w2.position.set(x,WH/2,0); parent.add(w2)
    const g2=new THREE.Mesh(new THREE.BoxGeometry(WT*0.9,0.65,d+WT),glowMat); g2.position.set(x,WH+0.33,0); parent.add(g2)
  })
  ;[[w/2,d/2],[w/2,-d/2],[-w/2,d/2],[-w/2,-d/2]].forEach(([x,z]) => {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(4,WH*3.2,4),pilMat); pil.position.set(x,WH*1.6,z); parent.add(pil)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3,3,2,8),glowMat); cap.position.set(x,WH*3.2+1,z); parent.add(cap)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(2.2,10,10),new THREE.MeshStandardMaterial({color:0xffffff,emissive:c,emissiveIntensity:9}))
    orb.position.set(x,WH*3.2+3.2,z); parent.add(orb)
    ;[[-2,0],[2,0],[0,-2],[0,2]].forEach(([dx,dz]) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.35,WH*3.2,0.35),glowMat); s.position.set(x+dx,WH*1.6,z+dz); parent.add(s)
    })
  })
}

/* ═══════════════════════════════════════════════════════
   ROAD SPOKE
═══════════════════════════════════════════════════════ */
function buildRoad(scene: THREE.Scene, angle: number, len: number, color: number) {
  const rg = new THREE.Group(); rg.rotation.y=-angle; rg.userData.city=true
  const W=18, midX=30+len/2
  const pl = (w: number, d: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat); m.rotation.x=-Math.PI/2; return m
  }
  const rm  = new THREE.MeshStandardMaterial({color:0x020a18,emissive:new THREE.Color(color),emissiveIntensity:0.14})
  const em  = new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:7})
  const im  = new THREE.MeshStandardMaterial({color:0x1e3a5f,emissive:0x1e3a5f,emissiveIntensity:1.8})
  const dm  = new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:2.5})
  const road=pl(len,W,rm); road.position.set(midX,0.15,0); rg.add(road)
  ;[-(W/2-0.5),(W/2-0.5)].forEach(z=>{ const e=pl(len,1.0,em); e.position.set(midX,0.17,z); rg.add(e) })
  ;[-3,3].forEach(z=>{ const il=pl(len,0.4,im); il.position.set(midX,0.16,z); rg.add(il) })
  for (let i=0; i<14; i++) {
    const d=pl((len/14)*0.42,0.5,dm); d.position.set(30+(i+0.5)*(len/14),0.18,0); rg.add(d)
  }
  for (let i=1; i<=6; i++) {
    const lx=30+i*(len/7)
    ;[-(W/2+1),(W/2+1)].forEach(z=>{
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.28,14,8),new THREE.MeshStandardMaterial({color:0x1e293b}))
      pole.position.set(lx,7,z); rg.add(pole)
      const arm=new THREE.Mesh(new THREE.BoxGeometry(4,0.25,0.25),new THREE.MeshStandardMaterial({color:0x1e293b}))
      arm.position.set(lx+(z>0?-2:2),14,z); rg.add(arm)
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.85,8,8),new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:9}))
      bulb.position.set(lx+(z>0?-4:4),14,z); rg.add(bulb)
    })
  }
  scene.add(rg)
}

/* ═══════════════════════════════════════════════════════
   FIX #3 — INNER CROSS ROADS + CENTRAL PLAZA FOUNTAIN
═══════════════════════════════════════════════════════ */
function addInnerCross(parent: THREE.Group, platW: number, platD: number, color: number) {
  const c = new THREE.Color(color)
  const rm = new THREE.MeshStandardMaterial({color:0x020b18,emissive:c,emissiveIntensity:0.25})
  const lm = new THREE.MeshStandardMaterial({color,emissive:c,emissiveIntensity:5.5})
  // EW road
  const ew = new THREE.Mesh(new THREE.PlaneGeometry(platW, IROAD*2), rm)
  ew.rotation.x=-Math.PI/2; ew.position.y=0.17; parent.add(ew)
  // NS road
  const ns = new THREE.Mesh(new THREE.PlaneGeometry(IROAD*2, platD), rm)
  ns.rotation.x=-Math.PI/2; ns.position.y=0.17; parent.add(ns)
  // Lane lines
  ;[0.45,-0.45].forEach(off => {
    ;[true,false].forEach(isEW => {
      const lp = new THREE.Mesh(new THREE.PlaneGeometry(isEW?platW:0.45,isEW?0.45:platD), lm)
      lp.rotation.x=-Math.PI/2; lp.position.set(isEW?0:off,0.19,isEW?off:0); parent.add(lp)
    })
  })
  // Central fountain
  const fm = new THREE.MeshStandardMaterial({color:0x080e22,emissive:c,emissiveIntensity:0.8})
  ;[{r:10,h:1.6,y:0.8},{r:6.2,h:2.4,y:2.8},{r:3.2,h:3.2,y:5.6},{r:1.4,h:2.6,y:8.8}].forEach(({r,h,y}) => {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r+1, h, 8), fm)
    tier.position.y=y; parent.add(tier)
  })
  const topOrb = new THREE.Mesh(new THREE.SphereGeometry(1.8,8,8),
    new THREE.MeshStandardMaterial({color:0xffffff,emissive:c,emissiveIntensity:12}))
  topOrb.position.y=12.2; parent.add(topOrb)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5,0.6,8,40),
    new THREE.MeshStandardMaterial({color,emissive:c,emissiveIntensity:6}))
  ring.rotation.x=Math.PI/2; ring.position.y=2.6; parent.add(ring)
  ;[[platW/2-5,0],[-(platW/2-5),0],[0,platD/2-5],[0,-(platD/2-5)]].forEach(([lx,lz]) => {
    const jl=new THREE.Mesh(new THREE.SphereGeometry(0.9,6,6),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:c,emissiveIntensity:8}))
    jl.position.set(lx,3,lz); parent.add(jl)
  })
}

/* ═══════════════════════════════════════════════════════
   FIX #4 — VISIBLE QUADCOPTER DRONE MESH (DJI-inspired)
═══════════════════════════════════════════════════════ */
function buildDroneMesh(): {group:THREE.Group; rotors:THREE.Mesh[]} {
  const g = new THREE.Group()
  const rotors: THREE.Mesh[] = []

  const bodyMat  = new THREE.MeshStandardMaterial({color:0x111827,emissive:0x1e40af,emissiveIntensity:0.5,roughness:0.35,metalness:0.6})
  const armMat   = new THREE.MeshStandardMaterial({color:0x1f2937,roughness:0.55,metalness:0.5})
  const rotorMat = new THREE.MeshStandardMaterial({color:0x374151,transparent:true,opacity:0.75,roughness:0.3})
  const motorMat = new THREE.MeshStandardMaterial({color:0xb45309,emissive:0x92400e,emissiveIntensity:0.7,metalness:0.8})
  const ledBlue  = new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x38bdf8,emissiveIntensity:14})
  const ledRed   = new THREE.MeshStandardMaterial({color:0xef4444,emissive:0xef4444,emissiveIntensity:14})

  // Main aerodynamic body
  const body = new THREE.Mesh(new THREE.BoxGeometry(6.0,1.6,4.2),bodyMat); body.position.y=0; g.add(body)
  // Rounded nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.0,8,6,0,Math.PI*2,0,Math.PI/2),bodyMat)
  nose.rotation.x=Math.PI/2; nose.position.set(2.6,0,0); g.add(nose)
  // Top hump / battery cover
  const hump = new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.6,0.9,8),bodyMat); hump.position.set(0,1.1,0); g.add(hump)
  // Camera gimbal
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.8,8,6),
    new THREE.MeshStandardMaterial({color:0x000000,emissive:0x60a5fa,emissiveIntensity:6}))
  gimbal.position.set(2.8,-0.3,0); g.add(gimbal)
  // Status LED on top
  const statusLed = new THREE.Mesh(new THREE.SphereGeometry(0.38,6,6),ledBlue)
  statusLed.position.set(0,1.65,0); g.add(statusLed)

  // 4 diagonal arms
  const armAngles = [Math.PI*0.25, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75]
  armAngles.forEach((ang, i) => {
    // Folding arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5.6,0.5,1.1),armMat)
    arm.position.set(Math.cos(ang)*2.0, 0.1, Math.sin(ang)*2.0)
    arm.rotation.y = ang+Math.PI/2; g.add(arm)

    // Motor housing at tip
    const mx = Math.cos(ang)*5.4, mz = Math.sin(ang)*5.4
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.8,0.7,0.9,8),motorMat)
    motor.position.set(mx, 0.7, mz); g.add(motor)

    // Two crossed blades
    ;[0, Math.PI/2].forEach(ba => {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(5.0,0.12,0.65),rotorMat)
      blade.position.set(mx, 1.2, mz); blade.rotation.y = ba; g.add(blade); rotors.push(blade)
    })
    // Blade guard ring
    const guard = new THREE.Mesh(new THREE.TorusGeometry(2.7,0.2,6,28),
      new THREE.MeshStandardMaterial({color:0x1f2937,roughness:0.6}))
    guard.rotation.x=Math.PI/2; guard.position.set(mx, 1.2, mz); g.add(guard)
    // Position LEDs: blue front (0,1), red rear (2,3)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.38,6,6), i<2?ledBlue:ledRed)
    led.position.set(mx, 0.3, mz); g.add(led)
  })

  // Landing skids
  ;[[3,1.6],[3,-1.6],[-3,1.6],[-3,-1.6]].forEach(([lx,lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,1.6,6),armMat)
    leg.position.set(lx,-1.2,lz); g.add(leg)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.2,0.2),armMat)
    foot.position.set(lx,-2.0,lz); g.add(foot)
  })

  return {group:g, rotors}
}

/* ═══════════════════════════════════════════════════════
   DISPOSE
═══════════════════════════════════════════════════════ */
function disposeCity(scene: THREE.Scene) {
  scene.children.filter(o=>o.userData.city).forEach(obj => {
    obj.traverse(child => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh && !(child as any).isSprite) return
      const mats = Array.isArray(mesh.material)?mesh.material:[mesh.material]
      mats.forEach(m => {
        if (!m) return
        ;['map','emissiveMap','normalMap','roughnessMap','alphaMap'].forEach(k=>{
          const t=(m as any)[k]; if (t instanceof THREE.Texture) t.dispose()
        })
        m.dispose()
      })
      if (mesh.geometry) mesh.geometry.dispose()
    })
    scene.remove(obj)
  })
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function CricCity() {
  const mountRef      = useRef<HTMLDivElement>(null)
  const sceneRef      = useRef<THREE.Scene|null>(null)
  const rendererRef   = useRef<THREE.WebGLRenderer|null>(null)
  const cameraRef     = useRef<THREE.PerspectiveCamera|null>(null)
  const diamondRef    = useRef<THREE.Mesh|null>(null)
  const hqHitRef      = useRef<THREE.Mesh|null>(null)
  const indicatorRef  = useRef<THREE.Mesh|null>(null)
  const hitMap        = useRef<Map<THREE.Object3D,{player:any;team:string}>>(new Map())
  const droneGroupRef = useRef<THREE.Group|null>(null)
  const droneRotors   = useRef<THREE.Mesh[]>([])
  const distRef       = useRef(185)
  const tDistRef      = useRef(185)
  const droneModeRef  = useRef(false)
  const droneYawRef   = useRef(Math.PI)
  const keysRef       = useRef<Set<string>>(new Set())
  const btnsRef       = useRef({fwd:false,back:false,left:false,right:false,up:false,down:false})

  const [fmt,       setFmt      ] = useState<'TEST'|'ODI'|'T20'>('TEST')
  const [loading,   setLoading  ] = useState(false)
  const [selected,  setSelected ] = useState<any>(null)
  const [hqOpen,    setHqOpen   ] = useState(false)
  const [counts,    setCounts   ] = useState<Record<string,number>>({})
  const [droneMode, setDroneMode] = useState(false)
  const [allMx,     setAllMx    ] = useState<AllMax|null>(null)

  /* ── SCENE INIT ──────────────────────────────────── */
  useEffect(() => {
    if (!mountRef.current) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000810)
    scene.fog = new THREE.FogExp2(0x00060e, 0.00068)
    sceneRef.current = scene
    const camera = new THREE.PerspectiveCamera(55,window.innerWidth/window.innerHeight,0.1,14000)
    cameraRef.current = camera
    const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    renderer.setSize(window.innerWidth,window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    rendererRef.current = renderer
    mountRef.current.appendChild(renderer.domElement)

    let theta=0.85, phi=0.34, drag=false, lx=0, ly=0
    const camUpdate = () => {
      if (droneModeRef.current) return
      const d = distRef.current
      camera.position.set(d*Math.sin(theta)*Math.cos(phi), d*Math.sin(phi), d*Math.cos(theta)*Math.cos(phi))
      camera.lookAt(0,0,0)
    }
    camUpdate()

    const onDown  = (e: PointerEvent) => { if (droneModeRef.current) return; drag=true; lx=e.clientX; ly=e.clientY }
    const onMove  = (e: PointerEvent) => {
      if (!drag||droneModeRef.current) return
      theta -= (e.clientX-lx)*0.004; phi = Math.max(0.05,Math.min(1.48,phi-(e.clientY-ly)*0.004))
      lx=e.clientX; ly=e.clientY
    }
    const onUp    = () => { drag=false }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (droneModeRef.current) {
        if (droneGroupRef.current) droneGroupRef.current.position.y = Math.max(3, Math.min(280, droneGroupRef.current.position.y+e.deltaY*0.04))
      } else {
        tDistRef.current = Math.max(15, Math.min(2000, tDistRef.current*Math.exp(e.deltaY*0.001)))
      }
    }
    const onKD = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase())
    const onKU = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())

    window.addEventListener('pointerdown',onDown); window.addEventListener('pointermove',onMove)
    window.addEventListener('pointerup',onUp); window.addEventListener('keydown',onKD); window.addEventListener('keyup',onKU)
    renderer.domElement.addEventListener('wheel',onWheel,{passive:false})

    // Lights
    scene.add(new THREE.AmbientLight(0x0d1f40,2.8))
    const dir=new THREE.DirectionalLight(0x3366ff,1.8); dir.position.set(100,300,100); scene.add(dir)
    const warmLight=new THREE.PointLight(0xff4400,0.35,1600); warmLight.position.set(0,-10,0); scene.add(warmLight)
    const centerLight=new THREE.PointLight(0x38bdf8,1.6,1000); centerLight.position.set(0,60,0); scene.add(centerLight)

    // Ground + grid
    const gnd=new THREE.Mesh(new THREE.PlaneGeometry(16000,16000),new THREE.MeshStandardMaterial({color:0x010810}))
    gnd.rotation.x=-Math.PI/2; scene.add(gnd)
    const grid=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000,110,110),new THREE.MeshBasicMaterial({color:0x091830,wireframe:true}))
    grid.rotation.x=-Math.PI/2; grid.position.y=0.07; scene.add(grid)

    // Outer ring (not city-tagged so survives format changes)
    buildOuterRing(scene)

    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)

      if (droneModeRef.current && droneGroupRef.current) {
        const drone=droneGroupRef.current, keys=keysRef.current, btns=btnsRef.current
        const SPEED=0.95, YAW=0.016   // FIX #4: slow & smooth
        const yaw=droneYawRef.current
        if (keys.has('a')||keys.has('arrowleft') ||btns.left)  droneYawRef.current-=YAW
        if (keys.has('d')||keys.has('arrowright')||btns.right) droneYawRef.current+=YAW
        const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw))
        if (keys.has('w')||keys.has('arrowup')  ||btns.fwd)  drone.position.addScaledVector(fwd,SPEED)
        if (keys.has('s')||keys.has('arrowdown')||btns.back) drone.position.addScaledVector(fwd,-SPEED*0.6)
        if (keys.has('q')||btns.up)   drone.position.y=Math.min(280,drone.position.y+SPEED*0.6)
        if (keys.has('e')||btns.down) drone.position.y=Math.max(3, drone.position.y-SPEED*0.6)
        drone.position.x=THREE.MathUtils.clamp(drone.position.x,-680,680)
        drone.position.z=THREE.MathUtils.clamp(drone.position.z,-680,680)
        drone.rotation.y=yaw
        drone.rotation.x=(keys.has('w')||keys.has('arrowup')||btns.fwd)?-0.10:0
        // Spin rotors
        droneRotors.current.forEach(r=>{r.rotation.y+=0.42})
        // 3rd-person cam: 30 units back so drone is fully visible in frame
        const behind=new THREE.Vector3(Math.sin(yaw)*30, 10, Math.cos(yaw)*30)
        camera.position.lerp(drone.position.clone().add(behind), 0.12)
        camera.lookAt(drone.position.clone().add(new THREE.Vector3(0, 1, 0)))
      } else {
        distRef.current+=(tDistRef.current-distRef.current)*0.12; camUpdate()
      }

      if (diamondRef.current)   diamondRef.current.rotation.y+=0.012
      if (indicatorRef.current) indicatorRef.current.rotation.y+=0.026
      renderer.render(scene,camera)
    }
    animate()

    const onResize=()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)}
    window.addEventListener('resize',onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('pointerdown',onDown); window.removeEventListener('pointermove',onMove)
      window.removeEventListener('pointerup',onUp); window.removeEventListener('keydown',onKD)
      window.removeEventListener('keyup',onKU); window.removeEventListener('resize',onResize)
      renderer.domElement.removeEventListener('wheel',onWheel)
      disposeCity(scene); renderer.dispose()
      mountRef.current?.removeChild(renderer.domElement)
    }
  },[])

  /* ── CLICK ───────────────────────────────────────── */
  useEffect(() => {
    const renderer=rendererRef.current, camera=cameraRef.current, scene=sceneRef.current
    if (!renderer||!camera||!scene) return
    const rc=new THREE.Raycaster(), mo=new THREE.Vector2()
    const onClick = (e: MouseEvent) => {
      if (droneModeRef.current) return
      mo.x=(e.clientX/window.innerWidth)*2-1; mo.y=-(e.clientY/window.innerHeight)*2+1
      rc.setFromCamera(mo,camera)
      if (hqHitRef.current) {
        const h=rc.intersectObject(hqHitRef.current,false)
        if (h.length>0){setHqOpen(true);setSelected(null);return}
      }
      const hits=rc.intersectObjects(Array.from(hitMap.current.keys()),false)
      if (hits.length>0) {
        const obj=hits[0].object, data=hitMap.current.get(obj); if (!data) return
        setSelected({...data.player,_team:data.team}); setHqOpen(false)
        if (indicatorRef.current) scene.remove(indicatorRef.current)
        const ind=new THREE.Mesh(new THREE.OctahedronGeometry(3.5,0),
          new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x7dd3fc,emissiveIntensity:9}))
        const wp=new THREE.Vector3(); obj.getWorldPosition(wp)
        ind.position.set(wp.x,wp.y+(obj.userData.halfH??5)+8,wp.z)
        ind.userData.city=true; indicatorRef.current=ind; scene.add(ind)
      } else {
        setSelected(null); setHqOpen(false)
        if (indicatorRef.current){scene.remove(indicatorRef.current);indicatorRef.current=null}
      }
    }
    renderer.domElement.addEventListener('click',onClick)
    return ()=>renderer.domElement.removeEventListener('click',onClick)
  },[])

  /* ── BUILD CITY ──────────────────────────────────── */
  useEffect(()=>{
    async function build() {
      const scene=sceneRef.current; if (!scene) return
      setLoading(true); setSelected(null); setHqOpen(false)
      hitMap.current.clear()
      if (indicatorRef.current){scene.remove(indicatorRef.current);indicatorRef.current=null}
      disposeCity(scene)

      const players: any[] = await fetchPlayers(fmt)
      const mx = computeAllMax(players)
      setAllMx(mx)

      const grouped: Record<string,any[]>={}
      players.forEach(p=>{const k=normalizeCountry(p);if(!grouped[k])grouped[k]=[];grouped[k].push(p)})
      const snap: Record<string,number>={}
      Object.entries(grouped).forEach(([k,v])=>{snap[k]=v.length}); setCounts(snap)

      // HQ + hub
      const hq=buildHQ(diamondRef,hqHitRef); hq.userData.city=true; scene.add(hq)
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(40,40,1.6,8),
        new THREE.MeshStandardMaterial({color:0x0a1628,emissive:0x1d4ed8,emissiveIntensity:0.6}))
      hub.position.y=0.8; hub.userData.city=true; scene.add(hub)

      const goldTex = mkGoldTex()
      const fmtLower = fmt.toLowerCase() as Format

      TEAM_LAYOUT.forEach(({key,angle,label})=>{
        const p = getPal(key)
        buildRoad(scene,angle,RLEN,p.border)

        const raw = grouped[key]||[]
        // FIX #5: sort by ACTIVE FORMAT score → Sachin leads in TEST, Virat in T20
        const sorted=[...raw].sort((a,b)=>fmtScore(b,fmtLower,mx)-fmtScore(a,fmtLower,mx))
        const n=sorted.length

        // Career scores for building height (so Sachin's building is still tall in T20 view)
        const cScores=sorted.map(pl=>careerScore(pl,mx))
        const sMax=cScores.length>0?Math.max(...cScores):1
        const sMin=cScores.length>0?Math.min(...cScores):0
        const sRange=Math.max(sMax-sMin,0.001)

        const cx=Math.cos(angle)*DDIST, cz=Math.sin(angle)*DDIST
        const dg=new THREE.Group(); dg.position.set(cx,0,cz); dg.rotation.y=-angle; dg.userData.city=true; scene.add(dg)

        // Quadrant layout: split n players into 4 quadrants around central fountain
        const perQ  = Math.max(1, Math.ceil(n/4))
        const qC    = Math.max(2, Math.ceil(Math.sqrt(perQ)))
        const qR    = Math.max(2, Math.ceil(perQ/qC))
        const startOff = IROAD + 4  // distance from centre to first building
        const qSpanX = axisSpan(qC)+BSLOT
        const qSpanZ = axisSpan(qR)+BSLOT
        const platHW = startOff + qSpanX + DPAD/2
        const platHD = startOff + qSpanZ + DPAD/2
        const platW2=platHW*2, platD2=platHD*2

        // Ground plate
        const plate=new THREE.Mesh(new THREE.PlaneGeometry(platW2,platD2),
          new THREE.MeshStandardMaterial({color:new THREE.Color(p.ground),emissive:new THREE.Color(p.border),emissiveIntensity:n>0?0.10:0.02}))
        plate.rotation.x=-Math.PI/2; plate.position.y=0.1; dg.add(plate)

        addBorder(dg,platW2,platD2,p.border)
        addInnerCross(dg,platW2,platD2,p.border)

        const lbl=mkLabel(`${label}  (${n})`,p.border)
        lbl.position.set(0,55,-(platD2/2+20)); dg.add(lbl)

        if (n===0) return

        const texBat=mkWinTex(p.batsman), texBow=mkWinTex(p.bowler), texAll=mkWinTex(p.allrounder)

        // Distribute players into 4 quadrants round-robin (best → Q0)
        const quads: Array<{pl:any;origIdx:number}[]>=[[],[],[],[]]
        sorted.forEach((pl,i)=>quads[i%4].push({pl,origIdx:i}))
        // Q signs: [+x+z, -x+z, -x-z, +x-z]
        const qSigns=[[1,1],[-1,1],[-1,-1],[1,-1]]

        quads.forEach((qArr,qi)=>{
          const [sx,sz]=qSigns[qi]
          qArr.forEach(({pl,origIdx},ii)=>{
            const col=ii%qC, row=Math.floor(ii/qC)
            const {x:gx,z:gz}=slotPos(col,row)
            const px=sx*(startOff+gx+BSLOT*0.5)
            const pz=sz*(startOff+gz+BSLOT*0.5)

            const cs=cScores[origIdx]??0
            const ns=isNaN(cs)?0:sRange>0?(cs-sMin)/sRange:0
            const isLeg=(origIdx===0)  // #1 in CURRENT FORMAT = gold legend
            const role=(pl.personal_info?.role||pl.role||'').toLowerCase()
            const shape=pickShape(role,origIdx,ns)

            // ══ BUILDING HEIGHT — edit numbers below to tune city scale ══
            // ns = 0.0 (worst player in team) → 1.0 (best player in team)
            let h = 12
            if (isLeg) {
              h = 420 + ns*120         // LEGEND height → 420 to 540  (LINE ~893)
            } else if (role.includes('bowl')) {
              h = 40 + Math.pow(ns,1.4)*200   // BOWLER height → 40 to 240  (LINE ~895)
            } else if (role.includes('all')) {
              h = 55 + Math.pow(ns,1.1)*250   // ALL-ROUNDER height → 55 to 305  (LINE ~897)
            } else {
              if (ns>0.85)     h=300+ns*120   // TOP batsmen   → 300-420  (LINE ~899)
              else if(ns>0.65) h=190+ns*105   // GOOD batsmen  → 190-295  (LINE ~900)
              else if(ns>0.40) h=100+ns*90    // MID batsmen   → 100-190  (LINE ~901)
              else if(ns>0.20) h=45 +ns*55    // LOW batsmen   → 45-100   (LINE ~902)
              else             h=14 +ns*35    // WEAK batsmen  → 14-45    (LINE ~903)
            }
            h=(!isFinite(h)||h<=0)?14:h

            // Width — max 6.4 in a 7.0-unit slot (0.6 gap = no overlap)
            const wBase=isLeg?6.0:role.includes('bowl')?5.0+ns*0.8:role.includes('all')?4.8+ns*1.0:3.5+ns*2.2
            const w=Math.min(wBase,6.4)

            if (isLeg) {
              const gMat=new THREE.MeshStandardMaterial({map:goldTex,emissiveMap:goldTex,emissive:new THREE.Color(0xffaa00),emissiveIntensity:2.8})
              const bldg=buildingGroup('tower',w,h,gMat); bldg.position.set(px,0,pz); dg.add(bldg)
              const rMat=new THREE.MeshStandardMaterial({color:0xffaa00,emissive:0xffaa00,emissiveIntensity:5.0,side:THREE.DoubleSide})
              const ring=new THREE.Mesh(new THREE.RingGeometry(w*0.9,w*1.35,36),rMat)
              ring.rotation.x=-Math.PI/2; ring.position.set(px,h*0.46,pz); dg.add(ring)
              const nm=(pl.name||pl.full_name||'').toUpperCase()||'LEGEND'
              const ll=mkLabel(`★ ${nm}`,0xffd700,0.74); ll.position.set(px,h+42,pz); dg.add(ll)
              const hb=new THREE.Mesh(new THREE.BoxGeometry(w*1.5,h,w*1.5),new THREE.MeshBasicMaterial({visible:false}))
              hb.position.set(px,h/2,pz); hb.userData.halfH=h/2; dg.add(hb)
              hitMap.current.set(hb,{player:pl,team:key})
            } else {
              let tex: THREE.CanvasTexture, emCol: number, emInt: number
              if (role.includes('bowl'))     {tex=texBow;emCol=p.bowler;    emInt=0.36+ns*1.1}
              else if(role.includes('all'))  {tex=texAll;emCol=p.allrounder;emInt=0.34+ns*1.0}
              else                           {tex=texBat;emCol=p.batsman;   emInt=0.34+ns*1.2}
              const mat=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:new THREE.Color(emCol),emissiveIntensity:emInt})
              const bldg=buildingGroup(shape,w,h,mat); bldg.position.set(px,0,pz); dg.add(bldg)
              const hb=new THREE.Mesh(new THREE.BoxGeometry(w*1.3,h,w*1.3),new THREE.MeshBasicMaterial({visible:false}))
              hb.position.set(px,h/2,pz); hb.userData.halfH=h/2; dg.add(hb)
              hitMap.current.set(hb,{player:pl,team:key})
            }
          })
        })
      })
      setLoading(false)
    }
    build()
  },[fmt])

  /* ── DRONE TOGGLE ────────────────────────────────── */
  const toggleDrone = () => {
    const next=!droneMode
    droneModeRef.current=next
    setDroneMode(next); setSelected(null); setHqOpen(false)
    const scene=sceneRef.current, camera=cameraRef.current
    if (!scene||!camera) return
    if (next) {
      const {group,rotors}=buildDroneMesh()
      group.position.copy(camera.position)
      group.position.y=Math.max(14,camera.position.y)
      group.scale.setScalar(0.4)  // small proportional drone
      droneYawRef.current=Math.PI
      group.userData.city=true
      droneGroupRef.current=group; droneRotors.current=rotors; scene.add(group)
    } else {
      if (droneGroupRef.current) {
        scene.remove(droneGroupRef.current)
        droneGroupRef.current.traverse(c=>{if((c as THREE.Mesh).isMesh)(c as THREE.Mesh).geometry.dispose()})
        droneGroupRef.current=null; droneRotors.current=[]
      }
      distRef.current=185; tDistRef.current=185
    }
  }

  const FMTS = ['TEST','ODI','T20'] as const
  const S    = (x: any, fb: any='—') => x!=null?String(x):fb

  /* ── JSX ─────────────────────────────────────────── */
  return (
    <div style={{width:'100vw',height:'100vh',background:'#000',position:'relative',overflow:'hidden',userSelect:'none'}}>
      <div ref={mountRef} style={{width:'100%',height:'100%'}}/>

      {/* FIX #6: CricCity branding */}
      <div style={{position:'absolute',top:20,left:24,zIndex:10,pointerEvents:'none'}}>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.65rem',fontWeight:700,letterSpacing:'0.18em',color:'#38bdf8',textShadow:'0 0 32px rgba(56,189,248,0.96)'}}>CricCity</div>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.57rem',letterSpacing:'0.30em',color:'#1d4ed8',marginTop:4,textTransform:'uppercase'}}>Cricket City · 3D Visualization</div>
      </div>

      {/* Format tabs */}
      <div style={{position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',gap:8}}>
        {FMTS.map(f=>(
          <button key={f} onClick={()=>setFmt(f)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.2em',padding:'8px 22px',borderRadius:5,cursor:'pointer',transition:'all .2s',background:fmt===f?'rgba(56,189,248,0.14)':'rgba(0,6,22,0.72)',border:`1px solid ${fmt===f?'#38bdf8':'#1e3a5f'}`,color:fmt===f?'#7dd3fc':'#1e4d8c',boxShadow:fmt===f?'0 0 20px rgba(56,189,248,0.32)':'none'}}>
            {f}
          </button>
        ))}
      </div>

      {/* Team count pills */}
      {Object.keys(counts).length>0&&(
        <div style={{position:'absolute',top:70,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',maxWidth:660,pointerEvents:'none'}}>
          {TEAM_LAYOUT.map(({key,label})=>{
            const cnt=counts[key]??0
            const hex='#'+new THREE.Color(getPal(key).border).getHexString()
            return <span key={key} style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.12em',padding:'2px 9px',borderRadius:3,border:`1px solid ${hex}`,color:hex,background:'rgba(0,4,18,0.75)',opacity:cnt>0?1:0.22}}>{label.slice(0,3)}&nbsp;{cnt}</span>
          })}
        </div>
      )}

      {/* Drone toggle */}
      <button onClick={toggleDrone} style={{position:'absolute',top:20,right:20,zIndex:15,fontFamily:'"Courier New",monospace',fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.15em',padding:'9px 18px',borderRadius:6,cursor:'pointer',background:droneMode?'rgba(251,191,36,0.2)':'rgba(56,189,248,0.12)',border:`1px solid ${droneMode?'#fbbf24':'#38bdf8'}`,color:droneMode?'#fbbf24':'#7dd3fc',boxShadow:droneMode?'0 0 22px rgba(251,191,36,0.45)':'none'}}>
        {droneMode?'✕ EXIT DRONE':'🚁 DRONE MODE'}
      </button>

      {/* Drone controls */}
      {droneMode&&(
        <div style={{position:'absolute',bottom:28,right:24,zIndex:15,display:'flex',flexDirection:'column',alignItems:'center',gap:6,background:'rgba(0,6,22,0.92)',border:'1px solid rgba(251,191,36,0.45)',borderRadius:12,padding:'14px 18px'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',color:'#fbbf24',letterSpacing:'0.15em',marginBottom:4}}>DRONE CONTROLS</div>
          <div style={{display:'grid',gridTemplateColumns:'48px 48px 48px',gridTemplateRows:'48px 48px',gap:5}}>
            <div/><DroneBtn onPress={v=>btnsRef.current.fwd=v} label="▲" title="Forward"/><div/>
            <DroneBtn onPress={v=>btnsRef.current.left=v} label="◀" title="Turn Left"/>
            <DroneBtn onPress={v=>btnsRef.current.back=v} label="▼" title="Backward"/>
            <DroneBtn onPress={v=>btnsRef.current.right=v} label="▶" title="Turn Right"/>
          </div>
          <div style={{display:'flex',gap:6,marginTop:2}}>
            <DroneBtn onPress={v=>btnsRef.current.up=v} label="↑ UP" wide/>
            <DroneBtn onPress={v=>btnsRef.current.down=v} label="↓ DN" wide/>
          </div>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.44rem',color:'rgba(251,191,36,0.5)',marginTop:2,letterSpacing:'0.1em',textAlign:'center'}}>WASD / ARROWS · Q↑ E↓</div>
        </div>
      )}

      {/* Legend key */}
      <div style={{position:'absolute',bottom:52,left:24,zIndex:10,pointerEvents:'none',background:'rgba(0,4,18,0.87)',border:'1px solid #1e3a5f',borderRadius:8,padding:'10px 14px'}}>
        {[{c:'#60a5fa',t:'BATSMAN   · Tower / Stepped'},{c:'#f87171',t:'BOWLER    · Slab / Cylinder'},{c:'#4ade80',t:'ALL-ROUND · Cruciform'},{c:'#ffd700',t:'★ LEGEND  · Format Leader'}].map(({c,t})=>(
          <div key={t} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4,fontFamily:'"Courier New",monospace',fontSize:'0.5rem',letterSpacing:'0.08em',color:c}}>
            <span style={{width:8,height:8,background:c,borderRadius:1,flexShrink:0}}/>{t}
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div style={{position:'absolute',bottom:20,left:24,zIndex:10,pointerEvents:'none'}}>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.18em',color:'#1e3a5f'}}>
          {droneMode?'WASD/ARROWS · MOVE · Q↑ E↓ · SCROLL HEIGHT':'DRAG · ROTATE  |  SCROLL · ZOOM  |  CLICK · STATS  |  CLICK HQ · INFO'}
        </div>
      </div>

      {/* Loading */}
      {loading&&(
        <div style={{position:'absolute',inset:0,zIndex:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,4,16,0.82)',backdropFilter:'blur(6px)'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'1rem',letterSpacing:'0.32em',color:'#38bdf8',animation:'cwP 1.2s infinite'}}>BUILDING CITY...</div>
          <div style={{display:'flex',gap:6,marginTop:18}}>
            {[0,1,2,3,4].map(i=><div key={i} style={{width:6,height:6,background:'#38bdf8',borderRadius:'50%',animation:`cwB 0.8s ${i*0.12}s infinite`}}/>)}
          </div>
        </div>
      )}

      {/* HQ Info card */}
      {hqOpen&&(
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:15,width:440,borderRadius:14,overflow:'hidden',background:'linear-gradient(135deg,rgba(0,8,32,0.97),rgba(0,20,60,0.97))',border:'1px solid #38bdf8',boxShadow:'0 0 70px rgba(56,189,248,0.45)',backdropFilter:'blur(18px)'}}>
          <div style={{background:'linear-gradient(90deg,rgba(56,189,248,0.15),rgba(29,78,216,0.30))',padding:'18px 22px',borderBottom:'1px solid rgba(56,189,248,0.2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.2rem',fontWeight:700,color:'#e0f2fe',letterSpacing:'0.15em'}}>⬡ HEADQUARTER</div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.6rem',color:'#60a5fa',letterSpacing:'0.2em',marginTop:3}}>ICC · INTERNATIONAL CRICKET COUNCIL</div>
            </div>
            <button onClick={()=>setHqOpen(false)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.7rem',color:'#60a5fa',background:'none',border:'1px solid #1e3a5f',borderRadius:4,padding:'4px 12px',cursor:'pointer'}}>ESC</button>
          </div>
          <div style={{padding:'16px 22px',borderBottom:'1px solid rgba(56,189,248,0.1)',display:'flex',gap:22,alignItems:'center'}}>
            {[{v:Object.values(counts).reduce((a,b)=>a+b,0),l:'TOTAL PLAYERS',c:'#38bdf8'},{v:8,l:'NATIONS',c:'#60a5fa'},{v:'TEST·ODI·T20',l:'FORMATS',c:'#7dd3fc'}].map(({v,l,c})=>(
              <div key={l} style={{textAlign:'center',flex:1}}>
                <div style={{fontFamily:'"Courier New",monospace',fontSize:typeof v==='number'?'2.0rem':'0.9rem',fontWeight:700,color:c}}>{v}</div>
                <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',color:'#1e4d8c',letterSpacing:'0.15em',marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'14px 22px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {TEAM_LAYOUT.map(({key,label})=>{
              const cnt=counts[key]??0, hex='#'+new THREE.Color(getPal(key).border).getHexString()
              const total=Object.values(counts).reduce((a,b)=>a+b,0)
              const pct=cnt>0?Math.round((cnt/Math.max(1,total))*100):0
              return(
                <div key={key} style={{background:`${hex}18`,border:`1px solid ${hex}44`,borderRadius:7,padding:'9px 11px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',color:hex,fontWeight:700}}>{FLAG[key]||'🏏'} {label}</span>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.82rem',color:'#fff',fontWeight:700}}>{cnt}</span>
                  </div>
                  <div style={{marginTop:6,height:3,background:'rgba(255,255,255,0.1)',borderRadius:2}}>
                    <div style={{height:'100%',width:`${pct}%`,background:hex,borderRadius:2,boxShadow:`0 0 6px ${hex}`}}/>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{padding:'10px 22px 16px',fontFamily:'"Courier New",monospace',fontSize:'0.5rem',color:'#1e4d8c',textAlign:'center',letterSpacing:'0.15em'}}>
            SWITCH FORMAT TABS TO SEE FORMAT LEADERS · ★ GOLD = CURRENT FORMAT CHAMPION
          </div>
        </div>
      )}

      {/* Player card */}
      {selected&&(()=>{
        const p=getPal(selected._team)
        const thx='#'+new THREE.Color(p.border).getHexString()
        const role=(selected.personal_info?.role||selected.role||'batsman').toLowerCase()
        const roleLabel=role.includes('bowl')?'BOWLER':role.includes('all')?'ALL-ROUNDER':'BATSMAN'
        const roleColor=role.includes('bowl')?'#f87171':role.includes('all')?'#4ade80':'#60a5fa'
        const initials=(selected.name||selected.full_name||'?').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()
        const mxForCard=allMx??computeAllMax([selected])
        const pct=Math.min(99,Math.round((careerScore(selected,mxForCard)||0)*100))
        return(
          <div style={{position:'absolute',top:20,right:droneMode?'unset':20,left:droneMode?20:undefined,zIndex:15,width:322,borderRadius:14,overflow:'hidden',background:'linear-gradient(160deg,rgba(0,6,22,0.97),rgba(0,12,35,0.97))',border:`1px solid ${thx}`,boxShadow:`0 0 42px ${thx}55,0 0 84px ${thx}18`,backdropFilter:'blur(14px)'}}>
            <div style={{height:4,background:`linear-gradient(90deg,transparent,${thx},transparent)`}}/>
            <div style={{padding:'16px 18px',background:`linear-gradient(135deg,${thx}22,transparent)`}}>
              <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:`linear-gradient(135deg,${thx}44,${thx}22)`,border:`2px solid ${thx}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 0 18px ${thx}66`}}>
                  <span style={{fontFamily:'"Courier New",monospace',fontSize:'1.2rem',fontWeight:700,color:thx}}>{initials}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.9rem',fontWeight:700,color:'#fff',letterSpacing:'0.04em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{selected.name||selected.full_name||'UNKNOWN'}</div>
                  <div style={{display:'flex',gap:6,marginTop:5,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.56rem',letterSpacing:'0.16em',color:thx,textTransform:'uppercase'}}>{FLAG[selected._team]||'🏏'} {selected._team?.toUpperCase()}</span>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.56rem',color:roleColor,background:`${roleColor}22`,padding:'1px 6px',borderRadius:3,border:`1px solid ${roleColor}55`}}>{roleLabel}</span>
                  </div>
                  <div style={{marginTop:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.44rem',color:'#475569',letterSpacing:'0.1em'}}>CAREER SCORE</span>
                      <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.5rem',color:thx,fontWeight:700}}>{pct}%</span>
                    </div>
                    <div style={{height:4,background:'rgba(255,255,255,0.08)',borderRadius:2}}>
                      <div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg,${thx}99,${thx})`,borderRadius:2,boxShadow:`0 0 8px ${thx}`}}/>
                    </div>
                  </div>
                </div>
                <button onClick={()=>setSelected(null)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.6rem',color:'#475569',background:'none',border:'1px solid #1e3a5f',borderRadius:4,padding:'3px 8px',cursor:'pointer',flexShrink:0,marginTop:2}}>ESC</button>
              </div>
            </div>
            <div style={{padding:'0 14px 14px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                {(['test','odi','t20'] as const).map(f=>{
                  const isActive=f===fmt.toLowerCase()
                  const bat=selected.stats?.batting?.[f]??{}, bowl=selected.stats?.bowling?.[f]??{}
                  return(
                    <div key={f} style={{borderRadius:8,padding:'10px 6px',textAlign:'center',background:isActive?`${thx}1a`:'rgba(255,255,255,0.03)',border:`1px solid ${isActive?thx:'#0a1830'}`,transition:'all .2s'}}>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.5rem',letterSpacing:'0.2em',fontWeight:700,color:isActive?thx:'#1e4d8c',marginBottom:7}}>{f.toUpperCase()}</div>
                      <div style={{fontSize:'1.05rem',fontWeight:700,color:'#e2e8f0'}}>{S(bat.runs,0)}</div>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155',marginBottom:3}}>RUNS</div>
                      <div style={{display:'flex',justifyContent:'space-around',marginBottom:5}}>
                        <div><div style={{fontSize:'0.72rem',color:'#94a3b8'}}>{S(bat.average)}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.36rem',color:'#334155'}}>AVG</div></div>
                        <div><div style={{fontSize:'0.72rem',color:'#64748b'}}>{S(bat.strike_rate)}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.36rem',color:'#334155'}}>SR</div></div>
                      </div>
                      <div style={{height:1,background:`${isActive?thx:'#0a1830'}66`,margin:'3px 0'}}/>
                      <div style={{fontSize:'1.05rem',fontWeight:700,color:'#e2e8f0',marginTop:5}}>{S(bowl.wickets,0)}</div>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155',marginBottom:3}}>WKTS</div>
                      <div style={{display:'flex',justifyContent:'space-around'}}>
                        <div><div style={{fontSize:'0.68rem',color:'#94a3b8'}}>{S(bowl.economy)}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.36rem',color:'#334155'}}>ECO</div></div>
                        <div><div style={{fontSize:'0.68rem',color:'#64748b'}}>{S(bowl.average)}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.36rem',color:'#334155'}}>AVG</div></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{height:3,background:`linear-gradient(90deg,transparent,${thx},transparent)`}}/>
          </div>
        )
      })()}

      <style>{`
        @keyframes cwB{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes cwP{0%,100%{opacity:1}50%{opacity:0.35}}
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   DRONE BUTTON
═══════════════════════════════════════════════════════ */
function DroneBtn({onPress,label,wide=false,title}:{onPress:(v:boolean)=>void;label:string;wide?:boolean;title?:string}) {
  return (
    <button
      title={title}
      onPointerDown={()=>onPress(true)} onPointerUp={()=>onPress(false)} onPointerLeave={()=>onPress(false)}
      style={{width:wide?88:48,height:48,background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.45)',borderRadius:7,color:'#fbbf24',fontSize:wide?'0.62rem':'1.05rem',fontFamily:'"Courier New",monospace',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',userSelect:'none',touchAction:'none',letterSpacing:wide?'0.1em':'0',transition:'background .1s'}}
    >{label}</button>
  )
}

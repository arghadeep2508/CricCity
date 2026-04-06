'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { fetchPlayers } from '@/lib/api'

/* ═══════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════ */
type Format = 'test' | 'odi' | 't20'
type Pal    = { border: number; emissive: number; ground: number; batsman: number; bowler: number; allrounder: number }
type AllMax = { runs: Record<Format,number>; wkts: Record<Format,number>; avg: Record<Format,number>; sr: Record<Format,number>; eco: Record<Format,number> }
type BldShape = 'skyscraper' | 'stepped' | 'cylinder' | 'blocky' | 'cruciform' | 'wedge'

/* ═══════════════════════════════════════════════════════
   TEAM CONFIG
═══════════════════════════════════════════════════════ */
const TEAM_LAYOUT = [
  { key: 'sri lanka',    angle:  Math.PI / 2,      label: 'SRI LANKA'    },
  { key: 'afghanistan', angle:  Math.PI / 4,       label: 'AFGHANISTAN'  },
  { key: 'england',     angle:  0,                 label: 'ENGLAND'      },
  { key: 'australia',   angle: -Math.PI / 4,       label: 'AUSTRALIA'    },
  { key: 'india',       angle: -Math.PI / 2,       label: 'INDIA'        },
  { key: 'south africa',angle: -(3*Math.PI)/4,     label: 'SOUTH AFRICA' },
  { key: 'west indies', angle:  Math.PI,           label: 'WEST INDIES'  },
  { key: 'new zealand', angle:  (3*Math.PI)/4,     label: 'NEW ZEALAND'  },
] as const

const PALETTE: Record<string,Pal> = {
  india:          { border:0x38bdf8, emissive:0x0369a1, ground:0x020c1a, batsman:0x38bdf8, bowler:0xf97316, allrounder:0x34d399 },
  australia:      { border:0xfbbf24, emissive:0xb45309, ground:0x130b00, batsman:0xfbbf24, bowler:0xef4444, allrounder:0xa3e635 },
  england:        { border:0xf87171, emissive:0x991b1b, ground:0x150000, batsman:0xf87171, bowler:0xc026d3, allrounder:0xfbbf24 },
  'south africa': { border:0x4ade80, emissive:0x166534, ground:0x001409, batsman:0x4ade80, bowler:0xfbbf24, allrounder:0x22d3ee },
  'new zealand':  { border:0xb0c4de, emissive:0x334155, ground:0x080d11, batsman:0xb0c4de, bowler:0x818cf8, allrounder:0x86efac },
  afghanistan:    { border:0xfb923c, emissive:0x9a3412, ground:0x130700, batsman:0xfb923c, bowler:0xa78bfa, allrounder:0x34d399 },
  'sri lanka':    { border:0xfde047, emissive:0x854d0e, ground:0x110e00, batsman:0xfde047, bowler:0xf472b6, allrounder:0x67e8f9 },
  'west indies':  { border:0xf472b6, emissive:0x9d174d, ground:0x130010, batsman:0xf472b6, bowler:0xfb923c, allrounder:0xa78bfa },
}
const FALLBACK: Pal = { border:0x60a5fa, emissive:0x1e40af, ground:0x050d1a, batsman:0x60a5fa, bowler:0xf97316, allrounder:0x34d399 }
const getPal = (t: string): Pal => PALETTE[t] ?? FALLBACK

const FLAG: Record<string,string> = {
  india:'🇮🇳', australia:'🇦🇺', england:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'south africa':'🇿🇦',
  'new zealand':'🇳🇿', afghanistan:'🇦🇫', 'sri lanka':'🇱🇰', 'west indies':'🏝️',
}

/* ═══════════════════════════════════════════════════════
   LAYOUT CONSTANTS
═══════════════════════════════════════════════════════ */
const DDIST    = 218   // hub → district centre
const RLEN     = 175   // road spoke length
const QSLOT    = 5.0   // slot per building in quadrant
const QBLK     = 4     // buildings per block
const QSTR     = 6.0   // street gap between blocks
const IROAD_H  = 5     // half-width of inner cross road
const D_PAD    = 22    // platform padding

/* ═══════════════════════════════════════════════════════
   SCORING  —  FIX #5: format-aware legend + best-format bonus
═══════════════════════════════════════════════════════ */
function computeAllMax(players: any[]): AllMax {
  const runs: Record<Format,number> = {test:1,odi:1,t20:1}
  const wkts: Record<Format,number> = {test:1,odi:1,t20:1}
  const avg:  Record<Format,number> = {test:1,odi:1,t20:1}
  const sr:   Record<Format,number> = {test:1,odi:1,t20:1}
  const eco:  Record<Format,number> = {test:0.01,odi:0.01,t20:0.01}
  players.forEach(p => {
    ;(['test','odi','t20'] as Format[]).forEach(f => {
      const b = p.stats?.batting?.[f] ?? {}, w = p.stats?.bowling?.[f] ?? {}
      runs[f] = Math.max(runs[f], b.runs        || 0)
      wkts[f] = Math.max(wkts[f], w.wickets     || 0)
      avg[f]  = Math.max(avg[f],  b.average     || 0)
      sr[f]   = Math.max(sr[f],   b.strike_rate || 0)
      eco[f]  = Math.max(eco[f],  w.economy     || 0)
    })
  })
  return {runs, wkts, avg, sr, eco}
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
    return f==='t20' ? wW*0.45+wE*0.55 : f==='odi' ? wW*0.52+wE*0.48 : wW*0.65+wE*0.35
  if (role.includes('all')) {
    const bs = f==='t20' ? bR*0.30+bAv*0.35+bSR*0.35 : f==='odi' ? bR*0.40+bAv*0.35+bSR*0.25 : bR*0.40+bAv*0.60
    const ws = f==='t20' ? wW*0.45+wE*0.55 : f==='odi' ? wW*0.52+wE*0.48 : wW*0.65+wE*0.35
    return (bs + ws) / 2
  }
  return f==='t20' ? bR*0.30+bAv*0.35+bSR*0.35 : f==='odi' ? bR*0.40+bAv*0.35+bSR*0.25 : bR*0.40+bAv*0.60
}

// Career height = weighted avg + 35% bonus for best format achieved
// This ensures Sachin (Test/ODI great) isn't penalised by T20 absence
function allFormatScore(p: any, mx: AllMax): number {
  const t   = fmtScore(p, 'test', mx)
  const o   = fmtScore(p, 'odi',  mx)
  const t20 = fmtScore(p, 't20',  mx)
  const weighted = t*0.40 + o*0.35 + t20*0.25
  const best     = Math.max(t, o, t20)
  return weighted * 0.65 + best * 0.35
}

/* ═══════════════════════════════════════════════════════
   COUNTRY NORMALISER
═══════════════════════════════════════════════════════ */
function normalizeCountry(p: any): string {
  const raw = (p.country||p.team||p.personal_info?.country||p.personal_info?.team||p.nationality||'')
    .toString().toLowerCase().trim()
  if (!raw) return 'world'
  if (raw.includes('india')  || raw==='ind')                        return 'india'
  if (raw.includes('eng')    || raw==='eng')                        return 'england'
  if (raw.includes('aus')    || raw==='aus')                        return 'australia'
  if (raw.includes('south')  || raw==='sa'  || raw==='rsa')         return 'south africa'
  if (raw.includes('zealand')|| raw.includes('nz')|| raw==='nzl')  return 'new zealand'
  if (raw.includes('afghan') || raw==='afg')                        return 'afghanistan'
  if (raw.includes('sri')    || raw==='slc' || raw==='sl')          return 'sri lanka'
  if (raw.includes('west')   || raw.includes('windies')||raw==='wi')return 'west indies'
  return 'world'
}

/* ═══════════════════════════════════════════════════════
   BUILDING SHAPE SYSTEM  —  FIX #3: variety, no overlap
═══════════════════════════════════════════════════════ */
function assignShape(role: string, idx: number, ns: number): BldShape {
  const seed = (idx * 137 + Math.floor(ns * 97)) % 100
  if (role.includes('bowl')) {
    if (seed < 38) return 'cylinder'
    if (seed < 68) return 'blocky'
    return 'wedge'
  }
  if (role.includes('all')) {
    if (seed < 42) return 'cruciform'
    if (seed < 78) return 'stepped'
    return 'blocky'
  }
  if (ns > 0.70) return seed < 55 ? 'skyscraper' : 'stepped'
  if (ns > 0.45) return seed < 50 ? 'stepped'    : 'skyscraper'
  if (seed < 30)  return 'blocky'
  if (seed < 55)  return 'cylinder'
  return 'skyscraper'
}

function makeBuildingGroup(shape: BldShape, w: number, h: number, mat: THREE.Material): THREE.Group {
  const g  = new THREE.Group()
  const sw = Math.min(w, 4.6)   // clamp to avoid inter-slot overlap

  switch (shape) {
    case 'skyscraper': {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(sw*0.55, h*0.78, sw*0.55), mat)
      shaft.position.y = h*0.78/2; g.add(shaft)
      const setback = new THREE.Mesh(new THREE.BoxGeometry(sw*0.32, h*0.17, sw*0.32), mat)
      setback.position.y = h*0.78 + h*0.085; g.add(setback)
      const tip = new THREE.Mesh(new THREE.ConeGeometry(sw*0.08, h*0.14, 4), mat)
      tip.position.y = h*0.95 + h*0.07; g.add(tip)
      break
    }
    case 'stepped': {
      const tiers = [[1.00, 0.50, 0.00],[0.68, 0.30, 0.50],[0.40, 0.20, 0.80]] as [number,number,number][]
      tiers.forEach(([wf, hf, yBase]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sw*wf, h*hf, sw*wf), mat)
        m.position.y = h*yBase + h*hf/2; g.add(m)
      })
      break
    }
    case 'cylinder': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(sw*0.40, sw*0.46, h*0.88, 8), mat)
      body.position.y = h*0.44; g.add(body)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(sw*0.40, 8, 6, 0, Math.PI*2, 0, Math.PI/2), mat)
      dome.position.y = h*0.88; g.add(dome)
      break
    }
    case 'blocky': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(sw, h*0.62, sw), mat)
      base.position.y = h*0.31; g.add(base)
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(sw*0.36, sw*0.40, h*0.38, 6), mat)
      crown.position.y = h*0.62 + h*0.19; g.add(crown)
      break
    }
    case 'cruciform': {
      const hz = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sw*0.42), mat)
      hz.position.y = h/2; g.add(hz)
      const vt = new THREE.Mesh(new THREE.BoxGeometry(sw*0.42, h, sw), mat)
      vt.position.y = h/2; g.add(vt)
      break
    }
    case 'wedge': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(sw*0.20, sw*0.46, h, 5), mat)
      body.position.y = h/2; g.add(body)
      break
    }
  }
  return g
}

/* ═══════════════════════════════════════════════════════
   GRID HELPERS (quadrant-space)
═══════════════════════════════════════════════════════ */
function slotPosQ(col: number, row: number): {x:number; z:number} {
  return {
    x: col*QSLOT + Math.floor(col/QBLK)*QSTR,
    z: row*QSLOT + Math.floor(row/QBLK)*QSTR,
  }
}
function axisSpanQ(n: number): number {
  if (n <= 0) return 0
  return (n-1)*QSLOT + Math.max(0, Math.ceil(n/QBLK)-1)*QSTR
}

/* ═══════════════════════════════════════════════════════
   TEXTURE BUILDERS
═══════════════════════════════════════════════════════ */
function mkWinTex(hex: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width=128; cv.height=256
  const ctx = cv.getContext('2d')!
  ctx.fillStyle='#010810'; ctx.fillRect(0,0,128,256)
  const c = new THREE.Color(hex), rgb = `${~~(c.r*255)},${~~(c.g*255)},${~~(c.b*255)}`
  for (let ci=0; ci<4; ci++) for (let ri=0; ri<14; ri++) {
    const r = Math.random()
    if (r > 0.28) {
      ctx.fillStyle = r>0.90 ? '#ffffff' : r>0.65 ? `rgba(${rgb},0.9)` : `rgba(${rgb},0.42)`
      ctx.fillRect(ci*32+2, ri*18+2, 28, 14)
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1,2)
  return t
}

function mkGoldTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width=128; cv.height=256
  const ctx = cv.getContext('2d')!
  ctx.fillStyle='#080400'; ctx.fillRect(0,0,128,256)
  for (let ci=0; ci<4; ci++) for (let ri=0; ri<14; ri++) {
    const r = Math.random()
    if (r > 0.22) {
      const rr=~~(200+Math.random()*55), gg=~~(130+Math.random()*80)
      ctx.fillStyle = r>0.90 ? '#ffffff' : r>0.60 ? `rgb(${rr},${gg},0)` : `rgba(255,165,0,0.5)`
      ctx.fillRect(ci*32+2, ri*18+2, 28, 14)
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1,3)
  return t
}

function mkLabel(text: string, colorHex: number, sz=1): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width=480; cv.height=88
  const ctx = cv.getContext('2d')!
  const hex = '#'+new THREE.Color(colorHex).getHexString()
  ctx.clearRect(0,0,480,88)
  ctx.fillStyle='rgba(0,4,18,0.92)'; ctx.beginPath(); ctx.roundRect(2,4,476,80,10); ctx.fill()
  ctx.strokeStyle=hex; ctx.lineWidth=2.5; ctx.beginPath(); ctx.roundRect(2,4,476,80,10); ctx.stroke()
  ctx.fillStyle=hex; ctx.font='bold 26px "Courier New",monospace'
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text, 240, 46)
  const t = new THREE.CanvasTexture(cv)
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:t, transparent:true, depthTest:false}))
  spr.scale.set(28*sz, 7*sz, 1)
  return spr
}

/* ═══════════════════════════════════════════════════════
   FIX #1 — EPIC HEADQUARTER (mega towers, observation decks, beams)
═══════════════════════════════════════════════════════ */
function buildHQ(
  diamondRef: {current: THREE.Mesh|null},
  hqHitRef:   {current: THREE.Mesh|null}
): THREE.Group {
  const g = new THREE.Group()

  const baseMat   = new THREE.MeshStandardMaterial({color:0x070e20, emissive:0x1d4ed8, emissiveIntensity:0.8})
  const spireMat  = new THREE.MeshStandardMaterial({color:0x030c22, emissive:0x38bdf8, emissiveIntensity:1.3})
  const goldMat   = new THREE.MeshStandardMaterial({color:0xffd700, emissive:0xffaa00, emissiveIntensity:3.2})
  const whiteMat  = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0x7dd3fc, emissiveIntensity:7, transparent:true, opacity:0.95})
  const accentMat = new THREE.MeshStandardMaterial({color:0x051030, emissive:0x60a5fa, emissiveIntensity:1.0})
  const glassMat  = new THREE.MeshStandardMaterial({color:0x071a3e, emissive:0x1d4ed8, emissiveIntensity:0.6, transparent:true, opacity:0.65})
  const ringMatFn = (e: number) =>
    new THREE.MeshStandardMaterial({color:0x38bdf8, emissive:0x38bdf8, emissiveIntensity:e})

  // ── 7-tier grand podium ──
  const tiers = [
    {r:40, h:5.0, y:2.50},
    {r:35, h:4.2, y:7.60},
    {r:29, h:3.8, y:11.7},
    {r:24, h:3.2, y:15.3},
    {r:19, h:2.8, y:18.3},
    {r:14, h:2.4, y:21.0},
    {r:10, h:2.0, y:23.2},
  ]
  tiers.forEach(({r, h, y}) => {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r+3.8, h, 8), baseMat)
    tier.position.y = y; g.add(tier)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r+0.3, 0.55, 8, 44), ringMatFn(4.5))
    ring.rotation.x = Math.PI/2; ring.position.y = y+h/2+0.35; g.add(ring)
  })

  // ── Main shaft (ultra tall) ──
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(14, 130, 14), spireMat)
  shaft.position.y = 24.2 + 65; g.add(shaft)

  // Glass observation drum
  const glassRing = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 14, 10), glassMat)
  glassRing.position.y = 162; g.add(glassRing)
  const glassRingTop = new THREE.Mesh(new THREE.TorusGeometry(8.2, 0.5, 8, 40), ringMatFn(5))
  glassRingTop.rotation.x = Math.PI/2; glassRingTop.position.y = 169; g.add(glassRingTop)

  // Tapered upper section
  const taper1 = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 7, 34, 8), accentMat)
  taper1.position.y = 186; g.add(taper1)
  const taper2 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 4.5, 24, 8), accentMat)
  taper2.position.y = 215; g.add(taper2)

  // Gold needle tip
  const needleMat = new THREE.MeshStandardMaterial({color:0xffd700, emissive:0xffaa00, emissiveIntensity:4.0})
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.8, 18, 6), needleMat)
  needle.position.y = 236; g.add(needle)
  const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 14, 6), goldMat)
  tipCone.position.y = 252; g.add(tipCone)

  // ── Observation decks at 3 levels ──
  ;[55, 95, 135].forEach(y => {
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 20, 1.8, 8),
      new THREE.MeshStandardMaterial({color:0x0c1e3c, emissive:0x38bdf8, emissiveIntensity:0.5})
    )
    deck.position.y = y; g.add(deck)
    const dRing = new THREE.Mesh(new THREE.TorusGeometry(20.3, 0.55, 8, 44), ringMatFn(5))
    dRing.rotation.x = Math.PI/2; dRing.position.y = y+0.9; g.add(dRing)
    // Mini pillars on deck edge
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2
      const pp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.8), accentMat)
      pp.position.set(Math.cos(a)*19.5, y+2.5, Math.sin(a)*19.5); g.add(pp)
    }
  })

  // ── 16 outer mega-towers (iconic skyline silhouette) ──
  for (let i = 0; i < 16; i++) {
    const angle = (i/16)*Math.PI*2
    const rx = Math.cos(angle)*22, rz = Math.sin(angle)*22
    const isMajor = i % 2 === 0
    const hh = isMajor ? 68 + Math.sin(i*0.8+1)*10 : 44 + Math.sin(i*1.1)*8
    const tw = isMajor ? 3.5 : 2.5

    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, hh, tw), accentMat)
    tower.position.set(rx, hh/2+24.2, rz); g.add(tower)

    const ts = new THREE.Mesh(new THREE.ConeGeometry(tw*0.42, hh*0.24, 4), goldMat)
    ts.position.set(rx, hh+24.2+hh*0.12, rz); g.add(ts)

    const orb = new THREE.Mesh(new THREE.SphereGeometry(isMajor?1.1:0.75, 8, 8), whiteMat)
    orb.position.set(rx, hh+24.2+hh*0.25, rz); g.add(orb)

    // Cross braces between adjacent towers
    if (i % 4 === 0) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 32),
        new THREE.MeshStandardMaterial({color:0x0d1f40, emissive:0x60a5fa, emissiveIntensity:1.2}))
      brace.position.set(rx*0.5, hh*0.5+24.2, rz*0.5)
      brace.lookAt(new THREE.Vector3(0, hh*0.5+24.2, 0)); g.add(brace)
    }
  }

  // ── 4 search beams ──
  ;[[24,24],[24,-24],[-24,24],[-24,-24]].forEach(([x,z]) => {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 3.5, 110, 6),
      new THREE.MeshStandardMaterial({color:0x38bdf8, emissive:0x38bdf8, emissiveIntensity:1.8, transparent:true, opacity:0.10})
    )
    beam.position.set(x, 79, z); g.add(beam)
  })

  // ── Ground plinth glow ──
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(45, 50, 2, 8),
    new THREE.MeshStandardMaterial({color:0x050d22, emissive:0x1d4ed8, emissiveIntensity:0.4}))
  plinth.position.y = 1; g.add(plinth)
  const plinthRing = new THREE.Mesh(new THREE.TorusGeometry(46, 1.2, 8, 60), ringMatFn(2.5))
  plinthRing.rotation.x = Math.PI/2; plinthRing.position.y = 2; g.add(plinthRing)

  // ── Animated diamond topper ──
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(7.5, 0), whiteMat)
  diamond.position.y = 224; g.add(diamond)
  diamondRef.current = diamond

  // ── HQ nameplate ──
  const sc = document.createElement('canvas'); sc.width=900; sc.height=144
  const sx = sc.getContext('2d')!
  const sg = sx.createLinearGradient(0,0,900,0)
  sg.addColorStop(0,'rgba(0,8,32,0)'); sg.addColorStop(0.1,'rgba(0,10,42,0.97)')
  sg.addColorStop(0.9,'rgba(0,10,42,0.97)'); sg.addColorStop(1,'rgba(0,8,32,0)')
  sx.fillStyle=sg; sx.fillRect(0,0,900,144)
  sx.shadowColor='#38bdf8'; sx.shadowBlur=30
  sx.strokeStyle='#38bdf8'; sx.lineWidth=3; sx.strokeRect(8,8,884,128)
  sx.strokeStyle='rgba(56,189,248,0.25)'; sx.lineWidth=14; sx.strokeRect(8,8,884,128)
  sx.shadowBlur=0
  ;[[8,8],[870,8],[8,114],[870,114]].forEach(([cx,cy]) => {
    sx.strokeStyle='#7dd3fc'; sx.lineWidth=2.5; sx.strokeRect(cx,cy,22,22)
    sx.fillStyle='#7dd3fc'; sx.fillRect(cx+8,cy+8,6,6)
  })
  sx.fillStyle='#e0f2fe'; sx.font='bold 70px "Courier New",monospace'
  sx.textAlign='center'; sx.textBaseline='middle'
  sx.shadowColor='#38bdf8'; sx.shadowBlur=28; sx.fillText('HEADQUARTER', 450, 56); sx.shadowBlur=0
  sx.fillStyle='rgba(125,211,252,0.65)'; sx.font='15px "Courier New",monospace'
  sx.fillText('ICC  ·  INTERNATIONAL CRICKET COUNCIL  ·  EST. 1909', 450, 108)
  const sSpr = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(sc), transparent:true, depthTest:false}))
  sSpr.scale.set(62, 10, 1); sSpr.position.set(0, 54, 0); g.add(sSpr)

  // Invisible hitbox
  const hb = new THREE.Mesh(new THREE.BoxGeometry(50, 260, 50), new THREE.MeshBasicMaterial({visible:false}))
  hb.position.y = 130; g.add(hb); hqHitRef.current = hb
  return g
}

/* ═══════════════════════════════════════════════════════
   FIX #2 — OUTER RING: tall pylons + multi-ring glow
═══════════════════════════════════════════════════════ */
function buildOuterRing(scene: THREE.Scene): void {
  const R = 280, PYLON_COUNT = 32

  // Three layered torus rings
  ;[{r:R, t:3.8, e:1.2},{r:R-14, t:1.6, e:0.55},{r:R+14, t:1.0, e:0.35}].forEach(({r,t,e}) => {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(r, t, 12, 128),
      new THREE.MeshStandardMaterial({color:0x1e3a5f, emissive:0x38bdf8, emissiveIntensity:e})
    )
    torus.rotation.x = Math.PI/2; torus.position.y = 2.5; scene.add(torus)
  })

  // Wide ground ring glow
  const ringGlow = new THREE.Mesh(
    new THREE.RingGeometry(R-22, R+22, 128),
    new THREE.MeshStandardMaterial({color:0x1e3a5f, emissive:0x1d4ed8, emissiveIntensity:0.35, side:THREE.DoubleSide})
  )
  ringGlow.rotation.x = -Math.PI/2; ringGlow.position.y = 0.5; scene.add(ringGlow)

  // Tall pylons arranged around the ring
  for (let i = 0; i < PYLON_COUNT; i++) {
    const angle = (i/PYLON_COUNT)*Math.PI*2
    const px = Math.cos(angle)*R, pz = Math.sin(angle)*R
    const isMajor = i % 4 === 0

    const pylonH = isMajor ? 70 : 42
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x060e22,
      emissive: isMajor ? 0x38bdf8 : 0x1e3a5f,
      emissiveIntensity: isMajor ? 1.4 : 0.5
    })
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(isMajor?5:3, pylonH, isMajor?5:3), pylonMat)
    pylon.position.set(px, pylonH/2, pz); scene.add(pylon)

    // Glowing orb on top
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: isMajor ? 0x38bdf8 : 0x1e3a5f,
      emissiveIntensity: isMajor ? 9 : 4
    })
    const orb = new THREE.Mesh(new THREE.SphereGeometry(isMajor?2.2:1.1, 8, 8), orbMat)
    orb.position.set(px, pylonH+2.2, pz); scene.add(orb)

    // Crossbar + side orbs on major pylons
    if (isMajor) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(16, 0.9, 0.9),
        new THREE.MeshStandardMaterial({color:0x0d1f40, emissive:0x38bdf8, emissiveIntensity:3.5}))
      bar.position.set(px, pylonH-6, pz)
      bar.rotation.y = angle; scene.add(bar)

      ;[-7, 7].forEach(offset => {
        const eo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), orbMat)
        const bPos = new THREE.Vector3(offset, 0, 0)
          .applyAxisAngle(new THREE.Vector3(0,1,0), angle)
        eo.position.set(px+bPos.x, pylonH-6, pz+bPos.z); scene.add(eo)
      })

      // Vertical neon strips on sides
      ;[-2.2, 2.2].forEach(d => {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, pylonH, 0.35),
          new THREE.MeshStandardMaterial({color:0x38bdf8, emissive:0x38bdf8, emissiveIntensity:2.5}))
        strip.position.set(px+Math.cos(angle+Math.PI/2)*d, pylonH/2, pz+Math.sin(angle+Math.PI/2)*d)
        scene.add(strip)
      })
    }
  }
}

/* ═══════════════════════════════════════════════════════
   CYBERPUNK DISTRICT BORDER
═══════════════════════════════════════════════════════ */
function addCyberpunkBorder(parent: THREE.Group, w: number, d: number, color: number): void {
  const c = new THREE.Color(color)
  const WALL_H = 8, WT = 1.8
  const wallMat   = new THREE.MeshStandardMaterial({color:0x0a1020, emissive:c, emissiveIntensity:2.0})
  const glowMat   = new THREE.MeshStandardMaterial({color, emissive:c, emissiveIntensity:5.5})
  const pillarMat = new THREE.MeshStandardMaterial({color:0x050c18, emissive:c, emissiveIntensity:3.0})

  ;[d/2,-d/2].forEach(z => {
    parent.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(w+WT, WALL_H, WT), wallMat),
      {position: new THREE.Vector3(0, WALL_H/2, z)}))
    parent.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(w+WT, 0.6, WT*0.8), glowMat),
      {position: new THREE.Vector3(0, WALL_H+0.3, z)}))
  })
  ;[w/2,-w/2].forEach(x => {
    parent.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(WT, WALL_H, d+WT), wallMat),
      {position: new THREE.Vector3(x, WALL_H/2, 0)}))
    parent.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(WT*0.8, 0.6, d+WT), glowMat),
      {position: new THREE.Vector3(x, WALL_H+0.3, 0)}))
  })

  ;[[w/2,d/2],[w/2,-d/2],[-w/2,d/2],[-w/2,-d/2]].forEach(([x,z]) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.6, WALL_H*2.8, 3.6), pillarMat)
    pillar.position.set(x, WALL_H*1.4, z); parent.add(pillar)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 8), glowMat)
    cap.position.set(x, WALL_H*2.8+0.8, z); parent.add(cap)
    const orb = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 10),
      new THREE.MeshStandardMaterial({color:0xffffff, emissive:c, emissiveIntensity:8}))
    orb.position.set(x, WALL_H*2.8+2.8, z); parent.add(orb)
    ;[[-1.8,0],[1.8,0],[0,-1.8],[0,1.8]].forEach(([dx,dz]) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, WALL_H*2.8, 0.3), glowMat)
      strip.position.set(x+dx, WALL_H*1.4, z+dz); parent.add(strip)
    })
  })
}

/* ═══════════════════════════════════════════════════════
   ROAD SPOKE
═══════════════════════════════════════════════════════ */
function buildRoad(scene: THREE.Scene, angle: number, len: number, color: number): void {
  const rg = new THREE.Group(); rg.rotation.y = -angle; rg.userData.city = true
  const W = 16, midX = 28 + len/2

  const mkPlane = (w: number, d: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    m.rotation.x = -Math.PI/2; return m
  }
  const roadMat  = new THREE.MeshStandardMaterial({color:0x020a18, emissive:new THREE.Color(color), emissiveIntensity:0.14})
  const edgeMat  = new THREE.MeshStandardMaterial({color, emissive:new THREE.Color(color), emissiveIntensity:6})
  const innerMat = new THREE.MeshStandardMaterial({color:0x1e3a5f, emissive:0x1e3a5f, emissiveIntensity:1.5})
  const dashMat  = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xffffff, emissiveIntensity:2})

  const road = mkPlane(len, W, roadMat); road.position.set(midX, 0.15, 0); rg.add(road)
  ;[-(W/2-0.4), (W/2-0.4)].forEach(z => {
    const e = mkPlane(len, 0.9, edgeMat); e.position.set(midX, 0.17, z); rg.add(e)
  })
  ;[-2.5, 2.5].forEach(z => {
    const il = mkPlane(len, 0.35, innerMat); il.position.set(midX, 0.16, z); rg.add(il)
  })
  const dashes = 12, dashLen = (len/dashes)*0.45
  for (let i=0; i<dashes; i++) {
    const d = mkPlane(dashLen, 0.5, dashMat)
    d.position.set(28+(i+0.5)*(len/dashes), 0.18, 0); rg.add(d)
  }
  for (let i=1; i<=5; i++) {
    const lx = 28 + i*(len/6)
    ;[-(W/2+1), (W/2+1)].forEach(z => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 13, 8),
        new THREE.MeshStandardMaterial({color:0x1e293b}))
      pole.position.set(lx, 6.5, z); rg.add(pole)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.25, 0.25),
        new THREE.MeshStandardMaterial({color:0x1e293b}))
      arm.position.set(lx+(z>0?-1.75:1.75), 13, z); rg.add(arm)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 8),
        new THREE.MeshStandardMaterial({color:0xffffff, emissive:new THREE.Color(color), emissiveIntensity:7}))
      bulb.position.set(lx+(z>0?-3.5:3.5), 13, z); rg.add(bulb)
    })
  }
  scene.add(rg)
}

/* ═══════════════════════════════════════════════════════
   FIX #3 — INNER CROSS ROADS + CENTRAL PLAZA
═══════════════════════════════════════════════════════ */
function addInnerCross(parent: THREE.Group, platW: number, platD: number, color: number): void {
  const c = new THREE.Color(color)
  const roadMat = new THREE.MeshStandardMaterial({color:0x020b18, emissive:c, emissiveIntensity:0.22})
  const lineMat = new THREE.MeshStandardMaterial({color, emissive:c, emissiveIntensity:4.5})

  // E-W road strip
  const rewMesh = new THREE.Mesh(new THREE.PlaneGeometry(platW, IROAD_H*2), roadMat)
  rewMesh.rotation.x = -Math.PI/2; rewMesh.position.y = 0.16; parent.add(rewMesh)
  // N-S road strip
  const rnsMesh = new THREE.Mesh(new THREE.PlaneGeometry(IROAD_H*2, platD), roadMat)
  rnsMesh.rotation.x = -Math.PI/2; rnsMesh.position.y = 0.16; parent.add(rnsMesh)

  // Glowing lane lines
  ;[0.4, -0.4].forEach(off => {
    ;[true, false].forEach(isEW => {
      const lm = new THREE.Mesh(
        new THREE.PlaneGeometry(isEW ? platW : 0.4, isEW ? 0.4 : platD),
        lineMat
      )
      lm.rotation.x = -Math.PI/2
      lm.position.set(isEW ? 0 : off, 0.18, isEW ? off : 0)
      parent.add(lm)
    })
  })

  // Central plaza fountain
  const plazaMat = new THREE.MeshStandardMaterial({color:0x080e22, emissive:c, emissiveIntensity:0.7})
  ;[{r:7, h:1.0, y:0.5}, {r:4.2, h:1.6, y:1.8}, {r:2.2, h:2.2, y:3.5}, {r:1.0, h:1.8, y:5.4}].forEach(({r,h,y}) => {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r+0.8, h, 8), plazaMat)
    tier.position.y = y; parent.add(tier)
  })
  const topOrb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8),
    new THREE.MeshStandardMaterial({color:0xffffff, emissive:c, emissiveIntensity:9}))
  topOrb.position.y = 7.6; parent.add(topOrb)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.4, 8, 36),
    new THREE.MeshStandardMaterial({color, emissive:c, emissiveIntensity:4.5}))
  ring.rotation.x = Math.PI/2; ring.position.y = 2.2; parent.add(ring)

  // 4 small junction lights at road crossings
  ;[[platW/2-4,0],[-(platW/2-4),0],[0,platD/2-4],[0,-(platD/2-4)]].forEach(([lx,lz]) => {
    const jl = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6),
      new THREE.MeshStandardMaterial({color:0xffffff, emissive:c, emissiveIntensity:6}))
    jl.position.set(lx, 2.5, lz); parent.add(jl)
  })
}

/* ═══════════════════════════════════════════════════════
   DISPOSE
═══════════════════════════════════════════════════════ */
function disposeCity(scene: THREE.Scene): void {
  scene.children.filter(o => o.userData.city).forEach(obj => {
    obj.traverse(child => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh && !(child as any).isSprite) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach(m => {
        if (!m) return
        ;['map','emissiveMap','normalMap','roughnessMap','alphaMap'].forEach(k => {
          const tex = (m as any)[k]; if (tex instanceof THREE.Texture) tex.dispose()
        })
        m.dispose()
      })
      if (mesh.geometry) mesh.geometry.dispose()
    })
    scene.remove(obj)
  })
}

/* ═══════════════════════════════════════════════════════
   FIX #4 — VISIBLE DRONE MESH (quadcopter with guards)
═══════════════════════════════════════════════════════ */
function buildDroneMesh(): {group: THREE.Group; rotors: THREE.Mesh[]} {
  const g = new THREE.Group()
  const rotors: THREE.Mesh[] = []

  const bodyMat  = new THREE.MeshStandardMaterial({color:0x111827, emissive:0x1e40af, emissiveIntensity:0.5, roughness:0.3})
  const armMat   = new THREE.MeshStandardMaterial({color:0x1f2937, roughness:0.5})
  const rotorMat = new THREE.MeshStandardMaterial({color:0x374151, transparent:true, opacity:0.72, roughness:0.3})
  const motorMat = new THREE.MeshStandardMaterial({color:0xfbbf24, emissive:0xb45309, emissiveIntensity:0.9})
  const ledBlue  = new THREE.MeshStandardMaterial({color:0x38bdf8, emissive:0x38bdf8, emissiveIntensity:12})
  const ledRed   = new THREE.MeshStandardMaterial({color:0xef4444, emissive:0xef4444, emissiveIntensity:12})

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.5, 3.8), bodyMat)
  body.position.y = 0; g.add(body)
  // Top hump
  const hump = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.8, 8), bodyMat)
  hump.position.set(0, 1.0, 0); g.add(hump)
  // Front camera
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 6),
    new THREE.MeshStandardMaterial({color:0x000000, emissive:0x60a5fa, emissiveIntensity:5}))
  cam.position.set(2.5, -0.2, 0); g.add(cam)

  // 4 arms + motors + rotors
  const armAngles = [Math.PI*0.25, Math.PI*0.75, Math.PI*1.25, Math.PI*1.75]
  armAngles.forEach((ang, i) => {
    const ax = Math.cos(ang)*2.5, az = Math.sin(ang)*2.5
    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.45, 1.0), armMat)
    arm.position.set(ax, 0, az); arm.rotation.y = ang + Math.PI/2; g.add(arm)

    // Motor at tip
    const mx = Math.cos(ang)*5.0, mz = Math.sin(ang)*5.0
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.65, 0.8, 8), motorMat)
    motor.position.set(mx, 0.6, mz); g.add(motor)

    // Propeller blades
    const prop1 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 0.6), rotorMat)
    prop1.position.set(mx, 1.05, mz); g.add(prop1); rotors.push(prop1)
    const prop2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 4.5), rotorMat)
    prop2.position.set(mx, 1.05, mz); g.add(prop2); rotors.push(prop2)

    // Blade guard ring
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.18, 6, 24),
      new THREE.MeshStandardMaterial({color:0x1f2937, roughness:0.5})
    )
    guard.rotation.x = Math.PI/2; guard.position.set(mx, 1.05, mz); g.add(guard)

    // LED lights (blue front 0,1 / red back 2,3)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), i < 2 ? ledBlue : ledRed)
    led.position.set(mx, 0.2, mz); g.add(led)
  })

  // Landing gear (4 legs)
  ;[[2.8,1.6],[-2.8,1.6],[2.8,-1.6],[-2.8,-1.6]].forEach(([lx,lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6), armMat)
    leg.position.set(lx, -1.1, lz); g.add(leg)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.18), armMat)
    foot.position.set(lx, -1.85, lz); g.add(foot)
  })

  // Top status indicator
  const topLed = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), ledBlue)
  topLed.position.set(0, 1.0, 0); g.add(topLed)

  return {group: g, rotors}
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function CricCity() {
  const mountRef     = useRef<HTMLDivElement>(null)
  const sceneRef     = useRef<THREE.Scene|null>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer|null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera|null>(null)
  const diamondRef   = useRef<THREE.Mesh|null>(null)
  const hqHitRef     = useRef<THREE.Mesh|null>(null)
  const indicatorRef = useRef<THREE.Mesh|null>(null)
  const hitMap       = useRef<Map<THREE.Object3D, {player:any; team:string}>>(new Map())
  const droneGroupRef  = useRef<THREE.Group|null>(null)
  const droneRotorsRef = useRef<THREE.Mesh[]>([])

  const distRef  = useRef(360)
  const tDistRef = useRef(360)

  const droneModeRef  = useRef(false)
  const droneYawRef   = useRef(Math.PI)
  const keysRef       = useRef<Set<string>>(new Set())
  const btnsRef       = useRef({fwd:false, back:false, left:false, right:false, up:false, down:false})

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
    scene.fog = new THREE.FogExp2(0x00060e, 0.00072)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 12000)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'})
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    rendererRef.current = renderer
    mountRef.current.appendChild(renderer.domElement)

    let theta = 0.85, phi = 0.34, drag = false, lx = 0, ly = 0
    const camUpdate = () => {
      if (droneModeRef.current) return
      const d = distRef.current
      camera.position.set(d*Math.sin(theta)*Math.cos(phi), d*Math.sin(phi), d*Math.cos(theta)*Math.cos(phi))
      camera.lookAt(0, 0, 0)
    }
    camUpdate()

    const onDown  = (e: PointerEvent) => { if (droneModeRef.current) return; drag=true; lx=e.clientX; ly=e.clientY }
    const onMove  = (e: PointerEvent) => {
      if (!drag || droneModeRef.current) return
      theta -= (e.clientX-lx)*0.004
      phi = Math.max(0.05, Math.min(1.48, phi-(e.clientY-ly)*0.004))
      lx=e.clientX; ly=e.clientY
    }
    const onUp    = () => { drag = false }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (droneModeRef.current) {
        if (droneGroupRef.current)
          droneGroupRef.current.position.y = Math.max(3, Math.min(260, droneGroupRef.current.position.y + e.deltaY*0.045))
      } else {
        tDistRef.current = Math.max(15, Math.min(1800, tDistRef.current * Math.exp(e.deltaY*0.001)))
      }
    }
    const onKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase())
    const onKeyUp   = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    renderer.domElement.addEventListener('wheel', onWheel, {passive:false})

    // Lighting
    scene.add(new THREE.AmbientLight(0x0d1f40, 2.6))
    const dir = new THREE.DirectionalLight(0x3366ff, 1.8); dir.position.set(100,300,100); scene.add(dir)
    scene.add(Object.assign(new THREE.PointLight(0xff4400, 0.3, 1400), {position: new THREE.Vector3(0,-10,0)}))
    scene.add(Object.assign(new THREE.PointLight(0x38bdf8, 1.5, 900), {position: new THREE.Vector3(0,55,0)}))

    // Ground
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(14000,14000),
      new THREE.MeshStandardMaterial({color:0x010810}))
    gnd.rotation.x = -Math.PI/2; scene.add(gnd)
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(2600,2600,105,105),
      new THREE.MeshBasicMaterial({color:0x091830, wireframe:true}))
    grid.rotation.x = -Math.PI/2; grid.position.y = 0.07; scene.add(grid)

    // Outer stadium ring (persistent, not city-tagged)
    buildOuterRing(scene)

    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)

      if (droneModeRef.current && droneGroupRef.current) {
        const drone = droneGroupRef.current
        const keys  = keysRef.current
        const btns  = btnsRef.current
        const SPEED     = 1.0   // FIX #4: was 2.8, now slow & controlled
        const YAW_SPD   = 0.016
        const yaw = droneYawRef.current

        if (keys.has('a')||keys.has('arrowleft') ||btns.left)  droneYawRef.current -= YAW_SPD
        if (keys.has('d')||keys.has('arrowright')||btns.right) droneYawRef.current += YAW_SPD

        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
        if (keys.has('w')||keys.has('arrowup')  ||btns.fwd)  drone.position.addScaledVector(fwd, SPEED)
        if (keys.has('s')||keys.has('arrowdown')||btns.back) drone.position.addScaledVector(fwd, -SPEED*0.6)
        if (keys.has('q')||btns.up)   drone.position.y = Math.min(260, drone.position.y + SPEED*0.65)
        if (keys.has('e')||btns.down) drone.position.y = Math.max(3, drone.position.y - SPEED*0.65)

        drone.position.x = THREE.MathUtils.clamp(drone.position.x, -620, 620)
        drone.position.z = THREE.MathUtils.clamp(drone.position.z, -620, 620)
        drone.rotation.y = droneYawRef.current

        // Slight tilt when moving forward
        drone.rotation.x = (keys.has('w')||keys.has('arrowup')||btns.fwd) ? -0.12 : 0

        // Spin rotors
        droneRotorsRef.current.forEach(r => { r.rotation.y += 0.38 })

        // Third-person camera follows drone from behind + above
        const behindOff = new THREE.Vector3(Math.sin(yaw)*24, 11, Math.cos(yaw)*24)
        camera.position.lerp(drone.position.clone().add(behindOff), 0.15)
        camera.lookAt(drone.position.clone().add(new THREE.Vector3(0, 3, 0)))
      } else {
        distRef.current += (tDistRef.current - distRef.current) * 0.12
        camUpdate()
      }

      if (diamondRef.current)   diamondRef.current.rotation.y  += 0.012
      if (indicatorRef.current) indicatorRef.current.rotation.y += 0.025
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      camera.aspect = window.innerWidth/window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('wheel', onWheel)
      disposeCity(scene)
      renderer.dispose()
      mountRef.current?.removeChild(renderer.domElement)
    }
  }, [])

  /* ── CLICK HANDLER ───────────────────────────────── */
  useEffect(() => {
    const renderer = rendererRef.current, camera = cameraRef.current, scene = sceneRef.current
    if (!renderer||!camera||!scene) return
    const rc = new THREE.Raycaster(), mo = new THREE.Vector2()
    const onClick = (e: MouseEvent) => {
      if (droneModeRef.current) return
      mo.x =  (e.clientX/window.innerWidth)*2-1
      mo.y = -(e.clientY/window.innerHeight)*2+1
      rc.setFromCamera(mo, camera)
      if (hqHitRef.current) {
        const h = rc.intersectObject(hqHitRef.current, false)
        if (h.length > 0) { setHqOpen(true); setSelected(null); return }
      }
      const hits = rc.intersectObjects(Array.from(hitMap.current.keys()), false)
      if (hits.length > 0) {
        const obj = hits[0].object, data = hitMap.current.get(obj); if (!data) return
        setSelected({...data.player, _team:data.team}); setHqOpen(false)
        if (indicatorRef.current) scene.remove(indicatorRef.current)
        const ind = new THREE.Mesh(
          new THREE.OctahedronGeometry(3, 0),
          new THREE.MeshStandardMaterial({color:0xffffff, emissive:0x7dd3fc, emissiveIntensity:8})
        )
        const wp = new THREE.Vector3(); obj.getWorldPosition(wp)
        ind.position.set(wp.x, wp.y+(obj.userData.halfH??5)+7, wp.z)
        ind.userData.city = true; indicatorRef.current = ind; scene.add(ind)
      } else {
        setSelected(null); setHqOpen(false)
        if (indicatorRef.current) { scene.remove(indicatorRef.current); indicatorRef.current = null }
      }
    }
    renderer.domElement.addEventListener('click', onClick)
    return () => renderer.domElement.removeEventListener('click', onClick)
  }, [])

  /* ── BUILD CITY ──────────────────────────────────── */
  useEffect(() => {
    async function build() {
      const scene = sceneRef.current; if (!scene) return
      setLoading(true); setSelected(null); setHqOpen(false)
      hitMap.current.clear()
      if (indicatorRef.current) { scene.remove(indicatorRef.current); indicatorRef.current = null }
      disposeCity(scene)

      const players: any[] = await fetchPlayers(fmt)
      const mx = computeAllMax(players)
      setAllMx(mx)

      const grouped: Record<string,any[]> = {}
      players.forEach(p => {
        const k = normalizeCountry(p); if (!grouped[k]) grouped[k] = []; grouped[k].push(p)
      })
      const snap: Record<string,number> = {}
      Object.entries(grouped).forEach(([k,v]) => { snap[k] = v.length })
      setCounts(snap)

      // HQ + hub
      const hq = buildHQ(diamondRef, hqHitRef); hq.userData.city = true; scene.add(hq)
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(38, 38, 1.4, 8),
        new THREE.MeshStandardMaterial({color:0x0a1628, emissive:0x1d4ed8, emissiveIntensity:0.5})
      )
      hub.position.y = 0.7; hub.userData.city = true; scene.add(hub)

      const goldTex  = mkGoldTex()
      const fmtLower = fmt.toLowerCase() as Format

      TEAM_LAYOUT.forEach(({key, angle, label}) => {
        const p = getPal(key)
        buildRoad(scene, angle, RLEN, p.border)

        const raw = grouped[key] || []
        // FIX #5: sort by CURRENT FORMAT score → Sachin is Test legend
        const sorted = [...raw].sort((a, b) => fmtScore(b, fmtLower, mx) - fmtScore(a, fmtLower, mx))
        const n = sorted.length

        const fmtScores    = sorted.map(pl => fmtScore(pl, fmtLower, mx))
        const careerScores = sorted.map(pl => allFormatScore(pl, mx))
        const sMax   = careerScores.length > 0 ? Math.max(...careerScores) : 1
        const sMin   = careerScores.length > 0 ? Math.min(...careerScores) : 0
        const sRange = Math.max(sMax - sMin, 0.001)

        const cx = Math.cos(angle)*DDIST, cz = Math.sin(angle)*DDIST
        const dg = new THREE.Group()
        dg.position.set(cx, 0, cz); dg.rotation.y = -angle; dg.userData.city = true; scene.add(dg)

        // Compute quadrant dimensions from max players-per-quadrant
        const perQ = Math.max(1, Math.ceil(n/4))
        const qC   = Math.max(2, Math.ceil(Math.sqrt(perQ)))
        const qR   = Math.max(2, Math.ceil(perQ/qC))
        const startOff  = IROAD_H + 3.5    // distance from centre to first building slot
        const quadSpanX = axisSpanQ(qC) + QSLOT
        const quadSpanZ = axisSpanQ(qR) + QSLOT
        const platHalfW = startOff + quadSpanX + D_PAD/2
        const platHalfD = startOff + quadSpanZ + D_PAD/2
        const platW2    = platHalfW * 2, platD2 = platHalfD * 2

        // Ground plate
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(platW2, platD2),
          new THREE.MeshStandardMaterial({
            color:  new THREE.Color(p.ground),
            emissive: new THREE.Color(p.border),
            emissiveIntensity: n > 0 ? 0.11 : 0.02
          })
        )
        plate.rotation.x = -Math.PI/2; plate.position.y = 0.1; dg.add(plate)

        // Cyberpunk border
        addCyberpunkBorder(dg, platW2, platD2, p.border)
        // Inner cross roads + fountain
        addInnerCross(dg, platW2, platD2, p.border)

        // Country label
        const lbl = mkLabel(`${label}  (${n})`, p.border)
        lbl.position.set(0, 38, -(platD2/2 + 18)); dg.add(lbl)

        if (n === 0) return

        const texBat = mkWinTex(p.batsman)
        const texBow = mkWinTex(p.bowler)
        const texAll = mkWinTex(p.allrounder)

        // Split players round-robin into 4 quadrants (best player to Q1 = origIdx 0)
        const quads: Array<{pl:any; origIdx:number}[]> = [[],[],[],[]]
        sorted.forEach((pl, i) => quads[i % 4].push({pl, origIdx: i}))

        // Quadrant directions: Q0=NE, Q1=NW, Q2=SW, Q3=SE
        const quadSigns = [[1,1],[-1,1],[-1,-1],[1,-1]]

        quads.forEach((qArr, qi) => {
          const [sx, sz] = quadSigns[qi]
          qArr.forEach(({pl, origIdx}, ii) => {
            const col = ii % qC, row = Math.floor(ii/qC)
            const {x: gx, z: gz} = slotPosQ(col, row)
            const px = sx * (startOff + gx + QSLOT*0.5)
            const pz = sz * (startOff + gz + QSLOT*0.5)

            const carS   = careerScores[origIdx] ?? 0
            const ns     = isNaN(carS) ? 0 : sRange > 0 ? (carS-sMin)/sRange : 0
            const isLeg  = origIdx === 0   // FIX #5: #1 in CURRENT FORMAT is legend
            const role   = (pl.personal_info?.role || pl.role || '').toLowerCase()
            const shape  = assignShape(role, origIdx, ns)

            // Height (career score drives visual impact)
            let h = 5
            if (isLeg) {
              h = 135 + ns*48
            } else if (role.includes('bowl')) {
              h = 7 + Math.pow(ns, 1.6)*40
            } else if (role.includes('all')) {
              h = 10 + Math.pow(ns, 1.3)*52
            } else {
              if (ns > 0.85)      h = 88 + ns*28
              else if (ns > 0.65) h = 52 + ns*30
              else if (ns > 0.40) h = 22 + ns*26
              else if (ns > 0.20) h = 10 + ns*18
              else                h = 4  + ns*11
            }
            h = (!isFinite(h) || h <= 0) ? 5 : h

            // Width capped at 4.5 to prevent inter-slot overlap
            const wBase = isLeg ? 4.0
              : role.includes('bowl') ? 3.0+ns*1.4
              : role.includes('all')  ? 2.8+ns*1.2
              :                         1.9+ns*1.7
            const w = Math.min(wBase, 4.5)

            if (isLeg) {
              // ★ Gold legend tower
              const goldMat2 = new THREE.MeshStandardMaterial({
                map:goldTex, emissiveMap:goldTex,
                emissive:new THREE.Color(0xffaa00), emissiveIntensity:2.6
              })
              const bldg = makeBuildingGroup('skyscraper', w, h, goldMat2)
              bldg.position.set(px, 0, pz); dg.add(bldg)
              // Orbit ring
              const rMat = new THREE.MeshStandardMaterial({color:0xffaa00, emissive:0xffaa00, emissiveIntensity:4.5, side:THREE.DoubleSide})
              const rMesh = new THREE.Mesh(new THREE.RingGeometry(w*0.9, w*1.3, 36), rMat)
              rMesh.rotation.x = -Math.PI/2; rMesh.position.set(px, h*0.48, pz); dg.add(rMesh)
              // Player name label
              const nm = (pl.name || pl.full_name || '').toUpperCase() || 'LEGEND'
              const ll = mkLabel(`★ ${nm}`, 0xffd700, 0.72)
              ll.position.set(px, h+28, pz); dg.add(ll)
              // Hitbox
              const hb = new THREE.Mesh(new THREE.BoxGeometry(w*1.4, h, w*1.4), new THREE.MeshBasicMaterial({visible:false}))
              hb.position.set(px, h/2, pz); hb.userData.halfH = h/2; dg.add(hb)
              hitMap.current.set(hb, {player:pl, team:key})
            } else {
              let useTex: THREE.CanvasTexture, emCol: number, emInt: number
              if (role.includes('bowl'))     { useTex=texBow; emCol=p.bowler;     emInt=0.38+ns*1.1 }
              else if (role.includes('all')) { useTex=texAll; emCol=p.allrounder; emInt=0.36+ns*1.0 }
              else                           { useTex=texBat; emCol=p.batsman;    emInt=0.36+ns*1.2 }
              const mat = new THREE.MeshStandardMaterial({map:useTex, emissiveMap:useTex, emissive:new THREE.Color(emCol), emissiveIntensity:emInt})
              const bldg = makeBuildingGroup(shape, w, h, mat)
              bldg.position.set(px, 0, pz); dg.add(bldg)
              const hb = new THREE.Mesh(new THREE.BoxGeometry(w*1.2, h, w*1.2), new THREE.MeshBasicMaterial({visible:false}))
              hb.position.set(px, h/2, pz); hb.userData.halfH = h/2; dg.add(hb)
              hitMap.current.set(hb, {player:pl, team:key})
            }
          })
        })
      })
      setLoading(false)
    }
    build()
  }, [fmt])

  /* ── DRONE TOGGLE ────────────────────────────────── */
  const toggleDrone = () => {
    const next = !droneMode
    droneModeRef.current = next
    setDroneMode(next)
    setSelected(null); setHqOpen(false)
    const scene = sceneRef.current, camera = cameraRef.current
    if (!scene || !camera) return
    if (next) {
      const {group, rotors} = buildDroneMesh()
      group.position.copy(camera.position)
      group.position.y = Math.max(12, camera.position.y)
      group.scale.setScalar(3.0)        // scaled up so it's clearly visible
      droneYawRef.current = Math.PI
      group.userData.city = true
      droneGroupRef.current = group
      droneRotorsRef.current = rotors
      scene.add(group)
    } else {
      if (droneGroupRef.current) {
        scene.remove(droneGroupRef.current)
        droneGroupRef.current.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose() })
        droneGroupRef.current = null
        droneRotorsRef.current = []
      }
      distRef.current = 360; tDistRef.current = 360
    }
  }

  const FMTS = ['TEST','ODI','T20'] as const
  const S    = (x: any, fb: any='—') => x != null ? String(x) : fb

  /* ── JSX ─────────────────────────────────────────── */
  return (
    <div style={{width:'100vw',height:'100vh',background:'#000',position:'relative',overflow:'hidden',userSelect:'none'}}>
      <div ref={mountRef} style={{width:'100%',height:'100%'}}/>

      {/* FIX #6: CRICCITY branding */}
      <div style={{position:'absolute',top:20,left:24,zIndex:10,pointerEvents:'none'}}>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.55rem',fontWeight:700,letterSpacing:'0.22em',color:'#38bdf8',textShadow:'0 0 30px rgba(56,189,248,0.95)'}}>CricCity</div>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.57rem',letterSpacing:'0.32em',color:'#1d4ed8',marginTop:4,textTransform:'uppercase'}}>Cricket City · 3D Visualization</div>
      </div>

      {/* Format Tabs */}
      <div style={{position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',gap:8}}>
        {FMTS.map(f => (
          <button key={f} onClick={() => setFmt(f)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.2em',padding:'8px 22px',borderRadius:5,cursor:'pointer',transition:'all .2s',background:fmt===f?'rgba(56,189,248,0.14)':'rgba(0,6,22,0.72)',border:`1px solid ${fmt===f?'#38bdf8':'#1e3a5f'}`,color:fmt===f?'#7dd3fc':'#1e4d8c',boxShadow:fmt===f?'0 0 20px rgba(56,189,248,0.32)':'none'}}>
            {f}
          </button>
        ))}
      </div>

      {/* Team count pills */}
      {Object.keys(counts).length > 0 && (
        <div style={{position:'absolute',top:70,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',maxWidth:640,pointerEvents:'none'}}>
          {TEAM_LAYOUT.map(({key,label}) => {
            const cnt = counts[key] ?? 0
            const hex = '#'+new THREE.Color(getPal(key).border).getHexString()
            return (
              <span key={key} style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.12em',padding:'2px 9px',borderRadius:3,border:`1px solid ${hex}`,color:hex,background:'rgba(0,4,18,0.75)',opacity:cnt>0?1:0.22}}>
                {label.slice(0,3)}&nbsp;{cnt}
              </span>
            )
          })}
        </div>
      )}

      {/* Drone toggle */}
      <button onClick={toggleDrone} style={{position:'absolute',top:20,right:20,zIndex:15,fontFamily:'"Courier New",monospace',fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.15em',padding:'9px 18px',borderRadius:6,cursor:'pointer',background:droneMode?'rgba(251,191,36,0.2)':'rgba(56,189,248,0.12)',border:`1px solid ${droneMode?'#fbbf24':'#38bdf8'}`,color:droneMode?'#fbbf24':'#7dd3fc',boxShadow:droneMode?'0 0 22px rgba(251,191,36,0.45)':'none'}}>
        {droneMode ? '✕ EXIT DRONE' : '🚁 DRONE MODE'}
      </button>

      {/* Drone controls panel */}
      {droneMode && (
        <div style={{position:'absolute',bottom:28,right:24,zIndex:15,display:'flex',flexDirection:'column',alignItems:'center',gap:6,background:'rgba(0,6,22,0.90)',border:'1px solid rgba(251,191,36,0.45)',borderRadius:12,padding:'14px 18px'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',color:'#fbbf24',letterSp

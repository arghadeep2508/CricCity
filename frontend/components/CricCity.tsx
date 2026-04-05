'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { fetchPlayers } from '@/lib/api'

/* ══════════════════════════════════════════════════════
   TEAM LAYOUT
══════════════════════════════════════════════════════ */
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
type TeamKey = typeof TEAM_LAYOUT[number]['key']

/* ══════════════════════════════════════════════════════
   PALETTES
══════════════════════════════════════════════════════ */
type Pal = { border:number; emissive:number; ground:number; batsman:number; bowler:number; allrounder:number }
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
const getPal = (t:string): Pal => PALETTE[t] ?? FALLBACK

/* ══════════════════════════════════════════════════════
   LAYOUT CONSTANTS
══════════════════════════════════════════════════════ */
const DDIST      = 200   // district center distance from HQ
const RLEN       = 160   // road length
const SLOT       = 5.5   // building spacing (increased — no overlap)
const QUADW      = 28    // each quadrant width/depth
const CROSS_ROAD = 8     // cross road width
const DPADS      = 8     // district padding

/* ══════════════════════════════════════════════════════
   ① SCORING — PARTICIPATION-WEIGHTED (SACHIN FIX)
   Only count formats the player actually played.
   Sachin's near-zero T20 no longer drags him down.
══════════════════════════════════════════════════════ */
type Format = 'test' | 'odi' | 't20'
type AllMax = {
  runs: Record<Format,number>; wkts: Record<Format,number>
  avg:  Record<Format,number>; sr:   Record<Format,number>
  eco:  Record<Format,number>
}

function computeAllMax(players: any[]): AllMax {
  const runs: Record<Format,number> = {test:1,odi:1,t20:1}
  const wkts: Record<Format,number> = {test:1,odi:1,t20:1}
  const avg:  Record<Format,number> = {test:1,odi:1,t20:1}
  const sr:   Record<Format,number> = {test:1,odi:1,t20:1}
  const eco:  Record<Format,number> = {test:0.01,odi:0.01,t20:0.01}
  players.forEach(p => {
    ;(['test','odi','t20'] as Format[]).forEach(f => {
      const b = p.stats?.batting?.[f]  ?? {runs:0,average:0,strike_rate:0}
      const w = p.stats?.bowling?.[f]  ?? {wickets:0,economy:0}
      runs[f] = Math.max(runs[f], b.runs)
      wkts[f] = Math.max(wkts[f], w.wickets)
      avg[f]  = Math.max(avg[f],  b.average)
      sr[f]   = Math.max(sr[f],   b.strike_rate)
      eco[f]  = Math.max(eco[f],  w.economy)
    })
  })
  return {runs,wkts,avg,sr,eco}
}

function fmtScore(p: any, f: Format, mx: AllMax): number {
  const role = (p.personal_info?.role || '').toLowerCase()
  const b = p.stats?.batting?.[f]  ?? {runs:0,average:0,strike_rate:0}
  const w = p.stats?.bowling?.[f]  ?? {wickets:0,economy:0}
  const bR  = b.runs        / mx.runs[f]
  const bAv = b.average     / mx.avg[f]
  const bSR = b.strike_rate / mx.sr[f]
  const wW  = w.wickets / mx.wkts[f]
  const wE  = w.economy > 0 ? Math.min(1,(mx.eco[f]*0.4)/w.economy) : 0
  if (role.includes('bowl')) {
    if (f==='t20') return wW*0.45 + wE*0.55
    if (f==='odi') return wW*0.52 + wE*0.48
    return wW*0.65 + wE*0.35
  }
  if (role.includes('all')) {
    const bs = f==='t20' ? bR*0.3+bAv*0.35+bSR*0.35 : f==='odi' ? bR*0.4+bAv*0.35+bSR*0.25 : bR*0.4+bAv*0.6
    const ws = f==='t20' ? wW*0.45+wE*0.55 : f==='odi' ? wW*0.52+wE*0.48 : wW*0.65+wE*0.35
    return (bs+ws)/2
  }
  if (f==='t20') return bR*0.3 + bAv*0.35 + bSR*0.35
  if (f==='odi') return bR*0.4 + bAv*0.35 + bSR*0.25
  return bR*0.4 + bAv*0.6
}

// KEY FIX: weight only by formats the player actually participated in
function allFormatScore(p: any, mx: AllMax): number {
  const WEIGHTS: Record<Format,number> = {test:0.40, odi:0.35, t20:0.25}
  let total = 0, totalW = 0
  ;(['test','odi','t20'] as Format[]).forEach(f => {
    const b = p.stats?.batting?.[f]
    const w = p.stats?.bowling?.[f]
    const played = (b?.runs??0)>0 || (b?.average??0)>0 || (w?.wickets??0)>0 || (w?.economy??0)>0
    if (played) {
      total  += fmtScore(p, f, mx) * WEIGHTS[f]
      totalW += WEIGHTS[f]
    }
  })
  return totalW > 0 ? total / totalW : 0
}

/* ══════════════════════════════════════════════════════
   ③ BUILDING SHAPES — 5 Archetypes for city variety
══════════════════════════════════════════════════════ */
type Archetype = 'tower' | 'slab' | 'podium' | 'stepped' | 'wedge'

function getArchetype(role: string, ns: number, idx: number): Archetype {
  if (role.includes('bowl')) {
    return (['slab','slab','wedge','stepped'] as Archetype[])[idx % 4]
  }
  if (role.includes('all')) {
    return (['podium','tower','stepped','tower'] as Archetype[])[idx % 4]
  }
  // Batsman
  if (ns > 0.82) return 'tower'
  if (ns > 0.55) return (idx % 2 === 0 ? 'podium' : 'tower') as Archetype
  if (ns > 0.32) return (idx % 3 === 0 ? 'slab' : 'tower') as Archetype
  return (['tower','slab','wedge','stepped'] as Archetype[])[idx % 4]
}

function calcHeight(role: string, ns: number, isLegend: boolean): number {
  const s = Math.max(0, Math.min(1, ns))
  if (isLegend)              return 130 + s * 55
  if (role.includes('bowl')) return  10 + Math.pow(s,1.8)*48   // squat
  if (role.includes('all'))  return  15 + Math.pow(s,1.3)*65   // balanced
  // Batsmen: dramatic skyline variation
  if (s > 0.85) return 105 + s * 32
  if (s > 0.65) return  62 + s * 30
  if (s > 0.40) return  28 + s * 28
  if (s > 0.20) return  14 + s * 20
  return 6 + s * 14
}

function calcDims(role: string, ns: number, isLegend: boolean, arch: Archetype): {w:number;d:number} {
  const s = Math.max(0, Math.min(1, ns))
  if (isLegend)   return {w:8,   d:8}
  if (arch==='slab')   return {w:5.5+s*3.5, d:4+s*2}
  if (arch==='tower')  return {w:2+s*1.8,   d:2+s*1.8}
  if (arch==='podium') return {w:4+s*2,     d:4+s*2}
  if (arch==='stepped') return {w:3.5+s*2,  d:3.5+s*2}
  if (arch==='wedge')  return {w:3+s*2,     d:3+s*2}
  if (role.includes('bowl')) return {w:5+s*2.5, d:5+s*2.5}
  if (role.includes('all'))  return {w:3.5+s*1.8, d:3.5+s*1.8}
  return {w:2.2+s*1.8, d:2.2+s*1.8}
}

/* ══════════════════════════════════════════════════════
   TEXTURES
══════════════════════════════════════════════════════ */
function mkWinTex(hex: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width=128; cv.height=256
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#010810'; ctx.fillRect(0,0,128,256)
  const c = new THREE.Color(hex), rgb = `${~~(c.r*255)},${~~(c.g*255)},${~~(c.b*255)}`
  for (let ci=0; ci<4; ci++) for (let ri=0; ri<14; ri++) {
    const r = Math.random()
    if (r>0.28) {
      ctx.fillStyle = r>0.90 ? '#ffffff' : r>0.65 ? `rgba(${rgb},0.9)` : `rgba(${rgb},0.42)`
      ctx.fillRect(ci*32+2, ri*18+2, 28, 14)
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,2); return t
}

function mkGoldTex(): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width=128; cv.height=256
  const ctx = cv.getContext('2d')!; ctx.fillStyle='#080400'; ctx.fillRect(0,0,128,256)
  for (let ci=0; ci<4; ci++) for (let ri=0; ri<14; ri++) {
    const r = Math.random()
    if (r>0.22) {
      const rr=~~(200+Math.random()*55), gg=~~(130+Math.random()*80)
      ctx.fillStyle = r>0.90 ? '#ffffff' : r>0.60 ? `rgb(${rr},${gg},0)` : `rgba(255,165,0,0.5)`
      ctx.fillRect(ci*32+2, ri*18+2, 28, 14)
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,3); return t
}

/* ══════════════════════════════════════════════════════
   LABEL SPRITE
══════════════════════════════════════════════════════ */
function mkLabel(text: string, colorHex: number, sz=1): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width=480; cv.height=88
  const ctx = cv.getContext('2d')!, hex = '#'+new THREE.Color(colorHex).getHexString()
  ctx.clearRect(0,0,480,88)
  ctx.fillStyle='rgba(0,4,18,0.92)'; ctx.beginPath(); ctx.roundRect(2,4,476,80,10); ctx.fill()
  ctx.strokeStyle=hex; ctx.lineWidth=2.5; ctx.beginPath(); ctx.roundRect(2,4,476,80,10); ctx.stroke()
  ctx.fillStyle=hex; ctx.font='bold 26px "Courier New",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(text,240,46)
  const t = new THREE.CanvasTexture(cv)
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}))
  spr.scale.set(28*sz,7*sz,1); return spr
}

/* ══════════════════════════════════════════════════════
   ④ VISIBLE 3D DRONE MESH
══════════════════════════════════════════════════════ */
function buildDroneMesh(rotorRefs: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group()

  const bodyMat  = new THREE.MeshStandardMaterial({color:0x0d1117, emissive:0x1d4ed8, emissiveIntensity:0.8, metalness:0.9, roughness:0.12})
  const armMat   = new THREE.MeshStandardMaterial({color:0x111827, emissive:0x334155, emissiveIntensity:0.4, metalness:0.85, roughness:0.25})
  const hubMat   = new THREE.MeshStandardMaterial({color:0x1e293b, metalness:0.95, roughness:0.08})
  const blademat = new THREE.MeshStandardMaterial({color:0x334155, transparent:true, opacity:0.55, side:THREE.DoubleSide})
  const ledBlue  = new THREE.MeshStandardMaterial({color:0x38bdf8, emissive:0x38bdf8, emissiveIntensity:10})
  const ledRed   = new THREE.MeshStandardMaterial({color:0xef4444, emissive:0xef4444, emissiveIntensity:10})
  const camMat   = new THREE.MeshStandardMaterial({color:0x0f172a, metalness:1, roughness:0.05})
  const lensMat  = new THREE.MeshStandardMaterial({color:0x1e40af, emissive:0x3b82f6, emissiveIntensity:3, transparent:true, opacity:0.9})

  // — Main octagonal body —
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.72, 8), bodyMat)
  g.add(body)

  // — Top dome —
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 8, 4, 0, Math.PI*2, 0, Math.PI/2),
    new THREE.MeshStandardMaterial({color:0x0a0f1a, emissive:0x38bdf8, emissiveIntensity:0.5, transparent:true, opacity:0.88})
  )
  dome.position.y = 0.38; g.add(dome)

  // — Glow ring around body —
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.0, 0.10, 6, 36),
    new THREE.MeshStandardMaterial({color:0x38bdf8, emissive:0x38bdf8, emissiveIntensity:6})
  )
  ring.rotation.x = Math.PI/2; ring.position.y = 0.18; g.add(ring)

  // — Camera gimbal under body —
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.9), camMat)
  camBox.position.set(0, -0.6, 0.35); g.add(camBox)
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.33, 0.42, 10), lensMat)
  lens.rotation.x = Math.PI/2; lens.position.set(0, -0.6, 0.72); g.add(lens)

  // — 4 diagonal arms + rotors —
  const ARM_LEN = 5.8
  const armAngles = [Math.PI/4, -Math.PI/4, (3*Math.PI)/4, -(3*Math.PI)/4]

  armAngles.forEach((angle, i) => {
    const ax = Math.cos(angle) * ARM_LEN * 0.5
    const az = Math.sin(angle) * ARM_LEN * 0.5

    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(ARM_LEN, 0.28, 0.5), armMat)
    arm.position.set(ax, 0, az); arm.rotation.y = -angle; g.add(arm)

    const hubX = Math.cos(angle) * ARM_LEN
    const hubZ = Math.sin(angle) * ARM_LEN

    // Motor hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.55, 10), hubMat)
    hub.position.set(hubX, 0, hubZ); g.add(hub)

    // Rotor disc (tinted transparent cylinder — spins)
    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 0.06, 12),
      new THREE.MeshStandardMaterial({color:0x1e3a5f, emissive:0x60a5fa, emissiveIntensity:0.6, transparent:true, opacity:0.5, side:THREE.DoubleSide})
    )
    rotor.position.set(hubX, 0.32, hubZ); g.add(rotor)
    rotorRefs.push(rotor)

    // Two propeller blades
    for (let b=0; b<2; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 0.38), blademat)
      blade.position.set(hubX, 0.35, hubZ)
      blade.rotation.y = b * Math.PI/2
      g.add(blade)
      rotorRefs.push(blade)
    }

    // Corner LED
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), i < 2 ? ledBlue : ledRed)
    led.position.set(hubX, 0.42, hubZ); g.add(led)
  })

  // — Landing gear (4 legs) —
  ;([[ 1.5, 1.5],[ 1.5,-1.5],[-1.5, 1.5],[-1.5,-1.5]] as [number,number][]).forEach(([xs,zs]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.3, 6),
      new THREE.MeshStandardMaterial({color:0x1e293b, metalness:0.8}))
    leg.position.set(xs, -0.9, zs); g.add(leg)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.14),
      new THREE.MeshStandardMaterial({color:0x334155}))
    foot.position.set(xs, -1.58, zs); g.add(foot)
  })

  return g
}

/* ══════════════════════════════════════════════════════
   ① ELABORATE ICC HEADQUARTER
══════════════════════════════════════════════════════ */
function buildHQ(
  diamondRef: React.MutableRefObject<THREE.Mesh|null>,
  hqHitRef:   React.MutableRefObject<THREE.Mesh|null>
): THREE.Group {
  const g = new THREE.Group()

  const baseMat   = new THREE.MeshStandardMaterial({color:0x0f1e33, emissive:0x1d4ed8, emissiveIntensity:0.55, metalness:0.6})
  const coreMat   = new THREE.MeshStandardMaterial({color:0x040c1c, emissive:0x38bdf8, emissiveIntensity:1.0,  metalness:0.85})
  const accentMat = new THREE.MeshStandardMaterial({color:0x0a1628, emissive:0x60a5fa, emissiveIntensity:1.3})
  const glowMat   = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0x7dd3fc, emissiveIntensity:6})
  const dmMat     = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0x7dd3fc, emissiveIntensity:6, transparent:true, opacity:0.95})
  const mkGlow = (c:number, ei:number) => new THREE.MeshStandardMaterial({color:c, emissive:new THREE.Color(c), emissiveIntensity:ei})

  // ── Grand octagonal plaza ──
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(30,33,3,8), new THREE.MeshStandardMaterial({color:0x060e1e, emissive:0x1d4ed8, emissiveIntensity:0.3, metalness:0.5}))
  plaza.position.y = 1.5; g.add(plaza)

  // Plaza glowing rim
  ;[29.5, 32.5].forEach(r => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.45, 8, 80), mkGlow(0x38bdf8, r<31?5:2))
    rim.rotation.x=Math.PI/2; rim.position.y=3.1; g.add(rim)
  })

  // 8 outer perimeter pillars
  for (let i=0; i<8; i++) {
    const a = i*Math.PI/4
    const px=Math.cos(a)*26.5, pz=Math.sin(a)*26.5
    // Pillar shaft
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.6,14,8), accentMat)
    pillar.position.set(px,10,pz); g.add(pillar)
    // Pillar cap cone
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8,3.5,8), glowMat)
    cap.position.set(px,18,pz); g.add(cap)
    // LED sphere
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.7,8,8), mkGlow(0x38bdf8,8))
    led.position.set(px,20,pz); g.add(led)
    // Vertical glow strip on pillar
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2,14,0.2), mkGlow(0x38bdf8,4))
    strip.position.set(px,10,pz); g.add(strip)
  }

  // ── Stepped octagonal podium (5 tiers) ──
  const tiers = [
    {r:22, h:4,   y:5},
    {r:18, h:3.5, y:9.75},
    {r:14, h:3,   y:13.25},
    {r:11, h:2.5, y:16.5},
    {r:8.5,h:2,   y:19.25},
  ]
  tiers.forEach(({r,h,y}) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r,r+1.8,h,8), baseMat)
    m.position.y=y; g.add(m)
    // Step edge glow
    const edgeRing = new THREE.Mesh(new THREE.TorusGeometry(r,0.35,6,48), mkGlow(0x38bdf8,3.5))
    edgeRing.rotation.x=Math.PI/2; edgeRing.position.y=y+h/2+0.2; g.add(edgeRing)
  })

  // ── Main tower ──
  const TOWER_BOT = 21
  const tower = new THREE.Mesh(new THREE.BoxGeometry(11,85,11), coreMat)
  tower.position.y = TOWER_BOT+42.5; g.add(tower)

  // Vertical edge glow strips on tower corners
  ;([[5.7,5.7],[-5.7,5.7],[5.7,-5.7],[-5.7,-5.7]] as [number,number][]).forEach(([x,z]) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.28,85,0.28), mkGlow(0x38bdf8,5))
    strip.position.set(x, TOWER_BOT+42.5, z); g.add(strip)
  })

  // Horizontal cross-beams every 18 units
  for (let i=0; i<5; i++) {
    const yy = TOWER_BOT + 14 + i*17
    ;[true,false].forEach(horiz => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(horiz?22:1.4, 1.5, horiz?1.4:22), accentMat)
      beam.position.y=yy; g.add(beam)
    })
    // Beacon at cross-beam ends
    ;[[11.5,0],[-11.5,0],[0,11.5],[0,-11.5]].forEach(([bx,bz]) => {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.6,8,8), mkGlow(0x60a5fa,4))
      bead.position.set(bx,yy,bz); g.add(bead)
    })
  }

  // ── 4 corner buttress towers ──
  ;([[8,8],[8,-8],[-8,8],[-8,-8]] as [number,number][]).forEach(([x,z]) => {
    const bt = new THREE.Mesh(new THREE.BoxGeometry(4.2,60,4.2), accentMat)
    bt.position.set(x, TOWER_BOT+30, z); g.add(bt)
    // Buttress edge strips
    const es = new THREE.Mesh(new THREE.BoxGeometry(0.2,60,0.2), mkGlow(0x60a5fa,3))
    es.position.set(x, TOWER_BOT+30, z); g.add(es)
    // Spire
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4,14,8), glowMat)
    spire.position.set(x, TOWER_BOT+65, z); g.add(spire)
    // Red aviation blink marker
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.65,8,8), new THREE.MeshStandardMaterial({color:0xff2222,emissive:0xff0000,emissiveIntensity:8}))
    marker.position.set(x, TOWER_BOT+72.5, z); g.add(marker)
  })

  // ── Upper taper + antenna ──
  const taper = new THREE.Mesh(new THREE.CylinderGeometry(2.8,5.8,30,8), coreMat)
  taper.position.y = TOWER_BOT+103; g.add(taper)
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.35,1.4,24,6), glowMat)
  ant.position.y = TOWER_BOT+131; g.add(ant)

  // ── Spinning diamond topper ──
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(6,0), dmMat)
  diamond.position.y = TOWER_BOT+150; g.add(diamond)
  diamondRef.current = diamond

  // Halo rings around diamond
  for (let i=0; i<3; i++) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(9+i*3.5, 0.28, 6, 48), mkGlow(0x38bdf8, 3-i*0.6))
    halo.rotation.x = i*Math.PI/3; halo.position.y = TOWER_BOT+150; g.add(halo)
  }

  // ── Holographic nameplate sprite ──
  const sc = document.createElement('canvas'); sc.width=768; sc.height=140
  const sCtx = sc.getContext('2d')!
  const grad = sCtx.createLinearGradient(0,0,768,0)
  grad.addColorStop(0,'rgba(0,8,32,0.97)'); grad.addColorStop(0.5,'rgba(0,22,65,0.99)'); grad.addColorStop(1,'rgba(0,8,32,0.97)')
  sCtx.fillStyle=grad; sCtx.fillRect(0,0,768,140)
  sCtx.strokeStyle='#38bdf8'; sCtx.lineWidth=2.5; sCtx.strokeRect(4,4,760,132)
  sCtx.strokeStyle='rgba(56,189,248,0.28)'; sCtx.lineWidth=9; sCtx.strokeRect(4,4,760,132)
  ;[[0,0],[730,0],[0,108],[730,108]].forEach(([cx,cy]) => {
    sCtx.strokeStyle='#7dd3fc'; sCtx.lineWidth=2.5; sCtx.strokeRect(cx+4,cy+4,30,26)
  })
  sCtx.shadowColor='#38bdf8'; sCtx.shadowBlur=28
  sCtx.fillStyle='#e0f2fe'; sCtx.font='bold 58px "Courier New",monospace'; sCtx.textAlign='center'; sCtx.textBaseline='middle'
  sCtx.fillText('ICC HEADQUARTER',384,58)
  sCtx.shadowBlur=0
  sCtx.fillStyle='rgba(96,165,250,0.7)'; sCtx.font='15px "Courier New",monospace'
  sCtx.fillText('INTERNATIONAL CRICKET COUNCIL  ·  EST. 1909',384,104)
  const signTex = new THREE.CanvasTexture(sc)
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({map:signTex,transparent:true,depthTest:false}))
  sign.scale.set(54,14,1); sign.position.set(0,40,0); g.add(sign)

  // Top label
  const topLbl = mkLabel('⬡ ICC WORLD HQ',0x38bdf8,1.1)
  topLbl.position.set(0,TOWER_BOT+168,0); g.add(topLbl)

  // Invisible hitbox for click detection
  const hb = new THREE.Mesh(new THREE.BoxGeometry(34,TOWER_BOT+158,34), new THREE.MeshBasicMaterial({visible:false}))
  hb.position.y=(TOWER_BOT+158)/2; g.add(hb); hqHitRef.current=hb

  return g
}

/* ══════════════════════════════════════════════════════
   COUNTRY NORMALISER
══════════════════════════════════════════════════════ */
function normalizeCountry(p: any): string {
  const raw = (p.country||p.team||p.personal_info?.country||p.personal_info?.team||p.nationality||'')
    .toString().toLowerCase().trim()
  if (!raw) return 'world'
  if (raw.includes('india')  || raw==='ind')             return 'india'
  if (raw.includes('eng')    || raw==='eng')             return 'england'
  if (raw.includes('aus')    || raw==='aus')             return 'australia'
  if (raw.includes('south')  || raw==='sa'||raw==='rsa') return 'south africa'
  if (raw.includes('zealand')|| raw.includes('nz')||raw==='nzl') return 'new zealand'
  if (raw.includes('afghan') || raw==='afg')             return 'afghanistan'
  if (raw.includes('sri')    || raw==='slc'||raw==='sl') return 'sri lanka'
  if (raw.includes('west')   || raw.includes('windies')||raw==='wi') return 'west indies'
  return 'world'
}

/* ══════════════════════════════════════════════════════
   ③ ROAD BUILDER — polished with center line + posts
══════════════════════════════════════════════════════ */
function buildRoad(scene: THREE.Scene, angle: number, roadLen: number, color: number) {
  const rg = new THREE.Group(); rg.rotation.y=-angle; rg.userData.city=true
  const startX=28, midX=startX+roadLen/2

  const road = new THREE.Mesh(new THREE.PlaneGeometry(roadLen,11),
    new THREE.MeshStandardMaterial({color:0x020a18,emissive:new THREE.Color(color),emissiveIntensity:0.18}))
  road.rotation.x=-Math.PI/2; road.position.set(midX,0.16,0); rg.add(road)

  ;[-5.2,5.2].forEach(z => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(roadLen,0.45),
      new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:4}))
    edge.rotation.x=-Math.PI/2; edge.position.set(midX,0.18,z); rg.add(edge)
  })

  const dashCount=10, dashLen=roadLen/dashCount/2
  for (let i=0; i<dashCount; i++) {
    const x=startX+(i+0.5)*(roadLen/dashCount)
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(dashLen,0.28),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:1.5}))
    dash.rotation.x=-Math.PI/2; dash.position.set(x,0.19,0); rg.add(dash)
  }

  const lampMat  = new THREE.MeshStandardMaterial({color:0x334155, emissive:0x334155, emissiveIntensity:0.3})
  const glowMat2 = new THREE.MeshStandardMaterial({color:0xffffff, emissive:new THREE.Color(color), emissiveIntensity:5})
  for (let i=1; i<5; i++) {
    const lx = startX+i*(roadLen/5)
    ;[-7.5,7.5].forEach(z => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,10,6), lampMat)
      pole.position.set(lx,5,z); rg.add(pole)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.18,0.18), lampMat)
      arm.position.set(lx,10.4,z); rg.add(arm)
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5,8,8), glowMat2)
      glow.position.set(lx,10.8,z); rg.add(glow)
    })
  }
  scene.add(rg)
}

/* ══════════════════════════════════════════════════════
   STRONG BORDER
══════════════════════════════════════════════════════ */
function addStrongBorder(parent: THREE.Group, w: number, d: number, color: number) {
  const mat = new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:2.2})
  const WH=5, WT=1.4
  ;[d/2,-d/2].forEach(z => { const m=new THREE.Mesh(new THREE.BoxGeometry(w+WT,WH,WT),mat); m.position.set(0,WH/2,z); parent.add(m) })
  ;[w/2,-w/2].forEach(x => { const m=new THREE.Mesh(new THREE.BoxGeometry(WT,WH,d+WT),mat); m.position.set(x,WH/2,0); parent.add(m) })
  const pMat = new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:4})
  ;([[w/2,d/2],[w/2,-d/2],[-w/2,d/2],[-w/2,-d/2]] as [number,number][]).forEach(([px,pz]) => {
    const pill=new THREE.Mesh(new THREE.BoxGeometry(2.4,9,2.4),pMat); pill.position.set(px,4.5,pz); parent.add(pill)
    const top=new THREE.Mesh(new THREE.SphereGeometry(1.3,8,8),new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:7}))
    top.position.set(px,9.8,pz); parent.add(top)
    const cone=new THREE.Mesh(new THREE.ConeGeometry(0.7,2.2,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:9}))
    cone.position.set(px,11.5,pz); parent.add(cone)
  })
}

/* ══════════════════════════════════════════════════════
   DISPOSE
══════════════════════════════════════════════════════ */
function disposeCity(scene: THREE.Scene, sharedGeo: THREE.BufferGeometry) {
  scene.children.filter(o=>o.userData.city).forEach(obj => {
    obj.traverse(child => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh && !(child as any).isSprite) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach(m => {
        if (!m) return
        ;['map','emissiveMap','normalMap','alphaMap'].forEach(k => {
          const t=(m as any)[k]; if(t instanceof THREE.Texture) t.dispose()
        })
        m.dispose()
      })
      if (mesh.geometry && mesh.geometry!==sharedGeo) mesh.geometry.dispose()
    })
    scene.remove(obj)
  })
}

/* ══════════════════════════════════════════════════════
   ③ MULTI-ARCHETYPE BUILDING PLACER
══════════════════════════════════════════════════════ */
type PlaceParams = {
  parent: THREE.Group; px:number; pz:number
  h:number; w:number; d:number; arch: Archetype
  mat: THREE.Material; isLegend: boolean
  player: any; team: string
  hitMap: Map<THREE.Mesh,{player:any;team:string}>
  goldTex: THREE.CanvasTexture; unitGeo: THREE.BoxGeometry
}

function placeBuilding({parent,px,pz,h,w,d,arch,mat,isLegend,player,team,hitMap,goldTex,unitGeo}: PlaceParams) {
  // Shared invisible hitbox (always accurate regardless of visual shape)
  const hbGeo  = new THREE.BoxGeometry(Math.max(w,d)*1.2, h, Math.max(w,d)*1.2)
  const hbMesh = new THREE.Mesh(hbGeo, new THREE.MeshBasicMaterial({visible:false}))
  hbMesh.position.set(px,h/2,pz); hbMesh.userData.halfH=h/2; parent.add(hbMesh)
  hitMap.set(hbMesh, {player, team})

  const mkM = (color:number, ei:number) => new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:ei})

  if (isLegend) {
    // Gold tower
    const goldMat = new THREE.MeshStandardMaterial({map:goldTex,emissiveMap:goldTex,emissive:new THREE.Color(0xffaa00),emissiveIntensity:2.4})
    const shaft = new THREE.Mesh(unitGeo, goldMat); shaft.scale.set(w,h*0.78,w); shaft.position.set(px,h*0.39,pz); parent.add(shaft)
    const tapGeo = new THREE.CylinderGeometry(w*0.22,w*0.48,h*0.18,8)
    const tap = new THREE.Mesh(tapGeo, new THREE.MeshStandardMaterial({color:0xffcc00,emissive:0xffaa00,emissiveIntensity:4}))
    tap.position.set(px, h*0.78+h*0.09, pz); parent.add(tap)
    const sp = new THREE.Mesh(new THREE.ConeGeometry(w*0.16,h*0.12,6), new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffd700,emissiveIntensity:9}))
    sp.position.set(px, h*0.78+h*0.18+h*0.06, pz); parent.add(sp)
    // Ring halo at mid height
    const haloR = new THREE.Mesh(new THREE.TorusGeometry(w,0.3,6,32), mkM(0xffaa00,3.5))
    haloR.rotation.x=-Math.PI/2; haloR.position.set(px,h*0.5,pz); parent.add(haloR)
    // Name label
    const nm=(player.name||player.full_name||'LEGEND').toUpperCase()
    const ll=mkLabel(`★ ${nm}`,0xffd700,0.72); ll.position.set(px,h+24,pz); parent.add(ll)
    return
  }

  switch (arch) {
    case 'tower': {
      // Sleek tall box + thin antenna
      const mesh=new THREE.Mesh(unitGeo,mat); mesh.scale.set(w,h,d); mesh.position.set(px,h/2,pz); parent.add(mesh)
      const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.3,h*0.14,6), mkM(0x60a5fa,3))
      ant.position.set(px,h+h*0.07,pz); parent.add(ant)
      break
    }
    case 'slab': {
      // Wide flat slab + rooftop mechanical boxes
      const mesh=new THREE.Mesh(unitGeo,mat); mesh.scale.set(w,h,d); mesh.position.set(px,h/2,pz); parent.add(mesh)
      const box=new THREE.Mesh(new THREE.BoxGeometry(w*0.45,h*0.12,d*0.45), mkM(0x1e293b,0.8))
      box.position.set(px,h+h*0.06,pz); parent.add(box)
      break
    }
    case 'podium': {
      // Wide base + narrower tower
      const podW=w*1.65, podH=h*0.28
      const pod=new THREE.Mesh(unitGeo,mat); pod.scale.set(podW,podH,podW); pod.position.set(px,podH/2,pz); parent.add(pod)
      const tH=h*0.72, tW=w*0.62
      const tow=new THREE.Mesh(unitGeo,mat); tow.scale.set(tW,tH,tW); tow.position.set(px,podH+tH/2,pz); parent.add(tow)
      break
    }
    case 'stepped': {
      // 3 stepped tiers — widest at bottom
      let curY=0
      for (let t=0; t<3; t++) {
        const tW=w*(1-t*0.3), tH=h/3
        const tier=new THREE.Mesh(unitGeo,mat); tier.scale.set(tW,tH,tW); tier.position.set(px,curY+tH/2,pz); parent.add(tier)
        curY+=tH
      }
      break
    }
    case 'wedge': {
      // Box + cylinder drum on top (like a water tower / cooling tower)
      const baseH=h*0.68
      const base=new THREE.Mesh(unitGeo,mat); base.scale.set(w,baseH,d); base.position.set(px,baseH/2,pz); parent.add(base)
      const cyl=new THREE.Mesh(new THREE.CylinderGeometry(w*0.52,w*0.52,h*0.32,10), mat as THREE.Material)
      cyl.position.set(px,baseH+h*0.16,pz); parent.add(cyl)
      break
    }
  }
}

/* ══════════════════════════════════════════════════════
   FLAG MAP
══════════════════════════════════════════════════════ */
const FLAG: Record<string,string> = {
  india:'🇮🇳', australia:'🇦🇺', england:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'south africa':'🇿🇦',
  'new zealand':'🇳🇿', afghanistan:'🇦🇫', 'sri lanka':'🇱🇰', 'west indies':'🏝️',
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT — CricCity
══════════════════════════════════════════════════════ */
export default function CricCity() {
  const mountRef     = useRef<HTMLDivElement>(null)
  const sceneRef     = useRef<THREE.Scene|null>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer|null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera|null>(null)
  const diamondRef   = useRef<THREE.Mesh|null>(null)
  const hqHitRef     = useRef<THREE.Mesh|null>(null)
  const indicatorRef = useRef<THREE.Mesh|null>(null)
  const hitMap       = useRef<Map<THREE.Mesh,{player:any;team:string}>>(new Map())
  const unitGeo      = useRef<THREE.BoxGeometry>(new THREE.BoxGeometry(1,1,1))
  const allMaxRef    = useRef<AllMax|null>(null)

  // Drone refs
  const droneGroupRef  = useRef<THREE.Group|null>(null)
  const droneRotorRefs = useRef<THREE.Object3D[]>([])

  // Orbit state
  const distRef  = useRef(300)
  const tDistRef = useRef(300)

  // Drone state
  const droneModeRef = useRef(false)
  const droneYawRef  = useRef(0)
  const keysRef      = useRef<Set<string>>(new Set())
  const droneBtnsRef = useRef({fwd:false,back:false,left:false,right:false,up:false,down:false})

  const [fmt,       setFmt     ] = useState<'TEST'|'ODI'|'T20'>('TEST')
  const [loading,   setLoading ] = useState(false)
  const [selected,  setSelected] = useState<any>(null)
  const [hqOpen,    setHqOpen  ] = useState(false)
  const [counts,    setCounts  ] = useState<Record<string,number>>({})
  const [droneMode, setDroneMode] = useState(false)

  /* ══ SCENE INIT ══ */
  useEffect(() => {
    if (!mountRef.current) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000810)
    scene.fog = new THREE.FogExp2(0x00060e, 0.00085)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth/window.innerHeight, 0.1, 8000)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'})
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    rendererRef.current = renderer
    mountRef.current.appendChild(renderer.domElement)

    // Build 3D drone mesh (hidden until drone mode)
    const rotors: THREE.Object3D[] = []
    const droneG = buildDroneMesh(rotors)
    droneG.scale.set(2.5,2.5,2.5)   // scale up for visibility
    droneG.visible = false
    droneG.userData.isDrone = true
    scene.add(droneG)
    droneGroupRef.current = droneG
    droneRotorRefs.current = rotors

    // Orbit state
    let theta=0.85, phi=0.36, drag=false, lx=0, ly=0
    const camUpdate = () => {
      if (droneModeRef.current) return
      const d = distRef.current
      camera.position.set(
        d*Math.sin(theta)*Math.cos(phi),
        d*Math.sin(phi),
        d*Math.cos(theta)*Math.cos(phi)
      )
      camera.lookAt(0,0,0)
    }
    camUpdate()

    const onDown  = (e:PointerEvent) => { if(droneModeRef.current) return; drag=true; lx=e.clientX; ly=e.clientY }
    const onMove  = (e:PointerEvent) => {
      if (!drag || droneModeRef.current) return
      theta -= (e.clientX-lx)*0.004
      phi    = Math.max(0.05, Math.min(1.48, phi-(e.clientY-ly)*0.004))
      lx=e.clientX; ly=e.clientY
    }
    const onUp    = () => { drag=false }
    const onWheel = (e:WheelEvent) => {
      e.preventDefault()
      if (droneModeRef.current) {
        const d = droneGroupRef.current
        if (d) d.position.y = Math.max(5, Math.min(220, d.position.y + e.deltaY*0.05))
      } else {
        tDistRef.current = Math.max(15, Math.min(1200, tDistRef.current*Math.exp(e.deltaY*0.001)))
      }
    }
    const onKeyDown = (e:KeyboardEvent) => keysRef.current.add(e.key.toLowerCase())
    const onKeyUp   = (e:KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('keydown',     onKeyDown)
    window.addEventListener('keyup',       onKeyUp)
    renderer.domElement.addEventListener('wheel', onWheel, {passive:false})

    // Lights
    scene.add(new THREE.AmbientLight(0x0d1f40, 2.6))
    const dir = new THREE.DirectionalLight(0x3366ff, 1.4); dir.position.set(100,280,100); scene.add(dir)
    scene.add(new THREE.PointLight(0xff5500,0.3,900))
    const center = new THREE.PointLight(0x38bdf8,1.1,700); center.position.set(0,50,0); scene.add(center)

    // Ground
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(9000,9000), new THREE.MeshStandardMaterial({color:0x010810}))
    gnd.rotation.x=-Math.PI/2; scene.add(gnd)
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(1900,1900,95,95), new THREE.MeshBasicMaterial({color:0x091830,wireframe:true}))
    grid.rotation.x=-Math.PI/2; grid.position.y=0.06; scene.add(grid)

    // ② Outer ring — taller + richer
    const OUTER_R=252
    // Main tall glowing torus
    const mainTorus = new THREE.Mesh(new THREE.TorusGeometry(OUTER_R,3.5,10,100),
      new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x38bdf8,emissiveIntensity:4}))
    mainTorus.rotation.x=Math.PI/2; mainTorus.position.y=4; scene.add(mainTorus)
    // Inner ring
    const innerTorus = new THREE.Mesh(new THREE.TorusGeometry(OUTER_R-8,1.2,8,100),
      new THREE.MeshStandardMaterial({color:0x1d4ed8,emissive:0x1d4ed8,emissiveIntensity:2}))
    innerTorus.rotation.x=Math.PI/2; innerTorus.position.y=1; scene.add(innerTorus)
    // Outer glow ring (slightly larger)
    const outerGlow = new THREE.Mesh(new THREE.TorusGeometry(OUTER_R+7,0.7,6,100),
      new THREE.MeshStandardMaterial({color:0x60a5fa,emissive:0x60a5fa,emissiveIntensity:1.5}))
    outerGlow.rotation.x=Math.PI/2; outerGlow.position.y=2; scene.add(outerGlow)
    // 32 perimeter pillars with glow tops
    for (let i=0; i<32; i++) {
      const a=i*Math.PI/16
      const px=Math.cos(a)*OUTER_R, pz=Math.sin(a)*OUTER_R
      const tall = i%4===0, mid = i%2===0
      const pH = tall?20:mid?13:8, pEi = tall?3:mid?1.5:0.7
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(tall?1.2:0.7, tall?1.5:0.9, pH, 6),
        new THREE.MeshStandardMaterial({color:0x1e3a5f,emissive:0x38bdf8,emissiveIntensity:pEi})
      )
      pillar.position.set(px,pH/2,pz); scene.add(pillar)
      if (tall || mid) {
        const glob = new THREE.Mesh(new THREE.SphereGeometry(tall?1.0:0.6,8,8),
          new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x38bdf8,emissiveIntensity:tall?8:5}))
        glob.position.set(px,pH+0.8,pz); scene.add(glob)
      }
    }

    // Animate loop
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)

      if (droneModeRef.current && droneGroupRef.current) {
        const drone = droneGroupRef.current
        const keys  = keysRef.current
        const btns  = droneBtnsRef.current
        const SPEED     = 1.1     // reduced — feels controlled
        const YAW_SPEED = 0.020

        // Yaw
        if (keys.has('arrowleft') ||keys.has('a')||btns.left)  droneYawRef.current -= YAW_SPEED
        if (keys.has('arrowright')||keys.has('d')||btns.right)  droneYawRef.current += YAW_SPEED

        const yaw = droneYawRef.current
        // Forward vector: +Z local maps to (sin,0,cos) in world at yaw
        const fwd = new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw))

        const movingFwd  = keys.has('arrowup')  ||keys.has('w')||btns.fwd
        const movingBack = keys.has('arrowdown') ||keys.has('s')||btns.back

        if (movingFwd)  drone.position.addScaledVector(fwd,  SPEED)
        if (movingBack) drone.position.addScaledVector(fwd, -SPEED*0.55)
        if (keys.has('q')||btns.up)   drone.position.y += SPEED*0.6
        if (keys.has('e')||btns.down) drone.position.y  = Math.max(4, drone.position.y-SPEED*0.6)

        drone.position.clampScalar(-450,450)
        drone.position.y = Math.max(4, Math.min(220, drone.position.y))

        // Drone faces direction of travel
        drone.rotation.y = yaw

        // Realistic tilt — pitch forward when flying, straighten when idle
        const targetPitch = movingFwd ? -0.24 : movingBack ? 0.14 : 0
        drone.rotation.x += (targetPitch - drone.rotation.x)*0.12

        // Bank (roll) when turning
        const turning = (keys.has('a')||btns.left) ? 1 : (keys.has('d')||btns.right) ? -1 : 0
        drone.rotation.z += (turning*0.18 - drone.rotation.z)*0.1

        // Third-person camera follows drone from behind/above
        const camDist=18, camHeight=10
        const behind = new THREE.Vector3(-Math.sin(yaw)*camDist, camHeight, -Math.cos(yaw)*camDist)
        camera.position.lerp(drone.position.clone().add(behind), 0.1)
        camera.lookAt(drone.position.clone().add(new THREE.Vector3(0,2,0)))

        // Spin rotors
        droneRotorRefs.current.forEach(r => { r.rotation.y += 0.45 })

      } else {
        distRef.current += (tDistRef.current-distRef.current)*0.12
        camUpdate()
      }

      if (diamondRef.current)   diamondRef.current.rotation.y   += 0.012
      if (indicatorRef.current) indicatorRef.current.rotation.y += 0.028

      renderer.render(scene,camera)
    }
    animate()

    const onResize = () => {
      camera.aspect = window.innerWidth/window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth,window.innerHeight)
    }
    window.addEventListener('resize',onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('pointerdown',onDown); window.removeEventListener('pointermove',onMove)
      window.removeEventListener('pointerup',onUp);     window.removeEventListener('keydown',onKeyDown)
      window.removeEventListener('keyup',onKeyUp);      window.removeEventListener('resize',onResize)
      renderer.domElement.removeEventListener('wheel',onWheel)
      disposeCity(scene,unitGeo.current); unitGeo.current.dispose(); renderer.dispose()
      mountRef.current?.removeChild(renderer.domElement)
    }
  },[])

  /* ══ CLICK RAYCASTER ══ */
  useEffect(() => {
    const renderer=rendererRef.current, camera=cameraRef.current, scene=sceneRef.current
    if (!renderer||!camera||!scene) return
    const rc=new THREE.Raycaster(), mo=new THREE.Vector2()

    const onClick = (e:MouseEvent) => {
      if (droneModeRef.current) return
      mo.x = (e.clientX/window.innerWidth)*2-1
      mo.y = -(e.clientY/window.innerHeight)*2+1
      rc.setFromCamera(mo,camera)

      if (hqHitRef.current) {
        const h = rc.intersectObject(hqHitRef.current,false)
        if (h.length>0) { setHqOpen(true); setSelected(null); return }
      }

      const hits = rc.intersectObjects(Array.from(hitMap.current.keys()),false)
      if (hits.length>0) {
        const obj = hits[0].object as THREE.Mesh
        const data = hitMap.current.get(obj); if (!data) return
        setSelected({...data.player, _team:data.team}); setHqOpen(false)
        if (indicatorRef.current) scene.remove(indicatorRef.current)
        const ind = new THREE.Mesh(new THREE.OctahedronGeometry(2.8,0),
          new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x7dd3fc,emissiveIntensity:5}))
        const wp = new THREE.Vector3(); obj.getWorldPosition(wp)
        ind.position.set(wp.x, wp.y+(obj.userData.halfH??5)+5, wp.z)
        ind.userData.city=true; indicatorRef.current=ind; scene.add(ind)
      } else {
        setSelected(null); setHqOpen(false)
        if (indicatorRef.current) { scene.remove(indicatorRef.current); indicatorRef.current=null }
      }
    }
    renderer.domElement.addEventListener('click',onClick)
    return () => renderer.domElement.removeEventListener('click',onClick)
  },[])

  /* ══ BUILD CITY ══ */
  useEffect(() => {
    async function build() {
      const scene = sceneRef.current; if (!scene) return
      setLoading(true); setSelected(null); setHqOpen(false); hitMap.current.clear()
      if (indicatorRef.current) { scene.remove(indicatorRef.current); indicatorRef.current=null }
      disposeCity(scene,unitGeo.current)

      const players: any[] = await fetchPlayers(fmt)
      if (players.length>0) console.log('[CricCity] sample:', JSON.stringify(players[0],null,2))

      const mx = computeAllMax(players)
      allMaxRef.current = mx

      const grouped: Record<string,any[]> = {}
      players.forEach(p => { const k=normalizeCountry(p); if (!grouped[k]) grouped[k]=[]; grouped[k].push(p) })
      const snap: Record<string,number> = {}
      Object.entries(grouped).forEach(([k,v]) => { snap[k]=v.length })
      setCounts(snap)

      // HQ
      const hq = buildHQ(diamondRef,hqHitRef); hq.userData.city=true; scene.add(hq)
      // Hub disc
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(32,32,1.2,8),
        new THREE.MeshStandardMaterial({color:0x0a1628,emissive:0x1d4ed8,emissiveIntensity:0.55}))
      hub.position.y=0.6; hub.userData.city=true; scene.add(hub)

      const goldTex = mkGoldTex()

      // 8 Districts
      TEAM_LAYOUT.forEach(({key,angle,label}) => {
        const p  = getPal(key)
        buildRoad(scene,angle,RLEN,p.border)

        const raw    = grouped[key] || []
        const sorted = [...raw].sort((a,b) => allFormatScore(b,mx)-allFormatScore(a,mx))
        const n      = sorted.length
        const scores = sorted.map(pl => allFormatScore(pl,mx))
        const sMax   = scores.length>0 ? Math.max(...scores) : 1
        const sMin   = scores.length>0 ? Math.min(...scores) : 0
        const sRange = Math.max(sMax-sMin,0.001)

        // Build a quick rank map for O(1) lookup
        const rankMap = new Map<any,number>()
        sorted.forEach((pl,i) => rankMap.set(pl,i))

        // District group
        const cx = Math.cos(angle)*DDIST, cz = Math.sin(angle)*DDIST
        const dg = new THREE.Group()
        dg.position.set(cx,0,cz); dg.rotation.y=-angle; dg.userData.city=true; scene.add(dg)

        // — District plate dimensions —
        const platW = QUADW*2 + CROSS_ROAD + DPADS*2
        const platD = platW

        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(platW,platD),
          new THREE.MeshStandardMaterial({color:new THREE.Color(p.ground),emissive:new THREE.Color(p.border),emissiveIntensity:n>0?0.08:0.02})
        )
        plate.rotation.x=-Math.PI/2; plate.position.y=0.1; dg.add(plate)
        addStrongBorder(dg,platW,platD,p.border)

        // Country label
        const lbl = mkLabel(`${FLAG[key]||'🏏'} ${label}  (${n})`,p.border)
        lbl.position.set(0,34,-(platD/2+16)); dg.add(lbl)

        // ③ Cross roads (N-S and E-W through district center)
        const roadMat = new THREE.MeshStandardMaterial({color:0x020a18,emissive:new THREE.Color(p.border),emissiveIntensity:0.12})
        const hRoad   = new THREE.Mesh(new THREE.PlaneGeometry(platW,CROSS_ROAD), roadMat)
        hRoad.rotation.x=-Math.PI/2; hRoad.position.set(0,0.15,0); dg.add(hRoad)
        const vRoad   = new THREE.Mesh(new THREE.PlaneGeometry(CROSS_ROAD,platD), roadMat)
        vRoad.rotation.x=-Math.PI/2; vRoad.position.set(0,0.15,0); dg.add(vRoad)

        // Road dashes
        ;[{horiz:true,len:platW},{horiz:false,len:platD}].forEach(({horiz,len}) => {
          for (let i=0; i<8; i++) {
            const pos = (-len/2)+(i+0.5)*(len/8)
            const dash = new THREE.Mesh(
              horiz ? new THREE.PlaneGeometry(len/20,0.28) : new THREE.PlaneGeometry(0.28,len/20),
              new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:1.5})
            )
            dash.rotation.x=-Math.PI/2
            dash.position.set(horiz?pos:0, 0.16, horiz?0:pos)
            dg.add(dash)
          }
        })

        // Central plaza circle
        const plaza = new THREE.Mesh(new THREE.CylinderGeometry(CROSS_ROAD*0.62,CROSS_ROAD*0.62,0.5,12),
          new THREE.MeshStandardMaterial({color:0x0a1628,emissive:new THREE.Color(p.border),emissiveIntensity:0.9}))
        plaza.position.y=0.25; dg.add(plaza)
        const pRing = new THREE.Mesh(new THREE.TorusGeometry(CROSS_ROAD*0.62,0.28,6,32),
          new THREE.MeshStandardMaterial({color:p.border,emissive:new THREE.Color(p.border),emissiveIntensity:5}))
        pRing.rotation.x=Math.PI/2; pRing.position.y=0.55; dg.add(pRing)

        if (n===0) return

        // — Quadrant offsets (center of each quadrant) —
        const qOff = CROSS_ROAD/2 + QUADW/2   // = 4+14 = 18
        const quadrantCenters: [number,number][] = [
          [ qOff,  qOff],   // NE
          [-qOff,  qOff],   // NW
          [ qOff, -qOff],   // SE
          [-qOff, -qOff],   // SW
        ]

        // Distribute round-robin so top players spread across quadrants
        const quads: any[][] = [[],[],[],[]]
        sorted.forEach((pl,i) => quads[i%4].push(pl))

        const texBat=mkWinTex(p.batsman), texBow=mkWinTex(p.bowler), texAll=mkWinTex(p.allrounder)

        quads.forEach((qPlayers,qi) => {
          const [qox,qoz] = quadrantCenters[qi]
          const qn = qPlayers.length
          if (qn===0) return

          // Grid dimensions for this quadrant
          const qCols = Math.ceil(Math.sqrt(qn))
          const qRows = Math.ceil(qn/qCols)
          const halfGX = (qCols-1)*SLOT/2
          const halfGZ = (qRows-1)*SLOT/2

          qPlayers.forEach((player,idx) => {
            const globalIdx = rankMap.get(player) ?? 0
            const isLegend  = globalIdx === 0

            const col = idx % qCols
            const row = Math.floor(idx/qCols)
            const posX = qox + (col*SLOT - halfGX)
            const posZ = qoz + (row*SLOT - halfGZ)

            const ns   = (scores[globalIdx]-sMin)/sRange
            const role = (player.personal_info?.role||'').toLowerCase()
            const arch: Archetype = isLegend ? 'tower' : getArchetype(role,ns,idx)
            const h    = calcHeight(role,ns,isLegend)
            const {w,d} = calcDims(role,ns,isLegend,arch)

            let mat: THREE.Material
            if (role.includes('bowl')) mat=new THREE.MeshStandardMaterial({map:texBow,emissiveMap:texBow,emissive:new THREE.Color(p.bowler),emissiveIntensity:0.45+ns*1.15})
            else if (role.includes('all')) mat=new THREE.MeshStandardMaterial({map:texAll,emissiveMap:texAll,emissive:new THREE.Color(p.allrounder),emissiveIntensity:0.42+ns*1.05})
            else mat=new THREE.MeshStandardMaterial({map:texBat,emissiveMap:texBat,emissive:new THREE.Color(p.emissive),emissiveIntensity:0.42+ns*1.2})

            placeBuilding({parent:dg,px:posX,pz:posZ,h,w,d,arch,mat,isLegend,player,team:key,hitMap:hitMap.current,goldTex,unitGeo:unitGeo.current})
          })
        })
      })

      setLoading(false)
    }
    build()
  },[fmt])

  /* ══ JSX ══ */
  const FMTS = ['TEST','ODI','T20'] as const
  const S = (x:any,y:any) => String(x??y??'—')

  const toggleDrone = () => {
    const next = !droneMode
    droneModeRef.current = next
    const drone = droneGroupRef.current
    if (next && drone) {
      const cam = cameraRef.current
      if (cam) {
        drone.position.copy(cam.position)
        drone.position.y = Math.max(25, cam.position.y)
      }
      droneYawRef.current = 0
      drone.visible = true
    } else if (drone) {
      drone.visible = false
    }
    setDroneMode(next)
  }

  return (
    <div style={{width:'100vw',height:'100vh',background:'#000',position:'relative',overflow:'hidden',userSelect:'none'}}>
      <div ref={mountRef} style={{width:'100%',height:'100%'}} />

      {/* ⑥ TITLE — CricCity */}
      <div style={{position:'absolute',top:20,left:24,zIndex:10,pointerEvents:'none'}}>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.5rem',fontWeight:700,letterSpacing:'0.25em',color:'#38bdf8',textShadow:'0 0 30px rgba(56,189,248,0.95)'}}>
          CRICCITY
        </div>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',letterSpacing:'0.32em',color:'#1d4ed8',marginTop:4}}>
          CRICKET CITY · 3D VISUALIZATION
        </div>
      </div>

      {/* FORMAT TABS */}
      <div style={{position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',gap:8}}>
        {FMTS.map(f => (
          <button key={f} onClick={()=>setFmt(f)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.2em',padding:'8px 22px',borderRadius:5,cursor:'pointer',transition:'all .2s',background:fmt===f?'rgba(56,189,248,0.14)':'rgba(0,6,22,0.72)',border:`1px solid ${fmt===f?'#38bdf8':'#1e3a5f'}`,color:fmt===f?'#7dd3fc':'#1e4d8c',boxShadow:fmt===f?'0 0 20px rgba(56,189,248,0.32)':'none'}}>{f}</button>
        ))}
      </div>

      {/* TEAM COUNT PILLS */}
      {Object.keys(counts).length>0 && (
        <div style={{position:'absolute',top:70,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',maxWidth:600,pointerEvents:'none'}}>
          {TEAM_LAYOUT.map(({key,label}) => {
            const cnt = counts[key]??0
            const hex = '#'+new THREE.Color(getPal(key).border).getHexString()
            return (
              <span key={key} style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.12em',padding:'2px 9px',borderRadius:3,border:`1px solid ${hex}`,color:hex,background:'rgba(0,4,18,0.75)',opacity:cnt>0?1:0.22}}>
                {label.slice(0,3)}&nbsp;{cnt}
              </span>
            )
          })}
        </div>
      )}

      {/* ④ DRONE BUTTON */}
      <button onClick={toggleDrone} style={{position:'absolute',top:20,right:20,zIndex:15,fontFamily:'"Courier New",monospace',fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.15em',padding:'9px 20px',borderRadius:6,cursor:'pointer',transition:'all .25s',background:droneMode?'rgba(251,191,36,0.22)':'rgba(56,189,248,0.12)',border:`1px solid ${droneMode?'#fbbf24':'#38bdf8'}`,color:droneMode?'#fbbf24':'#7dd3fc',boxShadow:droneMode?'0 0 24px rgba(251,191,36,0.45)':'none'}}>
        {droneMode ? '✕ EXIT DRONE' : '🚁 DRONE MODE'}
      </button>

      {/* DRONE CONTROLS */}
      {droneMode && (
        <div style={{position:'absolute',bottom:36,right:22,zIndex:15,display:'flex',flexDirection:'column',alignItems:'center',gap:7,background:'rgba(0,4,18,0.88)',border:'1px solid rgba(251,191,36,0.35)',borderRadius:10,padding:'14px 16px'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.56rem',color:'#fbbf24',letterSpacing:'0.18em',marginBottom:2}}>DRONE CONTROLS</div>
          <div style={{display:'grid',gridTemplateColumns:'40px 40px 40px',gridTemplateRows:'40px 40px 40px',gap:5}}>
            <div/><button onPointerDown={()=>{droneBtnsRef.current.fwd=true}} onPointerUp={()=>{droneBtnsRef.current.fwd=false}} onPointerLeave={()=>{droneBtnsRef.current.fwd=false}} style={{...dBtn}}>▲</button><div/>
            <button onPointerDown={()=>{droneBtnsRef.current.left=true}} onPointerUp={()=>{droneBtnsRef.current.left=false}} onPointerLeave={()=>{droneBtnsRef.current.left=false}} style={{...dBtn}}>◀</button>
            <button onPointerDown={()=>{droneBtnsRef.current.back=true}} onPointerUp={()=>{droneBtnsRef.current.back=false}} onPointerLeave={()=>{droneBtnsRef.current.back=false}} style={{...dBtn,fontSize:'0.55rem'}}>■</button>
            <button onPointerDown={()=>{droneBtnsRef.current.right=true}} onPointerUp={()=>{droneBtnsRef.current.right=false}} onPointerLeave={()=>{droneBtnsRef.current.right=false}} style={{...dBtn}}>▶</button>
            <div/><button onPointerDown={()=>{droneBtnsRef.current.back=true}} onPointerUp={()=>{droneBtnsRef.current.back=false}} onPointerLeave={()=>{droneBtnsRef.current.back=false}} style={{...dBtn}}>▼</button><div/>
          </div>
          <div style={{display:'flex',gap:7,marginTop:2}}>
            <button onPointerDown={()=>{droneBtnsRef.current.up=true}} onPointerUp={()=>{droneBtnsRef.current.up=false}} onPointerLeave={()=>{droneBtnsRef.current.up=false}} style={{...dBtn,width:58,fontSize:'0.62rem'}}>↑ UP</button>
            <button onPointerDown={()=>{droneBtnsRef.current.down=true}} onPointerUp={()=>{droneBtnsRef.current.down=false}} onPointerLeave={()=>{droneBtnsRef.current.down=false}} style={{...dBtn,width:58,fontSize:'0.62rem'}}>↓ DN</button>
          </div>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.48rem',color:'rgba(251,191,36,0.55)',letterSpacing:'0.1em',marginTop:2}}>WASD / ARROWS · Q↑ E↓ · SCROLL HEIGHT</div>
        </div>
      )}

      {/* LEGEND KEY */}
      <div style={{position:'absolute',bottom:52,left:20,zIndex:10,pointerEvents:'none',background:'rgba(0,4,18,0.88)',border:'1px solid #1e3a5f',borderRadius:8,padding:'10px 14px'}}>
        {[
          {c:'#60a5fa', t:'BATSMAN    · Tower (Tall & Sleek)'},
          {c:'#f87171', t:'BOWLER     · Slab / Wedge (Squat)'},
          {c:'#4ade80', t:'ALL-ROUND  · Podium / Stepped'},
          {c:'#ffd700', t:'★ LEGEND   · Top by All-Format Score'},
        ].map(({c,t}) => (
          <div key={t} style={{display:'flex',alignItems:'center',gap:7,marginBottom:5,fontFamily:'"Courier New",monospace',fontSize:'0.5rem',letterSpacing:'0.08em',color:c}}>
            <span style={{width:8,height:8,background:c,borderRadius:1,flexShrink:0}}/>{t}
          </div>
        ))}
      </div>

      {/* LOADING */}
      {loading && (
        <div style={{position:'absolute',inset:0,zIndex:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,4,16,0.78)',backdropFilter:'blur(6px)'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.05rem',letterSpacing:'0.32em',color:'#38bdf8',animation:'cwP 1.2s infinite'}}>BUILDING CRICCITY...</div>
          <div style={{display:'flex',gap:6,marginTop:20}}>
            {[0,1,2,3,4].map(i => <div key={i} style={{width:6,height:6,background:'#38bdf8',borderRadius:'50%',animation:`cwB 0.8s ${i*0.12}s infinite`}}/>)}
          </div>
        </div>
      )}

      {/* HQ CARD */}
      {hqOpen && (
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:15,width:440,borderRadius:14,overflow:'hidden',background:'linear-gradient(135deg,rgba(0,8,32,0.97),rgba(0,20,60,0.97))',border:'1px solid #38bdf8',boxShadow:'0 0 65px rgba(56,189,248,0.38)',backdropFilter:'blur(14px)'}}>
          <div style={{background:'linear-gradient(90deg,rgba(56,189,248,0.16),rgba(29,78,216,0.26))',padding:'18px 20px',borderBottom:'1px solid rgba(56,189,248,0.2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.1rem',fontWeight:700,color:'#e0f2fe',letterSpacing:'0.15em'}}>⬡ ICC HEADQUARTER</div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.6rem',color:'#60a5fa',letterSpacing:'0.2em',marginTop:3}}>INTERNATIONAL CRICKET COUNCIL · EST. 1909</div>
            </div>
            <button onClick={()=>setHqOpen(false)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.65rem',color:'#60a5fa',background:'none',border:'1px solid #1e3a5f',borderRadius:4,padding:'4px 10px',cursor:'pointer'}}>ESC</button>
          </div>
          <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(56,189,248,0.1)',display:'flex',gap:22,alignItems:'center'}}>
            {[{v:Object.values(counts).reduce((a,b)=>a+b,0),l:'TOTAL PLAYERS',c:'#38bdf8'},{v:8,l:'NATIONS',c:'#60a5fa'},{v:'TEST·ODI·T20',l:'FORMATS',c:'#7dd3fc'}].map(({v,l,c},i) => (
              <div key={l} style={{textAlign:'center',flex:1}}>
                {i>0 && <div style={{position:'absolute'}}/>}
                <div style={{fontFamily:'"Courier New",monospace',fontSize:typeof v==='number'?'1.9rem':'1.0rem',fontWeight:700,color:c}}>{v}</div>
                <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.5rem',color:'#1e4d8c',letterSpacing:'0.14em'}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'12px 18px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {TEAM_LAYOUT.map(({key,label}) => {
              const cnt=counts[key]??0
              const hex='#'+new THREE.Color(getPal(key).border).getHexString()
              const total=Object.values(counts).reduce((a,b)=>a+b,0)
              const pct=cnt>0?Math.round((cnt/Math.max(1,total))*100):0
              return (
                <div key={key} style={{background:`${hex}14`,border:`1px solid ${hex}42`,borderRadius:6,padding:'8px 10px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',color:hex,fontWeight:700,letterSpacing:'0.08em'}}>{FLAG[key]||'🏏'} {label}</span>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.78rem',color:'#fff',fontWeight:700}}>{cnt}</span>
                  </div>
                  <div style={{marginTop:5,height:3,background:'rgba(255,255,255,0.08)',borderRadius:2}}>
                    <div style={{height:'100%',width:`${pct}%`,background:hex,borderRadius:2,boxShadow:`0 0 6px ${hex}`}}/>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{padding:'8px 18px 14px',fontFamily:'"Courier New",monospace',fontSize:'0.49rem',color:'#1e4d8c',textAlign:'center',letterSpacing:'0.14em'}}>
            CLICK ANY BUILDING TO VIEW PLAYER STATS · ★ GOLD = LEGEND PERFORMER
          </div>
        </div>
      )}

      {/* PLAYER CARD */}
      {selected && (() => {
        const p  = getPal(selected._team)
        const thx = '#'+new THREE.Color(p.border).getHexString()
        const role = (selected.personal_info?.role||'batsman').toLowerCase()
        const roleLabel = role.includes('bowl')?'BOWLER':role.includes('all')?'ALL-ROUNDER':'BATSMAN'
        const roleColor = role.includes('bowl')?'#f87171':role.includes('all')?'#4ade80':'#60a5fa'
        const initials  = (selected.name||selected.full_name||'?').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()
        const mx = allMaxRef.current
        const combinedPct = mx ? Math.round(allFormatScore(selected,mx)*100) : 0

        return (
          <div style={{position:'absolute',top:20,right:droneMode?undefined:20,left:droneMode?20:undefined,zIndex:15,width:330,borderRadius:14,overflow:'hidden',background:'linear-gradient(160deg,rgba(0,6,22,0.97),rgba(0,12,38,0.97))',border:`1px solid ${thx}`,boxShadow:`0 0 44px ${thx}55,0 0 90px ${thx}18`,backdropFilter:'blur(14px)'}}>
            <div style={{height:4,background:`linear-gradient(90deg,transparent,${thx},transparent)`}}/>
            <div style={{padding:'16px 18px',background:`linear-gradient(135deg,${thx}22,transparent)`}}>
              <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:`linear-gradient(135deg,${thx}44,${thx}22)`,border:`2px solid ${thx}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 0 18px ${thx}66`}}>
                  <span style={{fontFamily:'"Courier New",monospace',fontSize:'1.2rem',fontWeight:700,color:thx}}>{initials}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.93rem',fontWeight:700,color:'#fff',letterSpacing:'0.04em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {selected.name||selected.full_name||'UNKNOWN'}
                  </div>
                  <div style={{display:'flex',gap:6,marginTop:5,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',letterSpacing:'0.18em',color:thx}}>{FLAG[selected._team]||'🏏'} {selected._team?.toUpperCase()}</span>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',color:roleColor,background:`${roleColor}22`,padding:'1px 6px',borderRadius:3,border:`1px solid ${roleColor}55`,letterSpacing:'0.1em'}}>{roleLabel}</span>
                  </div>
                  <div style={{marginTop:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.45rem',color:'#475569',letterSpacing:'0.1em'}}>ALL-FORMAT SCORE</span>
                      <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.5rem',color:thx,fontWeight:700}}>{combinedPct}%</span>
                    </div>
                    <div style={{height:4,background:'rgba(255,255,255,0.08)',borderRadius:2}}>
                      <div style={{height:'100%',width:`${combinedPct}%`,background:`linear-gradient(90deg,${thx}99,${thx})`,borderRadius:2,boxShadow:`0 0 8px ${thx}`}}/>
                    </div>
                  </div>
                </div>
                <button onClick={()=>setSelected(null)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.6rem',letterSpacing:'0.2em',color:'#475569',background:'none',border:'1px solid #1e3a5f',borderRadius:4,padding:'3px 8px',cursor:'pointer',flexShrink:0,marginTop:2}}>ESC</button>
              </div>
            </div>

            <div style={{padding:'0 14px 14px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                {(['test','odi','t20'] as Format[]).map(f => {
                  const isActive = f===fmt.toLowerCase()
                  const bat  = selected.stats?.batting?.[f]  ?? {}
                  const bowl = selected.stats?.bowling?.[f]  ?? {}
                  return (
                    <div key={f} style={{borderRadius:8,padding:'10px 8px',textAlign:'center',background:isActive?`${thx}1a`:'rgba(255,255,255,0.03)',border:`1px solid ${isActive?thx:'#0a1830'}`,transition:'all .2s'}}>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.22em',fontWeight:700,color:isActive?thx:'#1e4d8c',marginBottom:8}}>{f.toUpperCase()}</div>
                      <div style={{fontSize:'1.1rem',fontWeight:700,color:'#e2e8f0'}}>{S(bat.runs,0)}</div>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.4rem',color:'#334155',letterSpacing:'0.1em',marginBottom:4}}>RUNS</div>
                      <div style={{display:'flex',justifyContent:'space-around',marginBottom:6}}>
                        <div><div style={{fontSize:'0.74rem',fontWeight:600,color:'#94a3b8'}}>{S(bat.average,'—')}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>AVG</div></div>
                        <div><div style={{fontSize:'0.74rem',fontWeight:600,color:'#64748b'}}>{S(bat.strike_rate,'—')}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>SR</div></div>
                      </div>
                      <div style={{height:1,background:`${isActive?thx:'#0a1830'}66`,margin:'4px 0'}}/>
                      <div style={{fontSize:'1.1rem',fontWeight:700,color:'#e2e8f0'}}>{S(bowl.wickets,0)}</div>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.4rem',color:'#334155',letterSpacing:'0.1em',marginBottom:4}}>WKTS</div>
                      <div style={{display:'flex',justifyContent:'space-around'}}>
                        <div><div style={{fontSize:'0.72rem',fontWeight:600,color:'#94a3b8'}}>{S(bowl.economy,'—')}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>ECO</div></div>
                        <div><div style={{fontSize:'0.72rem',fontWeight:600,color:'#64748b'}}>{S(bowl.average,'—')}</div><div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>AVG</div></div>
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

      {/* BOTTOM CONTROLS HINT */}
      <div style={{position:'absolute',bottom:20,left:droneMode?undefined:'50%',right:droneMode?20:undefined,transform:droneMode?undefined:'translateX(-50%)',zIndex:10,pointerEvents:'none',textAlign:'center'}}>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.18em',color:'#1e3a5f'}}>
          {droneMode ? 'THIRD-PERSON DRONE · WASD/ARROWS=MOVE · Q/E=HEIGHT · SCROLL=ALT' : 'DRAG=ROTATE · SCROLL=ZOOM · CLICK=STATS · CLICK HQ=INFO'}
        </div>
        {!droneMode && <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.48rem',letterSpacing:'0.14em',color:'#0f2040',marginTop:3}}>★ GOLD=LEGEND (PARTICIPATION-WEIGHTED) · HEIGHT=ALL-FORMAT SCORE · QUADRANT CITY LAYOUT</div>}
      </div>

      <style>{`
        @keyframes cwB{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes cwP{0%,100%{opacity:1}50%{opacity:0.35}}
      `}</style>
    </div>
  )
}

/* Shared drone button style */
const dBtn: React.CSSProperties = {
  width:40,height:40,background:'rgba(251,191,36,0.14)',border:'1px solid rgba(251,191,36,0.45)',
  borderRadius:6,color:'#fbbf24',fontSize:'1rem',cursor:'pointer',
  display:'flex',alignItems:'center',justifyContent:'center',
  userSelect:'none',touchAction:'none',
}

'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { fetchPlayers } from '@/lib/api'

/* ══════════════════════════════════════════════════════
   TEAM LAYOUT
══════════════════════════════════════════════════════ */
const TEAM_LAYOUT = [
  { key: 'sri lanka',    angle:  Math.PI / 2,        label: 'SRI LANKA'    },
  { key: 'afghanistan', angle:  Math.PI / 4,         label: 'AFGHANISTAN'  },
  { key: 'england',     angle:  0,                   label: 'ENGLAND'      },
  { key: 'australia',   angle: -Math.PI / 4,         label: 'AUSTRALIA'    },
  { key: 'india',       angle: -Math.PI / 2,         label: 'INDIA'        },
  { key: 'south africa',angle: -(3*Math.PI)/4,       label: 'SOUTH AFRICA' },
  { key: 'west indies', angle:  Math.PI,             label: 'WEST INDIES'  },
  { key: 'new zealand', angle:  (3*Math.PI)/4,       label: 'NEW ZEALAND'  },
] as const

type TeamKey = typeof TEAM_LAYOUT[number]['key']

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
const FALLBACK:Pal = { border:0x60a5fa, emissive:0x1e40af, ground:0x050d1a, batsman:0x60a5fa, bowler:0xf97316, allrounder:0x34d399 }
const getPal = (t:string):Pal => PALETTE[t] ?? FALLBACK

/* ══════════════════════════════════════════════════════
   LAYOUT CONSTANTS
══════════════════════════════════════════════════════ */
const DDIST  = 195
const RLEN   = 160
const SLOT   = 3.4
const BLOCK  = 5
const STREET = 4.8
const PAD    = 20

/* ══════════════════════════════════════════════════════
   ① COMBINED ALL-FORMAT SCORING
   Building heights use TEST(40%) + ODI(35%) + T20(25%)
   weighted across runs, average, strike-rate, wickets, eco
══════════════════════════════════════════════════════ */
type Format = 'test' | 'odi' | 't20'

type AllMax = {
  runs: Record<Format, number>;
  wkts: Record<Format, number>;
  avg: Record<Format, number>;
  sr: Record<Format, number>;
  eco: Record<Format, number>;
}

function computeAllMax(players: any[]): AllMax {
  const runs: Record<Format, number> = { test: 1, odi: 1, t20: 1 }
  const wkts: Record<Format, number> = { test: 1, odi: 1, t20: 1 }
  const avg: Record<Format, number> = { test: 1, odi: 1, t20: 1 }
  const sr: Record<Format, number> = { test: 1, odi: 1, t20: 1 }
  const eco: Record<Format, number> = { test: 0.01, odi: 0.01, t20: 0.01 }

  players.forEach(p => {
    (['test', 'odi', 't20'] as Format[]).forEach((f) => {
      const b = p.stats?.batting?.[f] ?? { runs: 0, average: 0, strike_rate: 0 }
      const w = p.stats?.bowling?.[f] ?? { wickets: 0, economy: 0 }

      runs[f] = Math.max(runs[f], b.runs)
      wkts[f] = Math.max(wkts[f], w.wickets)
      avg[f] = Math.max(avg[f], b.average)
      sr[f] = Math.max(sr[f], b.strike_rate)
      eco[f] = Math.max(eco[f], w.economy)
    })
  })

  return { runs, wkts, avg, sr, eco }
}

function fmtScore(p: any, f: Format, mx: AllMax): number {
  const role = (p.personal_info?.role || '').toLowerCase()

  const b = p.stats?.batting?.[f] ?? {
    runs: 0,
    average: 0,
    strike_rate: 0,
  }

  const w = p.stats?.bowling?.[f] ?? {
    wickets: 0,
    economy: 0,
  }

  const bR = b.runs / mx.runs[f]
  const bAv = b.average / mx.avg[f]
  const bSR = b.strike_rate / mx.sr[f]

  const wW = w.wickets / mx.wkts[f]
  const wE =
    w.economy > 0
      ? Math.min(1, (mx.eco[f] * 0.4) / w.economy)
      : 0

  if (role.includes('bowl')) {
    if (f === 't20') return wW * 0.45 + wE * 0.55
    if (f === 'odi') return wW * 0.52 + wE * 0.48
    return wW * 0.65 + wE * 0.35
  }

  if (role.includes('all')) {
    const bs =
      f === 't20'
        ? bR * 0.3 + bAv * 0.35 + bSR * 0.35
        : f === 'odi'
        ? bR * 0.4 + bAv * 0.35 + bSR * 0.25
        : bR * 0.4 + bAv * 0.6

    const ws =
      f === 't20'
        ? wW * 0.45 + wE * 0.55
        : f === 'odi'
        ? wW * 0.52 + wE * 0.48
        : wW * 0.65 + wE * 0.35

    return (bs + ws) / 2
  }

  if (f === 't20') return bR * 0.3 + bAv * 0.35 + bSR * 0.35
  if (f === 'odi') return bR * 0.4 + bAv * 0.35 + bSR * 0.25
  return bR * 0.4 + bAv * 0.6
}

function allFormatScore(p:any, mx:AllMax): number {
  return fmtScore(p,'test',mx)*0.40 + fmtScore(p,'odi',mx)*0.35 + fmtScore(p,'t20',mx)*0.25
}

/* ══════════════════════════════════════════════════════
   ② BUILDING DIMENSIONS — score-tier + role variety
══════════════════════════════════════════════════════ */
function calcHeight(role:string, ns:number, isLegend:boolean): number {
  const s=Math.max(0,Math.min(1,ns))
  if (isLegend)              return 110+s*50         // 110-160
  if (role.includes('bowl')) return   7+Math.pow(s,1.8)*42  // 7-49  squat
  if (role.includes('all'))  return  12+Math.pow(s,1.3)*58  // 12-70 balanced
  // Batsman: dramatic tier curve for real skyline variety
  if (s>0.85) return 95+s*30  // super skyscraper
  if (s>0.65) return 55+s*35  // skyscraper
  if (s>0.40) return 25+s*30  // mid-rise
  if (s>0.20) return 12+s*25  // low-rise
  return 5+s*15               // tiny buildings at edge
}
function calcWidth(role:string, ns:number, isLegend:boolean): {w:number;d:number} {
  const s=Math.max(0,Math.min(1,ns))
  if (isLegend)              return {w:7,d:7}
  if (role.includes('bowl')) return {w:5.2+s*2.4,d:5.2+s*2.4}
  if (role.includes('all'))  return {w:3.2+s*1.8,d:3.2+s*1.8}
  // Sleek batsman tower
  return {w:2.0+s*1.8,d:2.0+s*1.8}
}

/* ══════════════════════════════════════════════════════
   GRID HELPERS
══════════════════════════════════════════════════════ */
function slotXZ(col:number,row:number){
  return {x:col*SLOT+Math.floor(col/BLOCK)*STREET, z:row*SLOT+Math.floor(row/BLOCK)*STREET}
}
function axisSpan(n:number){
  if(n<=0)return 0
  return (n-1)*SLOT+Math.max(0,Math.ceil(n/BLOCK)-1)*STREET
}
function centerOut(cols:number,rows:number):[number,number][]{
  const cx=(cols-1)/2,cz=(rows-1)/2
  const pts:{c:number;r:number;d:number}[]=[]
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) pts.push({c,r,d:Math.hypot(c-cx,r-cz)})
  pts.sort((a,b)=>a.d-b.d)
  return pts.map(({c,r})=>[c,r])
}

/* ══════════════════════════════════════════════════════
   COUNTRY NORMALISER
══════════════════════════════════════════════════════ */
function normalizeCountry(p:any):string{
  const raw=(p.country??p.team??p.personal_info?.country??p.personal_info?.team??p.nationality??'').toString().toLowerCase().trim()
  if(!raw) return 'world'
  if(raw.includes('india')||raw==='ind')                         return 'india'
  if(raw.includes('eng')||raw==='eng')                           return 'england'
  if(raw.includes('aus')||raw==='aus')                           return 'australia'
  if(raw.includes('south')||raw==='sa'||raw==='rsa')             return 'south africa'
  if(raw.includes('zealand')||raw.includes('nz')||raw==='nzl')  return 'new zealand'
  if(raw.includes('afghan')||raw==='afg')                        return 'afghanistan'
  if(raw.includes('sri')||raw==='slc'||raw==='sl')               return 'sri lanka'
  if(raw.includes('west')||raw.includes('windies')||raw==='wi')  return 'west indies'
  return 'world'
}

/* ══════════════════════════════════════════════════════
   TEXTURES
══════════════════════════════════════════════════════ */
function mkWinTex(hex:number):THREE.CanvasTexture{
  const cv=document.createElement('canvas'); cv.width=128; cv.height=256
  const ctx=cv.getContext('2d')!
  ctx.fillStyle='#010810'; ctx.fillRect(0,0,128,256)
  const c=new THREE.Color(hex), rgb=`${~~(c.r*255)},${~~(c.g*255)},${~~(c.b*255)}`
  for(let ci=0;ci<4;ci++) for(let ri=0;ri<14;ri++){
    const r=Math.random()
    if(r>0.28){ ctx.fillStyle=r>0.90?'#ffffff':r>0.65?`rgba(${rgb},0.9)`:`rgba(${rgb},0.42)`; ctx.fillRect(ci*32+2,ri*18+2,28,14) }
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,2); return t
}
function mkGoldTex():THREE.CanvasTexture{
  const cv=document.createElement('canvas'); cv.width=128; cv.height=256
  const ctx=cv.getContext('2d')!; ctx.fillStyle='#080400'; ctx.fillRect(0,0,128,256)
  for(let ci=0;ci<4;ci++) for(let ri=0;ri<14;ri++){
    const r=Math.random()
    if(r>0.22){ const rr=~~(200+Math.random()*55),gg=~~(130+Math.random()*80); ctx.fillStyle=r>0.90?'#ffffff':r>0.60?`rgb(${rr},${gg},0)`:`rgba(255,165,0,0.5)`; ctx.fillRect(ci*32+2,ri*18+2,28,14) }
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,3); return t
}

/* ══════════════════════════════════════════════════════
   LABEL SPRITE
══════════════════════════════════════════════════════ */
function mkLabel(text:string, colorHex:number, sz=1):THREE.Sprite{
  const cv=document.createElement('canvas'); cv.width=480; cv.height=88
  const ctx=cv.getContext('2d')!, hex='#'+new THREE.Color(colorHex).getHexString()
  ctx.clearRect(0,0,480,88)
  ctx.fillStyle='rgba(0,4,18,0.92)'; ctx.beginPath(); ctx.roundRect(2,4,476,80,10); ctx.fill()
  ctx.strokeStyle=hex; ctx.lineWidth=2.5; ctx.beginPath(); ctx.roundRect(2,4,476,80,10); ctx.stroke()
  ctx.fillStyle=hex; ctx.font='bold 26px "Courier New",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'
  ctx.fillText(text,240,46)
  const t=new THREE.CanvasTexture(cv), mat=new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false})
  const spr=new THREE.Sprite(mat); spr.scale.set(28*sz,7*sz,1); return spr
}

/* ══════════════════════════════════════════════════════
   ⑥ ICC HEADQUARTER  — cyberpunk nameplate + spire
══════════════════════════════════════════════════════ */
function buildHQ(diamondRef:React.MutableRefObject<THREE.Mesh|null>, hqHitRef:React.MutableRefObject<THREE.Mesh|null>):THREE.Group{
  const g=new THREE.Group()
  const bm=new THREE.MeshStandardMaterial({color:0x0f1e33,emissive:0x1d4ed8,emissiveIntensity:0.5})
  const sm=new THREE.MeshStandardMaterial({color:0x040c1c,emissive:0x38bdf8,emissiveIntensity:0.8})
  const cm=new THREE.MeshStandardMaterial({color:0x040c1c,emissive:0x60a5fa,emissiveIntensity:0.6})
  const dm=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x7dd3fc,emissiveIntensity:4,transparent:true,opacity:0.95})

  // Tiered octagonal base
  ;[{r:22,h:3,y:1.5},{r:18,h:2,y:4},{r:14,h:1.5,y:5.75}].forEach(({r,h,y})=>{
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r+2,h,8),bm); m.position.y=y; g.add(m)
  })
  // Main spire
  const spire=new THREE.Mesh(new THREE.BoxGeometry(10,70,10),sm); spire.position.y=42; g.add(spire)
  // Upper taper
  const top=new THREE.Mesh(new THREE.CylinderGeometry(2,5,22,8),cm); top.position.y=82; g.add(top)
  // Corner towers
  ;([[8,8],[8,-8],[-8,8],[-8,-8]] as [number,number][]).forEach(([x,z])=>{
    const t=new THREE.Mesh(new THREE.BoxGeometry(4,45,4),cm); t.position.set(x,24,z); g.add(t)
    const tc=new THREE.Mesh(new THREE.ConeGeometry(2,8,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x60a5fa,emissiveIntensity:3}))
    tc.position.set(x,50,z); g.add(tc)
  })
  // Glowing diamond topper
  const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(5,0),dm); diamond.position.y=96; g.add(diamond)
  diamondRef.current=diamond

  // ⑥ HEADQUARTER nameplate sprite (faces camera automatically)
  const signCanvas=document.createElement('canvas'); signCanvas.width=640; signCanvas.height=110
  const sCtx=signCanvas.getContext('2d')!
  // Cyberpunk sign background
  const grad=sCtx.createLinearGradient(0,0,640,0)
  grad.addColorStop(0,'rgba(0,8,32,0.95)'); grad.addColorStop(0.5,'rgba(0,20,60,0.98)'); grad.addColorStop(1,'rgba(0,8,32,0.95)')
  sCtx.fillStyle=grad; sCtx.fillRect(0,0,640,110)
  sCtx.strokeStyle='#38bdf8'; sCtx.lineWidth=3; sCtx.strokeRect(3,3,634,104)
  sCtx.strokeStyle='rgba(56,189,248,0.4)'; sCtx.lineWidth=8; sCtx.strokeRect(3,3,634,104)
  // Corner brackets
  ;[[0,0],[620,0],[0,90],[620,90]].forEach(([x,y])=>{
    sCtx.strokeStyle='#7dd3fc'; sCtx.lineWidth=2
    sCtx.strokeRect(x+3,y+3,17,17)
  })
  sCtx.fillStyle='#e0f2fe'; sCtx.font='bold 52px "Courier New",monospace'; sCtx.textAlign='center'; sCtx.textBaseline='middle'
  sCtx.shadowColor='#38bdf8'; sCtx.shadowBlur=18
  sCtx.fillText('HEADQUARTER',320,55)
  sCtx.shadowBlur=0
  sCtx.fillStyle='rgba(56,189,248,0.6)'; sCtx.font='14px "Courier New",monospace'
  sCtx.fillText('ICC · INTERNATIONAL CRICKET COUNCIL',320,90)
  const signTex=new THREE.CanvasTexture(signCanvas)
  const signSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:signTex,transparent:true,depthTest:false}))
  signSpr.scale.set(38,8,1); signSpr.position.set(0,32,0); g.add(signSpr)

  // Invisible hitbox for HQ click detection
  const hb=new THREE.Mesh(new THREE.BoxGeometry(26,96,26),new THREE.MeshBasicMaterial({visible:false}))
  hb.position.y=48; g.add(hb); hqHitRef.current=hb

  return g
}

/* ══════════════════════════════════════════════════════
   ④ STRONG COUNTRY BORDER — thick raised walls
══════════════════════════════════════════════════════ */
function addStrongBorder(parent:THREE.Group, w:number, d:number, color:number){
  const mat=new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:2.2})
  const WALL_H=3.5, WALL_T=1.2
  // 4 walls
  ;[d/2,-d/2].forEach(z=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w+WALL_T,WALL_H,WALL_T),mat); m.position.set(0,WALL_H/2,z); parent.add(m)
  })
  ;[w/2,-w/2].forEach(x=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(WALL_T,WALL_H,d+WALL_T),mat); m.position.set(x,WALL_H/2,0); parent.add(m)
  })
  // Corner pillars (taller)
  const pillarMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:3})
  ;[[w/2,d/2],[w/2,-d/2],[-w/2,d/2],[-w/2,-d/2]].forEach(([x,z])=>{
    const pillar=new THREE.Mesh(new THREE.BoxGeometry(1.8,6,1.8),pillarMat); pillar.position.set(x,3,z); parent.add(pillar)
    // Corner light sphere
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,8,8),new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:5}))
    sphere.position.set(x,6.5,z); parent.add(sphere)
  })
}

/* ══════════════════════════════════════════════════════
   ③ ROAD BUILDER — polished with center line + lights
══════════════════════════════════════════════════════ */
function buildRoad(scene:THREE.Scene, angle:number, roadLength:number, color:number){
  const rg=new THREE.Group(); rg.rotation.y=-angle; rg.userData.city=true
  const startX=26, endX=startX+roadLength
  const midX=startX+roadLength/2

  // Road surface
  const road=new THREE.Mesh(new THREE.PlaneGeometry(roadLength,10),new THREE.MeshStandardMaterial({color:0x020a18,emissive:new THREE.Color(color),emissiveIntensity:0.18}))
  road.rotation.x=-Math.PI/2; road.position.set(midX,0.16,0); rg.add(road)

  // Glowing edge lines
  ;[-4.8,4.8].forEach(z=>{
    const edge=new THREE.Mesh(new THREE.PlaneGeometry(roadLength,0.5),new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:4}))
    edge.rotation.x=-Math.PI/2; edge.position.set(midX,0.18,z); rg.add(edge)
  })

  // Center dashed line (8 segments)
  const dashCount=8, dashLen=roadLength/dashCount/2
  for(let i=0;i<dashCount;i++){
    const x=startX + (i+0.5)*(roadLength/dashCount)
    const dash=new THREE.Mesh(new THREE.PlaneGeometry(dashLen,0.3),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:1.5}))
    dash.rotation.x=-Math.PI/2; dash.position.set(x,0.19,0); rg.add(dash)
  }

  // Road lamp posts
  const lampMat=new THREE.MeshStandardMaterial({color:0x334155,emissive:0x334155,emissiveIntensity:0.3})
  const lampGlowMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:4})
  for(let i=1;i<4;i++){
    const lx=startX+i*(roadLength/4)
    ;[-6,6].forEach(z=>{
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,8,6),lampMat); pole.position.set(lx,4,z); rg.add(pole)
      const glow=new THREE.Mesh(new THREE.SphereGeometry(0.5,8,8),lampGlowMat); glow.position.set(lx,8.2,z); rg.add(glow)
    })
  }

  scene.add(rg)
}

/* ══════════════════════════════════════════════════════
   STREET GRID INSIDE DISTRICT
══════════════════════════════════════════════════════ */
function addStreets(parent:THREE.Group,cols:number,rows:number,offX:number,offZ:number,color:number){
  const mat=new THREE.MeshStandardMaterial({color:0x020810,emissive:new THREE.Color(color),emissiveIntensity:0.15})
  for(let b=1;b<Math.ceil(cols/BLOCK);b++){
    const {x}=slotXZ(b*BLOCK-0.5,0)
    const m=new THREE.Mesh(new THREE.PlaneGeometry(STREET*0.8,axisSpan(rows)+SLOT*2),mat)
    m.rotation.x=-Math.PI/2; m.position.set(x-offX,0.12,0); parent.add(m)
  }
  for(let b=1;b<Math.ceil(rows/BLOCK);b++){
    const {z}=slotXZ(0,b*BLOCK-0.5)
    const m=new THREE.Mesh(new THREE.PlaneGeometry(axisSpan(cols)+SLOT*2,STREET*0.8),mat)
    m.rotation.x=-Math.PI/2; m.position.set(0,0.12,z-offZ); parent.add(m)
  }
}

/* ══════════════════════════════════════════════════════
   DISPOSE
══════════════════════════════════════════════════════ */
function disposeCity(scene:THREE.Scene, sharedGeo:THREE.BufferGeometry){
  scene.children.filter(o=>o.userData.city).forEach(obj=>{
    obj.traverse(child=>{
      const mesh=child as THREE.Mesh
      if(!mesh.isMesh&&!(child as any).isSprite) return
      const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material]
      mats.forEach(m=>{ if(!m) return; ['map','emissiveMap','normalMap','roughnessMap','alphaMap'].forEach(k=>{ const t=(m as any)[k]; if(t instanceof THREE.Texture)t.dispose() }); m.dispose() })
      if(mesh.geometry&&mesh.geometry!==sharedGeo) mesh.geometry.dispose()
    })
    scene.remove(obj)
  })
}

/* ══════════════════════════════════════════════════════
   COUNTRY FLAG EMOJI MAP
══════════════════════════════════════════════════════ */
const FLAG:Record<string,string> = {
  india:'🇮🇳', australia:'🇦🇺', england:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'south africa':'🇿🇦',
  'new zealand':'🇳🇿', afghanistan:'🇦🇫', 'sri lanka':'🇱🇰', 'west indies':'🏝️',
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
export default function CricCity(){
  const mountRef    = useRef<HTMLDivElement>(null)
  const sceneRef    = useRef<THREE.Scene|null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer|null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera|null>(null)
  const diamondRef  = useRef<THREE.Mesh|null>(null)
  const hqHitRef    = useRef<THREE.Mesh|null>(null)
  const indicatorRef= useRef<THREE.Mesh|null>(null)
  const hitMap      = useRef<Map<THREE.Mesh,{player:any;team:string}>>(new Map())
  const unitGeo     = useRef<THREE.BoxGeometry>(new THREE.BoxGeometry(1,1,1))

  // Orbit camera
  const distRef  = useRef(300)
  const tDistRef = useRef(300)

  // ③ Drone camera
  const droneModeRef  = useRef(false)
  const dronePosRef   = useRef(new THREE.Vector3(0,22,280))
  const droneYawRef   = useRef(Math.PI) // start facing city center
  const dronePitchRef = useRef(-0.08)
  const keysRef       = useRef<Set<string>>(new Set())
  const droneBtnsRef  = useRef({fwd:false,back:false,left:false,right:false,up:false,down:false})

  const [fmt,        setFmt       ] = useState<'TEST'|'ODI'|'T20'>('TEST')
  const [loading,    setLoading   ] = useState(false)
  const [selected,   setSelected  ] = useState<any>(null)
  const [hqOpen,     setHqOpen    ] = useState(false)
  const [counts,     setCounts    ] = useState<Record<string,number>>({})
  const [droneMode,  setDroneMode ] = useState(false)

  /* ══════════ SCENE INIT ══════════ */
  useEffect(()=>{
    if(!mountRef.current) return
    const scene=new THREE.Scene()
    scene.background=new THREE.Color(0x000810)
    scene.fog=new THREE.FogExp2(0x00060e,0.0010)
    sceneRef.current=scene

    const camera=new THREE.PerspectiveCamera(55,window.innerWidth/window.innerHeight,0.1,8000)
    cameraRef.current=camera

    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    renderer.setSize(window.innerWidth,window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    rendererRef.current=renderer
    mountRef.current.appendChild(renderer.domElement)

    // Orbit state
    let theta=0.85, phi=0.36, drag=false, lx=0, ly=0

    const camUpdate=()=>{
      if(droneModeRef.current) return
      const d=distRef.current
      camera.position.set(d*Math.sin(theta)*Math.cos(phi),d*Math.sin(phi),d*Math.cos(theta)*Math.cos(phi))
      camera.lookAt(0,0,0)
    }
    camUpdate()

    const onDown =(e:PointerEvent)=>{ if(droneModeRef.current) return; drag=true; lx=e.clientX; ly=e.clientY }
    const onMove =(e:PointerEvent)=>{
      if(!drag||droneModeRef.current) return
      theta-=(e.clientX-lx)*0.004; phi=Math.max(0.05,Math.min(1.48,phi-(e.clientY-ly)*0.004))
      lx=e.clientX; ly=e.clientY
    }
    const onUp   =()=>{ drag=false }
    const onWheel=(e:WheelEvent)=>{
      e.preventDefault()
      if(droneModeRef.current){
        // drone height with scroll
        dronePosRef.current.y=Math.max(5,Math.min(200,dronePosRef.current.y+e.deltaY*0.05))
      } else {
        tDistRef.current=Math.max(15,Math.min(1200,tDistRef.current*Math.exp(e.deltaY*0.001)))
      }
    }

    // Keyboard for drone
    const onKeyDown=(e:KeyboardEvent)=>keysRef.current.add(e.key.toLowerCase())
    const onKeyUp  =(e:KeyboardEvent)=>keysRef.current.delete(e.key.toLowerCase())

    window.addEventListener('pointerdown',onDown)
    window.addEventListener('pointermove',onMove)
    window.addEventListener('pointerup',  onUp)
    window.addEventListener('keydown',    onKeyDown)
    window.addEventListener('keyup',      onKeyUp)
    renderer.domElement.addEventListener('wheel',onWheel,{passive:false})

    // Lights
    scene.add(new THREE.AmbientLight(0x0d1f40,2.6))
    const dir=new THREE.DirectionalLight(0x3366ff,1.4); dir.position.set(100,280,100); scene.add(dir)
    const warm=new THREE.PointLight(0xff5500,0.35,900); warm.position.set(0,-10,0); scene.add(warm)
    // City glow from center
    const centerGlow=new THREE.PointLight(0x38bdf8,0.8,500); centerGlow.position.set(0,30,0); scene.add(centerGlow)

    // Ground
    const gnd=new THREE.Mesh(new THREE.PlaneGeometry(8000,8000),new THREE.MeshStandardMaterial({color:0x010810}))
    gnd.rotation.x=-Math.PI/2; scene.add(gnd)
    // Grid
    const gridMesh=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600,80,80),new THREE.MeshBasicMaterial({color:0x091830,wireframe:true}))
    gridMesh.rotation.x=-Math.PI/2; gridMesh.position.y=0.06; scene.add(gridMesh)

    // ④ Outer circular boundary — torus (real 3D ring)
    const torusMat=new THREE.MeshStandardMaterial({color:0x1e3a5f,emissive:0x38bdf8,emissiveIntensity:0.6})
    const outerTorus=new THREE.Mesh(new THREE.TorusGeometry(248,1.8,8,80),torusMat)
    outerTorus.rotation.x=Math.PI/2; outerTorus.position.y=1; scene.add(outerTorus)
    // Inner ring
    const innerTorus=new THREE.Mesh(new THREE.TorusGeometry(228,0.8,8,80),new THREE.MeshStandardMaterial({color:0x1e3a5f,emissive:0x1d4ed8,emissiveIntensity:0.5}))
    innerTorus.rotation.x=Math.PI/2; innerTorus.position.y=0.5; scene.add(innerTorus)

    // Animate
    let animId:number
    const animate=()=>{
      animId=requestAnimationFrame(animate)

      if(droneModeRef.current){
        const keys=keysRef.current, btns=droneBtnsRef.current
        const speed=2.2, yawSpeed=0.028
        const yaw=droneYawRef.current

        if(keys.has('arrowleft')||keys.has('a')||btns.left)  droneYawRef.current-=yawSpeed
        if(keys.has('arrowright')||keys.has('d')||btns.right) droneYawRef.current+=yawSpeed

        const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw))
        if(keys.has('arrowup')||keys.has('w')||btns.fwd)   dronePosRef.current.addScaledVector(fwd,speed)
        if(keys.has('arrowdown')||keys.has('s')||btns.back) dronePosRef.current.addScaledVector(fwd,-speed*0.6)
        if(keys.has('q')||btns.up)   dronePosRef.current.y+=speed*0.7
        if(keys.has('e')||btns.down) dronePosRef.current.y=Math.max(5,dronePosRef.current.y-speed*0.7)

        // Clamp drone to scene bounds
        dronePosRef.current.clampScalar(-400,400)
        dronePosRef.current.y=Math.max(5,Math.min(200,dronePosRef.current.y))

        const pos=dronePosRef.current
        camera.position.copy(pos)
        const lookFwd=new THREE.Vector3(-Math.sin(yaw),dronePitchRef.current,-Math.cos(yaw))
        camera.lookAt(pos.clone().add(lookFwd.multiplyScalar(20)))
      } else {
        distRef.current+=(tDistRef.current-distRef.current)*0.12
        camUpdate()
      }

      if(diamondRef.current) diamondRef.current.rotation.y+=0.012
      if(indicatorRef.current) indicatorRef.current.rotation.y+=0.028
      renderer.render(scene,camera)
    }
    animate()

    const onResize=()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight) }
    window.addEventListener('resize',onResize)

    return ()=>{
      cancelAnimationFrame(animId)
      window.removeEventListener('pointerdown',onDown); window.removeEventListener('pointermove',onMove)
      window.removeEventListener('pointerup',onUp); window.removeEventListener('keydown',onKeyDown)
      window.removeEventListener('keyup',onKeyUp); window.removeEventListener('resize',onResize)
      renderer.domElement.removeEventListener('wheel',onWheel)
      disposeCity(scene,unitGeo.current); unitGeo.current.dispose(); renderer.dispose()
      mountRef.current?.removeChild(renderer.domElement)
    }
  },[])

  /* ══════════ CLICK RAYCASTER ══════════ */
  useEffect(()=>{
    const renderer=rendererRef.current, camera=cameraRef.current, scene=sceneRef.current
    if(!renderer||!camera||!scene) return
    const rc=new THREE.Raycaster(), mo=new THREE.Vector2()

    const onClick=(e:MouseEvent)=>{
      if(droneModeRef.current) return
      mo.x=(e.clientX/window.innerWidth)*2-1
      mo.y=-(e.clientY/window.innerHeight)*2+1
      rc.setFromCamera(mo,camera)

      // Check HQ first
      if(hqHitRef.current){
        const hqHits=rc.intersectObject(hqHitRef.current,false)
        if(hqHits.length>0){ setHqOpen(true); setSelected(null); return }
      }

      const hits=rc.intersectObjects(Array.from(hitMap.current.keys()),false)
      if(hits.length>0){
        const obj=hits[0].object as THREE.Mesh
        const data=hitMap.current.get(obj); if(!data) return
        setSelected({...data.player,_team:data.team}); setHqOpen(false)
        if(indicatorRef.current) scene.remove(indicatorRef.current)
        const ind=new THREE.Mesh(new THREE.OctahedronGeometry(2.8,0),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x7dd3fc,emissiveIntensity:5}))
        const wp=new THREE.Vector3(); obj.getWorldPosition(wp)
        ind.position.set(wp.x,wp.y+(obj.userData.halfH??5)+5,wp.z)
        ind.userData.city=true; indicatorRef.current=ind; scene.add(ind)
      } else {
        setSelected(null); setHqOpen(false)
        if(indicatorRef.current){scene.remove(indicatorRef.current);indicatorRef.current=null}
      }
    }
    renderer.domElement.addEventListener('click',onClick)
    return ()=>renderer.domElement.removeEventListener('click',onClick)
  },[])

  /* ══════════ BUILD CITY ══════════ */
  useEffect(()=>{
    async function build(){
      const scene=sceneRef.current; if(!scene) return
      setLoading(true); setSelected(null); setHqOpen(false); hitMap.current.clear()
      if(indicatorRef.current){scene.remove(indicatorRef.current);indicatorRef.current=null}
      disposeCity(scene,unitGeo.current)

      const players:any[]=await fetchPlayers(fmt)
      if(players.length>0) console.log('[CricCity] sample:',JSON.stringify(players[0],null,2))

      // ① Combined all-format max
      const mx=computeAllMax(players)

      // Group by country
      const grouped:Record<string,any[]>={}
      players.forEach(p=>{ const k=normalizeCountry(p); if(!grouped[k])grouped[k]=[]; grouped[k].push(p) })
      const countSnap:Record<string,number>={}
      Object.entries(grouped).forEach(([k,v])=>{countSnap[k]=v.length})
      setCounts(countSnap)

      // ⑥ HQ
      const hq=buildHQ(diamondRef,hqHitRef); hq.userData.city=true; scene.add(hq)

      // Hub disk
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(28,28,0.8,8),new THREE.MeshStandardMaterial({color:0x0a1628,emissive:0x1d4ed8,emissiveIntensity:0.4}))
      hub.position.y=0.4; hub.userData.city=true; scene.add(hub)

      const goldTex=mkGoldTex()

      // 8 Districts
      TEAM_LAYOUT.forEach(({key,angle,label})=>{
        const p=getPal(key)

        // ③ Polished road
        buildRoad(scene,angle,RLEN,p.border)

        // Sort players by combined score DESC
        const raw=grouped[key]||[]
        const sorted=[...raw].sort((a,b)=>allFormatScore(b,mx)-allFormatScore(a,mx))
        const n=sorted.length

        const teamScores=sorted.map(pl=>allFormatScore(pl,mx))
        const sMax=teamScores.length>0?Math.max(...teamScores):1
        const sMin=teamScores.length>0?Math.min(...teamScores):0
        const sRange=Math.max(sMax-sMin,0.001)

        // District group
        const cx=Math.cos(angle)*DDIST, cz=Math.sin(angle)*DDIST
        const dg=new THREE.Group(); dg.position.set(cx,0,cz); dg.rotation.y=-angle; dg.userData.city=true; scene.add(dg)

        const cols=n>0?Math.ceil(Math.sqrt(n)):4, rows=n>0?Math.ceil(n/cols):4
        const spanX=axisSpan(cols), spanZ=axisSpan(rows)
        const platW=spanX+PAD, platD=spanZ+PAD, halfX=spanX/2, halfZ=spanZ/2

        // Ground plate
        const plate=new THREE.Mesh(new THREE.PlaneGeometry(platW,platD),new THREE.MeshStandardMaterial({color:new THREE.Color(p.ground),emissive:new THREE.Color(p.border),emissiveIntensity:n>0?0.1:0.02}))
        plate.rotation.x=-Math.PI/2; plate.position.y=0.1; dg.add(plate)

        // ④ Strong border
        addStrongBorder(dg,platW,platD,p.border)

        // Country label
        const lbl=mkLabel(`${label}  (${n})`,p.border)
        lbl.position.set(0,28,-(platD/2+12)); dg.add(lbl)

        if(n===0) return

        addStreets(dg,cols,rows,halfX,halfZ,p.border)
        const slots=centerOut(cols,rows)
        const texBat=mkWinTex(p.batsman), texBow=mkWinTex(p.bowler), texAll=mkWinTex(p.allrounder)

        sorted.forEach((player,idx)=>{
          if(idx>=slots.length) return
          const [col,row]=slots[idx], {x:gx,z:gz}=slotXZ(col,row)
          const posX=gx-halfX, posZ=gz-halfZ
          const ns=(teamScores[idx]-sMin)/sRange
          const isLegend=idx===0
          const role=(player.personal_info?.role||'').toLowerCase()
          const h=calcHeight(role,ns,isLegend)
          const {w,d}=calcWidth(role,ns,isLegend)

          if(isLegend){
            // Legend tower
            const goldMat=new THREE.MeshStandardMaterial({map:goldTex,emissiveMap:goldTex,emissive:new THREE.Color(0xffaa00),emissiveIntensity:2.0})
            const shaft=new THREE.Mesh(unitGeo.current,goldMat); shaft.scale.set(w,h*0.82,w); shaft.position.set(posX,(h*0.82)/2,posZ); dg.add(shaft)
            const taperMat=new THREE.MeshStandardMaterial({color:0xffcc00,emissive:0xffaa00,emissiveIntensity:3.5})
            const taper=new THREE.Mesh(new THREE.CylinderGeometry(w*0.28,w*0.52,h*0.16,8),taperMat); taper.position.set(posX,h*0.82+h*0.08,posZ); dg.add(taper)
            const spMat=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffd700,emissiveIntensity:7})
            const sp=new THREE.Mesh(new THREE.ConeGeometry(w*0.22,h*0.10,6),spMat); sp.position.set(posX,h*0.82+h*0.16+h*0.05,posZ); dg.add(sp)
            const rMat=new THREE.MeshStandardMaterial({color:0xffaa00,emissive:0xffaa00,emissiveIntensity:3,side:THREE.DoubleSide})
            const rMesh=new THREE.Mesh(new THREE.RingGeometry(w*0.85,w*1.15,28),rMat); rMesh.rotation.x=-Math.PI/2; rMesh.position.set(posX,h*0.5,posZ); dg.add(rMesh)
            const nm=(player.name||player.full_name||'').toUpperCase()||'LEGEND'
            const ll=mkLabel(`★ ${nm}`,0xffd700,0.72); ll.position.set(posX,h+20,posZ); dg.add(ll)
            const hb=new THREE.Mesh(new THREE.BoxGeometry(w*1.2,h,w*1.2),new THREE.MeshBasicMaterial({visible:false}))
            hb.position.set(posX,h/2,posZ); hb.userData.halfH=h/2; dg.add(hb)
            hitMap.current.set(hb,{player,team:key})
          } else {
            let useTex:THREE.CanvasTexture, emCol:number, emInt:number
            if(role.includes('bowl')){useTex=texBow;emCol=p.bowler;emInt=0.45+ns*1.15}
            else if(role.includes('all')){useTex=texAll;emCol=p.allrounder;emInt=0.42+ns*1.05}
            else{useTex=texBat;emCol=p.emissive;emInt=0.42+ns*1.2}
            const mat=new THREE.MeshStandardMaterial({map:useTex,emissiveMap:useTex,emissive:new THREE.Color(emCol),emissiveIntensity:emInt})
            const mesh=new THREE.Mesh(unitGeo.current,mat)
            mesh.scale.set(w,h,d); mesh.position.set(posX,h/2,posZ); mesh.userData.halfH=h/2; dg.add(mesh)
            hitMap.current.set(mesh,{player,team:key})
          }
        })
      })
      setLoading(false)
    }
    build()
  },[fmt])

  /* ══════════════════════════════════════════════════════
     JSX
  ══════════════════════════════════════════════════════ */
  const FMTS=['TEST','ODI','T20'] as const
  const S=(x:any,y:any)=>String(x??y??'—')

  const toggleDrone=()=>{
    const next=!droneMode
    droneModeRef.current=next
    if(next){
      // Start drone from current orbit position
      const cam=cameraRef.current
      if(cam) dronePosRef.current.copy(cam.position)
      droneYawRef.current=Math.PI
    }
    setDroneMode(next)
  }

  return (
    <div style={{width:'100vw',height:'100vh',background:'#000',position:'relative',overflow:'hidden',userSelect:'none'}}>
      <div ref={mountRef} style={{width:'100%',height:'100%'}} />

      {/* TITLE */}
      <div style={{position:'absolute',top:20,left:24,zIndex:10,pointerEvents:'none'}}>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.5rem',fontWeight:700,letterSpacing:'0.25em',color:'#38bdf8',textShadow:'0 0 28px rgba(56,189,248,0.9)'}}>CRICWORLD</div>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',letterSpacing:'0.32em',color:'#1d4ed8',marginTop:4,textTransform:'uppercase'}}>Cricket City · 3D Visualization</div>
      </div>

      {/* FORMAT TABS */}
      <div style={{position:'absolute',top:20,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',gap:8}}>
        {FMTS.map(f=>(
          <button key={f} onClick={()=>setFmt(f)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.2em',padding:'8px 22px',borderRadius:5,cursor:'pointer',transition:'all .2s',background:fmt===f?'rgba(56,189,248,0.14)':'rgba(0,6,22,0.72)',border:`1px solid ${fmt===f?'#38bdf8':'#1e3a5f'}`,color:fmt===f?'#7dd3fc':'#1e4d8c',boxShadow:fmt===f?'0 0 20px rgba(56,189,248,0.32)':'none'}}>{f}</button>
        ))}
      </div>

      {/* TEAM COUNT PILLS */}
      {Object.keys(counts).length>0&&(
        <div style={{position:'absolute',top:70,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',maxWidth:580,pointerEvents:'none'}}>
          {TEAM_LAYOUT.map(({key,label})=>{
            const cnt=counts[key]??0, hex='#'+new THREE.Color(getPal(key).border).getHexString()
            return <span key={key} style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.12em',padding:'2px 9px',borderRadius:3,border:`1px solid ${hex}`,color:hex,background:'rgba(0,4,18,0.75)',opacity:cnt>0?1:0.22}}>{label.slice(0,3)}&nbsp;{cnt}</span>
          })}
        </div>
      )}

      {/* ③ DRONE CONTROLS */}
      <button onClick={toggleDrone} style={{position:'absolute',top:20,right:droneMode?'unset':20,left:droneMode?'50%':undefined,transform:droneMode?'translateX(-50%)':undefined,bottom:droneMode?100:undefined,top:droneMode?undefined:20,zIndex:15,fontFamily:'"Courier New",monospace',fontSize:'0.65rem',fontWeight:700,letterSpacing:'0.15em',padding:'8px 18px',borderRadius:5,cursor:'pointer',background:droneMode?'rgba(251,191,36,0.2)':'rgba(56,189,248,0.12)',border:`1px solid ${droneMode?'#fbbf24':'#38bdf8'}`,color:droneMode?'#fbbf24':'#7dd3fc',boxShadow:droneMode?'0 0 20px rgba(251,191,36,0.4)':'none'}}>
        {droneMode?'✕ EXIT DRONE':'🚁 DRONE MODE'}
      </button>

      {droneMode&&(
        <div style={{position:'absolute',bottom:40,left:'50%',transform:'translateX(-50%)',zIndex:15,display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.6rem',color:'#fbbf24',letterSpacing:'0.2em',marginBottom:4}}>DRONE · WASD / ARROW KEYS · Q↑ E↓</div>
          {/* D-PAD */}
          <div style={{display:'grid',gridTemplateColumns:'40px 40px 40px',gridTemplateRows:'40px 40px 40px',gap:4}}>
            {/* Row 1 */}
            <div/>
            <button onPointerDown={()=>{droneBtnsRef.current.fwd=true}} onPointerUp={()=>{droneBtnsRef.current.fwd=false}} onPointerLeave={()=>{droneBtnsRef.current.fwd=false}} style={{...droneBtn,'gridColumn':'2'}}>▲</button>
            <div/>
            {/* Row 2 */}
            <button onPointerDown={()=>{droneBtnsRef.current.left=true}} onPointerUp={()=>{droneBtnsRef.current.left=false}} onPointerLeave={()=>{droneBtnsRef.current.left=false}} style={droneBtn}>◀</button>
            <button onPointerDown={()=>{droneBtnsRef.current.back=true}} onPointerUp={()=>{droneBtnsRef.current.back=false}} onPointerLeave={()=>{droneBtnsRef.current.back=false}} style={{...droneBtn,fontSize:'0.6rem'}}>■</button>
            <button onPointerDown={()=>{droneBtnsRef.current.right=true}} onPointerUp={()=>{droneBtnsRef.current.right=false}} onPointerLeave={()=>{droneBtnsRef.current.right=false}} style={droneBtn}>▶</button>
            {/* Row 3 */}
            <div/>
            <button onPointerDown={()=>{droneBtnsRef.current.back=true}} onPointerUp={()=>{droneBtnsRef.current.back=false}} onPointerLeave={()=>{droneBtnsRef.current.back=false}} style={droneBtn}>▼</button>
            <div/>
          </div>
          {/* Height */}
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button onPointerDown={()=>{droneBtnsRef.current.up=true}} onPointerUp={()=>{droneBtnsRef.current.up=false}} onPointerLeave={()=>{droneBtnsRef.current.up=false}} style={{...droneBtn,width:60,fontSize:'0.7rem'}}>↑ UP</button>
            <button onPointerDown={()=>{droneBtnsRef.current.down=true}} onPointerUp={()=>{droneBtnsRef.current.down=false}} onPointerLeave={()=>{droneBtnsRef.current.down=false}} style={{...droneBtn,width:60,fontSize:'0.7rem'}}>↓ DN</button>
          </div>
        </div>
      )}

      {/* LEGEND KEY */}
      <div style={{position:'absolute',bottom:52,right:20,zIndex:10,pointerEvents:'none',background:'rgba(0,4,18,0.85)',border:'1px solid #1e3a5f',borderRadius:8,padding:'10px 14px'}}>
        {[{c:'#60a5fa',t:'BATSMAN   · Tall & Sleek'},{c:'#f87171',t:'BOWLER    · Wide & Squat'},{c:'#4ade80',t:'ALL-ROUND · Balanced'},{c:'#ffd700',t:'★ LEGEND  · Top Performer'}].map(({c,t})=>(
          <div key={t} style={{display:'flex',alignItems:'center',gap:7,marginBottom:4,fontFamily:'"Courier New",monospace',fontSize:'0.5rem',letterSpacing:'0.08em',color:c}}>
            <span style={{width:8,height:8,background:c,borderRadius:1,flexShrink:0}}/>{t}
          </div>
        ))}
      </div>

      {/* LOADING */}
      {loading&&(
        <div style={{position:'absolute',inset:0,zIndex:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,4,16,0.76)',backdropFilter:'blur(6px)'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'1rem',letterSpacing:'0.32em',color:'#38bdf8',animation:'cwP 1.2s infinite'}}>BUILDING CITY...</div>
          <div style={{display:'flex',gap:6,marginTop:18}}>
            {[0,1,2,3,4].map(i=><div key={i} style={{width:6,height:6,background:'#38bdf8',borderRadius:'50%',animation:`cwB 0.8s ${i*0.12}s infinite`}}/>)}
          </div>
        </div>
      )}

      {/* ⑦ HQ INFO CARD */}
      {hqOpen&&(
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:15,width:420,borderRadius:14,overflow:'hidden',background:'linear-gradient(135deg,rgba(0,8,32,0.97),rgba(0,20,60,0.97))',border:'1px solid #38bdf8',boxShadow:'0 0 60px rgba(56,189,248,0.35)',backdropFilter:'blur(14px)'}}>
          {/* HQ Header */}
          <div style={{background:'linear-gradient(90deg,rgba(56,189,248,0.15),rgba(29,78,216,0.25))',padding:'18px 20px',borderBottom:'1px solid rgba(56,189,248,0.2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.1rem',fontWeight:700,color:'#e0f2fe',letterSpacing:'0.15em'}}>⬡ HEADQUARTER</div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.6rem',color:'#60a5fa',letterSpacing:'0.2em',marginTop:3}}>ICC · INTERNATIONAL CRICKET COUNCIL</div>
            </div>
            <button onClick={()=>setHqOpen(false)} style={{fontFamily:'"Courier New",monospace',fontSize:'0.7rem',color:'#60a5fa',background:'none',border:'1px solid #1e3a5f',borderRadius:4,padding:'4px 10px',cursor:'pointer'}}>ESC</button>
          </div>
          {/* Total */}
          <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(56,189,248,0.1)',display:'flex',gap:20,alignItems:'center'}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.8rem',fontWeight:700,color:'#38bdf8'}}>{Object.values(counts).reduce((a,b)=>a+b,0)}</div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.55rem',color:'#1e4d8c',letterSpacing:'0.15em'}}>TOTAL PLAYERS</div>
            </div>
            <div style={{width:1,height:40,background:'rgba(56,189,248,0.2)'}}/>
            <div style={{textAlign:'center'}}>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.8rem',fontWeight:700,color:'#60a5fa'}}>8</div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.55rem',color:'#1e4d8c',letterSpacing:'0.15em'}}>NATIONS</div>
            </div>
            <div style={{width:1,height:40,background:'rgba(56,189,248,0.2)'}}/>
            <div style={{textAlign:'center'}}>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'1.0rem',fontWeight:700,color:'#7dd3fc',textTransform:'uppercase'}}>TEST·ODI·T20</div>
              <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.55rem',color:'#1e4d8c',letterSpacing:'0.15em'}}>FORMATS</div>
            </div>
          </div>
          {/* Country list */}
          <div style={{padding:'12px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {TEAM_LAYOUT.map(({key,label})=>{
              const cnt=counts[key]??0, hex='#'+new THREE.Color(getPal(key).border).getHexString()
              const pct=cnt>0?Math.round((cnt/Math.max(1,Object.values(counts).reduce((a,b)=>a+b,0)))*100):0
              return (
                <div key={key} style={{background:`${hex}15`,border:`1px solid ${hex}44`,borderRadius:6,padding:'8px 10px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.6rem',color:hex,fontWeight:700,letterSpacing:'0.1em'}}>{FLAG[key]||'🏏'} {label}</span>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.75rem',color:'#fff',fontWeight:700}}>{cnt}</span>
                  </div>
                  <div style={{marginTop:5,height:3,background:'rgba(255,255,255,0.1)',borderRadius:2}}>
                    <div style={{height:'100%',width:`${pct}%`,background:hex,borderRadius:2,boxShadow:`0 0 6px ${hex}`}}/>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{padding:'10px 20px 16px',fontFamily:'"Courier New",monospace',fontSize:'0.5rem',color:'#1e4d8c',textAlign:'center',letterSpacing:'0.15em'}}>
            CLICK ANY BUILDING TO VIEW PLAYER STATS · ★ GOLD = LEGEND PERFORMER
          </div>
        </div>
      )}

      {/* ⑤ ULTRA REALISTIC PLAYER CARD */}
      {selected&&(()=>{
        const p=getPal(selected._team)
        const thx='#'+new THREE.Color(p.border).getHexString()
        const role=(selected.personal_info?.role||'batsman').toLowerCase()
        const roleLabel=role.includes('bowl')?'BOWLER':role.includes('all')?'ALL-ROUNDER':'BATSMAN'
        const roleColor=role.includes('bowl')?'#f87171':role.includes('all')?'#4ade80':'#60a5fa'
        const initials=(selected.name||selected.full_name||'?').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()
        const combinedPct=Math.round(((allFormatScore(selected,computeAllMax([selected]))||0))*100)

        return (
          <div style={{position:'absolute',top:20,right:20,zIndex:15,width:320,borderRadius:14,overflow:'hidden',background:'linear-gradient(160deg,rgba(0,6,22,0.97),rgba(0,12,35,0.97))',border:`1px solid ${thx}`,boxShadow:`0 0 40px ${thx}55,0 0 80px ${thx}20`,backdropFilter:'blur(14px)'}}>
            {/* Team color accent bar */}
            <div style={{height:4,background:`linear-gradient(90deg,transparent,${thx},transparent)`}}/>

            {/* Header */}
            <div style={{padding:'16px 18px',background:`linear-gradient(135deg,${thx}22,transparent)`}}>
              <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>
                {/* Avatar circle */}
                <div style={{width:52,height:52,borderRadius:'50%',background:`linear-gradient(135deg,${thx}44,${thx}22)`,border:`2px solid ${thx}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:`0 0 16px ${thx}66`}}>
                  <span style={{fontFamily:'"Courier New",monospace',fontSize:'1.2rem',fontWeight:700,color:thx}}>{initials}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.92rem',fontWeight:700,color:'#fff',letterSpacing:'0.04em',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {selected.name||selected.full_name||'UNKNOWN'}
                  </div>
                  <div style={{display:'flex',gap:6,marginTop:5,alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',letterSpacing:'0.18em',color:thx,textTransform:'uppercase'}}>{FLAG[selected._team]||'🏏'} {selected._team?.toUpperCase()}</span>
                    <span style={{fontFamily:'"Courier New",monospace',fontSize:'0.58rem',color:roleColor,background:`${roleColor}22`,padding:'1px 6px',borderRadius:3,border:`1px solid ${roleColor}55`,letterSpacing:'0.1em'}}>{roleLabel}</span>
                  </div>
                  {/* All-format performance bar */}
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

            {/* Stats — all 3 formats */}
            <div style={{padding:'0 14px 14px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                {(['test','odi','t20'] as const).map(f=>{
                  const isActive=f===fmt.toLowerCase()
                  const bat=selected.stats?.batting?.[f]??{}
                  const bowl=selected.stats?.bowling?.[f]??{}
                  return (
                    <div key={f} style={{borderRadius:8,padding:'10px 8px',textAlign:'center',background:isActive?`${thx}1a`:'rgba(255,255,255,0.03)',border:`1px solid ${isActive?thx:'#0a1830'}`,transition:'all .2s'}}>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.22em',fontWeight:700,color:isActive?thx:'#1e4d8c',marginBottom:8}}>{f.toUpperCase()}</div>

                      {/* Batting */}
                      <div style={{fontSize:'1.1rem',fontWeight:700,color:'#e2e8f0'}}>{S(bat.runs,0)}</div>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.4rem',color:'#334155',letterSpacing:'0.1em',marginBottom:4}}>RUNS</div>

                      <div style={{display:'flex',justifyContent:'space-around',marginBottom:6}}>
                        <div>
                          <div style={{fontSize:'0.75rem',fontWeight:600,color:'#94a3b8'}}>{S(bat.average,'—')}</div>
                          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>AVG</div>
                        </div>
                        <div>
                          <div style={{fontSize:'0.75rem',fontWeight:600,color:'#64748b'}}>{S(bat.strike_rate,'—')}</div>
                          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>SR</div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{height:1,background:`${isActive?thx:'#0a1830'}66`,margin:'4px 0'}}/>

                      {/* Bowling */}
                      <div style={{fontSize:'1.1rem',fontWeight:700,color:'#e2e8f0'}}>{S(bowl.wickets,0)}</div>
                      <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.4rem',color:'#334155',letterSpacing:'0.1em',marginBottom:4}}>WKTS</div>
                      <div style={{display:'flex',justifyContent:'space-around'}}>
                        <div>
                          <div style={{fontSize:'0.72rem',fontWeight:600,color:'#94a3b8'}}>{S(bowl.economy,'—')}</div>
                          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>ECO</div>
                        </div>
                        <div>
                          <div style={{fontSize:'0.72rem',fontWeight:600,color:'#64748b'}}>{S(bowl.average,'—')}</div>
                          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.38rem',color:'#334155'}}>AVG</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bottom accent */}
            <div style={{height:3,background:`linear-gradient(90deg,transparent,${thx},transparent)`}}/>
          </div>
        )
      })()}

      {/* CONTROLS */}
      <div style={{position:'absolute',bottom:20,left:24,zIndex:10,pointerEvents:'none'}}>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.54rem',letterSpacing:'0.2em',color:'#1e3a5f'}}>
          {droneMode?'WASD/ARROWS · FLY · SCROLL · HEIGHT · ESC · EXIT':'DRAG · ROTATE | SCROLL · ZOOM | CLICK · STATS | CLICK HQ · INFO'}
        </div>
        <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.5rem',letterSpacing:'0.15em',color:'#0f2040',marginTop:3}}>
          ★ GOLD = LEGEND | HEIGHT = ALL-FORMAT PERFORMANCE | CENTER = TOP PLAYERS
        </div>
      </div>

      <style>{`
        @keyframes cwB{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes cwP{0%,100%{opacity:1}50%{opacity:0.35}}
      `}</style>
    </div>
  )
}

/* Shared drone button style */
const droneBtn:React.CSSProperties = {
  width:40,height:40,background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.5)',
  borderRadius:6,color:'#fbbf24',fontSize:'1rem',cursor:'pointer',display:'flex',
  alignItems:'center',justifyContent:'center',userSelect:'none',touchAction:'none',
}

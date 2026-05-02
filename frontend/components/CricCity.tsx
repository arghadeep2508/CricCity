'use client'

import { useEffect, useRef, useState, useCallback, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { fetchPlayers } from '@/lib/api'

/* ═══════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════ */  
type Format   = 'test' | 'odi' | 't20'
type BldShape = 'tower' | 'stepped' | 'cylinder' | 'slab' | 'cruciform' | 'pyramid'
type Pal      = { border:number; emissive:number; ground:number; batsman:number; bowler:number; allrounder:number }
type AllMax   = { runs:Record<Format,number>; wkts:Record<Format,number>; avg:Record<Format,number>; sr:Record<Format,number>; eco:Record<Format,number> }
type FmtTab   = 'TEST' | 'ODI' | 'T20'

/* ═══════════════════════════════════════════════════════
   TEAM LAYOUT & PALETTES
═══════════════════════════════════════════════════════ */
const TEAM_LAYOUT = [
  { key:'sri lanka',    angle: Math.PI/2,      label:'SRI LANKA'    },
  { key:'afghanistan', angle: Math.PI/4,       label:'AFGHANISTAN'  },
  { key:'england',     angle: 0,               label:'ENGLAND'      },
  { key:'australia',   angle:-Math.PI/4,       label:'AUSTRALIA'    },
  { key:'india',       angle:-Math.PI/2,       label:'INDIA'        },
  { key:'south africa',angle:-(3*Math.PI)/4,   label:'SOUTH AFRICA' },
  { key:'west indies', angle: Math.PI,         label:'WEST INDIES'  },
  { key:'new zealand', angle: (3*Math.PI)/4,   label:'NEW ZEALAND'  },
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
const getPal = (t:string): Pal => PALETTE[t] ?? FALLBACK

const FLAG: Record<string,string> = {
  india:'🇮🇳', australia:'🇦🇺', england:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'south africa':'🇿🇦',
  'new zealand':'🇳🇿', afghanistan:'🇦🇫', 'sri lanka':'🇱🇰', 'west indies':'🏝️',
}

/* ═══════════════════════════════════════════════════════
   CITY LAYOUT CONSTANTS
═══════════════════════════════════════════════════════ */
const DDIST = 900   // hub → district centre
const RLEN  = 750   // road spoke length
const BSLOT = 30.0  // slot width per building
const BBLK  = 3     // buildings per block
const BSTR  = 20.0  // street gap between blocks
const IROAD = 12    // inner cross-road half-width
const DPAD  = 40    // platform padding

/* ═══════════════════════════════════════════════════════
   SCORING — best-format bonus so Sachin leads TEST
═══════════════════════════════════════════════════════ */
function computeAllMax(players:any[]): AllMax {
  const r: AllMax = {
    runs:{test:1,odi:1,t20:1}, wkts:{test:1,odi:1,t20:1},
    avg: {test:1,odi:1,t20:1}, sr:  {test:1,odi:1,t20:1}, eco:{test:0.01,odi:0.01,t20:0.01}
  }
  players.forEach(p => {
    ;(['test','odi','t20'] as Format[]).forEach(f => {
      const b=p.stats?.batting?.[f]??{}, w=p.stats?.bowling?.[f]??{}
      r.runs[f]=Math.max(r.runs[f],b.runs||0)
      r.wkts[f]=Math.max(r.wkts[f],w.wickets||0)
      r.avg[f] =Math.max(r.avg[f], b.average||0)
      r.sr[f]  =Math.max(r.sr[f],  b.strike_rate||0)
      r.eco[f] =Math.max(r.eco[f], w.economy||0)
    })
  })
  return r
}

function fmtScore(p:any, f:Format, mx:AllMax): number {
  const role=(p.personal_info?.role||p.role||'').toLowerCase()
  const b=p.stats?.batting?.[f]??{}, w=p.stats?.bowling?.[f]??{}
  const bR =(b.runs||0)/mx.runs[f], bAv=(b.average||0)/mx.avg[f], bSR=(b.strike_rate||0)/mx.sr[f]
  const wW =(w.wickets||0)/mx.wkts[f]
  const wE = w.economy>0?Math.min(1,(mx.eco[f]*0.4)/w.economy):0
  if(role.includes('bowl')) return f==='t20'?wW*0.45+wE*0.55:f==='odi'?wW*0.52+wE*0.48:wW*0.65+wE*0.35
  if(role.includes('all')){
    const bs=f==='t20'?bR*0.30+bAv*0.35+bSR*0.35:f==='odi'?bR*0.40+bAv*0.35+bSR*0.25:bR*0.40+bAv*0.60
    const ws=f==='t20'?wW*0.45+wE*0.55:f==='odi'?wW*0.52+wE*0.48:wW*0.65+wE*0.35
    return (bs+ws)/2
  }
  return f==='t20'?bR*0.30+bAv*0.35+bSR*0.35:f==='odi'?bR*0.40+bAv*0.35+bSR*0.25:bR*0.40+bAv*0.60
}

function careerScore(p:any, mx:AllMax): number {
  const t=fmtScore(p,'test',mx), o=fmtScore(p,'odi',mx), t2=fmtScore(p,'t20',mx)
  return (t*0.40+o*0.35+t2*0.25)*0.60+Math.max(t,o,t2)*0.40
}

/* ═══════════════════════════════════════════════════════
   COUNTRY NORMALISER
═══════════════════════════════════════════════════════ */
function normalizeCountry(p:any): string {
  const raw=(p.country||p.team||p.personal_info?.country||p.personal_info?.team||p.nationality||'')
    .toString().toLowerCase().trim()
  if(!raw) return 'world'
  if(raw.includes('india')   ||raw==='ind')                       return 'india'
  if(raw.includes('eng')     ||raw==='eng')                       return 'england'
  if(raw.includes('aus')     ||raw==='aus')                       return 'australia'
  if(raw.includes('south')   ||raw==='sa'||raw==='rsa')           return 'south africa'
  if(raw.includes('zealand') ||raw.includes('nz')||raw==='nzl')  return 'new zealand'
  if(raw.includes('afghan')  ||raw==='afg')                       return 'afghanistan'
  if(raw.includes('sri')     ||raw==='slc'||raw==='sl')           return 'sri lanka'
  if(raw.includes('west')    ||raw.includes('windies')||raw==='wi') return 'west indies'
  return 'world'
}

/* ═══════════════════════════════════════════════════════
   BUILDING SHAPES
═══════════════════════════════════════════════════════ */
function pickShape(role:string, idx:number, ns:number): BldShape {
  const seed=(idx*137+~~(ns*89))%6
  if(role.includes('bowl')) return (['cylinder','slab','pyramid'] as BldShape[])[seed%3]
  if(role.includes('all'))  return (['cruciform','stepped','slab'] as BldShape[])[seed%3]
  if(ns>0.75) return seed<3?'tower':'stepped'
  if(ns>0.50) return seed<3?'stepped':'tower'
  return (['cylinder','slab','pyramid','tower'] as BldShape[])[seed%4]
}

function buildingGroup(shape:BldShape, w:number, h:number, mat:THREE.Material): THREE.Group {
  const g=new THREE.Group(), sw=w
  switch(shape){
    case 'tower':{
      const s=new THREE.Mesh(new THREE.BoxGeometry(sw*0.90,h*0.70,sw*0.90),mat); s.position.y=h*0.35; g.add(s)
      const m=new THREE.Mesh(new THREE.BoxGeometry(sw*0.60,h*0.22,sw*0.60),mat); m.position.y=h*0.70+h*0.11; g.add(m)
      const tip=new THREE.Mesh(new THREE.ConeGeometry(sw*0.18,h*0.12,6),mat); tip.position.y=h*0.92+h*0.06; g.add(tip)
      break
    }
    case 'stepped':{
      ;[[1.00,0.46,0.00],[0.76,0.32,0.46],[0.52,0.22,0.78]].forEach(([wf,hf,yb])=>{
        const m=new THREE.Mesh(new THREE.BoxGeometry(sw*wf,h*hf,sw*wf),mat); m.position.y=h*yb+h*hf/2; g.add(m)
      }); break
    }
    case 'cylinder':{
      const b=new THREE.Mesh(new THREE.CylinderGeometry(sw*0.48,sw*0.50,h*0.86,10),mat); b.position.y=h*0.43; g.add(b)
      const d=new THREE.Mesh(new THREE.SphereGeometry(sw*0.48,10,6,0,Math.PI*2,0,Math.PI/2),mat); d.position.y=h*0.86; g.add(d)
      break
    }
    case 'slab':{
      const body=new THREE.Mesh(new THREE.BoxGeometry(sw,h*0.55,sw*0.92),mat); body.position.y=h*0.275; g.add(body)
      const top=new THREE.Mesh(new THREE.CylinderGeometry(sw*0.38,sw*0.42,h*0.42,8),mat); top.position.y=h*0.55+h*0.21; g.add(top)
      break
    }
    case 'cruciform':{
      const hz=new THREE.Mesh(new THREE.BoxGeometry(sw,h,sw*0.72),mat); hz.position.y=h/2; g.add(hz)
      const vt=new THREE.Mesh(new THREE.BoxGeometry(sw*0.72,h,sw),mat); vt.position.y=h/2; g.add(vt)
      break
    }
    case 'pyramid':{
      const body=new THREE.Mesh(new THREE.CylinderGeometry(sw*0.30,sw*0.50,h,6),mat); body.position.y=h/2; g.add(body)
      break
    }
  }
  return g
}

/* ═══════════════════════════════════════════════════════
   GRID HELPERS
═══════════════════════════════════════════════════════ */
function slotPos(col:number,row:number){return{x:col*BSLOT+Math.floor(col/BBLK)*BSTR,z:row*BSLOT+Math.floor(row/BBLK)*BSTR}}
function axisSpan(n:number){if(n<=0)return 0;return(n-1)*BSLOT+Math.max(0,Math.ceil(n/BBLK)-1)*BSTR}

/* ═══════════════════════════════════════════════════════
   TEXTURES
═══════════════════════════════════════════════════════ */
function mkWinTex(hex:number): THREE.CanvasTexture {
  const cv=document.createElement('canvas'); cv.width=128; cv.height=256
  const cx=cv.getContext('2d')!
  cx.fillStyle='#010810'; cx.fillRect(0,0,128,256)
  const c=new THREE.Color(hex), rgb=`${~~(c.r*255)},${~~(c.g*255)},${~~(c.b*255)}`
  for(let ci=0;ci<4;ci++) for(let ri=0;ri<14;ri++){
    const r=Math.random()
    if(r>0.28){cx.fillStyle=r>0.90?'#ffffff':r>0.65?`rgba(${rgb},0.9)`:`rgba(${rgb},0.42)`;cx.fillRect(ci*32+2,ri*18+2,28,14)}
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,2); return t
}

function mkGoldTex(): THREE.CanvasTexture {
  const cv=document.createElement('canvas'); cv.width=128; cv.height=256
  const cx=cv.getContext('2d')!
  cx.fillStyle='#080400'; cx.fillRect(0,0,128,256)
  for(let ci=0;ci<4;ci++) for(let ri=0;ri<14;ri++){
    const r=Math.random()
    if(r>0.22){const rr=~~(200+Math.random()*55),gg=~~(130+Math.random()*80);cx.fillStyle=r>0.90?'#ffffff':r>0.60?`rgb(${rr},${gg},0)`:`rgba(255,165,0,0.5)`;cx.fillRect(ci*32+2,ri*18+2,28,14)}
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1,3); return t
}

/* ── mkLabel: FIXED — was using hex.replace() which crashes on #rrggbb strings ── */
function mkLabel(text:string, colorHex:number, sz=1): THREE.Sprite {
  const cv=document.createElement('canvas'); cv.width=960; cv.height=176
  const cx=cv.getContext('2d')!
  const c=new THREE.Color(colorHex)
  const hexStr='#'+c.getHexString()
  const glowStr=`rgba(${~~(c.r*255)},${~~(c.g*255)},${~~(c.b*255)},0.35)`
  cx.clearRect(0,0,960,176)
  cx.fillStyle='rgba(0,4,18,0.96)'; cx.beginPath(); cx.roundRect(4,8,952,160,16); cx.fill()
  cx.strokeStyle=hexStr; cx.lineWidth=5; cx.beginPath(); cx.roundRect(4,8,952,160,16); cx.stroke()
  cx.strokeStyle=glowStr; cx.lineWidth=14; cx.beginPath(); cx.roundRect(4,8,952,160,16); cx.stroke()
  cx.fillStyle=hexStr; cx.font='bold 56px "Courier New",monospace'; cx.textAlign='center'; cx.textBaseline='middle'
  cx.shadowColor=hexStr; cx.shadowBlur=22; cx.fillText(text,480,92); cx.shadowBlur=0
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthTest:false}))
  spr.scale.set(280*sz,70*sz,1); return spr
}

/* ═══════════════════════════════════════════════════════
   CYBERPUNK HQ — fixed: MutableRefObject (not React.MutableRefObject)
═══════════════════════════════════════════════════════ */
function buildHQ(
  diamondRef: MutableRefObject<THREE.Mesh|null>,
  hqHitRef:   MutableRefObject<THREE.Mesh|null>
): THREE.Group {
  const g=new THREE.Group()
  const darkMat =new THREE.MeshStandardMaterial({color:0x0a0e18,emissive:0x1a2040,emissiveIntensity:0.4,roughness:0.7,metalness:0.8})
  const darkMat2=new THREE.MeshStandardMaterial({color:0x0d1220,emissive:0x0d1f40,emissiveIntensity:0.3,roughness:0.6,metalness:0.9})
  const goldMat =new THREE.MeshStandardMaterial({color:0xffd700,emissive:0xffaa00,emissiveIntensity:3.5})
  const glassMat=new THREE.MeshStandardMaterial({color:0x001830,emissive:0x00e5ff,emissiveIntensity:0.8,transparent:true,opacity:0.55})
  const pipeMat =new THREE.MeshStandardMaterial({color:0x1a1a2e,emissive:0x9b00ff,emissiveIntensity:0.6,roughness:0.4,metalness:1.0})
  const neon=(col:number,ei=4)=>new THREE.MeshStandardMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:ei})

  // Base
  const base=new THREE.Mesh(new THREE.CylinderGeometry(360,410,40,8),darkMat2); base.position.y=20; g.add(base)
  for(let i=0;i<8;i++){
    const a=(i/8)*Math.PI*2
    const strip=new THREE.Mesh(new THREE.BoxGeometry(4,42,80),neon(0x00e5ff))
    strip.position.set(Math.cos(a)*370,20,Math.sin(a)*370); strip.rotation.y=a; g.add(strip)
  }

  // 5 stepped tiers
  const tiers=[
    {w:280,h:110,y:40,  col:0x00e5ff,plat:true},
    {w:220,h:130,y:155, col:0xff00aa,plat:true},
    {w:170,h:150,y:290, col:0x9b00ff,plat:true},
    {w:130,h:140,y:445, col:0x00e5ff,plat:false},
    {w:90, h:160,y:590, col:0xff00aa,plat:false},
  ]
  tiers.forEach(({w,h,y,col,plat})=>{
    const block=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),darkMat); block.position.y=y+h/2; g.add(block)
    for(let face=0;face<4;face++){
      const a=(face/4)*Math.PI*2
      const wp=new THREE.Mesh(new THREE.PlaneGeometry(w*0.85,h*0.75),
        new THREE.MeshStandardMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:0.25,transparent:true,opacity:0.4}))
      wp.rotation.y=a; wp.position.set(Math.cos(a)*(w/2+0.1),y+h/2,Math.sin(a)*(w/2+0.1)); g.add(wp)
    }
    const rim=new THREE.Mesh(new THREE.TorusGeometry(w*0.72,0.8,6,36),neon(col,6))
    rim.rotation.x=Math.PI/2; rim.position.y=y+h; g.add(rim)
    if(plat){
      for(let i=0;i<4;i++){
        const pa=(i/4)*Math.PI*2+Math.PI/8, pd=w/2+40
        const pl=new THREE.Mesh(new THREE.BoxGeometry(60,10,35),darkMat2)
        pl.position.set(Math.cos(pa)*pd,y+h-15,Math.sin(pa)*pd); pl.rotation.y=pa; g.add(pl)
        const rl=new THREE.Mesh(new THREE.BoxGeometry(60,15,2),neon(col,5))
        rl.position.set(Math.cos(pa)*(pd+20),y+h-7,Math.sin(pa)*(pd+20)); rl.rotation.y=pa; g.add(rl)
      }
    }
    ;[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([sx,sz])=>{
      const pipe=new THREE.Mesh(new THREE.CylinderGeometry(6,6,h+30,6),pipeMat)
      pipe.position.set(sx*(w/2+12),y+h/2,sz*(w/2+12)); g.add(pipe)
    })
  })

  // Glass shaft
  const shaft=new THREE.Mesh(new THREE.BoxGeometry(70,400,70),glassMat); shaft.position.y=950; g.add(shaft)
  for(let i=0;i<4;i++){
    const a=(i/4)*Math.PI*2
    const vs=new THREE.Mesh(new THREE.BoxGeometry(6,400,6),neon(0x00e5ff,5))
    vs.position.set(Math.cos(a)*40,950,Math.sin(a)*40); g.add(vs)
  }

  // Rooftop billboard
  const rooftop=new THREE.Mesh(new THREE.BoxGeometry(150,15,150),darkMat2); rooftop.position.y=755; g.add(rooftop)
  const screenMesh=new THREE.Mesh(new THREE.BoxGeometry(100,50,4),
    new THREE.MeshStandardMaterial({color:0x003344,emissive:0x00e5ff,emissiveIntensity:1.5,transparent:true,opacity:0.9}))
  screenMesh.position.set(0,790,70); g.add(screenMesh)
  const sBorder=new THREE.Mesh(new THREE.BoxGeometry(105,55,2),neon(0x00e5ff,6)); sBorder.position.set(0,790,68); g.add(sBorder)
  const dishBase=new THREE.Mesh(new THREE.CylinderGeometry(3,3,30,6),pipeMat); dishBase.position.set(55,773,-40); g.add(dishBase)
  const dish=new THREE.Mesh(new THREE.ConeGeometry(25,15,12,1,true),
    new THREE.MeshStandardMaterial({color:0x1a1a2e,emissive:0x9b00ff,emissiveIntensity:1.5,side:THREE.DoubleSide}))
  dish.rotation.x=-Math.PI/3; dish.position.set(55,795,-40); g.add(dish)
  ;[[-50,770,50],[-60,765,-25],[50,768,-50]].forEach(([x,y,z])=>{
    const ant=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,40,4),pipeMat); ant.position.set(x,y+20,z); g.add(ant)
  })

  // Spires
  const sp1=new THREE.Mesh(new THREE.CylinderGeometry(12,25,250,8),darkMat2); sp1.position.y=1275; g.add(sp1)
  const sp2=new THREE.Mesh(new THREE.CylinderGeometry(4,12,175,6),
    new THREE.MeshStandardMaterial({color:0x0a0e18,emissive:0x9b00ff,emissiveIntensity:2}))
  sp2.position.y=1487; g.add(sp2)
  const needle=new THREE.Mesh(new THREE.ConeGeometry(4,125,6),goldMat); needle.position.y=1636; g.add(needle)

  // Tier neon rings
  ;[{y:150,c:0x00e5ff},{y:280,c:0xff00aa},{y:440,c:0x9b00ff},{y:580,c:0x00e5ff},{y:750,c:0xff00aa}].forEach(({y,c})=>{
    const ring=new THREE.Mesh(new THREE.TorusGeometry(160,7,8,64),neon(c,4.5))
    ring.rotation.x=Math.PI/2; ring.position.y=y; g.add(ring)
  })

  // Searchlight beams
  ;[[200,200],[200,-200],[-200,200],[-200,-200],[275,0],[-275,0],[0,275],[0,-275]].forEach(([x,z])=>{
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.5,20,1000,6),
      new THREE.MeshStandardMaterial({color:0x9b00ff,emissive:0x9b00ff,emissiveIntensity:2.5,transparent:true,opacity:0.05}))
    beam.position.set(x,500,z); g.add(beam)
  })

  // Diamond topper
  const diamond=new THREE.Mesh(new THREE.OctahedronGeometry(50,0),
    new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x00e5ff,emissiveIntensity:12,transparent:true,opacity:0.9}))
  diamond.position.y=1730; g.add(diamond); diamondRef.current=diamond

  // Nameplate sprite
  const sc=document.createElement('canvas'); sc.width=1000; sc.height=160
  const sx=sc.getContext('2d')!
  sx.fillStyle='rgba(0,8,22,0.95)'; sx.fillRect(0,0,1000,160)
  sx.shadowColor='#00e5ff'; sx.shadowBlur=40
  sx.strokeStyle='#00e5ff'; sx.lineWidth=3; sx.strokeRect(8,8,984,144)
  sx.strokeStyle='rgba(0,229,255,0.2)'; sx.lineWidth=18; sx.strokeRect(8,8,984,144)
  sx.shadowBlur=0
  ;[[8,8],[956,8],[8,116],[956,116]].forEach(([cx,cy])=>{
    sx.strokeStyle='#ff00aa'; sx.lineWidth=3; sx.strokeRect(cx,cy,36,36)
    sx.fillStyle='#ff00aa'; sx.fillRect(cx+12,cy+12,12,12)
  })
  sx.fillStyle='#e0f9ff'; sx.font='bold 72px "Courier New",monospace'; sx.textAlign='center'; sx.textBaseline='middle'
  sx.shadowColor='#00e5ff'; sx.shadowBlur=30; sx.fillText('HEADQUARTER',500,58); sx.shadowBlur=0
  sx.fillStyle='rgba(0,229,255,0.6)'; sx.font='16px "Courier New",monospace'
  sx.fillText('ICC  ·  INTERNATIONAL CRICKET COUNCIL  ·  EST. 1909',500,112)
  const sSpr=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthTest:false}))
  sSpr.scale.set(360,60,1); sSpr.position.set(0,340,0); g.add(sSpr)

  // Hitbox
  const hb=new THREE.Mesh(new THREE.BoxGeometry(420,1800,420),new THREE.MeshBasicMaterial({visible:false}))
  hb.position.y=900; g.add(hb); hqHitRef.current=hb
  return g
}

/* ═══════════════════════════════════════════════════════
   OUTER RING
═══════════════════════════════════════════════════════ */
function buildOuterRing(scene:THREE.Scene) {
  const R=1400
  ;[{r:R,t:10,e:2.2,y:5,col:0x00e5ff},{r:R-80,t:5,e:0.7,y:2,col:0x9b00ff},
    {r:R+80,t:3.5,e:0.5,y:2.5,col:0xff00aa},{r:R-160,t:2.5,e:0.2,y:1,col:0x00e5ff},
    {r:R+160,t:2,e:0.2,y:1.2,col:0x9b00ff}].forEach(({r,t,e,y,col})=>{
    const tor=new THREE.Mesh(new THREE.TorusGeometry(r,t,12,200),
      new THREE.MeshStandardMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:e}))
    tor.rotation.x=Math.PI/2; tor.position.y=y; scene.add(tor)
  })
  const glow=new THREE.Mesh(new THREE.RingGeometry(R-220,R+220,200),
    new THREE.MeshStandardMaterial({color:0x020820,emissive:0x00e5ff,emissiveIntensity:0.12,side:THREE.DoubleSide}))
  glow.rotation.x=-Math.PI/2; glow.position.y=0.3; scene.add(glow)

  const PC=64
  for(let i=0;i<PC;i++){
    const a=(i/PC)*Math.PI*2, px=Math.cos(a)*R, pz=Math.sin(a)*R
    const isMajor=i%8===0, isMid=i%4===0
    const hh=isMajor?260:isMid?160:80, tw=isMajor?18:isMid?11:6
    const col=isMajor?0x00e5ff:isMid?0x9b00ff:0xff00aa
    const pm=new THREE.MeshStandardMaterial({color:0x0a0e18,emissive:new THREE.Color(col),emissiveIntensity:isMajor?0.9:0.3,roughness:0.7,metalness:0.9})
    const pB=new THREE.Mesh(new THREE.BoxGeometry(tw*1.8,hh*0.3,tw*1.8),pm); pB.position.set(px,hh*0.15,pz); scene.add(pB)
    const pM=new THREE.Mesh(new THREE.BoxGeometry(tw*1.3,hh*0.42,tw*1.3),pm); pM.position.set(px,hh*0.3+hh*0.21,pz); scene.add(pM)
    const pT=new THREE.Mesh(new THREE.BoxGeometry(tw,hh*0.32,tw),pm); pT.position.set(px,hh*0.72+hh*0.16,pz); scene.add(pT)
    ;[hh*0.3,hh*0.72].forEach(hy=>{
      const rim=new THREE.Mesh(new THREE.TorusGeometry(tw*0.9,0.9,6,28),
        new THREE.MeshStandardMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:5}))
      rim.rotation.x=Math.PI/2; rim.position.set(px,hy,pz); scene.add(rim)
    })
    const om=new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(col),emissiveIntensity:isMajor?18:isMid?12:6})
    const orb=new THREE.Mesh(new THREE.SphereGeometry(isMajor?9:isMid?5.5:2.5,8,8),om); orb.position.set(px,hh+9,pz); scene.add(orb)
    if(isMajor){
      const arm=new THREE.Mesh(new THREE.BoxGeometry(100,5,5),
        new THREE.MeshStandardMaterial({color:0x0a0e18,emissive:new THREE.Color(col),emissiveIntensity:4,roughness:0.5,metalness:1}))
      arm.position.set(px,hh-35,pz); arm.rotation.y=a; scene.add(arm)
      ;[-40,40].forEach(off=>{
        const bp=new THREE.Vector3(off,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),a)
        const el=new THREE.Mesh(new THREE.SphereGeometry(5,6,6),om); el.position.set(px+bp.x,hh-35,pz+bp.z); scene.add(el)
      })
      ;[-8,8].forEach(d=>{
        const strip=new THREE.Mesh(new THREE.BoxGeometry(1.2,hh,1.2),
          new THREE.MeshStandardMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:4}))
        strip.position.set(px+Math.cos(a+Math.PI/2)*d,hh/2,pz+Math.sin(a+Math.PI/2)*d); scene.add(strip)
      })
      const tip=new THREE.Mesh(new THREE.ConeGeometry(10,50,4),
        new THREE.MeshStandardMaterial({color:0xffd700,emissive:0xffaa00,emissiveIntensity:6}))
      tip.position.set(px,hh+36,pz); scene.add(tip)
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(1.5,15,800,6),
        new THREE.MeshStandardMaterial({color:0x00e5ff,emissive:0x00e5ff,emissiveIntensity:3,transparent:true,opacity:0.04}))
      beam.position.set(px,hh+400,pz); scene.add(beam)
    }
  }
  for(let i=0;i<PC;i+=8){
    const nb=new THREE.Mesh(new THREE.TorusGeometry(R,2.5,6,8,Math.PI/4),
      new THREE.MeshStandardMaterial({color:0x00e5ff,emissive:0x00e5ff,emissiveIntensity:3}))
    nb.rotation.x=Math.PI/2; nb.rotation.z=(i/PC)*Math.PI*2; nb.position.y=130; scene.add(nb)
  }
}

/* ═══════════════════════════════════════════════════════
   DISTRICT BORDER
═══════════════════════════════════════════════════════ */
function addBorder(parent:THREE.Group, w:number, d:number, color:number) {
  const c=new THREE.Color(color), WH=14, WT=2.4
  const wm=new THREE.MeshStandardMaterial({color:0x0a1020,emissive:c,emissiveIntensity:2.2})
  const gm=new THREE.MeshStandardMaterial({color,emissive:c,emissiveIntensity:6.0})
  const pm=new THREE.MeshStandardMaterial({color:0x050c18,emissive:c,emissiveIntensity:3.5})
  ;[d/2,-d/2].forEach(z=>{
    const w1=new THREE.Mesh(new THREE.BoxGeometry(w+WT,WH,WT),wm); w1.position.set(0,WH/2,z); parent.add(w1)
    const g1=new THREE.Mesh(new THREE.BoxGeometry(w+WT,0.65,WT*0.9),gm); g1.position.set(0,WH+0.33,z); parent.add(g1)
  })
  ;[w/2,-w/2].forEach(x=>{
    const w2=new THREE.Mesh(new THREE.BoxGeometry(WT,WH,d+WT),wm); w2.position.set(x,WH/2,0); parent.add(w2)
    const g2=new THREE.Mesh(new THREE.BoxGeometry(WT*0.9,0.65,d+WT),gm); g2.position.set(x,WH+0.33,0); parent.add(g2)
  })
  ;[[w/2,d/2],[w/2,-d/2],[-w/2,d/2],[-w/2,-d/2]].forEach(([x,z])=>{
    const pil=new THREE.Mesh(new THREE.BoxGeometry(4,WH*3.2,4),pm); pil.position.set(x,WH*1.6,z); parent.add(pil)
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(3,3,2,8),gm); cap.position.set(x,WH*3.2+1,z); parent.add(cap)
    const orb=new THREE.Mesh(new THREE.SphereGeometry(2.2,10,10),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:c,emissiveIntensity:9}))
    orb.position.set(x,WH*3.2+3.2,z); parent.add(orb)
    ;[[-2,0],[2,0],[0,-2],[0,2]].forEach(([dx,dz])=>{
      const s=new THREE.Mesh(new THREE.BoxGeometry(0.35,WH*3.2,0.35),gm); s.position.set(x+dx,WH*1.6,z+dz); parent.add(s)
    })
  })
}

/* ═══════════════════════════════════════════════════════
   ROAD SPOKE
═══════════════════════════════════════════════════════ */
function buildRoad(scene:THREE.Scene, angle:number, len:number, color:number) {
  const rg=new THREE.Group(); rg.rotation.y=-angle; rg.userData.city=true
  const W=18, midX=30+len/2
  const pl=(w:number,d:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),m);mesh.rotation.x=-Math.PI/2;return mesh}
  const rm=new THREE.MeshStandardMaterial({color:0x020a18,emissive:new THREE.Color(color),emissiveIntensity:0.14})
  const em=new THREE.MeshStandardMaterial({color,emissive:new THREE.Color(color),emissiveIntensity:7})
  const im=new THREE.MeshStandardMaterial({color:0x1e3a5f,emissive:0x1e3a5f,emissiveIntensity:1.8})
  const dm=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:2.5})
  const road=pl(len,W,rm); road.position.set(midX,0.15,0); rg.add(road)
  ;[-(W/2-0.5),(W/2-0.5)].forEach(z=>{const e=pl(len,1.0,em);e.position.set(midX,0.17,z);rg.add(e)})
  ;[-3,3].forEach(z=>{const il=pl(len,0.4,im);il.position.set(midX,0.16,z);rg.add(il)})
  for(let i=0;i<14;i++){const d=pl((len/14)*0.42,0.5,dm);d.position.set(30+(i+0.5)*(len/14),0.18,0);rg.add(d)}
  for(let i=1;i<=6;i++){
    const lx=30+i*(len/7)
    ;[-(W/2+1),(W/2+1)].forEach(z=>{
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.28,14,8),new THREE.MeshStandardMaterial({color:0x1e293b}))
      pole.position.set(lx,7,z); rg.add(pole)
      const arm=new THREE.Mesh(new THREE.BoxGeometry(4,0.25,0.25),new THREE.MeshStandardMaterial({color:0x1e293b}))
      arm.position.set(lx+(z>0?-2:2),14,z); rg.add(arm)
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.85,8,8),
        new THREE.MeshStandardMaterial({color:0xffffff,emissive:new THREE.Color(color),emissiveIntensity:9}))
      bulb.position.set(lx+(z>0?-4:4),14,z); rg.add(bulb)
    })
  }
  scene.add(rg)
}

/* ═══════════════════════════════════════════════════════
   INNER CROSS + FOUNTAIN
═══════════════════════════════════════════════════════ */
function addInnerCross(parent:THREE.Group, platW:number, platD:number, color:number) {
  const c=new THREE.Color(color)
  const rm=new THREE.MeshStandardMaterial({color:0x020b18,emissive:c,emissiveIntensity:0.25})
  const lm=new THREE.MeshStandardMaterial({color,emissive:c,emissiveIntensity:5.5})
  const ew=new THREE.Mesh(new THREE.PlaneGeometry(platW,IROAD*2),rm); ew.rotation.x=-Math.PI/2; ew.position.y=0.17; parent.add(ew)
  const ns=new THREE.Mesh(new THREE.PlaneGeometry(IROAD*2,platD),rm); ns.rotation.x=-Math.PI/2; ns.position.y=0.17; parent.add(ns)
  ;[0.45,-0.45].forEach(off=>{
    ;[true,false].forEach(isEW=>{
      const lp=new THREE.Mesh(new THREE.PlaneGeometry(isEW?platW:0.45,isEW?0.45:platD),lm)
      lp.rotation.x=-Math.PI/2; lp.position.set(isEW?0:off,0.19,isEW?off:0); parent.add(lp)
    })
  })
  const fm=new THREE.MeshStandardMaterial({color:0x080e22,emissive:c,emissiveIntensity:0.8})
  ;[{r:10,h:1.6,y:0.8},{r:6.2,h:2.4,y:2.8},{r:3.2,h:3.2,y:5.6},{r:1.4,h:2.6,y:8.8}].forEach(({r,h,y})=>{
    const tier=new THREE.Mesh(new THREE.CylinderGeometry(r,r+1,h,8),fm); tier.position.y=y; parent.add(tier)
  })
  const topOrb=new THREE.Mesh(new THREE.SphereGeometry(1.8,8,8),
    new THREE.MeshStandardMaterial({color:0xffffff,emissive:c,emissiveIntensity:12}))
  topOrb.position.y=12.2; parent.add(topOrb)
  const ring=new THREE.Mesh(new THREE.TorusGeometry(7.5,0.6,8,40),
    new THREE.MeshStandardMaterial({color,emissive:c,emissiveIntensity:6}))
  ring.rotation.x=Math.PI/2; ring.position.y=2.6; parent.add(ring)
  ;[[platW/2-5,0],[-(platW/2-5),0],[0,platD/2-5],[0,-(platD/2-5)]].forEach(([lx,lz])=>{
    const jl=new THREE.Mesh(new THREE.SphereGeometry(0.9,6,6),
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:c,emissiveIntensity:8}))
    jl.position.set(lx,3,lz); parent.add(jl)
  })
}

/* ═══════════════════════════════════════════════════════
   DRONE MESH
═══════════════════════════════════════════════════════ */
function buildDroneMesh(): {group:THREE.Group; rotors:THREE.Mesh[]} {
  const g=new THREE.Group(), rotors:THREE.Mesh[]=[]
  const bm=new THREE.MeshStandardMaterial({color:0x111827,emissive:0x1e40af,emissiveIntensity:0.5,roughness:0.35,metalness:0.6})
  const am=new THREE.MeshStandardMaterial({color:0x1f2937,roughness:0.55,metalness:0.5})
  const rm=new THREE.MeshStandardMaterial({color:0x374151,transparent:true,opacity:0.75,roughness:0.3})
  const mm=new THREE.MeshStandardMaterial({color:0xb45309,emissive:0x92400e,emissiveIntensity:0.7,metalness:0.8})
  const lb=new THREE.MeshStandardMaterial({color:0x38bdf8,emissive:0x38bdf8,emissiveIntensity:14})
  const lr=new THREE.MeshStandardMaterial({color:0xef4444,emissive:0xef4444,emissiveIntensity:14})
  const body=new THREE.Mesh(new THREE.BoxGeometry(6.0,1.6,4.2),bm); g.add(body)
  const nose=new THREE.Mesh(new THREE.SphereGeometry(2.0,8,6,0,Math.PI*2,0,Math.PI/2),bm); nose.rotation.x=Math.PI/2; nose.position.set(2.6,0,0); g.add(nose)
  const hump=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.6,0.9,8),bm); hump.position.set(0,1.1,0); g.add(hump)
  const gimbal=new THREE.Mesh(new THREE.SphereGeometry(0.8,8,6),
    new THREE.MeshStandardMaterial({color:0x000000,emissive:0x60a5fa,emissiveIntensity:6}))
  gimbal.position.set(2.8,-0.3,0); g.add(gimbal)
  const sLed=new THREE.Mesh(new THREE.SphereGeometry(0.38,6,6),lb); sLed.position.set(0,1.65,0); g.add(sLed)
  ;[Math.PI*0.25,Math.PI*0.75,Math.PI*1.25,Math.PI*1.75].forEach((ang,i)=>{
    const arm=new THREE.Mesh(new THREE.BoxGeometry(5.6,0.5,1.1),am)
    arm.position.set(Math.cos(ang)*2.0,0.1,Math.sin(ang)*2.0); arm.rotation.y=ang+Math.PI/2; g.add(arm)
    const mx=Math.cos(ang)*5.4, mz=Math.sin(ang)*5.4
    const motor=new THREE.Mesh(new THREE.CylinderGeometry(0.8,0.7,0.9,8),mm); motor.position.set(mx,0.7,mz); g.add(motor)
    ;[0,Math.PI/2].forEach(ba=>{
      const blade=new THREE.Mesh(new THREE.BoxGeometry(5.0,0.12,0.65),rm)
      blade.position.set(mx,1.2,mz); blade.rotation.y=ba; g.add(blade); rotors.push(blade)
    })
    const guard=new THREE.Mesh(new THREE.TorusGeometry(2.7,0.2,6,28),
      new THREE.MeshStandardMaterial({color:0x1f2937,roughness:0.6}))
    guard.rotation.x=Math.PI/2; guard.position.set(mx,1.2,mz); g.add(guard)
    const led=new THREE.Mesh(new THREE.SphereGeometry(0.38,6,6),i<2?lb:lr); led.position.set(mx,0.3,mz); g.add(led)
  })
  ;[[3,1.6],[3,-1.6],[-3,1.6],[-3,-1.6]].forEach(([lx,lz])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,1.6,6),am); leg.position.set(lx,-1.2,lz); g.add(leg)
    const foot=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.2,0.2),am); foot.position.set(lx,-2.0,lz); g.add(foot)
  })
  return {group:g,rotors}
}

/* ═══════════════════════════════════════════════════════
   DISPOSE
═══════════════════════════════════════════════════════ */
function disposeCity(scene:THREE.Scene) {
  scene.children.filter(o=>o.userData.city).forEach(obj=>{
    obj.traverse(child=>{
      const mesh=child as THREE.Mesh
      if(!mesh.isMesh&&!(child as any).isSprite) return
      const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material]
      mats.forEach(m=>{
        if(!m) return
        ;['map','emissiveMap','normalMap','roughnessMap','alphaMap'].forEach(k=>{
          const tex=(m as any)[k]; if(tex instanceof THREE.Texture) tex.dispose()
        })
        m.dispose()
      })
      if(mesh.geometry) mesh.geometry.dispose()
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
  const distRef       = useRef(1300)
  const tDistRef      = useRef(1300)
  const droneModeRef  = useRef(false)
  const droneYawRef   = useRef(Math.PI)
  const keysRef       = useRef<Set<string>>(new Set())
  const btnsRef       = useRef({fwd:false,back:false,left:false,right:false,up:false,down:false})

  const [fmt,       setFmt     ] = useState<FmtTab>('TEST')
  const [loading,   setLoading ] = useState(false)
  const [selected,  setSelected] = useState<any>(null)
  const [hqOpen,    setHqOpen  ] = useState(false)
  const [counts,    setCounts  ] = useState<Record<string,number>>({})
  const [droneMode, setDroneMode] = useState(false)
  const [allMx,     setAllMx   ] = useState<AllMax|null>(null)
  const [dbgInfo,   setDbgInfo ] = useState<string>('')   // debug overlay

  /* ── SCENE INIT ──────────────────────────────────── */
  useEffect(()=>{
    if(!mountRef.current) return
    const scene=new THREE.Scene()
    scene.background=new THREE.Color(0x000810)
    scene.fog=new THREE.FogExp2(0x00060e,0.000055)
    sceneRef.current=scene
    const camera=new THREE.PerspectiveCamera(55,window.innerWidth/window.innerHeight,0.1,30000)
    cameraRef.current=camera
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})
    renderer.setSize(window.innerWidth,window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2))
    rendererRef.current=renderer
    mountRef.current.appendChild(renderer.domElement)

    let theta=0.85, phi=0.34, drag=false, lx=0, ly=0
    const camUpdate=()=>{
      if(droneModeRef.current) return
      const d=distRef.current
      camera.position.set(d*Math.sin(theta)*Math.cos(phi),d*Math.sin(phi),d*Math.cos(theta)*Math.cos(phi))
      camera.lookAt(0,0,0)
    }
    camUpdate()

    const onDown =(e:PointerEvent)=>{if(droneModeRef.current) return;drag=true;lx=e.clientX;ly=e.clientY}
    const onMove =(e:PointerEvent)=>{
      if(!drag||droneModeRef.current) return
      theta-=(e.clientX-lx)*0.004; phi=Math.max(0.05,Math.min(1.48,phi-(e.clientY-ly)*0.004))
      lx=e.clientX; ly=e.clientY
    }
    const onUp=()=>{drag=false}
    const onWheel=(e:WheelEvent)=>{
      e.preventDefault()
      if(droneModeRef.current){
        if(droneGroupRef.current) droneGroupRef.current.position.y=Math.max(3,Math.min(1200,droneGroupRef.current.position.y+e.deltaY*0.08))
      } else {
        tDistRef.current=Math.max(15,Math.min(10000,tDistRef.current*Math.exp(e.deltaY*0.001)))
      }
    }
    const onKD=(e:KeyboardEvent)=>keysRef.current.add(e.key.toLowerCase())
    const onKU=(e:KeyboardEvent)=>keysRef.current.delete(e.key.toLowerCase())

    window.addEventListener('pointerdown',onDown); window.addEventListener('pointermove',onMove)
    window.addEventListener('pointerup',onUp); window.addEventListener('keydown',onKD); window.addEventListener('keyup',onKU)
    renderer.domElement.addEventListener('wheel',onWheel,{passive:false})

    scene.add(new THREE.AmbientLight(0x0d1f40,2.8))
    const dir=new THREE.DirectionalLight(0x3366ff,1.8); dir.position.set(100,300,100); scene.add(dir)
    const wl=new THREE.PointLight(0xff4400,0.35,1600); wl.position.set(0,-10,0); scene.add(wl)
    const cl=new THREE.PointLight(0x38bdf8,1.6,1000); cl.position.set(0,60,0); scene.add(cl)

    const gnd=new THREE.Mesh(new THREE.PlaneGeometry(50000,50000),new THREE.MeshStandardMaterial({color:0x010810}))
    gnd.rotation.x=-Math.PI/2; scene.add(gnd)
    const grid=new THREE.Mesh(new THREE.PlaneGeometry(8000,8000,160,160),new THREE.MeshBasicMaterial({color:0x091830,wireframe:true}))
    grid.rotation.x=-Math.PI/2; grid.position.y=0.07; scene.add(grid)

    buildOuterRing(scene)

    let animId:number
    const animate=()=>{
      animId=requestAnimationFrame(animate)
      if(droneModeRef.current&&droneGroupRef.current){
        const drone=droneGroupRef.current,keys=keysRef.current,btns=btnsRef.current
        const SPEED=4.5, YAW=0.016, yaw=droneYawRef.current
        if(keys.has('a')||keys.has('arrowleft') ||btns.left)  droneYawRef.current-=YAW
        if(keys.has('d')||keys.has('arrowright')||btns.right) droneYawRef.current+=YAW
        const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw))
        if(keys.has('w')||keys.has('arrowup')  ||btns.fwd)  drone.position.addScaledVector(fwd,SPEED)
        if(keys.has('s')||keys.has('arrowdown')||btns.back) drone.position.addScaledVector(fwd,-SPEED*0.6)
        if(keys.has('q')||btns.up)   drone.position.y=Math.min(1200,drone.position.y+SPEED*0.7)
        if(keys.has('e')||btns.down) drone.position.y=Math.max(3,drone.position.y-SPEED*0.7)
        drone.position.x=THREE.MathUtils.clamp(drone.position.x,-4000,4000)
        drone.position.z=THREE.MathUtils.clamp(drone.position.z,-4000,4000)
        drone.rotation.y=yaw
        drone.rotation.x=(keys.has('w')||keys.has('arrowup')||btns.fwd)?-0.10:0
        droneRotors.current.forEach(r=>{r.rotation.y+=0.42})
        const behind=new THREE.Vector3(Math.sin(yaw)*30,10,Math.cos(yaw)*30)
        camera.position.lerp(drone.position.clone().add(behind),0.12)
        camera.lookAt(drone.position.clone().add(new THREE.Vector3(0,1,0)))
      } else {
        distRef.current+=(tDistRef.current-distRef.current)*0.12; camUpdate()
      }
      if(diamondRef.current)   diamondRef.current.rotation.y+=0.012
      if(indicatorRef.current) indicatorRef.current.rotation.y+=0.026
      renderer.render(scene,camera)
    }
    animate()

    const onResize=()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)}
    window.addEventListener('resize',onResize)

    return ()=>{
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
  useEffect(()=>{
    const renderer=rendererRef.current,camera=cameraRef.current,scene=sceneRef.current
    if(!renderer||!camera||!scene) return
    const rc=new THREE.Raycaster(),mo=new THREE.Vector2()
    const onClick=(e:MouseEvent)=>{
      if(droneModeRef.current) return
      mo.x=(e.clientX/window.innerWidth)*2-1; mo.y=-(e.clientY/window.innerHeight)*2+1
      rc.setFromCamera(mo,camera)
      if(hqHitRef.current){const h=rc.intersectObject(hqHitRef.current,false);if(h.length>0){setHqOpen(true);setSelected(null);return}}
      const hits=rc.intersectObjects(Array.from(hitMap.current.keys()),false)
      if(hits.length>0){
        const obj=hits[0].object,data=hitMap.current.get(obj); if(!data) return
        setSelected({...data.player,_team:data.team}); setHqOpen(false)
        if(indicatorRef.current) scene.remove(indicatorRef.current)
        const ind=new THREE.Mesh(new THREE.OctahedronGeometry(3.5,0),
          new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x7dd3fc,emissiveIntensity:9}))
        const wp=new THREE.Vector3(); obj.getWorldPosition(wp)
        ind.position.set(wp.x,wp.y+(obj.userData.halfH??5)+8,wp.z)
        ind.userData.city=true; indicatorRef.current=ind; scene.add(ind)
      } else {
        setSelected(null); setHqOpen(false)
        if(indicatorRef.current){scene.remove(indicatorRef.current);indicatorRef.current=null}
      }
    }
    renderer.domElement.addEventListener('click',onClick)
    return ()=>renderer.domElement.removeEventListener('click',onClick)
  },[])

  /* ── BUILD CITY ──────────────────────────────────── */
  const buildCity = useCallback(async(activeFmt:FmtTab)=>{
    const scene=sceneRef.current; if(!scene) return
    setLoading(true); setSelected(null); setHqOpen(false); setDbgInfo('Fetching players...')
    hitMap.current.clear()
    if(indicatorRef.current){scene.remove(indicatorRef.current);indicatorRef.current=null}
    disposeCity(scene)

    // Try fetchPlayers — attempt both uppercase and lowercase just in case
    let players:any[]=[]
    try {
      const result = await fetchPlayers(activeFmt)
      players = Array.isArray(result) ? result : []
      // If empty, try lowercase variant
      if(players.length===0){
        const result2 = await fetchPlayers(activeFmt.toLowerCase() as any)
        players = Array.isArray(result2) ? result2 : []
      }
      setDbgInfo(`Fetched ${players.length} players`)
      console.log(`[CricCity] ${activeFmt}: ${players.length} players`, players[0])
    } catch(err) {
      console.error('[CricCity] fetchPlayers failed:', err)
      setDbgInfo(`API error: ${String(err).slice(0,80)}`)
      setLoading(false); return
    }

    const mx=computeAllMax(players)
    setAllMx(mx)

    const grouped:Record<string,any[]>={}
    players.forEach(p=>{const k=normalizeCountry(p);if(!grouped[k])grouped[k]=[];grouped[k].push(p)})
    const snap:Record<string,number>={}
    Object.entries(grouped).forEach(([k,v])=>{snap[k]=v.length})
    setCounts(snap)

    setDbgInfo(`${players.length} players | ${Object.values(snap).reduce((a,b)=>a+b,0)} assigned`)

    const hq=buildHQ(diamondRef,hqHitRef); hq.userData.city=true; scene.add(hq)
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(420,420,8,8),
      new THREE.MeshStandardMaterial({color:0x0a1628,emissive:0x1d4ed8,emissiveIntensity:0.6}))
    hub.position.y=0.8; hub.userData.city=true; scene.add(hub)

    const goldTex=mkGoldTex()
    const fmtLower=activeFmt.toLowerCase() as Format

    TEAM_LAYOUT.forEach(({key,angle,label})=>{
      const p=getPal(key)
      buildRoad(scene,angle,RLEN,p.border)

      const raw=grouped[key]||[]
      const sorted=[...raw].sort((a,b)=>fmtScore(b,fmtLower,mx)-fmtScore(a,fmtLower,mx))
      const n=sorted.length

      const cScores=sorted.map(pl=>careerScore(pl,mx))
      const sMax=cScores.length>0?Math.max(...cScores):1
      const sMin=cScores.length>0?Math.min(...cScores):0
      const sRange=Math.max(sMax-sMin,0.001)

      const cx=Math.cos(angle)*DDIST, cz=Math.sin(angle)*DDIST
      const dg=new THREE.Group(); dg.position.set(cx,0,cz); dg.rotation.y=-angle; dg.userData.city=true; scene.add(dg)

      const perQ=Math.max(1,Math.ceil(n/4))
      const qC=Math.max(2,Math.ceil(Math.sqrt(perQ))), qR=Math.max(2,Math.ceil(perQ/qC))
      const startOff=IROAD+4
      const qSpanX=axisSpan(qC)+BSLOT, qSpanZ=axisSpan(qR)+BSLOT
      const platHW=startOff+qSpanX+DPAD/2, platHD=startOff+qSpanZ+DPAD/2
      const platW2=platHW*2, platD2=platHD*2

      const plate=new THREE.Mesh(new THREE.PlaneGeometry(platW2,platD2),
        new THREE.MeshStandardMaterial({color:new THREE.Color(p.ground),emissive:new THREE.Color(p.border),emissiveIntensity:n>0?0.10:0.02}))
      plate.rotation.x=-Math.PI/2; plate.position.y=0.1; dg.add(plate)

      addBorder(dg,platW2,platD2,p.border)
      addInnerCross(dg,platW2,platD2,p.border)

      const lbl=mkLabel(`${FLAG[key]||'🏏'} ${label}  (${n})`,p.border,1.4)
      lbl.position.set(0,280,-(platD2/2+60)); dg.add(lbl)

      if(n===0) return

      const texBat=mkWinTex(p.batsman),texBow=mkWinTex(p.bowler),texAll=mkWinTex(p.allrounder)
      const quads:Array<{pl:any;origIdx:number}[]>=[[],[],[],[]]
      sorted.forEach((pl,i)=>quads[i%4].push({pl,origIdx:i}))
      const qSigns=[[1,1],[-1,1],[-1,-1],[1,-1]]

      quads.forEach((qArr,qi)=>{
        const [sx,sz]=qSigns[qi]
        qArr.forEach(({pl,origIdx},ii)=>{
          const col=ii%qC, row=Math.floor(ii/qC)
          const {x:gx,z:gz}=slotPos(col,row)
          const px=sx*(startOff+gx+BSLOT*0.5), pz=sz*(startOff+gz+BSLOT*0.5)

          const cs=cScores[origIdx]??0
          const ns=isNaN(cs)?0:sRange>0?(cs-sMin)/sRange:0
          const isLeg=(origIdx===0)
          const role=(pl.personal_info?.role||pl.role||'').toLowerCase()
          const shape=pickShape(role,origIdx,ns)

          // ── BUILDING HEIGHT (edit these numbers to tune scale) ──
          let h=18
          if(isLeg)                  h=700+ns*200         // 700–900
          else if(role.includes('bowl')) h=80+Math.pow(ns,1.3)*380   // 80–460
          else if(role.includes('all'))  h=100+Math.pow(ns,1.1)*420  // 100–520
          else if(ns>0.85)           h=520+ns*190   // 520–710
          else if(ns>0.65)           h=330+ns*175   // 330–505
          else if(ns>0.40)           h=170+ns*145   // 170–315
          else if(ns>0.20)           h=75+ns*90     // 75–165
          else                       h=22+ns*55     // 22–77
          if(!isFinite(h)||h<=0) h=22

          const wBase=isLeg?28:role.includes('bowl')?20+ns*6:role.includes('all')?19+ns*7:18+ns*9
          const w=wBase

          if(isLeg){
            const gm=new THREE.MeshStandardMaterial({map:goldTex,emissiveMap:goldTex,emissive:new THREE.Color(0xffaa00),emissiveIntensity:2.8})
            const bldg=buildingGroup('tower',w,h,gm); bldg.position.set(px,0,pz); dg.add(bldg)
            const rMat=new THREE.MeshStandardMaterial({color:0xffaa00,emissive:0xffaa00,emissiveIntensity:5.0,side:THREE.DoubleSide})
            const ring=new THREE.Mesh(new THREE.RingGeometry(w*0.9,w*1.35,36),rMat)
            ring.rotation.x=-Math.PI/2; ring.position.set(px,h*0.46,pz); dg.add(ring)
            const nm=(pl.name||pl.full_name||'').toUpperCase()||'LEGEND'
            const ll=mkLabel(`★ ${nm}`,0xffd700,1.2); ll.position.set(px,h+160,pz); dg.add(ll)
            const hb=new THREE.Mesh(new THREE.BoxGeometry(w*1.5,h,w*1.5),new THREE.MeshBasicMaterial({visible:false}))
            hb.position.set(px,h/2,pz); hb.userData.halfH=h/2; dg.add(hb)
            hitMap.current.set(hb,{player:pl,team:key})
          } else {
            let tex:THREE.CanvasTexture,emCol:number,emInt:number
            if(role.includes('bowl'))     {tex=texBow;emCol=p.bowler;    emInt=0.36+ns*1.1}
            else if(role.includes('all')) {tex=texAll;emCol=p.allrounder;emInt=0.34+ns*1.0}
            else                          {tex=texBat;emCol=p.batsman;   emInt=0.34+ns*1.2}
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
  },[])

  useEffect(()=>{ buildCity(fmt) },[fmt, buildCity])

  /* ── DRONE TOGGLE ────────────────────────────────── */
  const toggleDrone=()=>{
    const next=!droneMode; droneModeRef.current=next
    setDroneMode(next); setSelected(null); setHqOpen(false)
    const scene=sceneRef.current,camera=cameraRef.current
    if(!scene||!camera) return
    if(next){
      const {group,rotors}=buildDroneMesh()
      group.position.copy(camera.position); group.position.y=Math.max(14,camera.position.y)
      group.scale.setScalar(0.4); droneYawRef.current=Math.PI; group.userData.city=true
      droneGroupRef.current=group; droneRotors.current=rotors; scene.add(group)
    } else {
      if(droneGroupRef.current){
        scene.remove(droneGroupRef.current)
        droneGroupRef.current.traverse(c=>{if((c as THREE.Mesh).isMesh)(c as THREE.Mesh).geometry.dispose()})
        droneGroupRef.current=null; droneRotors.current=[]
      }
      distRef.current=1300; tDistRef.current=1300
    }
  }

  const FMTS:FmtTab[]=['TEST','ODI','T20']
  const S=(x:any,fb:any='—')=>x!=null?String(x):fb
  const totalPlayers=Object.values(counts).reduce((a,b)=>a+b,0)

  /* ── JSX ─────────────────────────────────────────── */
  return(
    <div style={{width:'100vw',height:'100vh',background:'#000',position:'relative',overflow:'hidden',userSelect:'none'}}>
      <div ref={mountRef} style={{width:'100%',height:'100%'}}/>

      {/* Branding */}
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

      {/* Team pills */}
      {Object.keys(counts).length>0&&(
        <div style={{position:'absolute',top:70,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center',maxWidth:660,pointerEvents:'none'}}>
          {TEAM_LAYOUT.map(({key,label})=>{
            const cnt=counts[key]??0, hex='#'+new THREE.Color(getPal(key).border).getHexString()
            return<span key={key} style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',letterSpacing:'0.12em',padding:'2px 9px',borderRadius:3,border:`1px solid ${hex}`,color:hex,background:'rgba(0,4,18,0.75)',opacity:cnt>0?1:0.22}}>{label.slice(0,3)}&nbsp;{cnt}</span>
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

      {/* Debug info — shows player count and API status */}
      {dbgInfo&&(
        <div style={{position:'absolute',bottom:20,right:droneMode?'unset':20,left:droneMode?20:undefined,zIndex:10,pointerEvents:'none'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.48rem',letterSpacing:'0.12em',color:totalPlayers>0?'#22c55e':'#f87171',background:'rgba(0,4,18,0.7)',padding:'3px 8px',borderRadius:4,border:`1px solid ${totalPlayers>0?'#22c55e':'#f87171'}33`}}>
            {dbgInfo}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading&&(
        <div style={{position:'absolute',inset:0,zIndex:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,4,16,0.82)',backdropFilter:'blur(6px)'}}>
          <div style={{fontFamily:'"Courier New",monospace',fontSize:'1rem',letterSpacing:'0.32em',color:'#38bdf8',animation:'cwP 1.2s infinite'}}>BUILDING CITY...</div>
          <div style={{display:'flex',gap:6,marginTop:18}}>{[0,1,2,3,4].map(i=><div key={i} style={{width:6,height:6,background:'#38bdf8',borderRadius:'50%',animation:`cwB 0.8s ${i*0.12}s infinite`}}/>)}</div>
        </div>
      )}

      {/* HQ card */}
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
            {[{v:totalPlayers,l:'TOTAL PLAYERS',c:'#38bdf8'},{v:8,l:'NATIONS',c:'#60a5fa'},{v:'TEST·ODI·T20',l:'FORMATS',c:'#7dd3fc'}].map(({v,l,c})=>(
              <div key={l} style={{textAlign:'center',flex:1}}>
                <div style={{fontFamily:'"Courier New",monospace',fontSize:typeof v==='number'?'2.0rem':'0.9rem',fontWeight:700,color:c}}>{v}</div>
                <div style={{fontFamily:'"Courier New",monospace',fontSize:'0.52rem',color:'#1e4d8c',letterSpacing:'0.15em',marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'14px 22px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {TEAM_LAYOUT.map(({key,label})=>{
              const cnt=counts[key]??0, hex='#'+new THREE.Color(getPal(key).border).getHexString()
              const pct=cnt>0?Math.round((cnt/Math.max(1,totalPlayers))*100):0
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
        const p=getPal(selected._team), thx='#'+new THREE.Color(p.border).getHexString()
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

function DroneBtn({onPress,label,wide=false,title}:{onPress:(v:boolean)=>void;label:string;wide?:boolean;title?:string}) {
  return(
    <button title={title}
      onPointerDown={()=>onPress(true)} onPointerUp={()=>onPress(false)} onPointerLeave={()=>onPress(false)}
      style={{width:wide?88:48,height:48,background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.45)',borderRadius:7,color:'#fbbf24',fontSize:wide?'0.62rem':'1.05rem',fontFamily:'"Courier New",monospace',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',userSelect:'none',touchAction:'none',letterSpacing:wide?'0.1em':'0',transition:'background .1s'}}
    >{label}</button>
  )
}

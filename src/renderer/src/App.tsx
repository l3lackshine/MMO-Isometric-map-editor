import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Box, Grid3X3, Layers, MousePointer2, Mountain, Move, Plus, Save, Upload, ZoomIn, ZoomOut, Undo2, Redo2, ImagePlus, Eye, EyeOff } from "lucide-react";

type MapObject = { id:number; kind:string; x:number; y:number; z:number; height?:number; floorLevel?:number; secret?:boolean; boss?:boolean; orientation?:string; scale:number; color:string; layer:string; imageData?:string; imageName?:string };
type Layer = { id:string; name:string; visible:boolean };
type Snapshot = { objects:MapObject[]; selected:number|null; mapSize:number; layers:Layer[]; projectName:string };
const MIN_MAP_SIZE=16;
const MAX_MAP_SIZE=512;
const MAP_SIZE_PRESETS=[16,32,64,128,256,512];
const clampMapSize=(value:number)=>Math.max(MIN_MAP_SIZE,Math.min(MAX_MAP_SIZE,Math.round(value)||MIN_MAP_SIZE));
const palette = [
  {name:"Grass",color:"#668b62",kind:"tile"},{name:"Stone",color:"#92969c",kind:"tile"},{name:"Water",color:"#4f8fb4",kind:"tile"},
  {name:"Tree",color:"#315f45",kind:"tree"},{name:"House",color:"#b77c56",kind:"house"},{name:"Rock",color:"#777d88",kind:"rock"},{name:"Flower",color:"#d98eb1",kind:"flower"}
];
const initialLayers:Layer[]=[{id:"ground",name:"Ground",visible:true},{id:"objects",name:"Objects",visible:true},{id:"decoration",name:"Decoration",visible:true}];

export default function App(){
  const canvasRef=useRef<HTMLCanvasElement>(null); const imageCache=useRef(new Map<string,HTMLImageElement>()); const gridCache=useRef<{key:string;canvas:HTMLCanvasElement}|null>(null); const renderFrame=useRef<number| null>(null);
  const [tool,setTool]=useState("select"); const [zoom,setZoom]=useState(1); const [performanceMode,setPerformanceMode]=useState<"low"|"balanced"|"high">("low"); const [objects,setObjects]=useState<MapObject[]>([]); const [selected,setSelected]=useState<number|null>(null);
  const [activeAsset,setActiveAsset]=useState(palette[0]); const [mapSize,setMapSize]=useState(20); const [terrainHeight,setTerrainHeight]=useState(1); const [showGrid,setShowGrid]=useState(true); const [layers,setLayers]=useState<Layer[]>(initialLayers); const [activeLayer,setActiveLayer]=useState("objects");
  const [history,setHistory]=useState<Snapshot[]>([]); const [future,setFuture]=useState<Snapshot[]>([]); const [dragging,setDragging]=useState(false); const [projectName,setProjectName]=useState("Untitled Map"); const [maxMountainHeight,setMaxMountainHeight]=useState(8); const [layoutType,setLayoutType]=useState("dungeon"); const [roomCount,setRoomCount]=useState(8); const [roomShape,setRoomShape]=useState("mixed"); const [floorCount,setFloorCount]=useState(2); const [secretRoomChance,setSecretRoomChance]=useState(25); const [bossRoomEnabled,setBossRoomEnabled]=useState(true); const [terrainBrushSize,setTerrainBrushSize]=useState(2); const [terrainBrushMode,setTerrainBrushMode]=useState("raise"); const [rampOrientation,setRampOrientation]=useState("east-west"); const [rampRise,setRampRise]=useState(2);
  const nextId=useRef(1); const dragOffset=useRef({x:0,y:0}); const lastPoint=useRef<{x:number;y:number}|null>(null); const painting=useRef(false); const paintedCells=useRef(new Set<string>());
  const selectedObject=objects.find(o=>o.id===selected)??null;
  // Derived render data is built once per edit instead of filtering/sorting on every paint.
  const visibleLayerIds=useMemo(()=>new Set(layers.filter(l=>l.visible).map(l=>l.id)),[layers]);
  const visibleObjects=useMemo(()=>objects.filter(o=>visibleLayerIds.has(o.layer)),[objects,visibleLayerIds]);
  const terrainObjects=useMemo(()=>visibleObjects.filter(o=>o.kind==="tile"),[visibleObjects]);
  const tileAt=useMemo(()=>new Map<string,MapObject>(terrainObjects.map(o=>[`${o.x},${o.y},${o.floorLevel||0}`,o] as [string,MapObject])),[terrainObjects]);
  const sortedTerrain=useMemo(()=>[...terrainObjects].sort((a,b)=>(a.x+a.y)-(b.x+b.y)),[terrainObjects]);
  const sortedObjects=useMemo(()=>visibleObjects.filter(o=>o.kind!=="tile").sort((a,b)=>(a.x+a.y+a.z+(Number(tileAt.get(`${a.x},${a.y},0`)?.height)||0))-(b.x+b.y+b.z+(Number(tileAt.get(`${b.x},${b.y},0`)?.height)||0))),[visibleObjects,tileAt]);
  const hitCandidates=useMemo(()=>[...visibleObjects].sort((a,b)=>(b.x+b.y+b.z+(Number(tileAt.get(`${b.x},${b.y},0`)?.height)||0))-(a.x+a.y+a.z+(Number(tileAt.get(`${a.x},${a.y},0`)?.height)||0))),[visibleObjects,tileAt]);
  const project=useMemo(()=>({format:"blackshine-map",version:3,projection:"isometric",tileWidth:64,tileHeight:32,mapSize,objects,layers,projectName}),[mapSize,objects,layers,projectName]);
  const pushHistory=useCallback((override?:Snapshot)=>{const snap=override??{objects,selected,mapSize,layers,projectName};setHistory(h=>[...h.slice(-99),snap]);setFuture([]);},[objects,selected,mapSize,layers,projectName]);
  const toGrid=(sx:number,sy:number,w:number)=>{const tw=64*zoom,th=32*zoom,ox=w/2,oy=105;const dx=sx-ox,dy=sy-oy-16*zoom;return{x:(dx/tw*2+dy/th*2)/2,y:(dy/th*2-dx/tw*2)/2};};
  const toScreen=(x:number,y:number,w:number)=>({x:w/2+(x-y)*32*zoom,y:105+(x+y)*16*zoom});

  function draw(ctx:CanvasRenderingContext2D,w:number,h:number){
    const tw=64*zoom,th=32*zoom;
    const corners=[[0,0],[w,0],[0,h],[w,h]].map(([sx,sy])=>toGrid(sx,sy,w));
    const margin=3,minX=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x)))-margin),maxX=Math.min(mapSize-1,Math.ceil(Math.max(...corners.map(p=>p.x)))+margin),minY=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y)))-margin),maxY=Math.min(mapSize-1,Math.ceil(Math.max(...corners.map(p=>p.y)))+margin);
    // Cache the static map/grid layer; edits only repaint dynamic terrain and objects.
    const cacheKey=`${Math.round(w)}x${Math.round(h)}:${zoom}:${mapSize}:${showGrid}`;
    if(!gridCache.current||gridCache.current.key!==cacheKey){
      const base=document.createElement("canvas");base.width=Math.max(1,Math.round(w));base.height=Math.max(1,Math.round(h));
      const bctx=base.getContext("2d");if(bctx){bctx.fillStyle="#171a24";bctx.fillRect(0,0,base.width,base.height);for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const p=toScreen(x,y,w);bctx.beginPath();bctx.moveTo(p.x,p.y);bctx.lineTo(p.x+tw/2,p.y+th/2);bctx.lineTo(p.x,p.y+th);bctx.lineTo(p.x-tw/2,p.y+th/2);bctx.closePath();bctx.fillStyle=(x+y)%2===0?"#293b36":"#2d403a";bctx.fill();if(showGrid){bctx.strokeStyle="rgba(177,207,190,.22)";bctx.lineWidth=1;bctx.stroke();}}}
      gridCache.current={key:cacheKey,canvas:base};
    }
    ctx.clearRect(0,0,w,h);ctx.drawImage(gridCache.current.canvas,0,0,w,h);
    const terrain=terrainObjects;
    const shade=(hex:string,factor:number)=>{const n=parseInt(hex.slice(1),16),r=Math.max(0,Math.min(255,Math.round(((n>>16)&255)*factor))),g=Math.max(0,Math.min(255,Math.round(((n>>8)&255)*factor))),b=Math.max(0,Math.min(255,Math.round((n&255)*factor)));return `rgb(${r},${g},${b})`;};
    for(const o of sortedTerrain){
      const p=toScreen(o.x,o.y,w);if(p.x < -tw || p.x > w+tw || p.y < -120*zoom || p.y > h+120*zoom)continue;const level=Math.max(0,Number(o.height)||0)+Math.max(0,Number(o.floorLevel)||0)*4,centerY=p.y+16*zoom-level*16*zoom,halfW=32*zoom,halfH=16*zoom;
      const floorKey=o.floorLevel||0;const right=tileAt.get(`${o.x+1},${o.y},${floorKey}`),front=tileAt.get(`${o.x},${o.y+1},${floorKey}`);
      const rightLevel=Math.max(0,Number(right?.height)||0)+Math.max(0,Number(right?.floorLevel)||0)*4,frontLevel=Math.max(0,Number(front?.height)||0)+Math.max(0,Number(front?.floorLevel)||0)*4;
      ctx.save();
      // Exposed south-east wall (right-to-bottom edge).
      if(level>rightLevel){const drop=(level-rightLevel)*16*zoom;ctx.beginPath();ctx.moveTo(p.x+halfW,centerY);ctx.lineTo(p.x,centerY+halfH);ctx.lineTo(p.x,centerY+halfH+drop);ctx.lineTo(p.x+halfW,centerY+drop);ctx.closePath();ctx.fillStyle=shade(o.color,.58);ctx.fill();ctx.strokeStyle="rgba(0,0,0,.18)";ctx.stroke();}
      // Exposed south-west wall (bottom-to-left edge).
      if(level>frontLevel){const drop=(level-frontLevel)*16*zoom;ctx.beginPath();ctx.moveTo(p.x,centerY+halfH);ctx.lineTo(p.x-halfW,centerY);ctx.lineTo(p.x-halfW,centerY+drop);ctx.lineTo(p.x,centerY+halfH+drop);ctx.closePath();ctx.fillStyle=shade(o.color,.72);ctx.fill();ctx.strokeStyle="rgba(0,0,0,.18)";ctx.stroke();}
      ctx.beginPath();ctx.moveTo(p.x,centerY-halfH);ctx.lineTo(p.x+halfW,centerY);ctx.lineTo(p.x,centerY+halfH);ctx.lineTo(p.x-halfW,centerY);ctx.closePath();ctx.fillStyle=o.color;ctx.fill();ctx.strokeStyle="rgba(255,255,255,.16)";ctx.stroke();
      if(selected===o.id){ctx.strokeStyle="#f0c47a";ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.stroke();}
      ctx.restore();
    }
    for(const o of sortedObjects){const p=toScreen(o.x,o.y,w);if(p.x < -220*zoom || p.x > w+220*zoom || p.y < -220*zoom || p.y > h+160*zoom)continue;const s=o.scale*zoom;const ground=tileAt.get(`${o.x},${o.y},0`);ctx.save();ctx.translate(p.x,p.y+16*zoom-(o.z+(Number(ground?.height)||0)*16)*zoom);
      if(o.imageData){let img=imageCache.current.get(o.imageData);if(!img){img=new Image();img.src=o.imageData;img.onload=()=>{const c=canvasRef.current?.getContext("2d");if(c&&canvasRef.current)draw(c,canvasRef.current.clientWidth,canvasRef.current.clientHeight);};imageCache.current.set(o.imageData,img);}if(img.complete&&img.naturalWidth){const iw=img.naturalWidth,ih=img.naturalHeight,scale=Math.min(160/iw,160/ih)*s;ctx.drawImage(img,-iw*scale/2,-ih*scale,iw*scale,ih*scale);}}
      else if(o.kind==="tree"){ctx.fillStyle="#6b4936";ctx.fillRect(-4*s,0,8*s,25*s);ctx.fillStyle=o.color;ctx.beginPath();ctx.arc(0,-8*s,18*s,0,Math.PI*2);ctx.fill();ctx.fillStyle="rgba(255,255,255,.13)";ctx.beginPath();ctx.arc(-6*s,-15*s,7*s,0,Math.PI*2);ctx.fill();}
      else if(o.kind==="house"){ctx.fillStyle="#8a5a42";ctx.fillRect(-18*s,-22*s,36*s,25*s);ctx.fillStyle=o.color;ctx.beginPath();ctx.moveTo(-22*s,-22*s);ctx.lineTo(0,-42*s);ctx.lineTo(22*s,-22*s);ctx.closePath();ctx.fill();ctx.fillStyle="#3d2c2b";ctx.fillRect(-4*s,-13*s,9*s,16*s);}
      else if(o.kind==="rock"){ctx.fillStyle=o.color;ctx.beginPath();ctx.moveTo(-14*s,0);ctx.lineTo(-11*s,-14*s);ctx.lineTo(2*s,-21*s);ctx.lineTo(15*s,-9*s);ctx.lineTo(12*s,0);ctx.closePath();ctx.fill();}
      else if(o.kind==="wall"){
        const hh=38*s;ctx.fillStyle=shade(o.color,.62);ctx.beginPath();ctx.moveTo(-25*s,-hh+14*s);ctx.lineTo(0,-hh+28*s);ctx.lineTo(0,14*s);ctx.lineTo(-25*s,0);ctx.closePath();ctx.fill();
        ctx.fillStyle=shade(o.color,.78);ctx.beginPath();ctx.moveTo(0,-hh+28*s);ctx.lineTo(25*s,-hh+14*s);ctx.lineTo(25*s,0);ctx.lineTo(0,14*s);ctx.closePath();ctx.fill();
        ctx.fillStyle=o.color;ctx.beginPath();ctx.moveTo(-25*s,-hh+14*s);ctx.lineTo(0,-hh);ctx.lineTo(25*s,-hh+14*s);ctx.lineTo(0,-hh+28*s);ctx.closePath();ctx.fill();ctx.strokeStyle="rgba(0,0,0,.28)";ctx.stroke();
      }
      else if(o.kind==="ramp"||o.kind==="stairs"){
        const rise=(o.height||rampRise)*16*s;ctx.fillStyle=o.kind==="ramp"?"#9a8062":"#8c8f98";ctx.beginPath();if((o.orientation||rampOrientation)==="east-west"){ctx.moveTo(-28*s,0);ctx.lineTo(28*s,0);ctx.lineTo(28*s,-rise);ctx.lineTo(-28*s,0);}else{ctx.moveTo(0,-16*s);ctx.lineTo(28*s,0);ctx.lineTo(0,rise-16*s);ctx.lineTo(-28*s,0);}ctx.closePath();ctx.fill();ctx.strokeStyle="#d8c3a0";ctx.stroke();if(o.kind==="stairs"){ctx.strokeStyle="#4a4542";for(let i=1;i<5;i++){const t=i/5;ctx.beginPath();ctx.moveTo(-25*s+50*s*t,-rise*t);ctx.lineTo(25*s-50*s*t,-rise*t);ctx.stroke();}}
      }
      else if(o.kind==="secretDoor"||o.kind==="door"){
        ctx.fillStyle="#34251f";ctx.fillRect(-12*s,-34*s,24*s,34*s);ctx.fillStyle=o.color;ctx.fillRect(-16*s,-38*s,5*s,38*s);ctx.fillRect(11*s,-38*s,5*s,38*s);ctx.fillRect(-16*s,-42*s,32*s,5*s);ctx.fillStyle="#d6ae6d";ctx.beginPath();ctx.arc(7*s,-18*s,2*s,0,Math.PI*2);ctx.fill();
      }
      else if(o.kind==="flower"){ctx.fillStyle=o.color;for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*6*s,Math.sin(a)*6*s-7*s,5*s,0,Math.PI*2);ctx.fill();}ctx.fillStyle="#f5d77d";ctx.beginPath();ctx.arc(0,-7*s,3*s,0,Math.PI*2);ctx.fill();}
      if(selected===o.id){ctx.strokeStyle="#f0c47a";ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(-26*s,-Math.max(48*s, o.imageData?100*s:48*s),52*s,Math.max(52*s,o.imageData?104*s:52*s));}ctx.restore();
    }
  }
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d",{alpha:false,desynchronized:true});if(!ctx)return;let width=0,height=0,dpr=1;const render=()=>{renderFrame.current=null;const r=canvas.getBoundingClientRect();width=Math.max(1,Math.round(r.width));height=Math.max(1,Math.round(r.height));const cap=performanceMode==="low"?1:performanceMode==="balanced"?1.5:2;dpr=Math.min(window.devicePixelRatio||1,cap);const pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=performanceMode!=="low";draw(ctx,width,height);};const schedule=()=>{if(renderFrame.current===null)renderFrame.current=requestAnimationFrame(render);};const observer=new ResizeObserver(schedule);observer.observe(canvas);schedule();return()=>{observer.disconnect();if(renderFrame.current!==null)cancelAnimationFrame(renderFrame.current);};},[objects,zoom,mapSize,showGrid,selected,layers,performanceMode,visibleObjects,terrainObjects,sortedTerrain,sortedObjects,tileAt,hitCandidates]);
  function addObject(x:number,y:number,asset=activeAsset){pushHistory();const isTerrain=asset.kind==="tile";const o:MapObject={id:nextId.current++,kind:asset.kind,x:Math.max(0,Math.min(mapSize-1,Math.round(x))),y:Math.max(0,Math.min(mapSize-1,Math.round(y))),z:0,height:isTerrain?terrainHeight:0,scale:1,color:asset.color,layer:isTerrain?"ground":activeLayer};setObjects(p=>[...p,o]);setSelected(o.id);}
  function hitObject(sx:number,sy:number,w:number){return hitCandidates.find(o=>{const p=toScreen(o.x,o.y,w),ground=tileAt.get(`${o.x},${o.y},0`),baseY=p.y+16*zoom-(o.z+(Number(ground?.height)||0)*16)*zoom,dx=(sx-p.x)/zoom,dy=(sy-baseY)/zoom;return o.kind==="tile"?Math.abs(dx)<32&&dy>=-16&&dy<=16:Math.abs(dx)<(o.imageData?70:30)*o.scale&&dy<12&&dy>-(o.imageData?150:60)*o.scale;});}
  function paintTerrainAt(sx:number,sy:number,w:number){
    const g=toGrid(sx,sy,w),cx=Math.round(g.x),cy=Math.round(g.y),radius=Math.max(0,terrainBrushSize-1),updates=new Map<string,number>();
    for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
      if(x<0||y<0||x>=mapSize||y>=mapSize)continue;
      const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy>radius*radius+0.5)continue;
      const k=`${x},${y}`;if(paintedCells.current.has(k))continue;paintedCells.current.add(k);updates.set(k,terrainBrushMode==="lower"?Math.max(0,terrainHeight-1):terrainHeight);
    }
    if(!updates.size)return;
    setObjects(prev=>{const next=[...prev],indexByCell=new Map<string,number>();for(let i=0;i<next.length;i++){const o=next[i];if(o.kind==="tile"&&(o.floorLevel||0)===0)indexByCell.set(`${o.x},${o.y}`,i);}for(const [key,level] of updates){const [x,y]=key.split(",").map(Number),idx=indexByCell.get(key);if(idx!==undefined)next[idx]={...next[idx],height:level};else{indexByCell.set(key,next.length);next.push({id:nextId.current++,kind:"tile",x,y,z:0,height:level,scale:1,color:"#668b62",layer:"ground"});}}return next;});
  }
  function onPointerDown(e:PointerEvent<HTMLCanvasElement>){const r=e.currentTarget.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
    if(tool==="terrain"){pushHistory();paintedCells.current.clear();painting.current=true;paintTerrainAt(sx,sy,r.width);e.currentTarget.setPointerCapture(e.pointerId);return;}
    if(tool==="ramp"||tool==="stairs"){const g=toGrid(sx,sy,r.width),x=Math.max(0,Math.min(mapSize-1,Math.round(g.x))),y=Math.max(0,Math.min(mapSize-1,Math.round(g.y)));pushHistory();const o:MapObject={id:nextId.current++,kind:tool,x,y,z:0,height:rampRise,scale:1,color:tool==="ramp"?"#a58a67":"#9a9da5",layer:"objects",orientation:rampOrientation};setObjects(p=>[...p,o]);setSelected(o.id);return;}
    const hit=hitObject(sx,sy,r.width);if(tool==="place"){const g=toGrid(sx,sy,r.width);addObject(g.x,g.y);return;}if(hit){setSelected(hit.id);if(tool==="move"||tool==="select"){pushHistory();const p=toScreen(hit.x,hit.y,r.width);dragOffset.current={x:sx-p.x,y:sy-p.y};lastPoint.current={x:sx,y:sy};setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);}}else{setSelected(null);}}
  function onPointerMove(e:PointerEvent<HTMLCanvasElement>){const r=e.currentTarget.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;if(painting.current){paintTerrainAt(sx,sy,r.width);return;}if(!dragging||selected===null)return;const g=toGrid(sx-dragOffset.current.x,sy-dragOffset.current.y,r.width);setObjects(p=>p.map(o=>o.id===selected?{...o,x:Math.max(0,Math.min(mapSize-1,Math.round(g.x))),y:Math.max(0,Math.min(mapSize-1,Math.round(g.y)))}:o));lastPoint.current={x:sx,y:sy};}
  function onPointerUp(){setDragging(false);painting.current=false;paintedCells.current.clear();lastPoint.current=null;}
  function updateSelected(key:keyof MapObject,value:number){pushHistory();setObjects(p=>p.map(o=>o.id===selected?{...o,[key]:value}:o));}
  function generateMountains(){
    const maxHeight=Math.max(1,Math.min(12,Math.round(maxMountainHeight)||1));
    const peakCount=Math.max(1,Math.min(32,Math.round(mapSize*mapSize/500)));
    const peaks=Array.from({length:peakCount},()=>({x:Math.random()*(mapSize-1),y:Math.random()*(mapSize-1),radius:Math.max(2,mapSize/(peakCount>12?5:3.5))*(0.72+Math.random()*0.65),strength:0.72+Math.random()*0.28}));
    const existing=new Map<string,MapObject>(objects.filter(o=>o.kind==="tile").map(o=>[`${o.x},${o.y}`,o] as [string,MapObject]));
    const generated:MapObject[]=[];
    for(let y=0;y<mapSize;y++)for(let x=0;x<mapSize;x++){
      let elevation=0;
      for(const peak of peaks){const dx=x-peak.x,dy=y-peak.y;const d=Math.sqrt(dx*dx+dy*dy);const influence=peak.strength*Math.exp(-(d*d)/(2*peak.radius*peak.radius));if(influence>elevation)elevation=influence;}
      const roughness=(Math.random()-0.5)*0.22;
      const level=Math.max(0,Math.min(maxHeight,Math.round((elevation+roughness)*maxHeight)));
      if(level<=0)continue;
      const old=existing.get(`${x},${y}`);
      generated.push(old?{...old,height:level}:{id:nextId.current++,kind:"tile",x,y,z:0,height:level,scale:1,color:"#668b62",layer:"ground"});
    }
    pushHistory();
    const generatedByKey=new Map<string,MapObject>(generated.map(o=>[`${o.x},${o.y}`,o] as [string,MapObject]));
    setObjects(prev=>{
      const nonTerrain=prev.filter(o=>o.kind!=="tile");
      const existingTerrain=prev.filter(o=>o.kind==="tile").map(o=>generatedByKey.get(`${o.x},${o.y}`)??{...o,height:0});
      const newTerrain=generated.filter(o=>!existing.has(`${o.x},${o.y}`));
      return [...nonTerrain,...existingTerrain,...newTerrain];
    });
    setSelected(null);setTool("select");
  }
  function generateRooms(){
    const count=Math.max(2,Math.min(30,Math.round(roomCount)||2));
    type RoomShape="rectangle"|"circle"|"octagon"|"lshape"|"cross"|"freeform"|"boss";
    const shapeOptions:RoomShape[]=["rectangle","circle","octagon","lshape","cross","freeform"];
    const rooms:{x:number;y:number;w:number;h:number;shape:RoomShape;cells:Set<string>;secret:boolean;boss:boolean;floor:number}[]=[];
    const occupied=new Set<string>();
    const corridor=new Set<string>();
    const key=(x:number,y:number)=>`${x},${y}`;
    const inside=(x:number,y:number)=>x>=1&&y>=1&&x<mapSize-1&&y<mapSize-1;
    const makeCells=(x:number,y:number,w:number,h:number,shape:RoomShape)=>{
      const cells=new Set<string>();
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
        const nx=xx/(w-1||1),ny=yy/(h-1||1);let include=true;
        if(shape==="circle"){const dx=(nx-.5)*2,dy=(ny-.5)*2;include=dx*dx+dy*dy<=1.12;}
        else if(shape==="octagon"){const cut=Math.max(1,Math.floor(Math.min(w,h)*.23));include=!((xx<cut&&yy<cut-cut*xx/cut)||(xx>=w-cut&&yy<cut-(w-1-xx))||(xx<cut&&yy>=h-cut-(xx))||(xx>=w-cut&&yy>=h-cut-(w-1-xx)));}
        else if(shape==="lshape"){include=xx<Math.max(2,Math.ceil(w*.42))||yy>=Math.floor(h*.58);}
        else if(shape==="cross"){include=xx>=Math.floor(w*.32)&&xx<Math.ceil(w*.68)||yy>=Math.floor(h*.32)&&yy<Math.ceil(h*.68);}
        else if(shape==="freeform"){const edgeNoise=(Math.sin(xx*1.7+yy*.63)+Math.cos(yy*1.35-xx*.4))*.10;const dx=(nx-.5)*2,dy=(ny-.5)*2;include=dx*dx+dy*dy<(1.05+edgeNoise);}
        else if(shape==="boss"){const dx=(nx-.5)*2,dy=(ny-.5)*2;include=dx*dx+dy*dy<1.16; }
        if(include)cells.add(key(x+xx,y+yy));
      }
      return cells;
    };
    // Place rooms using their actual footprints, preserving a one-tile gap for walls.
    for(let attempt=0;attempt<count*60&&rooms.length<count;attempt++){
      const maxRoom=Math.max(4,Math.min(9,Math.floor(mapSize/3)));
      const w=Math.min(mapSize-4,4+Math.floor(Math.random()*(maxRoom-3)));
      const h=Math.min(mapSize-4,4+Math.floor(Math.random()*(maxRoom-3)));
      const x=1+Math.floor(Math.random()*Math.max(1,mapSize-w-2));
      const y=1+Math.floor(Math.random()*Math.max(1,mapSize-h-2));
      const isBoss=bossRoomEnabled&&rooms.length===count-1;const shape=(isBoss?"boss":(roomShape==="mixed"?shapeOptions[Math.floor(Math.random()*shapeOptions.length)]:roomShape)) as RoomShape;
      const cells=makeCells(x,y,w,h,shape);let clear=true;
      for(const cell of cells){const [cx,cy]=cell.split(",").map(Number);if(!inside(cx,cy)){clear=false;break;}for(let yy=cy-1;yy<=cy+1&&clear;yy++)for(let xx=cx-1;xx<=cx+1;xx++)if(occupied.has(key(xx,yy))){clear=false;break;}}
      if(!clear||cells.size<7)continue;
      const room={x,y,w,h,shape,cells,secret:!isBoss&&Math.random()*100<secretRoomChance,boss:isBoss,floor:rooms.length%Math.max(1,Math.min(floorCount,count))};rooms.push(room);for(const cell of cells)occupied.add(cell);
    }
    if(rooms.length<2){alert("พื้นที่แผนที่ไม่เพียงพอสำหรับสร้างห้อง กรุณาเพิ่มขนาดแผนที่หรือลดจำนวนห้อง");return;}
    const floor=new Set(occupied);const cellFloor=new Map<string,number>();for(const room of rooms)for(const cell of room.cells)cellFloor.set(cell,room.floor);const carve=(x:number,y:number)=>{if(inside(x,y)){floor.add(key(x,y));corridor.add(key(x,y));}};
    const centers=rooms.map(r=>{const pts=[...r.cells].map(v=>v.split(",").map(Number));return{x:Math.round(pts.reduce((a,p)=>a+p[0],0)/pts.length),y:Math.round(pts.reduce((a,p)=>a+p[1],0)/pts.length)};});
    for(let i=1;i<centers.length;i++){
      let x=centers[i-1].x,y=centers[i-1].y;const target=centers[i];const horizontalFirst=Math.random()<.5;
      if(horizontalFirst){while(x!==target.x){carve(x,y);x+=Math.sign(target.x-x);}while(y!==target.y){carve(x,y);y+=Math.sign(target.y-y);}}
      else{while(y!==target.y){carve(x,y);y+=Math.sign(target.y-y);}while(x!==target.x){carve(x,y);x+=Math.sign(target.x-x);}}
      carve(target.x,target.y);
    }
    const cellSecret=new Map<string,boolean>();for(const room of rooms)if(room.secret)for(const cell of room.cells)cellSecret.set(cell,true);const wallCells=new Map<string,{x:number;y:number;door:boolean;secret:boolean;floorLevel:number}>();const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    for(const cell of floor){const [sx,sy]=cell.split(",").map(Number);for(const [dx,dy] of dirs){const x=sx+dx,y=sy+dy,k=key(x,y);if(!inside(x,y)||floor.has(k))continue;const old=wallCells.get(k);const adjacent=dirs.map(([ax,ay])=>key(x+ax,y+ay));const touchesCorridor=adjacent.some(n=>corridor.has(n));const secret=adjacent.some(n=>cellSecret.has(n));const floorLevel=cellFloor.get(adjacent.find(n=>cellFloor.has(n))||"")||0;wallCells.set(k,{x,y,door:(old?.door??false)||touchesCorridor||secret,secret:(old?.secret??false)||secret,floorLevel});}}
    const floorColor=layoutType==="dungeon"?"#777b82":"#9a7655";const wallColor=layoutType==="dungeon"?"#9ca3ad":"#b58b61";
    const newObjects:MapObject[]=[];const existingTiles=new Map<string,MapObject>(objects.filter(o=>o.kind==="tile").map(o=>[key(o.x,o.y),o] as [string,MapObject]));
    for(const cell of floor){const [x,y]=cell.split(",").map(Number);const fl=cellFloor.get(cell)||0;const old=existingTiles.get(cell);newObjects.push({...(old||{id:nextId.current++,kind:"tile",x,y,z:0,height:0,scale:1,color:floorColor,layer:"ground"}),height:0,floorLevel:fl,color:floorColor,layer:"ground"});}
    for(const wall of wallCells.values()){const isDoor=wall.secret||(wall.door&&Math.random()<.78);newObjects.push({id:nextId.current++,kind:isDoor?(wall.secret?"secretDoor":"door"):"wall",x:wall.x,y:wall.y,z:wall.floorLevel*64,scale:1,color:isDoor?(wall.secret?"#514b62":layoutType==="dungeon"?"#9a7049":"#d2a36a"):wallColor,layer:"objects",secret:wall.secret});}
    for(const room of rooms){const pts=[...room.cells].map(v=>v.split(",").map(Number));const cx=Math.round(pts.reduce((a,p)=>a+p[0],0)/pts.length),cy=Math.round(pts.reduce((a,p)=>a+p[1],0)/pts.length);if(room.boss){newObjects.push({id:nextId.current++,kind:"rock",x:cx,y:cy,z:room.floor*64,scale:1.8,color:"#b18a56",layer:"decoration",boss:true});for(const [dx,dy] of [[-2,0],[2,0],[0,-2],[0,2]])newObjects.push({id:nextId.current++,kind:"rock",x:Math.max(0,Math.min(mapSize-1,cx+dx)),y:Math.max(0,Math.min(mapSize-1,cy+dy)),z:room.floor*64,scale:.8,color:"#777b88",layer:"decoration",boss:true});}if(room.secret)newObjects.push({id:nextId.current++,kind:"rock",x:cx,y:cy,z:room.floor*64,scale:.65,color:"#776b88",layer:"decoration",secret:true});}
    // Connect each generated floor with stairs placed at the nearest room center.
    const floorRooms=new Map<number,typeof rooms>();for(const room of rooms){const arr=floorRooms.get(room.floor)||[];arr.push(room);floorRooms.set(room.floor,arr);}const levels=[...floorRooms.keys()].sort((a,b)=>a-b);for(let i=1;i<levels.length;i++){const room=floorRooms.get(levels[i])![0];const pts=[...room.cells].map(v=>v.split(",").map(Number));const cx=Math.round(pts.reduce((a,p)=>a+p[0],0)/pts.length),cy=Math.round(pts.reduce((a,p)=>a+p[1],0)/pts.length);newObjects.push({id:nextId.current++,kind:"stairs",x:cx,y:cy,z:levels[i]*64,height:4,scale:1,color:"#969ba4",layer:"objects",orientation:"east-west"});}
    pushHistory();setObjects(prev=>[...prev.filter(o=>o.kind!=="wall"&&o.kind!=="door"&&o.kind!=="secretDoor"&&(o.kind!=="tile"||!floor.has(key(o.x,o.y)))),...newObjects]);setSelected(null);setTool("select");
  }
  function currentSnapshot():Snapshot{return {objects,selected,mapSize,layers,projectName};}
  function restoreSnapshot(snapshot:Snapshot){setObjects(snapshot.objects);setSelected(snapshot.selected);setMapSize(snapshot.mapSize);setLayers(snapshot.layers);setProjectName(snapshot.projectName);}
  function undo(){if(!history.length)return;const prev=history[history.length-1];setFuture(f=>[currentSnapshot(),...f].slice(0,100));setHistory(h=>h.slice(0,-1));restoreSnapshot(prev);}
  function redo(){if(!future.length)return;const next=future[0];setHistory(h=>[...h,currentSnapshot()].slice(-100));setFuture(f=>f.slice(1));restoreSnapshot(next);}
  function saveProject(){const blob=new Blob([JSON.stringify(project,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${projectName.replace(/[^a-z0-9-_]/gi,"-")||"map"}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function loadProject(file?:File){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(String(reader.result));if(d.format!=="blackshine-map"||!Array.isArray(d.objects))throw Error();pushHistory();setMapSize(clampMapSize(Number(d.mapSize)||20));setObjects(d.objects.map((o:MapObject)=>({...o,height:Number(o.height)||0,layer:o.layer??(o.kind==="tile"?"ground":"objects")})));setLayers(Array.isArray(d.layers)?d.layers:initialLayers);setProjectName(d.projectName??"Untitled Map");nextId.current=Math.max(1,...d.objects.map((o:MapObject)=>Number(o.id)+1));setSelected(null);}catch{alert("ไฟล์โปรเจกต์ไม่ถูกต้องหรือเสียหาย");}};reader.readAsText(file);}
  function importPng(file?:File){if(!file)return;if(!file.type.startsWith("image/png")){alert("รองรับไฟล์ PNG เท่านั้น");return;}const reader=new FileReader();reader.onload=()=>{const data=String(reader.result);pushHistory();const o:MapObject={id:nextId.current++,kind:"image",x:Math.floor(mapSize/2),y:Math.floor(mapSize/2),z:0,scale:1,color:"#ffffff",layer:activeLayer,imageData:data,imageName:file.name};setObjects(p=>[...p,o]);setSelected(o.id);};reader.readAsDataURL(file);}
  function toggleLayer(id:string){pushHistory();setLayers(p=>p.map(l=>l.id===id?{...l,visible:!l.visible}:l));}
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo();}if((e.key==="Delete"||e.key==="Backspace")&&selected!==null){pushHistory();setObjects(p=>p.filter(o=>o.id!==selected));setSelected(null);}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[history,future,objects,selected,mapSize,layers,projectName]);

  return <div className="app"><header className="topbar"><div className="brand"><div className="brandmark">B</div><div><b>BLACKSHINE</b><small>MAP EDITOR <span>v1.0.0</span></small></div></div><div className="menu"><button onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={15}/></button><button onClick={redo} disabled={!future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={15}/></button><button onClick={saveProject}><Save size={15}/> Save Project</button><label className="button"><Upload size={15}/> Open Project<input hidden type="file" accept=".json" onChange={e=>{loadProject(e.target.files?.[0]);e.currentTarget.value="";}}/></label></div><div className="topright"><span className="statusdot"/> LOCAL PROJECT</div></header>
    <div className="workspace"><aside className="leftbar"><div className="paneltitle">TOOLS</div>{[["select","Select",MousePointer2],["place","Place Object",Plus],["move","Move",Move],["terrain","Terrain Brush",Mountain],["ramp","Slope / Ramp",Move],["stairs","Stairs",Grid3X3]].map(([id,label,Icon]:any)=><button key={id} className={`toolbtn ${tool===id?"active":""}`} onClick={()=>setTool(id)}><Icon size={18}/><span>{label}</span></button>)}<div className="divider"/><label className="importbutton"><ImagePlus size={17}/> Import PNG<input hidden type="file" accept="image/png" onChange={e=>{importPng(e.target.files?.[0]);e.currentTarget.value="";}}/></label><button className={`toolbtn ${showGrid?"active":""}`} onClick={()=>setShowGrid(!showGrid)}><Grid3X3 size={18}/><span>Isometric Grid</span></button><div className="zoomcontrols"><button onClick={()=>setZoom(z=>Math.min(2,z+.1))}><ZoomIn size={16}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.max(.5,z-.1))}><ZoomOut size={16}/></button></div></aside>
    <main className="center"><div className="canvashead"><div><input className="projectname" value={projectName} onFocus={()=>pushHistory()} onChange={e=>setProjectName(e.target.value)}/> <span> / World Editor</span></div><div className="canvasmeta">ISOMETRIC 2.5D · {mapSize} × {mapSize} TILES · {objects.filter(o=>o.kind==="tile"&&(o.height||0)>0).length} ELEVATED</div></div><div className="canvaswrap"><canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}/><div className="hint">{tool==="place"?"คลิกบนแผนที่เพื่อวาง Object":tool==="move"?"ลาก Object เพื่อย้ายตำแหน่ง":tool==="terrain"?`Terrain Brush · ${terrainBrushMode.toUpperCase()} · Level ${terrainHeight} · ลากเมาส์เพื่อระบาย Terrain`:tool==="ramp"||tool==="stairs"?`คลิกเพื่อวาง ${tool==="ramp"?"ทางลาด":"บันได"}`:"คลิกเลือก · ลากเพื่อย้าย · Ctrl+Z ย้อนกลับ · Ctrl+Y ทำซ้ำ"}</div></div><footer className="bottomstatus"><span>● READY</span><span>{objects.length} OBJECTS</span><span>GRID {showGrid?"ON":"OFF"}</span><span>BLACKSHINE GAME TOOLS</span></footer></main>
    <aside className="rightbar"><section><div className="sectiontitle"><Box size={15}/> ASSET PALETTE</div><div className="assetgrid">{palette.map(a=><button key={a.name} className={`asset ${activeAsset.name===a.name?"chosen":""}`} onClick={()=>{setActiveAsset(a);setTool("place");}}><span className="swatch" style={{background:a.color}}/><small>{a.name}</small></button>)}</div></section>
    <section><div className="sectiontitle"><Layers size={15}/> LAYERS</div><div className="layerlist">{layers.map(l=><div className={`layerrow ${activeLayer===l.id?"layeractive":""}`} key={l.id} onClick={()=>setActiveLayer(l.id)}><span>{l.name}</span><button title={l.visible?"ซ่อน Layer":"แสดง Layer"} onClick={e=>{e.stopPropagation();toggleLayer(l.id);}}>{l.visible?<Eye size={14}/>:<EyeOff size={14}/>}</button></div>)}</div><div className="empty">เลือก Layer เพื่อกำหนดตำแหน่ง Object ใหม่</div></section>
    <section className="objectsection"><div className="sectiontitle"><Layers size={15}/> OBJECT PROPERTIES</div>{selectedObject?<><div className="selectedname">#{selectedObject.id} · {(selectedObject.imageName??selectedObject.kind).toUpperCase()}</div>{(["x","y","z",...(selectedObject.kind==="tile"?["height" as const]:[]),"scale"] as const).map(k=><label className="prop" key={k}><span>{k.toUpperCase()}</span><input type="number" step={k==="scale"?.1:1} value={selectedObject[k]} onChange={e=>updateSelected(k,Number(e.target.value))}/></label>)}<label className="prop"><span>LAYER</span><select value={selectedObject.layer} onChange={e=>{pushHistory();setObjects(p=>p.map(o=>o.id===selected?{...o,layer:e.target.value}:o));}}>{layers.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><button className="delete" onClick={()=>{pushHistory();setObjects(p=>p.filter(o=>o.id!==selected));setSelected(null);}}>Delete Object</button></>:<div className="empty">เลือก Object บนแผนที่เพื่อแก้ไขตำแหน่งและขนาด</div>}</section>
    <section><div className="sectiontitle"><Mountain size={15}/> TERRAIN BRUSH & HEIGHT</div><label className="prop"><span>BRUSH LEVEL</span><input type="number" min="0" max="12" value={terrainHeight} onChange={e=>setTerrainHeight(Math.max(0,Math.min(12,Number(e.target.value)||0)))}/></label><label className="prop"><span>BRUSH SIZE</span><input type="number" min="1" max="8" value={terrainBrushSize} onChange={e=>setTerrainBrushSize(Math.max(1,Math.min(8,Number(e.target.value)||1)))}/></label><label className="prop"><span>BRUSH MODE</span><select value={terrainBrushMode} onChange={e=>setTerrainBrushMode(e.target.value)}><option value="raise">Set / Raise</option><option value="lower">Lower</option></select></label><div className="heightbuttons"><button onClick={()=>setTerrainHeight(h=>Math.max(0,h-1))}>− Lower Level</button><button onClick={()=>setTerrainHeight(h=>Math.min(12,h+1))}>＋ Raise Level</button></div><div className="empty">เลือก Terrain Brush แล้วลากเมาส์เพื่อปรับระดับพื้นเป็นบริเวณ · Brush Size กำหนดรัศมี · 1 ระดับ = 16 px · Undo ย้อนการลากทั้งครั้ง</div></section>
    <section><div className="sectiontitle"><Move size={15}/> SLOPE / RAMP & STAIRS</div><label className="prop"><span>ORIENTATION</span><select value={rampOrientation} onChange={e=>setRampOrientation(e.target.value)}><option value="east-west">East ↔ West</option><option value="north-south">North ↔ South</option></select></label><label className="prop"><span>RISE (LEVELS)</span><input type="number" min="1" max="12" value={rampRise} onChange={e=>setRampRise(Math.max(1,Math.min(12,Number(e.target.value)||1)))}/></label><div className="empty">เลือกเครื่องมือ Slope / Ramp หรือ Stairs ทางแถบซ้าย แล้วคลิกช่องเพื่อวางตัวเชื่อมระดับสูงต่ำ</div></section><section><div className="sectiontitle"><Mountain size={15}/> MOUNTAIN GENERATOR</div><label className="prop"><span>MAX HEIGHT</span><input type="number" min="1" max="12" value={maxMountainHeight} onChange={e=>setMaxMountainHeight(Math.max(1,Math.min(12,Number(e.target.value)||1)))}/></label><div className="empty">สุ่มสร้างแนวภูเขาหลายยอดทั่วแผนที่ ความสูงแต่ละช่องจะไล่ระดับอย่างเป็นธรรมชาติ และไม่เกินค่าที่กำหนด (1–12)</div><button className="generatebutton" onClick={generateMountains}> <Mountain size={14}/> Generate Random Mountains</button></section>
        <section><div className="sectiontitle"><Layers size={15}/> DUNGEON & INTERIOR GENERATOR</div>
          <label className="prop"><span>LAYOUT TYPE</span><select value={layoutType} onChange={e=>setLayoutType(e.target.value)}><option value="dungeon">Dungeon / Underground</option><option value="interior">Building Interior</option></select></label>
          <label className="prop"><span>ROOM COUNT</span><input type="number" min="2" max="30" value={roomCount} onChange={e=>setRoomCount(Math.max(2,Math.min(30,Number(e.target.value)||2)))}/></label>
          <label className="prop"><span>ROOM SHAPE</span><select value={roomShape} onChange={e=>setRoomShape(e.target.value)}><option value="mixed">Mixed / Random</option><option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="octagon">Octagon</option><option value="lshape">L-Shape</option><option value="cross">Cross</option><option value="freeform">Freeform / Organic</option></select></label><label className="prop"><span>FLOOR LEVELS</span><input type="number" min="1" max="5" value={floorCount} onChange={e=>setFloorCount(Math.max(1,Math.min(5,Number(e.target.value)||1)))}/></label><label className="prop"><span>SECRET ROOM %</span><input type="number" min="0" max="100" value={secretRoomChance} onChange={e=>setSecretRoomChance(Math.max(0,Math.min(100,Number(e.target.value)||0)))}/></label><label className="prop"><span>BOSS CHAMBER</span><select value={bossRoomEnabled?"yes":"no"} onChange={e=>setBossRoomEnabled(e.target.value==="yes")}><option value="yes">Include final boss room</option><option value="no">No boss room</option></select></label>
          <div className="empty">สุ่มสร้างห้องทรงอิสระและหลายรูปทรง พร้อมชั้นพื้นหลายระดับ ห้องลับ และห้องบอสเฉพาะ เชื่อมต่อด้วยทางเดิน พร้อมพื้น ผนัง และประตูอัตโนมัติ {layoutType==="dungeon"?"ใช้พื้นหินและผนังดันเจี้ยน":"ใช้พื้นไม้และผนังภายในอาคาร"} · วางทับ Terrain เดิมในบริเวณที่สร้าง</div>
          <button className="generatebutton" onClick={generateRooms}><Grid3X3 size={14}/> Generate Rooms & Corridors</button>
        </section>
        <section><div className="sectiontitle"><Move size={15}/> PERFORMANCE</div><label className="prop"><span>RENDER QUALITY</span><select value={performanceMode} onChange={e=>setPerformanceMode(e.target.value as "low"|"balanced"|"high")}><option value="low">Low Spec · Fast</option><option value="balanced">Balanced</option><option value="high">High Quality</option></select></label><div className="empty">Low Spec ลดความละเอียด Canvas และปิดการเกลี่ยภาพเพื่อเพิ่ม FPS · Balanced เหมาะกับคอมทั่วไป · High ใช้ความละเอียดสูงสุดตามจอ</div></section>
        <section><div className="sectiontitle"><Grid3X3 size={15}/> MAP SETTINGS</div><label className="prop"><span>MAP SIZE</span><select value={MAP_SIZE_PRESETS.includes(mapSize)?mapSize:"custom"} onChange={e=>{const next=Number(e.target.value);if(Number.isFinite(next)){pushHistory();setMapSize(clampMapSize(next));}}}><option value="custom">Custom ({mapSize} × {mapSize})</option>{MAP_SIZE_PRESETS.map(size=><option key={size} value={size}>{size} × {size}</option>)}</select></label><label className="prop"><span>CUSTOM SIZE</span><input type="number" min={MIN_MAP_SIZE} max={MAX_MAP_SIZE} step="1" value={mapSize} onFocus={()=>pushHistory()} onChange={e=>{const raw=e.target.value;if(raw!==""){const next=Number(raw);if(Number.isInteger(next)&&next>=MIN_MAP_SIZE&&next<=MAX_MAP_SIZE)setMapSize(next);}}} onBlur={()=>{if(mapSize<MIN_MAP_SIZE||mapSize>MAX_MAP_SIZE)setMapSize(clampMapSize(mapSize));}}/></label><div className="empty">ขนาดแผนที่แบบสี่เหลี่ยม {MIN_MAP_SIZE} × {MIN_MAP_SIZE} ถึง {MAX_MAP_SIZE} × {MAX_MAP_SIZE} ช่อง<br/>Tile: 64 × 32 px<br/>Projection: Diamond Isometric<br/>PNG: embedded in project JSON</div></section></aside></div></div>;
}

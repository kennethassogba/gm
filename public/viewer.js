import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {compileModel,collectInstances,locate} from './csg.js';
import {compileRayRegion} from './csg-raycast.js';
import {createCSGMaterial,installCSGPicking} from './csg-material.js';
import {SectionViews} from './section-views.js';

export class GeometryViewer {
 constructor(host,onSelect,onFocus,onError,onFraming=()=>{},onMove=()=>{}){
  this.host=host;this.onSelect=onSelect;this.onFocus=onFocus;this.onError=onError;this.onFraming=onFraming;this.revision=0;this.meshes=[];this.materialCache=new Map();this.sliceMaps=new Map();
  this.canvas=host.querySelector('#view-3d');this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#17191e');
  try{this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.localClippingEnabled=true;this.renderer.outputColorSpace=THREE.SRGBColorSpace;}
  catch(error){onError('3D unavailable. Enable hardware acceleration or use the section views.');}
  this.camera=new THREE.PerspectiveCamera(35,1,.001,100000);this.camera.up.set(0,0,1);
  this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=false;this.controls.addEventListener('change',()=>this.render3D());
  this.scene.add(new THREE.HemisphereLight('#e8eef4','#44404e',2));const light=new THREE.DirectionalLight('#ffffff',2.5);light.position.set(30,-40,70);this.scene.add(light);
  this.group=new THREE.Group();this.scene.add(this.group);
  this.moveTarget=new THREE.Object3D();this.scene.add(this.moveTarget);this.transform=new TransformControls(this.camera,this.canvas);this.transform.setSize(.8);this.scene.add(this.transform.getHelper());
  this.transform.addEventListener('dragging-changed',e=>{this.controls.enabled=!e.value;this.wasDragging=true;if(e.value)this.moveStart=this.moveTarget.position.clone();});
  this.transform.addEventListener('objectChange',()=>{const delta=this.moveTarget.position.clone().sub(this.moveStart);for(const mesh of this.meshes)if(mesh.userData.items.every(i=>this.selectedCells.has(i.cell.id)))mesh.position.copy(delta);this.render3D();});
  this.transform.addEventListener('change',()=>this.render3D());
  this.transform.addEventListener('mouseUp',()=>{const d=this.moveTarget.position.clone().sub(this.moveStart).toArray();if(d.some(v=>Math.abs(v)>1e-9))onMove(d);});
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
  let down;this.canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
  this.canvas.addEventListener('pointerup',e=>{if(!this.wasDragging&&down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<5)this.pick3D(e,false);down=null;this.wasDragging=false;});
  this.canvas.addEventListener('dblclick',e=>this.pick3D(e,true));
  this.canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.orbit(e.key);}});
  this.sections=new SectionViews(host,(event,axis,focus)=>this.pickSlice(event,axis,focus),onError);this.sliceMaps=this.sections.maps;
 }
 update(model,options={}){
  this.model=model;this.compiled=compileModel(model);this.revision++;this.items=collectInstances(this.compiled);
  this.onlyBackground=this.items.every(item=>item.cell.background||item.shape.type==='moderator'||(!item.cell.region&&item.shape.type==='box'));
  const s=model.selection;this.selectedCells=new Set(model.cells.filter(c=>s?.kind==='cell'?(model.selectedIds?.length?model.selectedIds.includes(c.id):c.id===s.id):s?.kind==='material'?c.material===s.id:s?.kind==='surface'?(c.region.match(/[+-]?\d+/g)||[]).some(t=>Math.abs(Number(t))===s.id):false).map(c=>c.id));
  for(const item of this.items)if(item.ancestors.some(id=>this.selectedCells.has(id)))this.selectedCells.add(item.cell.id);
  const focus=JSON.stringify([model.id,model.focus]),focusChanged=this.lastFocus!==focus,previousDetail=JSON.stringify(this.detailBounds);
  const wasPin=!!this.pinBounds;this.pinBounds=this.findPinBounds();if(focusChanged||this.pinBounds&&!wasPin){this.detail=!!this.pinBounds;this.detailCutaway=true;}else if(!this.pinBounds)this.detail=false;
  this.updateFraming();this.rebuild();if(options.fit||focusChanged||previousDetail!==JSON.stringify(this.detailBounds))this.fit(!focusChanged&&!options.fit);this.lastFocus=focus;this.resize();
  this.canvas.dataset.revision=this.revision;this.canvas.dataset.instances=this.items.length;
  this.updateMoveHandle();
 }
 setMoveEnabled(enabled){this.moveEnabled=enabled;this.updateMoveHandle();}
 updateMoveHandle(){
  const items=this.items?.filter(i=>this.selectedCells.has(i.cell.id)&&!i.cell.background)||[];
  if(!this.moveEnabled||!items.length){this.transform.detach();return;}
  const b=items.reduce((a,i)=>a.map((v,k)=>k%2?Math.max(v,i.bounds[k]+i.position[k>>1]):Math.min(v,i.bounds[k]+i.position[k>>1])),[Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity]);
  this.moveTarget.position.set((b[0]+b[1])/2,(b[2]+b[3])/2,this.detailBounds?(this.detailBounds[4]+this.detailBounds[5])/2:(b[4]+b[5])/2);this.transform.attach(this.moveTarget);this.render3D();
 }
 findPinBounds(){
  const solids=this.items.filter(item=>!item.cell.background&&item.shape.type!=='moderator'&&(item.cell.region||item.shape.type!=='box'));
  if(!solids.length||solids.some(item=>item.shape.type!=='tube'))return null;
  const first=solids[0],cx=first.position[0]+first.shape.center[0],cy=first.position[1]+first.shape.center[1];
  if(solids.some(item=>Math.abs(item.position[0]+item.shape.center[0]-cx)>1e-6||Math.abs(item.position[1]+item.shape.center[1]-cy)>1e-6))return null;
  const radius=Math.max(...solids.map(item=>item.shape.outer)),bottom=Math.min(...solids.map(item=>item.bounds[4]+item.position[2])),top=Math.max(...solids.map(item=>item.bounds[5]+item.position[2]));
  return top-bottom>radius*24?[cx-radius,cx+radius,cy-radius,cy+radius,bottom,top]:null;
 }
 updateFraming(){
  this.detailBounds=null;
  if(this.detail&&this.pinBounds){
   const b=this.pinBounds,span=(b[1]-b[0])*2.2,z=this.model.view==='3d'||this.model.view==='xy'?this.model.section:null;
   const center=Math.max(b[4]+span/2,Math.min(b[5]-span/2,z??(b[4]+b[5])/2));this.detailBounds=[...b.slice(0,4),center-span/2,center+span/2];
  }
  this.canvas.dataset.framing=this.detailBounds?'detail':'full';
  this.onFraming({available:!!this.pinBounds,detail:!!this.detailBounds,span:this.detailBounds?this.detailBounds[5]-this.detailBounds[4]:null,cutaway:this.detailBounds?this.detailCutaway:!!this.model.cutaway});
 }
 toggleDetail(){if(!this.pinBounds)return;this.detail=!this.detail;this.updateFraming();this.rebuild();this.fit();}
 toggleDetailCutaway(){this.detailCutaway=!this.detailCutaway;this.updateFraming();this.rebuild();this.render3D();}
 clear(){
  for(const o of this.group.children){o.geometry?.dispose();if(!o.material?.userData.analyticCSG)o.material?.dispose();o.dispose?.();}
  this.group.clear();this.meshes=[];
 }
 rebuild(){
  this.clear();const batches=new Map();const m=this.model,cutaway=this.detailBounds?this.detailCutaway:m.cutaway;
  for(const item of this.items){
   if(item.cell.hidden||(m.isolated!=null&&item.cell.id!==m.isolated))continue;
   if(item.cell.material==null&&!this.selectedCells.has(item.cell.id)&&!m.showModerator)continue;
   const sh=item.shape,b=[...item.bounds],mat=m.materials.find(x=>x.id===item.cell.material),background=!this.onlyBackground&&(item.cell.background||sh.type==='moderator'||(!item.cell.region&&sh.type==='box'));
   // Display bounds do not change canonical instances or OpenMC dimensions.
   if(this.detailBounds){b[4]=Math.max(b[4],this.detailBounds[4]-item.position[2]);b[5]=Math.min(b[5],this.detailBounds[5]-item.position[2]);if(b[5]<=b[4])continue;}
   if(background&&!m.showModerator&&!this.selectedCells.has(item.cell.id))continue;
   const color=m.colorBy==='universe'?new THREE.Color().setHSL((item.universe*.137)%1,.3,.57).getStyle():mat?.color||'#9b9da2';
   const key=JSON.stringify([item.cell.id,sh,b,color,cutaway,background,item.clips]);
   if(!batches.has(key))batches.set(key,{items:[],item,bounds:b,color,background});batches.get(key).items.push(item);
  }
  for(const batch of batches.values()){
   const {item,color,background,items,bounds:b}=batch,sh=item.shape;
   const empty=item.cell.material==null,selected=this.selectedCells.has(item.cell.id),opacity=empty?.16:background?.08:m.transparent?.42:1;
   const source={color:new THREE.Color(color),transparent:opacity<1,opacity,depthWrite:opacity===1,clippingPlanes:cutaway&&!(sh.type==='tube'&&this.items.length<5000)?[true]:[]};
   const clips=[...item.clips];if(cutaway&&sh.type==='tube'&&this.items.length<5000)clips.push({wedge:sh.center.slice(0,2)});
   try{
    const region=compileRayRegion(item.cell.region,this.compiled.surfaces,b,clips),key=JSON.stringify([region.polynomials,region.program,b,color,opacity,selected,source.clippingPlanes.length]);
    let material=this.materialCache.get(key);
    if(material){this.materialCache.delete(key);this.materialCache.set(key,material);}
    else{material=createCSGMaterial(region,source,selected,this.renderer?.capabilities.maxTextureSize);this.materialCache.set(key,material);}
    const proxy=new THREE.BoxGeometry(b[1]-b[0],b[3]-b[2],b[5]-b[4]);proxy.translate((b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2);
    const mesh=this.addBatch(proxy,material,items,[0,0,0]);installCSGPicking(mesh,region);
   }catch(error){this.onError('Cannot display '+(item.cell.name||'cell '+item.cell.id)+': '+error.message);}
  }
  const active=new Set(this.meshes.map(mesh=>mesh.material));let cachedBytes=[...this.materialCache.values()].reduce((sum,material)=>sum+material.userData.textureBytes,0);
  for(const [key,material] of this.materialCache)if((this.materialCache.size>64||cachedBytes>64*1024*1024)&&!active.has(material)){cachedBytes-=material.userData.textureBytes;material.dispose();this.materialCache.delete(key);}
 }

 addBatch(geometry,material,items,center){
  const mesh=new THREE.InstancedMesh(geometry,material,items.length),matrix=new THREE.Matrix4();
  items.forEach((item,i)=>{const explode=this.model.exploded&&this.items.length<1000?item.cell.id*.12:0;matrix.makeTranslation(item.position[0]+center[0]+explode,item.position[1]+center[1],item.position[2]+center[2]);mesh.setMatrixAt(i,matrix);if(this.selectedCells.has(item.cell.id))mesh.setColorAt(i,new THREE.Color(material.color).lerp(new THREE.Color('#ffffff'),.22));});
  mesh.instanceMatrix.needsUpdate=true;mesh.userData.items=items;this.group.add(mesh);this.meshes.push(mesh);
  return mesh;
 }
 resize(){
  if(!this.renderer){this.drawSlices();return;}const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1){this.drawSlices();return;}
  const size=r.width+':'+r.height,sizeChanged=this.viewSize!==size;this.viewSize=size;
  this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();if(sizeChanged)this.fit(true);this.render3D();this.drawSlices();
 }
 fit(preserveAngle=false){
  if(!this.model)return;const b=this.detailBounds||this.compiled.universes.get(this.model.focus?.universe??0)?.bounds||[-2,2,-2,2,-2,2];
  const center=new THREE.Vector3((b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2),span=Math.max(b[1]-b[0],b[3]-b[2],b[5]-b[4]);
  const r=this.canvas.getBoundingClientRect(),hr=this.host.getBoundingClientRect(),aspect=(r.width||hr.width||1)/Math.max(r.height||hr.height,1),tanV=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),tanH=tanV*aspect;
  const direction=preserveAngle?this.camera.position.clone().sub(this.controls.target).normalize():new THREE.Vector3(.85,-1.25,.85).normalize(),right=new THREE.Vector3().crossVectors(this.camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right);let distance=0;
  for(const x of [b[0],b[1]])for(const y of [b[2],b[3]])for(const z of [b[4],b[5]]){const p=new THREE.Vector3(x,y,z).sub(center),depth=p.dot(direction);distance=Math.max(distance,depth+Math.abs(p.dot(right))/tanH,depth+Math.abs(p.dot(up))/tanV);}
  distance=Math.max(span*.5,distance*1.15);this.camera.aspect=aspect;this.camera.position.copy(center).add(direction.multiplyScalar(distance));
  this.camera.near=Math.max(.0001,span/10000);this.camera.far=Math.max(span*1000,distance*10);this.camera.updateProjectionMatrix();this.controls.target.copy(center);this.controls.update();this.render3D();
 }
 render3D(){if(this.renderer&&!this.renderPending&&this.canvas.clientWidth>0&&this.canvas.clientHeight>0){this.renderPending=true;requestAnimationFrame(()=>{this.renderPending=false;if(!this.canvas.clientWidth||!this.canvas.clientHeight)return;this.renderer.render(this.scene,this.camera);this.canvas.dataset.draws=Number(this.canvas.dataset.draws||0)+1;});}}
 zoom(factor){this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);this.controls.update();this.render3D();}
 orbit(key='ArrowRight'){const v=this.camera.position.clone().sub(this.controls.target),axis=key==='ArrowLeft'||key==='ArrowRight'?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);v.applyAxisAngle(axis,key==='ArrowLeft'||key==='ArrowDown'?-.15:.15);this.camera.position.copy(this.controls.target).add(v);this.controls.update();this.render3D();}
 pick3D(e,focus){
  if(!this.compiled)return;const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
  const hits=ray.intersectObjects(this.meshes,false);const hit=hits.find(h=>!h.object.material.clippingPlanes?.some(p=>p.distanceToPoint(h.point)<0));if(!hit)return;
  const item=hit.object.userData.items[hit.instanceId];this.onSelect({cell:item.cell,universe:item.universe,path:item.path,point:hit.point.toArray(),additive:e.shiftKey||e.ctrlKey||e.metaKey});if(focus)this.onFocus(item);
 }
 drawSlices(){if(this.compiled)this.sections.update(this.model,this.selectedCells,this.compiled.universes.get(this.model.focus?.universe??0)?.bounds||[-2,2,-2,2,-2,2],this.revision);}
 pickSlice(e,axis,focus){
  const map=this.sliceMaps.get(axis);if(!map||this.host.querySelector('#view-'+axis).getAttribute('aria-busy')==='true')return;const canvas=this.host.querySelector('#view-'+axis),r=canvas.getBoundingClientRect(),p=[0,0,0];p[map.a]=map.cx+((e.clientX-r.left)/r.width*map.width-map.width/2)*map.scale;p[map.c]=map.cy+(map.height/2-(e.clientY-r.top)/r.height*map.height)*map.scale;p[map.normal]=map.cut;
  const found=locate(this.compiled,p);if(found){this.onSelect({...found,worldPoint:p});if(focus)this.onFocus(found);}
 }
}

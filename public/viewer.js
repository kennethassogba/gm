import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {compileModel,collectInstances,locate} from './csg.js';

function tubeGeometry(outer,inner,height,cutaway,segments){
 const shape=new THREE.Shape(),steps=segments,end=cutaway?Math.PI*1.5:Math.PI*2;
 shape.moveTo(outer,0);for(let i=1;i<=steps;i++){const t=end*i/steps;shape.lineTo(Math.cos(t)*outer,Math.sin(t)*outer);}
 if(cutaway){if(inner){shape.lineTo(Math.cos(end)*inner,Math.sin(end)*inner);for(let i=steps-1;i>=0;i--){const t=end*i/steps;shape.lineTo(Math.cos(t)*inner,Math.sin(t)*inner);}}else shape.lineTo(0,0);shape.closePath();}
 else{shape.closePath();if(inner){const h=new THREE.Path();h.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(h);}}
 return new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:Math.max(8,segments)});
}
export class GeometryViewer {
 constructor(host,onSelect,onFocus,onError,onFraming=()=>{},onMove=()=>{}){
  this.host=host;this.onSelect=onSelect;this.onFocus=onFocus;this.onError=onError;this.onFraming=onFraming;this.revision=0;this.meshes=[];this.jobs=new Map();this.cache=new Map();this.sliceMaps=new Map();
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
  this.worker=new Worker('/geometry-worker.js',{type:'module'});this.worker.onmessage=({data})=>{const job=this.jobs.get(data.id);this.jobs.delete(data.id);this.updateBusy();if(!job||job.revision!==this.revision)return;if(data.error){onError(data.error);return;}this.cache.set(job.key,data.positions);job.complete(data.positions);this.render3D();};
  this.worker.onerror=()=>onError('Geometry calculation failed. Reload the workspace.');
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
  let down;this.canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
  this.canvas.addEventListener('pointerup',e=>{if(!this.wasDragging&&down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<5)this.pick3D(e,false);down=null;this.wasDragging=false;});
  this.canvas.addEventListener('dblclick',e=>this.pick3D(e,true));
  this.canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.orbit(e.key);}});
  for(const axis of ['xy','xz','yz']){const c=host.querySelector('#view-'+axis);c.addEventListener('click',e=>this.pickSlice(e,axis,false));c.addEventListener('dblclick',e=>this.pickSlice(e,axis,true));}
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
  for(const o of this.group.children){o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(x=>x.dispose());else o.material?.dispose();o.dispose?.();}
  this.group.clear();this.meshes=[];
 }
 rebuild(){
  this.clear();this.updateBusy();const batches=new Map();const m=this.model,cutaway=this.detailBounds?this.detailCutaway:m.cutaway;
  for(const item of this.items){
   if(item.cell.hidden||(m.isolated!=null&&item.cell.id!==m.isolated))continue;
   if(item.cell.material==null&&!this.selectedCells.has(item.cell.id)&&!m.showModerator)continue;
   const sh=item.shape,b=[...item.bounds],mat=m.materials.find(x=>x.id===item.cell.material),background=!this.onlyBackground&&(item.cell.background||sh.type==='moderator'||(!item.cell.region&&sh.type==='box'));
   // Crop display meshes only. Canonical instances and OpenMC dimensions stay intact.
   if(this.detailBounds){b[4]=Math.max(b[4],this.detailBounds[4]-item.position[2]);b[5]=Math.min(b[5],this.detailBounds[5]-item.position[2]);if(b[5]<=b[4])continue;}
   if(background&&!m.showModerator&&!this.selectedCells.has(item.cell.id))continue;
   const color=m.colorBy==='universe'?new THREE.Color().setHSL((item.universe*.137)%1,.3,.57).getStyle():mat?.color||'#9b9da2';
   const key=JSON.stringify([item.cell.id,sh,b,color,cutaway,background,item.clips]);
   if(!batches.has(key))batches.set(key,{items:[],item,bounds:b,color,background});batches.get(key).items.push(item);
  }
  const segments=this.items.length>5000?12:40;
  for(const batch of batches.values()){
   const {item,color,background,items,bounds:b}=batch,sh=item.shape,dx=b[1]-b[0],dy=b[3]-b[2],dz=b[5]-b[4];
   const empty=item.cell.material==null,material=new THREE.MeshStandardMaterial({color,roughness:.65,metalness:sh.inner?.2:0,side:THREE.DoubleSide,transparent:!!(empty||background||m.transparent),opacity:empty?.16:background?.08:m.transparent?.42:1,depthWrite:!empty&&!background&&!m.transparent});
   if(this.selectedCells.has(item.cell.id)){material.emissive.copy(material.color);material.emissiveIntensity=.18;}
   if(cutaway&&this.items.length>5000)material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),0)];
   let geometry,center=[(b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2];
   if(sh.type==='tube'){geometry=tubeGeometry(sh.outer,sh.inner,dz,cutaway&&this.items.length<5000,segments);center=[sh.center[0],sh.center[1],b[4]];}
   else if(sh.type==='sphere'){geometry=new THREE.SphereGeometry(sh.radius,32,20);center=sh.center;}
   else if(sh.type==='csg'||sh.type==='moderator'){
    const key=JSON.stringify([item.cell.region,this.model.surfaces,b,item.clips]);
    const complete=positions=>{if(!positions.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.computeVertexNormals();this.addBatch(g,material,items,[0,0,0]);};
    if(this.cache.has(key))complete(this.cache.get(key));else{const id=crypto.randomUUID();this.jobs.set(id,{key,revision:this.revision,complete});this.updateBusy();this.worker.postMessage({id,region:item.cell.region,surfaces:this.model.surfaces,bounds:b,clips:item.clips});}
    continue;
   }else geometry=new THREE.BoxGeometry(dx,dy,dz);
   this.addBatch(geometry,material,items,center);
  }
 }
 addBatch(geometry,material,items,center){
  const mesh=new THREE.InstancedMesh(geometry,material,items.length),matrix=new THREE.Matrix4();
  items.forEach((item,i)=>{const explode=this.model.exploded&&this.items.length<1000?item.cell.id*.12:0;matrix.makeTranslation(item.position[0]+center[0]+explode,item.position[1]+center[1],item.position[2]+center[2]);mesh.setMatrixAt(i,matrix);if(this.selectedCells.has(item.cell.id))mesh.setColorAt(i,new THREE.Color(material.color).lerp(new THREE.Color('#ffffff'),.22));});
  mesh.instanceMatrix.needsUpdate=true;mesh.userData.items=items;this.group.add(mesh);this.meshes.push(mesh);
  if(this.detailBounds&&this.selectedCells.has(items[0].cell.id)){
   const edges=new THREE.EdgesGeometry(geometry,20);for(const item of items){const outline=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:'#c2c6ff'})),explode=this.model.exploded?item.cell.id*.12:0;outline.position.set(item.position[0]+center[0]+explode,item.position[1]+center[1],item.position[2]+center[2]);this.group.add(outline);}
  }
 }
 updateBusy(){const status=document.getElementById('geometry-status');if(status)status.hidden=![...this.jobs.values()].some(job=>job.revision===this.revision);}
 resize(){
  if(!this.renderer)return;const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1){this.drawSlices();return;}
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
 render3D(){if(this.renderer){this.renderer.render(this.scene,this.camera);this.canvas.dataset.draws=Number(this.canvas.dataset.draws||0)+1;}}
 zoom(factor){this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);this.controls.update();this.render3D();}
 orbit(key='ArrowRight'){const v=this.camera.position.clone().sub(this.controls.target),axis=key==='ArrowLeft'||key==='ArrowRight'?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);v.applyAxisAngle(axis,key==='ArrowLeft'||key==='ArrowDown'?-.15:.15);this.camera.position.copy(this.controls.target).add(v);this.controls.update();this.render3D();}
 pick3D(e,focus){
  if(!this.compiled)return;const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
  const hits=ray.intersectObjects(this.meshes,false);const hit=hits.find(h=>!h.object.material.clippingPlanes?.some(p=>p.distanceToPoint(h.point)<0));if(!hit)return;
  const item=hit.object.userData.items[hit.instanceId];this.onSelect({cell:item.cell,universe:item.universe,path:item.path,point:hit.point.toArray(),additive:e.shiftKey||e.ctrlKey||e.metaKey});if(focus)this.onFocus(item);
 }
 drawSlices(){
  if(!this.compiled)return;
  const b=this.compiled.universes.get(this.model.focus?.universe??0)?.bounds||[-2,2,-2,2,-2,2];
  for(const axis of ['xy','xz','yz']){
   const canvas=this.host.querySelector('#view-'+axis),r=canvas.getBoundingClientRect();if(r.width<1||r.height<1)continue;
   const width=Math.min(340,Math.max(64,Math.round(r.width))),height=Math.max(64,Math.round(width*r.height/r.width));canvas.width=width;canvas.height=height;
   const a=axis==='yz'?1:0,c=axis==='xy'?1:2,normal=axis==='xy'?2:axis==='xz'?1:0;
   const scale=Math.max((b[a*2+1]-b[a*2])/width,(b[c*2+1]-b[c*2])/height)*1.1,cx=(b[a*2]+b[a*2+1])/2,cy=(b[c*2]+b[c*2+1])/2,cut=this.model.section??(b[normal*2]+b[normal*2+1])/2;
   this.sliceMaps.set(axis,{a,c,normal,scale,cx,cy,cut,width,height});const ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height),colors=new Map(this.model.materials.map(m=>[m.id,new THREE.Color(m.color).getHex()]));
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=[0,0,0];p[a]=cx+(x-width/2)*scale;p[c]=cy+(height/2-y)*scale;p[normal]=cut;
    const found=locate(this.compiled,p),cell=found?.cell;let hex=0x17191e;
    if(cell&&!cell.hidden&&(this.model.isolated==null||cell.id===this.model.isolated)){hex=this.model.colorBy==='universe'?new THREE.Color().setHSL((found.universe*.137)%1,.3,.57).getHex():colors.get(cell.material)||0x91939b;if(this.selectedCells.has(cell.id))hex=new THREE.Color(hex).lerp(new THREE.Color('#ffffff'),.14).getHex();}
    const i=(y*width+x)*4;image.data[i]=hex>>16&255;image.data[i+1]=hex>>8&255;image.data[i+2]=hex&255;image.data[i+3]=255;
   }ctx.putImageData(image,0,0);canvas.dataset.revision=this.revision;
  }
 }
 pickSlice(e,axis,focus){
  const map=this.sliceMaps.get(axis);if(!map)return;const canvas=e.currentTarget,r=canvas.getBoundingClientRect(),p=[0,0,0];p[map.a]=map.cx+((e.clientX-r.left)/r.width*map.width-map.width/2)*map.scale;p[map.c]=map.cy+(map.height/2-(e.clientY-r.top)/r.height*map.height)*map.scale;p[map.normal]=map.cut;
  const found=locate(this.compiled,p);if(found){this.onSelect({...found,worldPoint:p});if(focus)this.onFocus(found);}
 }
}

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {compileModel,collectInstances,locate} from './csg.js';

function tubeGeometry(outer,inner,height,cutaway,segments){
 const shape=new THREE.Shape(),steps=segments,end=cutaway?Math.PI*1.5:Math.PI*2;
 shape.moveTo(outer,0);for(let i=1;i<=steps;i++){const t=end*i/steps;shape.lineTo(Math.cos(t)*outer,Math.sin(t)*outer);}
 if(cutaway){if(inner){shape.lineTo(Math.cos(end)*inner,Math.sin(end)*inner);for(let i=steps-1;i>=0;i--){const t=end*i/steps;shape.lineTo(Math.cos(t)*inner,Math.sin(t)*inner);}}else shape.lineTo(0,0);shape.closePath();}
 else{shape.closePath();if(inner){const h=new THREE.Path();h.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(h);}}
 return new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:Math.max(8,segments)});
}
export class GeometryViewer {
 constructor(host,onSelect,onFocus,onError){
  this.host=host;this.onSelect=onSelect;this.onFocus=onFocus;this.onError=onError;this.revision=0;this.meshes=[];this.jobs=new Map();this.cache=new Map();this.sliceMaps=new Map();
  this.canvas=host.querySelector('#view-3d');this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#17191e');
  try{this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.localClippingEnabled=true;this.renderer.outputColorSpace=THREE.SRGBColorSpace;}
  catch(error){onError('3D unavailable. Enable hardware acceleration or use the section views.');}
  this.camera=new THREE.PerspectiveCamera(35,1,.001,100000);this.camera.up.set(0,0,1);
  this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=false;this.controls.addEventListener('change',()=>this.render3D());
  this.scene.add(new THREE.HemisphereLight('#e8eef4','#44404e',2));const light=new THREE.DirectionalLight('#ffffff',2.5);light.position.set(30,-40,70);this.scene.add(light);
  this.group=new THREE.Group();this.scene.add(this.group);
  this.worker=new Worker('/geometry-worker.js',{type:'module'});this.worker.onmessage=({data})=>{const job=this.jobs.get(data.id);this.jobs.delete(data.id);if(!job||job.revision!==this.revision)return;if(data.error){onError(data.error);return;}this.cache.set(job.key,data.positions);job.complete(data.positions);this.render3D();};
  this.worker.onerror=()=>onError('Geometry calculation failed. Reload the workspace.');
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
  let down;this.canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
  this.canvas.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<5)this.pick3D(e,false);down=null;});
  this.canvas.addEventListener('dblclick',e=>this.pick3D(e,true));
  this.canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();this.orbit(e.key);}});
  for(const axis of ['xy','xz','yz']){const c=host.querySelector('#view-'+axis);c.addEventListener('click',e=>this.pickSlice(e,axis,false));c.addEventListener('dblclick',e=>this.pickSlice(e,axis,true));}
 }
 update(model,options={}){
  this.model=model;this.compiled=compileModel(model);this.revision++;this.items=collectInstances(this.compiled);this.rebuild();if(options.fit||this.lastFocus!==JSON.stringify(model.focus)){this.fit();this.lastFocus=JSON.stringify(model.focus);}this.resize();
  this.canvas.dataset.revision=this.revision;this.canvas.dataset.instances=this.items.length;
 }
 clear(){
  for(const o of this.group.children){o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(x=>x.dispose());else o.material?.dispose();o.dispose?.();}
  this.group.clear();this.meshes=[];
 }
 rebuild(){
  this.clear();const batches=new Map();const m=this.model;
  for(const item of this.items){
   if(item.cell.hidden||(m.isolated!=null&&item.cell.id!==m.isolated))continue;
   const sh=item.shape,b=item.bounds,mat=m.materials.find(x=>x.id===item.cell.material),background=sh.type==='moderator'||(!item.cell.region&&sh.type==='box');
   if(background&&!m.showModerator)continue;
   const color=m.colorBy==='universe'?new THREE.Color().setHSL((item.universe*.137)%1,.3,.57).getStyle():mat?.color||'#9b9da2';
   const key=JSON.stringify([item.cell.id,sh,b,color,m.cutaway,background]);
   if(!batches.has(key))batches.set(key,{items:[],item,color,background});batches.get(key).items.push(item);
  }
  const segments=this.items.length>5000?12:40;
  for(const batch of batches.values()){
   const {item,color,background,items}=batch,b=item.bounds,sh=item.shape,dx=b[1]-b[0],dy=b[3]-b[2],dz=b[5]-b[4];
   const material=new THREE.MeshStandardMaterial({color,roughness:.65,metalness:sh.inner?.2:0,side:THREE.DoubleSide,transparent:!!(background||m.transparent),opacity:background?.08:m.transparent?.42:1,depthWrite:!background&&!m.transparent});
   if(m.cutaway&&this.items.length>5000)material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(-1,0,0),0)];
   let geometry,center=[(b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2];
   if(sh.type==='tube'){geometry=tubeGeometry(sh.outer,sh.inner,dz,m.cutaway&&this.items.length<5000,segments);center=[sh.center[0],sh.center[1],b[4]];}
   else if(sh.type==='sphere'){geometry=new THREE.SphereGeometry(sh.radius,32,20);center=sh.center;}
   else if(sh.type==='csg'||sh.type==='moderator'){
    const key=JSON.stringify([item.cell.region,this.model.surfaces,b]);
    const complete=positions=>{if(!positions.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.computeVertexNormals();this.addBatch(g,material,items,[0,0,0]);};
    if(this.cache.has(key))complete(this.cache.get(key));else{const id=crypto.randomUUID();this.jobs.set(id,{key,revision:this.revision,complete});this.worker.postMessage({id,region:item.cell.region,surfaces:this.model.surfaces,bounds:b});}
    continue;
   }else geometry=new THREE.BoxGeometry(dx,dy,dz);
   this.addBatch(geometry,material,items,center);
  }
 }
 addBatch(geometry,material,items,center){
  const mesh=new THREE.InstancedMesh(geometry,material,items.length),matrix=new THREE.Matrix4();
  items.forEach((item,i)=>{const explode=this.model.exploded&&this.items.length<1000?item.cell.id*.12:0;matrix.makeTranslation(item.position[0]+center[0]+explode,item.position[1]+center[1],item.position[2]+center[2]);mesh.setMatrixAt(i,matrix);if(this.model.selection?.kind==='cell'&&this.model.selection.id===item.cell.id)mesh.setColorAt(i,new THREE.Color(material.color).lerp(new THREE.Color('#ffffff'),.22));});
  mesh.instanceMatrix.needsUpdate=true;mesh.userData.items=items;this.group.add(mesh);this.meshes.push(mesh);
 }
 resize(){
  if(!this.renderer)return;const r=this.canvas.getBoundingClientRect();if(r.width<1||r.height<1){this.drawSlices();return;}
  this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();this.render3D();this.drawSlices();
 }
 fit(){
  if(!this.model)return;const b=this.compiled.universes.get(this.model.focus?.universe??0)?.bounds||[-2,2,-2,2,-2,2];
  const center=new THREE.Vector3((b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2),span=Math.max(b[1]-b[0],b[3]-b[2],b[5]-b[4]);
  const r=this.canvas.getBoundingClientRect(),hr=this.host.getBoundingClientRect(),aspect=(r.width||hr.width||1)/Math.max(r.height||hr.height,1),distance=span*2.65/Math.min(1,aspect);
  this.camera.position.copy(center).add(new THREE.Vector3(.85,-1.25,.85).normalize().multiplyScalar(distance));
  this.camera.near=Math.max(.0001,span/10000);this.camera.far=span*1000;this.camera.updateProjectionMatrix();this.controls.target.copy(center);this.controls.update();this.render3D();
 }
 render3D(){if(this.renderer){this.renderer.render(this.scene,this.camera);this.canvas.dataset.draws=Number(this.canvas.dataset.draws||0)+1;}}
 zoom(factor){this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);this.controls.update();this.render3D();}
 orbit(key='ArrowRight'){const v=this.camera.position.clone().sub(this.controls.target),axis=key==='ArrowLeft'||key==='ArrowRight'?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);v.applyAxisAngle(axis,key==='ArrowLeft'||key==='ArrowDown'?-.15:.15);this.camera.position.copy(this.controls.target).add(v);this.controls.update();this.render3D();}
 pick3D(e,focus){
  if(!this.compiled)return;const r=this.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
  const hits=ray.intersectObjects(this.meshes,false);const hit=hits.find(h=>!h.object.material.clippingPlanes?.some(p=>p.distanceToPoint(h.point)<0));if(!hit)return;
  const item=hit.object.userData.items[hit.instanceId];this.onSelect({cell:item.cell,universe:item.universe,path:item.path,point:hit.point.toArray()});if(focus)this.onFocus(item);
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
    if(cell&&!cell.hidden&&(this.model.isolated==null||cell.id===this.model.isolated)){hex=this.model.colorBy==='universe'?new THREE.Color().setHSL((found.universe*.137)%1,.3,.57).getHex():colors.get(cell.material)||0x91939b;if(this.model.selection?.id===cell.id&&this.model.selection.kind==='cell')hex=new THREE.Color(hex).lerp(new THREE.Color('#ffffff'),.14).getHex();}
    const i=(y*width+x)*4;image.data[i]=hex>>16&255;image.data[i+1]=hex>>8&255;image.data[i+2]=hex&255;image.data[i+3]=255;
   }ctx.putImageData(image,0,0);canvas.dataset.revision=this.revision;
  }
 }
 pickSlice(e,axis,focus){
  const map=this.sliceMaps.get(axis);if(!map)return;const canvas=e.currentTarget,r=canvas.getBoundingClientRect(),p=[0,0,0];p[map.a]=map.cx+((e.clientX-r.left)/r.width*map.width-map.width/2)*map.scale;p[map.c]=map.cy+(map.height/2-(e.clientY-r.top)/r.height*map.height)*map.scale;p[map.normal]=map.cut;
  const found=locate(this.compiled,p);if(found){this.onSelect({...found,worldPoint:p});if(focus)this.onFocus(found);}
 }
}

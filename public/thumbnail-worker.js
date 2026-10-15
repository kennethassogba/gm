import * as THREE from 'three';
import {compileModel,collectInstances} from './csg.js';
import {compileRayRegion} from './csg-raycast.js';
import {createCSGMaterial} from './csg-material.js';

let renderer,canvas;
async function thumbnail(model){
 const compiled=compileModel(model),items=collectInstances(compiled,{universe:model.rootUniverse??0,path:[]}).filter(i=>!i.cell.hidden&&!i.cell.background&&i.shape.type!=='moderator');
 if(!items.length)return{label:'Empty geometry'};
 canvas??=new OffscreenCanvas(320,200);
 renderer??=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setSize(320,200,false);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#191b22');
 const bounds=items.reduce((b,i)=>b.map((v,k)=>k%2?Math.max(v,i.bounds[k]+i.position[k>>1]):Math.min(v,i.bounds[k]+i.position[k>>1])),[Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity]);
 let detail=false;
 // Match the editor's useful pin framing without changing the saved geometry.
 if(items.every(i=>i.shape.type==='tube')&&items.every(i=>Math.abs(i.position[0]+i.shape.center[0]-items[0].position[0]-items[0].shape.center[0])<1e-6&&Math.abs(i.position[1]+i.shape.center[1]-items[0].position[1]-items[0].shape.center[1])<1e-6)&&bounds[5]-bounds[4]>(bounds[1]-bounds[0])*12){const z=(bounds[4]+bounds[5])/2,span=(bounds[1]-bounds[0])*2.2;bounds[4]=z-span/2;bounds[5]=z+span/2;detail=true;}
 const batches=new Map(),resources=[];
 try{
  for(const item of items){
   const b=[...item.bounds];if(detail){b[4]=Math.max(b[4],bounds[4]-item.position[2]);b[5]=Math.min(b[5],bounds[5]-item.position[2]);if(b[5]<=b[4])continue;}
   const color=model.materials.find(m=>m.id===item.cell.material)?.color||'#9b9da2',key=JSON.stringify([item.cell.id,b,item.clips,color]);
   if(!batches.has(key))batches.set(key,{item,b,color,items:[]});batches.get(key).items.push(item);
  }
  for(const {item,b,color,items:instances} of batches.values()){
   const clips=[...item.clips],cut=detail||!!model.cutaway;if(cut&&item.shape.type==='tube')clips.push({wedge:item.shape.center.slice(0,2)});
   const region=compileRayRegion(item.cell.region,compiled.surfaces,b,clips),opacity=item.cell.material==null?.22:1;
   const material=createCSGMaterial(region,{color:new THREE.Color(color),transparent:opacity<1,opacity,depthWrite:opacity===1,clippingPlanes:cut&&item.shape.type!=='tube'?[true]:[]},false,renderer.capabilities.maxTextureSize);resources.push(material);
   const geometry=new THREE.BoxGeometry(b[1]-b[0],b[3]-b[2],b[5]-b[4]);geometry.translate((b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2);resources.push(geometry);
   const mesh=new THREE.InstancedMesh(geometry,material,instances.length),matrix=new THREE.Matrix4();resources.push(mesh);instances.forEach((i,n)=>{matrix.makeTranslation(...i.position);mesh.setMatrixAt(n,matrix);});mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);
  }
  const camera=new THREE.PerspectiveCamera(35,1.6,.001,100000);camera.up.set(0,0,1);
  const b=bounds,center=new THREE.Vector3((b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2),span=Math.max(b[1]-b[0],b[3]-b[2],b[5]-b[4]);
  const direction=new THREE.Vector3(.85,-1.25,.85).normalize(),right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right),tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));let distance=0;
  for(const x of [b[0],b[1]])for(const y of [b[2],b[3]])for(const z of [b[4],b[5]]){const p=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,p.dot(direction)+Math.abs(p.dot(right))/(tanV*1.6),p.dot(direction)+Math.abs(p.dot(up))/tanV);}
  camera.position.copy(center).add(direction.multiplyScalar(Math.max(span*.5,distance*1.12)));camera.near=Math.max(.0001,span/10000);camera.far=Math.max(span*1000,distance*10);camera.lookAt(center);camera.updateProjectionMatrix();
  renderer.render(scene,camera);const blob=await canvas.convertToBlob({type:'image/webp',quality:.8});const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return{url:'data:'+blob.type+';base64,'+btoa(binary),label:detail?'Pin detail':''};
 }finally{for(const resource of resources)resource.dispose();renderer.renderLists.dispose();}
}
self.onmessage=async({data})=>{try{self.postMessage(await thumbnail(data));}catch(error){self.postMessage({error:error.message});}};

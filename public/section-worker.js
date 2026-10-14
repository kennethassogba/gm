import {compileModel,collectInstances} from './csg.js';
import {compileRayRegion} from './csg-raycast.js';
import {sectionPolygons,polygonPath} from './section-geometry.js';

let fingerprint='',items=[],surfaces;
const paths=new Map();
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const safeColor=color=>/^#[\da-f]{6}$/i.test(color)?color:'#91939b';
function prepare(model){
 const key=JSON.stringify([model.surfaces,model.cells,model.universes,model.lattices,model.focus]);
 if(key===fingerprint)return;
 const compiled=compileModel(model);items=collectInstances(compiled);surfaces=compiled.surfaces;paths.clear();fingerprint=key;
}
function section(model,map,palette){
 const {a,c,normal,cut,width,height,scale,cx,cy}=map,tolerance=scale*.15;
 const minX=cx-width*scale/2,maxX=cx+width*scale/2,minY=cy-height*scale/2,maxY=cy+height*scale/2;
 const definitions=new Map(),shapes=[];let characters=0;
 for(const item of items){
  if(item.cell.hidden||(model.isolated!=null&&item.cell.id!==model.isolated))continue;
  const localCut=cut-item.position[normal],b=item.bounds;if(localCut<b[normal*2]||localCut>b[normal*2+1])continue;
  const bounds=[Math.max(b[a*2],minX-item.position[a]),Math.min(b[a*2+1],maxX-item.position[a]),Math.max(b[c*2],minY-item.position[c]),Math.min(b[c*2+1],maxY-item.position[c])];
  if(bounds[0]>=bounds[1]||bounds[2]>=bounds[3])continue;
  const key=JSON.stringify([item.cell.region,b,item.clips,a,c,localCut,bounds,tolerance]);
  let path=paths.get(key);
  if(path==null){const region=compileRayRegion(item.cell.region,surfaces,b,item.clips);path=polygonPath(sectionPolygons(region,{...map,cut:localCut},bounds,tolerance));paths.set(key,path);if(paths.size>512)paths.delete(paths.keys().next().value);}
  if(!path)continue;
  if(!definitions.has(key)){characters+=path.length;if(characters>8000000)throw new Error('Section has too much detail to display. Focus a smaller universe.');definitions.set(key,{id:map.axis+'s'+definitions.size,path});}
  const definition=definitions.get(key);shapes.push({...definition,color:safeColor(palette[item.cell.id]),x:item.position[a],y:item.position[c]});
 }
 const description=`${map.axis.toUpperCase()} section at ${cut} cm. Curves are approximated with adaptive chords targeting ${tolerance.toPrecision(4)} cm (0.15 display pixel). Floating-point polygon operations are not a geometry validity check.`;
 const body=`<defs>${[...definitions.values()].map(d=>`<path id="${d.id}" d="${d.path}"/>`).join('')}</defs>`+shapes.toReversed().map(s=>`<use href="#${s.id}" transform="translate(${s.x} ${-s.y})" fill="${s.color}"/>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${-maxY} ${maxX-minX} ${maxY-minY}" fill-rule="evenodd"><title>${escape(model.name)} - ${map.axis.toUpperCase()}</title><desc>${escape(description)}</desc>${body}</svg>`;
 return{svg,shapes,map,description,tolerance,minX,minY};
}
onmessage=async({data})=>{
 const {id,model,maps,palette,format}=data;
 try{
  prepare(model);const result=maps.map(map=>section(model,map,palette));
  if(format==='pdf'){
   const {PDFDocument,rgb}=await import('pdf-lib'),doc=await PDFDocument.create();doc.setTitle(model.name+' - sections');doc.setSubject(result.map(r=>r.description).join('\n'));
   for(const r of result){const page=doc.addPage([r.map.width,r.map.height]);for(const s of r.shapes.toReversed()){const color=s.color.slice(1);page.drawSvgPath(s.path,{x:(s.x-r.minX)/r.map.scale,y:(s.y-r.minY)/r.map.scale,scale:1/r.map.scale,color:rgb(parseInt(color.slice(0,2),16)/255,parseInt(color.slice(2,4),16)/255,parseInt(color.slice(4),16)/255)});}}
   const bytes=await doc.save();postMessage({id,bytes},[bytes.buffer]);
  }else postMessage({id,sections:result.map(({svg,map,description,tolerance})=>({svg,map,description,tolerance}))});
 }catch(error){postMessage({id,error:error.message});}
};

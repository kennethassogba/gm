import {surf,cell,uni,box,nextId,recipes,hexPositions,translateCell,latticePosition} from './model.js';
import {parseRegion,regionValue,cellBounds} from './csg.js';
import {rotationMatrix,vector,transformSurface} from './transforms.js';
import {GUIDE_POSITIONS,CORE_ROWS} from './source-map.js';

const finite=(value,name)=>{const n=Number(value);if(!Number.isFinite(n))throw new Error('Enter a number for '+name+'.');return n;};
const positive=(value,name)=>{const n=finite(value,name);if(n<=0)throw new Error(name+' must be greater than zero.');return n;};
const integer=(value,name,max=100)=>{const n=positive(value,name);if(!Number.isInteger(n)||n>max)throw new Error(name+' must be a whole number from 1 to '+max+'.');return n;};
export const surfaceIds=region=>[...new Set((String(region).match(/[+-]?\d+/g)||[]).map(x=>Math.abs(Number(x))))];
export const unionRegions=regions=>regions.length===1?regions[0]:'('+regions.map(r=>'('+r+')').join(' | ')+')';
export function ensureMaterials(m){if(!m.materials.length)recipes(m);}
export function getCellBounds(m,c){return cellBounds(c,new Map(m.surfaces.map(s=>[s.id,s])),[-1e6,1e6,-1e6,1e6,-1e6,1e6]);}
export function mergeBounds(list){return Array.from({length:6},(_,i)=>i%2?Math.max(...list.map(b=>b[i])):Math.min(...list.map(b=>b[i])));}
export function focusUniverse(m,id){m.focus={universe:id,path:[]};m.selection={kind:'universe',id};m.view='3d';m.isolated=null;}

export function createCell(m,spec){
 if(!['sphere','shell','cylinder','tube','box','hexprism','region'].includes(spec.type))throw new Error('Choose a supported cell shape.');
 const u=spec.universe??m.focus.universe,name=spec.name?.trim()||'Cell',p=(spec.position||[0,0,0]).map((v,i)=>finite(v,'XYZ'[i])),d=spec.size||[1.6,1.6,2];
 let region;
 if(spec.type==='sphere'||spec.type==='shell'){
  const r=positive(spec.radius,'Outer radius');region='-'+surf(m,name,'sphere',{x0:p[0],y0:p[1],z0:p[2],r});
  if(spec.type==='shell'){const inner=positive(spec.innerRadius,'Inner radius');if(inner>=r)throw new Error('Inner radius must be smaller than outer radius.');region+=' '+surf(m,name+' inner','sphere',{x0:p[0],y0:p[1],z0:p[2],r:inner});}
 }
 else if(spec.type==='cylinder'||spec.type==='tube'){
  const r=positive(spec.radius,'Radius'),h=positive(spec.height,'Height'),axis=spec.axis||'z',i='xyz'.indexOf(axis),keys=['x0','y0','z0'].filter((_,j)=>i!==j);if(i<0)throw new Error('Choose X, Y or Z as the axis.');
  const s=surf(m,name,axis+'-cylinder',Object.fromEntries([...keys.map(k=>[k,p['xyz'.indexOf(k[0])]]),['r',r]])),lo=surf(m,name+' bottom',axis+'-plane',{[axis+'0']:p[i]-h/2}),hi=surf(m,name+' top',axis+'-plane',{[axis+'0']:p[i]+h/2});region='-'+s+' '+lo+' -'+hi;
  if(spec.type==='tube'){const inner=positive(spec.innerRadius,'Inner radius');if(inner>=r)throw new Error('Inner radius must be smaller than outer radius.');region+=' '+surf(m,name+' inner',axis+'-cylinder',Object.fromEntries([...keys.map(k=>[k,p['xyz'.indexOf(k[0])]]),['r',inner]]));}
 }else if(spec.type==='hexprism'){
  const width=positive(spec.width,'Across flats'),height=positive(spec.height,'Height');
  const sides=Array.from({length:6},(_,i)=>{const a=Math.cos(i*Math.PI/3),b=Math.sin(i*Math.PI/3);return '-'+surf(m,name+' side '+(i+1),'plane',{a,b,c:0,d:width/2+a*p[0]+b*p[1]});});
  const lo=surf(m,name+' bottom','z-plane',{z0:p[2]-height/2}),hi=surf(m,name+' top','z-plane',{z0:p[2]+height/2});region=[...sides,lo,'-'+hi].join(' ');
 }else if(spec.type==='region'){
  region=String(spec.region||'').trim();if(!region)throw new Error('Choose at least one surface for the region.');parseRegion(region);
  for(const id of surfaceIds(region))if(!m.surfaces.some(s=>s.id===id))throw new Error('Surface '+id+' does not exist.');
 }else{
  const sizes=d.map((v,i)=>positive(v,'XYZ'[i]+' size'));region=box(m,name,p.flatMap((v,i)=>[v-sizes[i]/2,v+sizes[i]/2]));
 }
 const id=cell(m,u,name,region,spec.material==null?null:Number(spec.material));
 const c=m.cells.find(c=>c.id===id);c.editorTranslation=p;if(spec.type!=='region')c.primitive={...structuredClone(spec),position:p};
 m.kind='geometry';m.selection={kind:'cell',id};m.focus={universe:u,path:[]};m.view='3d';syncUniverse(m,u);return id;
}

export function editCell(m,id,spec){
 const old=m.cells.find(c=>c.id===id);if(!old||!old.primitive||old.fill!=null)throw new Error('Choose a primitive cell.');
 m.cells=m.cells.filter(c=>c!==old);const created=createCell(m,{...spec,universe:old.universe}),c=m.cells.find(c=>c.id===created);c.id=id;c.hidden=old.hidden;m.selection={kind:'cell',id};syncDomains(m);return id;
}
export function rotateCells(m,ids,angles,pivot){
 if(angles.length!==3||!angles.every(Number.isFinite)||pivot.length!==3||!pivot.every(Number.isFinite))throw new Error('Enter three finite angles and pivot coordinates.');
 const cs=m.cells.filter(c=>ids.includes(c.id)&&!c.background);if(!cs.length)throw new Error('Select cells to rotate.');if(cs.some(c=>c.fill!=null))throw new Error('Open the universe and rotate its material cells.');
 if(angles.every(v=>v===0))return cs[0].id;
 const r=rotationMatrix(angles),offset=pivot.map((v,i)=>v-vector(r,pivot)[i]);
 for(const c of cs){
  const bounds=getCellBounds(m,c);if(bounds.some(v=>Math.abs(v)>=1e5))throw new Error('Bound the cell before rotating.');
  c.transformSurfacesCloned=false;translateCell(m,c,c.editorTranslation||[0,0,0]);
  for(const id of surfaceIds(c.region))transformSurface(m.surfaces.find(s=>s.id===id),r,offset);
  const corners=Array.from({length:8},(_,i)=>vector(r,[bounds[i&1],bounds[2+(i>>1&1)],bounds[4+(i>>2&1)]]).map((v,j)=>v+offset[j]));
  const rotated=Array.from({length:6},(_,i)=>(i%2?Math.max:Math.min)(...corners.map(p=>p[i>>1])));
  c.region='('+c.region+') '+box(m,c.name+' bounds',rotated);delete c.primitive;c.editorTranslation=vector(r,c.editorTranslation||[0,0,0]).map((v,i)=>v+offset[i]);
 }syncDomains(m);return cs[0].id;
}
export function arrayCells(m,ids,counts=[3,1,1],spacing=[2,0,0]){
 if(!Array.isArray(counts)||counts.length!==3||!Array.isArray(spacing)||spacing.length!==3)throw new Error('Provide counts and spacing for X, Y and Z.');
 if(!ids.length||ids.some(id=>!m.cells.some(c=>c.id===id&&!c.background)))throw new Error('Select cells to repeat.');
 counts=counts.map((v,i)=>integer(v,'XYZ'[i]+' count',50));spacing=spacing.map((v,i)=>finite(v,'XYZ'[i]+' spacing'));
 if(counts.reduce((a,b)=>a*b,1)*ids.length>500)throw new Error('Use at most 500 cells per array, or use a lattice.');
 if(counts.some((v,i)=>v>1&&spacing[i]===0))throw new Error('Set spacing on each repeated axis.');
 const copies=[];for(let z=0;z<counts[2];z++)for(let y=0;y<counts[1];y++)for(let x=0;x<counts[0];x++)if(x||y||z)copies.push(...duplicateCells(m,ids,[x*spacing[0],y*spacing[1],z*spacing[2]]));
 if(copies.length)m.selection={kind:'cell',id:copies[0]};return copies;
}

export function resizePlacements(m,id,bounds){
 const u=m.universes.find(u=>u.id===id);u.bounds=[...bounds];
 for(const c of m.cells.filter(c=>c.fill===id&&c.builderPlacement)){
  const p=c.translation||[0,0,0],boundary=surfaceIds(c.region).map(id=>m.surfaces.find(s=>s.id===id)?.boundaryType).find(t=>t&&t!=='transmission');c.region=box(m,u.name+' boundary',bounds.map((v,i)=>v+p[i>>1]),boundary);c.transformSurfacesCloned=false;
  syncUniverse(m,c.universe);
 }
 syncDomains(m);
}
export function createPin(m,spec,existing=null){
 const pitch=positive(spec.pitch,'Pitch'),height=positive(spec.height,'Height'),layers=spec.layers||[];
 if(!layers.length)throw new Error('Add at least one radial layer.');let previous=0;
 for(const layer of layers){const r=positive(layer.radius,'Outer radius');if(r<=previous)throw new Error('Each outer radius must be larger than the previous layer.');previous=r;}
 if(previous>=pitch/2)throw new Error('Pitch must exceed twice the outer radius.');
 const b=[-pitch/2,pitch/2,-pitch/2,pitch/2,-height/2,height/2],id=existing??uni(m,spec.name||'Fuel pin',b),u=m.universes.find(u=>u.id===id);if(existing!=null){m.cells=m.cells.filter(c=>c.universe!==id);delete u.domain;}u.bounds=b;u.name=spec.name||u.name;u.builder={type:'pin',pitch,height};let last;
 for(const layer of layers){const s=surf(m,(spec.name||'Pin')+' - '+layer.name,'z-cylinder',{x0:0,y0:0,r:Number(layer.radius)});cell(m,id,layer.name,(last?last+' ':'')+'-'+s,layer.material==null?null:Number(layer.material));last=s;}
 const bg=cell(m,id,'Coolant',String(last),spec.coolant==null?null:Number(spec.coolant));m.cells.find(c=>c.id===bg).background=true;
 if(existing!=null)resizePlacements(m,id,b);
 return id;
}

export function createUniform(m,spec){
 const b=spec.bounds||[-1,1,-1,1,-1,1],id=uni(m,spec.name||'Moderator',b);cell(m,id,spec.name||'Moderator','',spec.material==null?null:Number(spec.material));return id;
}

export function createLattice(m,spec,existing=null){
 const fill=Number(spec.fill);if(!m.universes.some(u=>u.id===fill))throw new Error('Create or choose a fill universe first.');
 const height=positive(spec.height,'Height'),px=positive(spec.pitch,'Pitch X'),py=positive(spec.pitchY??px,'Pitch Y'),n=integer(spec.columns??3,'Columns'),ny=integer(spec.rows??n,'Rows'),nz=integer(spec.levels??1,'Axial levels',50),rings=integer(spec.rings??3,'Rings',20),h=height/2;
 const isHex=spec.type==='hexagonal',b=isHex?[-rings*px,rings*px,-rings*px,rings*px,-h,h]:[-n*px/2,n*px/2,-ny*py/2,ny*py/2,-h,h];
 const outside=spec.outer!=null?Number(spec.outer):createUniform(m,{name:(spec.name||'Lattice')+' outer',material:spec.outerMaterial??null,bounds:b});
 const old=existing!=null?m.lattices.find(l=>l.id===existing):null;
 const u=old?m.cells.find(c=>c.fill===existing)?.universe:uni(m,spec.name||'Lattice',b),id=old?existing:Math.max(nextId(m.universes),nextId(m.lattices));
 if(u==null)throw new Error('Lattice has no containing universe.');
 if(!canContain(m,fill,u)||!canContain(m,outside,u))throw new Error('A lattice cannot contain its own universe.');
 const pattern=(x,y)=>{
  if(spec.pattern==='pwr-guides'&&n===17&&ny===17&&GUIDE_POSITIONS.has(y+','+x))return outside;
  if(spec.pattern==='bwr-channel'&&n===9&&ny===9&&((x===4&&y>=3&&y<=5)||((x===3||x===5)&&y===4)))return outside;
  if(spec.pattern==='round'&&Math.hypot((x-(n-1)/2)/(n/2),(y-(ny-1)/2)/(ny/2))>=1)return outside;
  if(spec.pattern==='beavrs'&&n===19&&ny===19&&!/^[A-R]_{2,}\d{1,2}$/.test(CORE_ROWS[y][x]))return outside;
  return fill;
 };
 const lattice=isHex?{id,name:spec.name,type:'hexagonal',orientation:spec.orientation||'x',rings,pitch:[px],center:[0,0],outer:outside,cells:hexPositions(rings).map(e=>({...e,universe:fill}))}:{id,name:spec.name,type:'rectangular',dimension:nz>1?[n,ny,nz]:[n,ny],pitch:nz>1?[px,py,height/nz]:[px,py],lowerLeft:nz>1?[b[0],b[2],b[4]]:[b[0],b[2]],outer:outside,cells:Array.from({length:n*ny*nz},(_,i)=>({x:i%n,y:Math.floor(i/n)%ny,...(nz>1?{z:Math.floor(i/(n*ny))}:{}),universe:pattern(i%n,Math.floor(i/n)%ny)}))};
 if(spec.map)lattice.cells.forEach((e,i)=>e.universe=spec.map[i]??e.universe);
 if(old){
  if(spec.preserveMap&&old.type===lattice.type){const positions=new Map(old.cells.map(e=>[e.q!=null?'h:'+e.q+','+e.r:'r:'+e.x+','+e.y+','+(e.z||0),e.universe]));for(const e of lattice.cells){const key=e.q!=null?'h:'+e.q+','+e.r:'r:'+e.x+','+e.y+','+(e.z||0);if(positions.has(key))e.universe=positions.get(key);}}
  Object.assign(old,lattice);m.cells.find(c=>c.fill===id).name=spec.name;resizePlacements(m,u,b);
 }else{m.lattices.push(lattice);cell(m,u,spec.name||'Lattice','',null,id);}
 const owner=m.universes.find(x=>x.id===u);owner.name=spec.name||owner.name;owner.builder={type:'lattice',lattice:id};return u;
}

export function placeUniverse(m,id,{target=m.focus.universe,position=[0,0,0],name,replace=null}={}){
 if(!canContain(m,id,target))throw new Error('A universe cannot contain itself. Choose another destination.');
 const u=m.universes.find(u=>u.id===id);if(!u)throw new Error('Choose a universe.');
 if(replace!=null){const c=m.cells.find(c=>c.id===replace);if(c?.universe!==target)throw new Error('Choose a cell in the destination universe.');m.cells=m.cells.filter(c=>c.id!==replace);}
 const region=box(m,u.name+' boundary',u.bounds),cId=cell(m,target,name||u.name,region,null,id),c=m.cells.find(c=>c.id===cId);c.editorTranslation=[0,0,0];c.builderPlacement=true;
 if(position.some(v=>Number(v)!==0))translateCell(m,c,position.map(Number));
 m.kind='geometry';m.selection={kind:'cell',id:cId};m.focus={universe:target,path:[]};m.view='3d';syncUniverse(m,target);return cId;
}

export function canContain(m,fill,target,seen=new Set()){
 if(fill===target)return false;if(seen.has(fill))return true;seen.add(fill);
 const l=m.lattices.find(l=>l.id===fill),next=l?[l.outer,...l.cells.map(e=>e.universe)]:m.cells.filter(c=>c.universe===fill&&c.fill!=null).map(c=>c.fill);
 return next.filter(v=>v!=null).every(id=>canContain(m,id,target,seen));
}

export function enableDomain(m,id=m.focus.universe,material=null,boundary='vacuum'){
 const u=m.universes.find(u=>u.id===id);if(u.domain)return;
 if(id===(m.rootUniverse??0)){const refs=new Set(m.cells.filter(c=>c.universe===id).flatMap(c=>surfaceIds(c.region)));for(const s of m.surfaces)if(refs.has(s.id)&&s.boundaryType&&s.boundaryType!=='transmission')s.boundaryType='transmission';}
 const region=box(m,u.name+' boundary',u.bounds,id===(m.rootUniverse??0)?boundary:'transmission');
 const bg=cell(m,id,'Background',region,material);m.cells.find(c=>c.id===bg).background=true;
 u.domain={surfaceIds:surfaceIds(region),cell:bg,auto:true,boundary};syncUniverse(m,id);
}
export function syncUniverse(m,id){
 const u=m.universes.find(u=>u.id===id);if(!u)return;
 const solid=m.cells.filter(c=>c.universe===id&&!c.background),bounds=solid.map(c=>getCellBounds(m,c)).filter(b=>b.every(v=>Math.abs(v)<1e5));
 if(bounds.length&&bounds.length===solid.length&&(!u.domain||u.domain.auto)){
  const b=mergeBounds(bounds);u.bounds=b.map((v,i)=>v+(i%2?1:-1)*Math.max((b[i|1]-b[i&~1])*.025,.02));
 }
 if(u.domain){const d=u.domain,bg=m.cells.find(c=>c.id===d.cell);
  d.surfaceIds.forEach((id,i)=>{const s=m.surfaces.find(s=>s.id===id);if(s){s.params['xyz'[i>>1]+'0']=u.bounds[i];s.boundaryType=u.id===(m.rootUniverse??0)?d.boundary:'transmission';}});
  if(bg)bg.region=d.surfaceIds.map((s,i)=>(i%2?'-':'')+s).join(' ')+(solid.length?' ~('+unionRegions(solid.map(c=>c.region))+')':'');
 }
}
export function syncDomains(m){for(const u of m.universes)if(u.domain)syncUniverse(m,u.id);}

export function combineCells(m,{a,b,operation,name,material,keepTool=false}){
 const first=m.cells.find(c=>c.id===Number(a)),other=m.cells.find(c=>c.id===Number(b));
 if(!first||!other||first===other)throw new Error('Choose two different cells.');
 if(first.universe!==other.universe)throw new Error('Choose cells in the same universe.');
 if(first.fill!=null||other.fill!=null||first.background||other.background)throw new Error('Choose two material or void cells.');
 if(!first.region||!other.region)throw new Error('Give each cell a bounded region first.');
 const op=operation==='union'?' | ':operation==='intersection'?' ':' ~';
 first.region='('+first.region+')'+op+'('+other.region+')';parseRegion(first.region);
 if(operation==='intersection'){const b=getCellBounds(m,first);if(b.some((v,i)=>i%2&&v<=b[i-1]))throw new Error('The cells do not intersect. Move them closer or choose Union.');}
 first.name=name?.trim()||first.name;first.material=material===undefined?first.material:material===null?null:Number(material);delete first.builder;delete first.primitive;delete first.editorTranslation;first.transformSurfacesCloned=false;
 if(!(operation==='difference'&&keepTool))m.cells=m.cells.filter(c=>c!==other);
 m.selection={kind:'cell',id:first.id};m.focus={universe:first.universe,path:[]};syncUniverse(m,first.universe);return first.id;
}
export function duplicateCells(m,ids,delta=[1,0,0]){
 const copied=[];for(const id of ids){const old=m.cells.find(c=>c.id===id);if(!old||old.background)continue;
  const c=structuredClone(old);c.id=nextId(m.cells);c.name+=' copy';c.transformSurfacesCloned=false;m.cells.push(c);translateCell(m,c,(c.editorTranslation||c.translation||[0,0,0]).map((v,i)=>v+delta[i]));copied.push(c.id);
 }syncDomains(m);if(copied.length)m.selection={kind:'cell',id:copied[0]};return copied;
}
export function deleteCells(m,ids){
 const removed=m.cells.filter(c=>ids.includes(c.id)&&!c.background);m.cells=m.cells.filter(c=>!removed.includes(c));
 m.selection={kind:'universe',id:m.focus.universe};m.isolated=null;syncDomains(m);return removed.length;
}
export function groupCells(m,ids,name='Component'){
 const cs=m.cells.filter(c=>ids.includes(c.id)&&!c.background);if(!cs.length)throw new Error('Select cells to group.');
 const target=cs[0].universe;if(cs.some(c=>c.universe!==target))throw new Error('Select cells in the same universe.');
 const bounds=mergeBounds(cs.map(c=>getCellBounds(m,c)));if(bounds.some(v=>Math.abs(v)>=1e5))throw new Error('Bound the selected cells before grouping.');
 const u=uni(m,name,bounds);cs.forEach(c=>c.universe=u);enableDomain(m,u,null,'transmission');m.universes.find(x=>x.id===u).domain.auto=false;
 const placement=placeUniverse(m,u,{target,name});return {universe:u,cell:placement};
}

export function geometryDiagnostics(m,universe=m.focus.universe){
 const surfaces=new Map(m.surfaces.map(s=>[s.id,s])),u=m.universes.find(u=>u.id===universe),cs=m.cells.filter(c=>c.universe===universe).map(c=>({...c,tree:parseRegion(c.region)})),issues=[];
 if(!u||!cs.length)return [{message:'Add a cell to this universe.',kind:'empty'}];
 const b=u.bounds,n=18,overlaps=new Map();let holes=0,firstHole;
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const p=[x,y,z].map((v,i)=>b[i*2]+(v+.431)/n*(b[i*2+1]-b[i*2])),hits=cs.filter(c=>regionValue(c.tree,surfaces,p)<-1e-8);
  if(hits.length>1){const key=hits.map(c=>c.id).join(',');if(!overlaps.has(key))overlaps.set(key,{cells:hits.map(c=>c.id),point:p,message:hits.map(c=>c.name).join(' + '),kind:'overlap'});}
  if(!hits.length){holes++;firstHole??=p;}
 }
 issues.push(...overlaps.values());if(holes)issues.push({kind:'gap',message:'Unfilled space',point:firstHole});return issues;
}

export function serializeRegion(t){if(!t)return '';if(t.op==='surface')return (t.negative?'-':'')+t.id;if(t.op==='not')return '~('+serializeRegion(t.a)+')';return '('+serializeRegion(t.a)+(t.op==='and'?' ':' | ')+serializeRegion(t.b)+')';}

// Shared by browser agents and the stateless MCP endpoint.
export function constructGeometry(m,operation,spec={}){
 ensureMaterials(m);const target=spec.target??m.focus.universe;let id;
 if(['cell','pin','lattice','universe','place'].includes(operation)&&(!m.cells.some(c=>c.universe===target)||target===(m.rootUniverse??0)))enableDomain(m,target,null);
 if(operation==='cell')id=createCell(m,{...spec,universe:target});
 else if(operation==='edit')id=editCell(m,spec.id,spec);
 else if(operation==='rotate')id=rotateCells(m,spec.ids||[],spec.angles||[0,0,0],spec.pivot||[0,0,0]);
 else if(operation==='array')id=arrayCells(m,spec.ids||[],spec.counts,spec.spacing)[0];
 else if(operation==='combine')id=combineCells(m,spec);
 else if(operation==='move'){const c=m.cells.find(c=>c.id===spec.id);if(!c||c.background)throw new Error('Choose a movable cell.');if(!Array.isArray(spec.position)||spec.position.length!==3||!spec.position.every(Number.isFinite))throw new Error('Provide three finite position coordinates.');translateCell(m,c,spec.position);id=c.id;}
 else if(operation==='delete')deleteCells(m,spec.ids||[]);
 else if(operation==='duplicate')duplicateCells(m,spec.ids||[],spec.offset||[1,0,0]);
 else if(operation==='group')id=groupCells(m,spec.ids||[],spec.name).universe;
 else if(['pin','lattice','universe','place'].includes(operation)){
  id=operation==='pin'?createPin(m,spec):operation==='lattice'?createLattice(m,spec):operation==='universe'?createUniform(m,spec):spec.fill;
  if(spec.place!==false)id=placeUniverse(m,id,{target,position:spec.position||[0,0,0],replace:spec.replace});else focusUniverse(m,id);
 }else throw new Error('Unknown construction operation.');
 syncDomains(m);return id;
}

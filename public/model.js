import {CORE_ROWS, GUIDE_POSITIONS} from './source-map.js';
export const BENCHMARKS=[
{id:'beavrs',name:'BEAVRS',source:'MIT CRPG',version:'2.0.2',href:'https://github.com/mit-crpg/BEAVRS',simplification:'Published map and pin dimensions. One representative assembly and fuel recipe. Axial loading and control rods omitted.'},
{id:'c5g7-2d',name:'C5G7 · 2D',source:'OECD NEA / MIT CRPG',version:'NEA/NSC/DOC(2003)16',href:'https://github.com/mit-crpg/benchmarks/tree/master/c5g7/openmc',simplification:'3 × 3 core and 17 × 17 pin layouts. Illustrative continuous-energy recipes replace the seven-group benchmark materials.'},
{id:'c5g7-3d',name:'C5G7 · 3D',source:'OECD NEA / MIT CRPG',version:'NEA/NSC/DOC(2005)16',href:'https://github.com/mit-crpg/benchmarks/tree/master/c5g7/openmc',simplification:'Unrodded layout with a top reflector. Illustrative continuous-energy recipes. Axial pin details omitted.'},
{id:'takeda',name:'Takeda',source:'OECD NEA',version:'NEA/NSC/DOC(2000)4',href:'https://www.oecd-nea.org/jcms/pl_17440/3-d-radiation-transport-benchmarks-for-simple-geometries-with-void-region',simplification:'Box-core, reflector and void-channel adaptation. Illustrative dimensions and recipes; not an exact reference variant.'}
].map(x=>({...x,family:'benchmarks'}));
export const STARTERS=[
{id:'pin',name:'Fuel pin',family:'components'},{id:'pwr17',name:'PWR 17 × 17',family:'components'},{id:'bwr9',name:'BWR assembly',family:'components'},{id:'hex19',name:'Hexagonal lattice',family:'components'},...BENCHMARKS,
{id:'pwr-core',name:'PWR',family:'architectures'},{id:'bwr-core',name:'BWR',family:'architectures'},{id:'candu',name:'CANDU',family:'architectures'},{id:'fast-hex',name:'Fast reactor',family:'architectures'},{id:'htgr',name:'HTGR',family:'architectures'}
].map(x=>({kind:'editable',status:x.family==='architectures'?'Generic':'Example',...x}));
export const nextId=a=>Math.max(0,...a.map(x=>x.id))+1;
export function createEmptyModel(name='Untitled geometry'){
return {schema:'gm-openmc-model/v1',id:crypto.randomUUID(),name,kind:'empty',units:'cm',metadata:{exportable:true,notes:''},surfaces:[],cells:[],materials:[],universes:[{id:0,name:'Geometry',bounds:[-2,2,-2,2,-2,2]}],lattices:[],selection:null,focus:{universe:0,path:[]},view:'3d',cutaway:false,exploded:false,colorBy:'material'};
}
function recipes(m){
const data=[['UO₂','#d99b58',10.3,[['U235',.031],['U238',.969],['O16',2]]],['Helium','#d9dcd3',.0016,[['He4',1]]],['Zircaloy','#6caaa9',6.55,[['Zr90',1]]],['Water','#60788f',.74,[['H1',2],['O16',1]]],['Graphite','#888a91',1.7,[['C12',1]]],['MOX','#a191bf',10.4,[['U238',.94],['Pu239',.06],['O16',2]]],['Sodium','#9eac94',.85,[['Na23',1]]],['Steel','#8896a1',7.8,[['Fe56',1]]],['Heavy water','#7390a5',1.1,[['H2',2],['O16',1]]]];
m.materials=data.map(([name,color,density,ns],i)=>({id:i+1,name,color,density,densityUnits:'g/cm3',nuclides:ns.map(([name,fraction])=>({name,fraction,basis:'ao'}))}));
}
function surf(m,name,type,params,boundaryType){const id=nextId(m.surfaces);m.surfaces.push({id,name,type,params,...(boundaryType?{boundaryType}:{})});return id;}
function cell(m,universe,name,region,material,fill=null){const id=nextId(m.cells);m.cells.push({id,universe,name,region,material,fill});return id;}
function uni(m,name,bounds){const id=Math.max(nextId(m.universes),nextId(m.lattices));m.universes.push({id,name,bounds});return id;}
function box(m,name,b,boundary){return b.map((v,i)=>{const a='xyz'[Math.floor(i/2)],id=surf(m,name+' '+a+(i%2?'+':'−'),a+'-plane',{[a+'0']:v},boundary);return(i%2?'-':'')+id;}).join(' ');}
function water(m,name='Moderator',mat=4,b=[-1,1,-1,1,-15,15]){const u=uni(m,name,b);cell(m,u,name,'',mat);return u;}
function pin(m,name='Fuel pin',r=.41,p=1.26,h=30,fuel=1,coolant=4,single=false){
const u=uni(m,name,[-p/2,p/2,-p/2,p/2,-h/2,h/2]),f=surf(m,name+' · fuel','z-cylinder',{x0:0,y0:0,r});cell(m,u,'Fuel','-'+f,fuel);
if(single){cell(m,u,'Moderator',''+f,coolant);return u;}
const g=surf(m,name+' · gap','z-cylinder',{x0:0,y0:0,r:r+.008}),c=surf(m,name+' · clad','z-cylinder',{x0:0,y0:0,r:r+.065});cell(m,u,'Gap',f+' -'+g,2);cell(m,u,'Cladding',g+' -'+c,3);cell(m,u,'Moderator',''+c,coolant);return u;
}
export function hexPositions(rings){const a=[];for(let q=1-rings;q<rings;q++)for(let r=1-rings;r<rings;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<rings)a.push({q,r});return a;}
export function latticePosition(l,e){
if(l.type==='hexagonal')return l.orientation==='y'?[(l.center?.[0]||0)+l.pitch[0]*Math.sqrt(3)/2*e.q,(l.center?.[1]||0)+l.pitch[0]*(e.r+e.q/2),0]:[(l.center?.[0]||0)+l.pitch[0]*(e.q+e.r/2),(l.center?.[1]||0)+l.pitch[0]*Math.sqrt(3)/2*e.r,0];
return[l.lowerLeft[0]+(e.x+.5)*l.pitch[0],l.lowerLeft[1]+(l.dimension[1]-e.y-.5)*l.pitch[1],l.dimension[2]?l.lowerLeft[2]+((e.z||0)+.5)*l.pitch[2]:0];
}
function rect(m,name,n,p,fill,outer,h=30,map=null){
const u=uni(m,name,[-n*p/2,n*p/2,-n*p/2,n*p/2,-h/2,h/2]),id=Math.max(nextId(m.lattices),nextId(m.universes));
m.lattices.push({id,name,type:'rectangular',dimension:[n,n],pitch:[p,p],lowerLeft:[-n*p/2,-n*p/2],outer,cells:Array.from({length:n*n},(_,i)=>({x:i%n,y:Math.floor(i/n),universe:map?map(i%n,Math.floor(i/n)):fill}))});cell(m,u,name,'',null,id);return u;
}
function hex(m,name,rings,p,fill,outer,h=30){
const s=(rings-.5)*p,u=uni(m,name,[-s,s,-s,s,-h/2,h/2]),id=Math.max(nextId(m.lattices),nextId(m.universes));
m.lattices.push({id,name,type:'hexagonal',orientation:'x',rings,pitch:[p],center:[0,0],outer,cells:hexPositions(rings).map(e=>({...e,universe:fill}))});cell(m,u,name,'',null,id);return u;
}
function root(m,u){const b=structuredClone(m.universes.find(x=>x.id===u).bounds);m.universes[0].bounds=b;cell(m,0,m.name,box(m,'Boundary',b,'vacuum'),null,u);m.kind='geometry';m.selection={kind:'universe',id:0};return m;}
function assembly(m,kind='pwr',fuel=1,h=30){
const n=kind==='bwr'?9:17,p=kind==='bwr'?1.6:1.26,f=pin(m,kind==='bwr'?'BWR pin':'PWR pin',.41,p,h,fuel),w=water(m,'Guide tube',4,[-p/2,p/2,-p/2,p/2,-h/2,h/2]);
return rect(m,kind==='bwr'?'BWR assembly':'PWR assembly',n,p,f,w,h,(x,y)=>kind==='bwr'?((x===4&&y>=3&&y<=5)||((x===3||x===5)&&y===4)?w:f):(GUIDE_POSITIONS.has(y+','+x)?w:f));
}
function c5(m,three){
const h=three?214.2:1,p=1.26,w=water(m,'Reflector',4,[-10.71,10.71,-10.71,10.71,-h/2,h/2]),f=pin(m,'UO₂ pin',.54,p,h,1,4,true),g=pin(m,'MOX pin',.54,p,h,6,4,true);
const a=rect(m,'UO₂ assembly',17,p,f,w,h,(x,y)=>GUIDE_POSITIONS.has(y+','+x)?w:f),b=rect(m,'MOX assembly',17,p,g,w,h,(x,y)=>GUIDE_POSITIONS.has(y+','+x)?w:g);
const map=[[a,b,w],[b,a,w],[w,w,w]],core=rect(m,'Core',3,21.42,a,w,h,(x,y)=>map[y][x]);
if(three){const l=m.lattices.find(x=>x.name==='Core');l.dimension=[3,3,10];l.pitch=[21.42,21.42,21.42];l.lowerLeft=[-32.13,-32.13,-107.1];l.cells=Array.from({length:10},(_,z)=>Array.from({length:9},(_,i)=>({x:i%3,y:Math.floor(i/3),z,universe:z===9?w:map[Math.floor(i/3)][i%3]}))).flat();}
return root(m,core);
}
export function createModelForTemplate(id){
const t=STARTERS.find(x=>x.id===id);if(!t)throw new Error('Choose a model from the library.');const m=createEmptyModel(t.name);recipes(m);m.metadata={exportable:true,source:t.source||'GM',sourceUrl:t.href,sourceVersion:t.version||'1',notes:t.simplification||(t.family==='architectures'?'Generic geometry with illustrative material recipes.':'Parametric example with illustrative material recipes.')};let u;
if(id==='pin')u=pin(m);
if(id==='pwr17'||id==='bwr9')u=assembly(m,id==='bwr9'?'bwr':'pwr');
if(id==='hex19'){const f=pin(m),w=water(m);u=hex(m,'Hexagonal lattice',3,1.26,f,w);}
if(id==='beavrs'){const h=10,p=1.25984,f=pin(m,'Fuel pin',.39218,p,h),ss=m.surfaces.filter(x=>x.type==='z-cylinder');ss[1].params.r=.40005;ss[2].params.r=.4572;const w=water(m,'Water',4,[-10.75,10.75,-10.75,10.75,-h/2,h/2]),a=rect(m,'Assembly',17,p,f,w,h,(x,y)=>GUIDE_POSITIONS.has(y+','+x)?w:f);u=rect(m,'Core',19,21.50364,a,w,h,(x,y)=>/^[A-R]_{2,}\d{1,2}$/.test(CORE_ROWS[y][x])?a:w);}
if(id.startsWith('c5g7'))return c5(m,id.endsWith('3d'));
if(id==='takeda'){const outer=[-15,15,-15,15,-15,15],inner=[-10,10,-10,10,-10,10],core=box(m,'Fuel block',inner),channel=box(m,'Void channel',[-2,2,-2,2,-10,10]);m.universes[0].bounds=outer;cell(m,0,'Fuel block','('+core+') ~('+channel+')',1);cell(m,0,'Void channel',channel,null);cell(m,0,'Reflector',box(m,'Boundary',outer,'vacuum')+' ~('+core+')',5);m.selection={kind:'cell',id:1};return m;}
if(id==='pwr-core'||id==='bwr-core'){const k=id==='bwr-core'?'bwr':'pwr',a=assembly(m,k,1,80),p=k==='bwr'?15:22,w=water(m,'Reflector',4,[-p/2,p/2,-p/2,p/2,-40,40]);u=rect(m,'Core',9,p,a,w,80,(x,y)=>Math.hypot(x-4,y-4)<4.5?a:w);}
if(id==='candu'){const f=pin(m,'Fuel element',.61,1.5,50,1,9),w=water(m,'Heavy water',9,[-4,4,-4,4,-25,25]),a=hex(m,'37-element bundle',4,1.5,f,w,50);u=rect(m,'Pressure tubes',7,15,a,w,50);}
if(id==='fast-hex'){const f=pin(m,'Fuel pin',.32,1.02,60,1,7),w=water(m,'Sodium',7,[-1,1,-1,1,-30,30]),a=hex(m,'Assembly',4,1.02,f,w,60);u=hex(m,'Core',4,8,a,w,60);}
if(id==='htgr'){const f=pin(m,'Fuel compact',.65,2.2,40,1,5,true),g=water(m,'Graphite',5,[-10,10,-10,10,-20,20]),a=hex(m,'Graphite block',3,2.2,f,g,40);u=hex(m,'Core',4,12,a,g,40);}
return root(m,u);
}
export function addPrimitive(m,type='cylinder'){
if(!m.materials.length)recipes(m);const u=m.focus?.universe??0,n=nextId(m.cells);let region;
if(type==='sphere')region='-'+surf(m,'Sphere '+n,'sphere',{x0:0,y0:0,z0:0,r:.8});
else if(type==='box')region=box(m,'Box '+n,[-.8,.8,-.8,.8,-.8,.8]);
else{const r=surf(m,'Cylinder '+n,'z-cylinder',{x0:0,y0:0,r:.6}),lo=surf(m,'Bottom','z-plane',{z0:-1}),hi=surf(m,'Top','z-plane',{z0:1});region='-'+r+' '+lo+' -'+hi;}
const id=cell(m,u,type[0].toUpperCase()+type.slice(1)+' '+n,region,1);m.kind='geometry';m.selection={kind:'cell',id};return id;
}
export function cloneOccurrence(m,path,cellId){
const cm=new Map(),sm=new Map(),um=new Map(),lm=new Map();
function copy(id,depth){
const old=m.universes.find(x=>x.id===id),u=uni(m,old.name+' · occurrence',structuredClone(old.bounds));um.set(id,u);
for(const c of [...m.cells.filter(x=>x.universe===id)]){
const n=structuredClone(c);n.id=nextId(m.cells);n.universe=u;cm.set(c.id,n.id);
n.region=String(c.region).replace(/[+-]?\d+/g,t=>{const old=Math.abs(Number(t));if(!sm.has(old)){const s=structuredClone(m.surfaces.find(x=>x.id===old));s.id=nextId(m.surfaces);m.surfaces.push(s);sm.set(old,s.id);}return(t.startsWith('-')?'-':'')+sm.get(old);});
if(n.fill!=null){const l=m.lattices.find(x=>x.id===n.fill);if(l){const a=structuredClone(l);a.id=Math.max(nextId(m.lattices),nextId(m.universes));m.lattices.push(a);lm.set(l.id,a.id);n.fill=a.id;const step=path[depth];if(step?.lattice===l.id)a.cells[step.index].universe=copy(a.cells[step.index].universe,depth+1);}else n.fill=copy(n.fill,depth);}
m.cells.push(n);}return u;}
const first=path[0];if(!first)throw new Error('Select a lattice occurrence first.');const l=m.lattices.find(x=>x.id===first.lattice);l.cells[first.index].universe=copy(l.cells[first.index].universe,1);
return{cellId:cm.get(cellId)||cellId,surfaceMap:sm,path:path.map((s,i)=>({...s,lattice:i?lm.get(s.lattice)||s.lattice:s.lattice,universe:um.get(s.universe)||s.universe}))};
}
export function focusModel(m,{level,x,y}){if(level==='core'){m.focus={universe:0,path:[]};return m;}let u=m.focus.universe,l;for(let i=0;i<8&&!l;i++){const c=m.cells.find(c=>c.universe===u&&c.fill!=null);l=m.lattices.find(l=>l.id===c?.fill);u=c?.fill;}const e=l?.cells.find(e=>e.x===Number(x)&&e.y===Number(y));if(!e)throw new Error('Choose a position within the lattice.');m.focus={universe:e.universe,path:[...(m.focus.path||[]),{lattice:l.id,index:l.cells.indexOf(e),universe:e.universe}]};return m;}
export function validateModel(m){
const errors=[],sets={};for(const name of ['surfaces','cells','materials','universes','lattices']){sets[name]=new Set();for(const x of m[name]||[]){if(sets[name].has(x.id))errors.push('Duplicate '+name+' ID '+x.id);sets[name].add(x.id);}}
for(const s of m.surfaces){if(!Object.values(s.params).every(Number.isFinite))errors.push('Surface '+s.id+': enter finite coefficients.');if('r'in s.params&&s.params.r<=0)errors.push('Surface '+s.id+': radius must be positive.');}
for(const c of m.cells){if(!sets.universes.has(c.universe))errors.push('Cell '+c.id+': missing universe.');if(c.material!=null&&!sets.materials.has(c.material))errors.push('Cell '+c.id+': missing material.');if(c.fill!=null&&!sets.lattices.has(Number(c.fill))&&!sets.universes.has(Number(c.fill)))errors.push('Cell '+c.id+': missing fill.');for(const r of String(c.region).match(/[+-]?\d+/g)||[])if(!sets.surfaces.has(Math.abs(Number(r))))errors.push('Cell '+c.id+': missing surface '+r);}
for(const mat of m.materials){if(!(Number.isFinite(mat.density)&&mat.density>0))errors.push('Material '+mat.id+': density must be positive.');for(const n of mat.nuclides||[])if(!(Number.isFinite(n.fraction)&&n.fraction>0))errors.push('Material '+mat.id+': fractions must be positive.');}
for(const l of m.lattices){if(!l.pitch.every(p=>Number.isFinite(p)&&p>0))errors.push('Lattice '+l.id+': pitch must be positive.');if(l.outer!=null&&!sets.universes.has(l.outer))errors.push('Lattice '+l.id+': missing outer universe.');const n=l.type==='hexagonal'?1+3*l.rings*(l.rings-1):l.dimension.reduce((a,b)=>a*b,1);if(n!==l.cells.length)errors.push('Lattice '+l.id+': expected '+n+' positions.');for(const e of l.cells)if(!sets.universes.has(e.universe))errors.push('Lattice '+l.id+': missing universe '+e.universe);}
const visit=(id,path)=>{if(path.has(id)){errors.push('Cyclic universe or lattice fill: '+id);return;}const seen=new Set(path);seen.add(id);const l=m.lattices.find(l=>l.id===id);for(const next of l?[...new Set(l.cells.map(e=>e.universe))]:m.cells.filter(c=>c.universe===id&&c.fill!=null).map(c=>Number(c.fill)))visit(next,seen);};for(const u of m.universes)visit(u.id,new Set());return[...new Set(errors)];
}
const xe=v=>String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function exportGeometryXML(m){
const lines=['<?xml version="1.0" encoding="utf-8"?>','<geometry>'];
for(const s of m.surfaces){const p=s.params,c=s.type==='sphere'?[p.x0,p.y0,p.z0,p.r]:s.type==='z-cylinder'?[p.x0,p.y0,p.r]:s.type==='plane'?[p.a,p.b,p.c,p.d]:[Object.values(p)[0]];lines.push('  <surface id="'+s.id+'" name="'+xe(s.name)+'" type="'+s.type+'" coeffs="'+c.map(x=>Number(x)||0).join(' ')+'"'+(s.boundaryType?' boundary="'+s.boundaryType+'"':'')+' />');}
for(const c of m.cells)lines.push('  <cell id="'+c.id+'" name="'+xe(c.name)+'" universe="'+c.universe+'"'+(c.fill!=null?' fill="'+c.fill+'"':' material="'+(c.material??'void')+'"')+(c.region?' region="'+xe(c.region.replaceAll(':','|'))+'"':'')+(c.translation?' translation="'+c.translation.join(' ')+'"':'')+' />');
for(const l of m.lattices){
if(l.type==='rectangular')lines.push('  <lattice id="'+l.id+'" name="'+xe(l.name)+'" dimension="'+l.dimension.join(' ')+'" outer="'+l.outer+'">','    <lower_left>'+l.lowerLeft.join(' ')+'</lower_left>','    <pitch>'+l.pitch.join(' ')+'</pitch>','    <universes>'+l.cells.map(e=>e.universe).join(' ')+'</universes>','  </lattice>');
else{const y=l.orientation==='y',rows=[];for(let r=(y?2:1)*(l.rings-1);r>=(y?-2:-1)*(l.rings-1);r--)rows.push(l.cells.filter(e=>(y?e.q+2*e.r:e.r)===r).sort((a,b)=>a.q-b.q).map(e=>e.universe).join(' '));lines.push('  <hex_lattice id="'+l.id+'" name="'+xe(l.name)+'" n_rings="'+l.rings+'" orientation="'+(l.orientation||'x')+'" outer="'+l.outer+'">','    <center>'+(l.center||[0,0]).join(' ')+'</center>','    <pitch>'+l.pitch[0]+'</pitch>','    <universes>\n'+rows.join('\n')+'\n    </universes>','  </hex_lattice>');}}
return[...lines,'</geometry>',''].join('\n');
}
export function exportMaterialsXML(m){
const lines=['<?xml version="1.0" encoding="utf-8"?>','<materials>'];for(const x of m.materials){lines.push('  <material id="'+x.id+'" name="'+xe(x.name)+'">','    <density value="'+Number(x.density)+'" units="'+xe(x.densityUnits||'g/cm3')+'" />');for(const n of x.nuclides||[])lines.push('    <nuclide name="'+xe(n.name)+'" '+(n.basis==='wo'?'wo':'ao')+'="'+Number(n.fraction)+'" />');for(const e of x.elements||[])lines.push('    <element name="'+xe(e.name)+'" '+(e.basis==='wo'?'wo':'ao')+'="'+Number(e.fraction)+'" />');lines.push('  </material>');}return[...lines,'</materials>',''].join('\n');
}
export function exportPython(m){return'# '+m.name+'\nimport openmc\n\nmaterials = openmc.Materials.from_xml("materials.xml")\ngeometry = openmc.Geometry.from_xml("geometry.xml", materials=materials)\n\n# Add settings and tallies for your calculation.\nmodel = openmc.Model(geometry=geometry, materials=materials)\nmodel.export_to_xml()\n';}
export function importGeometryXML(text){
 const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror')||!doc.querySelector('geometry'))throw new Error('Open a valid geometry.xml file.');const m=createEmptyModel('Imported geometry'),get=(e,k)=>e.getAttribute(k)??e.querySelector(k)?.textContent?.trim(),nums=(e,k)=>(get(e,k)||'').split(/\s+/).filter(Boolean).map(Number);
 for(const s of doc.querySelectorAll('surface')){const type=get(s,'type');if(!['sphere','z-cylinder','plane','x-plane','y-plane','z-plane'].includes(type))throw new Error('Unsupported surface: '+type);const c=nums(s,'coeffs'),keys=type==='sphere'?['x0','y0','z0','r']:type==='z-cylinder'?['x0','y0','r']:type==='plane'?['a','b','c','d']:[type[0]+'0'];m.surfaces.push({id:Number(get(s,'id')),name:get(s,'name')||type,type,params:Object.fromEntries(keys.map((k,i)=>[k,c[i]])),boundaryType:get(s,'boundary')||undefined});}
 for(const c of doc.querySelectorAll('cell')){if(get(c,'rotation'))throw new Error('Rotated universes are not supported.');const material=get(c,'material');if(material?.trim().split(/\s+/).length>1)throw new Error('Distributed materials are not supported.');m.cells.push({id:Number(get(c,'id')),name:get(c,'name')||'Cell',universe:Number(get(c,'universe')||0),material:get(c,'fill')!=null||material==='void'?null:Number(material),fill:get(c,'fill')!=null?Number(get(c,'fill')):null,region:get(c,'region')||'',...(get(c,'translation')?{translation:nums(c,'translation')}: {})});}
 const ids=[...new Set(m.cells.map(c=>c.universe))];m.universes=ids.map(id=>({id,name:'Universe '+id,bounds:[-10,10,-10,10,-10,10]}));
 for(const l of doc.querySelectorAll('lattice')){const values=nums(l,'universes'),d=nums(l,'dimension');m.lattices.push({id:Number(get(l,'id')),name:get(l,'name')||'Lattice',type:'rectangular',dimension:d,pitch:nums(l,'pitch'),lowerLeft:nums(l,'lower_left'),outer:Number(get(l,'outer')),cells:values.map((u,i)=>({x:i%d[0],y:Math.floor(i/d[0])%d[1],z:Math.floor(i/(d[0]*d[1])),universe:u}))});}
 for(const l of doc.querySelectorAll('hex_lattice')){if(Number(get(l,'n_axial')||1)>1)throw new Error('Axial hexagonal lattices are not supported.');const rings=Number(get(l,'n_rings')),orientation=get(l,'orientation')||'y',values=nums(l,'universes'),cells=hexPositions(rings).sort((a,b)=>orientation==='x'?b.r-a.r||a.q-b.q:(b.q+2*b.r)-(a.q+2*a.r)||a.q-b.q);m.lattices.push({id:Number(get(l,'id')),name:get(l,'name')||'Hexagonal lattice',type:'hexagonal',orientation,rings,pitch:nums(l,'pitch'),center:nums(l,'center'),outer:Number(get(l,'outer')),cells:cells.map((e,i)=>({...e,universe:values[i]}))});}
 m.focus.universe=ids.includes(0)?0:ids[0];const root=m.universes.find(u=>u.id===m.focus.universe),planes=m.cells.filter(c=>c.universe===root.id).flatMap(c=>(c.region.match(/[+-]?\d+/g)||[]).map(t=>({s:m.surfaces.find(s=>s.id===Math.abs(Number(t))),neg:Number(t)<0})));for(const {s,neg} of planes)if(s&&['x-plane','y-plane','z-plane'].includes(s.type)){const k='xyz'.indexOf(s.type[0])*2;root.bounds[k+(neg?1:0)]=Object.values(s.params)[0];}
 for(const u of m.universes)if(u!==root){u.bounds=[...root.bounds];const cell=m.cells.find(c=>c.universe===u.id&&c.fill!=null),l=m.lattices.find(l=>l.id===cell?.fill);if(l){const span=l.type==='hexagonal'?(l.rings-.5)*l.pitch[0]:l.dimension[0]*l.pitch[0]/2;u.bounds=[-span,span,-span,span,root.bounds[4],root.bounds[5]];}for(const parent of m.lattices){if(parent.cells.some(e=>e.universe===u.id)){u.bounds[0]=-parent.pitch[0]/2;u.bounds[1]=parent.pitch[0]/2;u.bounds[2]=-parent.pitch[1]/2||-parent.pitch[0]/2;u.bounds[3]=parent.pitch[1]/2||parent.pitch[0]/2;if(parent.dimension?.[2]){u.bounds[4]=-parent.pitch[2]/2;u.bounds[5]=parent.pitch[2]/2;}}}}
 m.kind='geometry';m.selection={kind:'universe',id:root.id};return m;
}

export function translateCell(m,c,value){
 const old=c.editorTranslation||c.translation||[0,0,0],delta=value.map((v,i)=>v-old[i]);
 if(!c.transformSurfacesCloned){const map=new Map();c.region=c.region.replace(/[+-]?\d+/g,t=>{const id=Math.abs(Number(t));if(!map.has(id)){const s=structuredClone(m.surfaces.find(s=>s.id===id));s.id=nextId(m.surfaces);m.surfaces.push(s);map.set(id,s.id);}return(t.startsWith('-')?'-':'')+map.get(id);});c.transformSurfacesCloned=true;}
 for(const id of new Set((c.region.match(/[+-]?\d+/g)||[]).map(t=>Math.abs(Number(t))))){const s=m.surfaces.find(s=>s.id===id),p=s.params;
 if(s.type==='plane')p.d+=p.a*delta[0]+p.b*delta[1]+p.c*delta[2];
 else for(let i=0;i<3;i++){const key='xyz'[i]+'0';if(key in p)p[key]+=delta[i];}
 }
 if(c.fill!=null)c.translation=value;else delete c.translation;c.editorTranslation=value;
}
export function updateLatticePitch(m,l,value){
 const scale=value/l.pitch[0];l.pitch=l.pitch.map((v,i)=>i<2?v*scale:v);if(l.lowerLeft)l.lowerLeft=l.lowerLeft.map((v,i)=>i<2?v*scale:v);
 const owner=m.cells.find(c=>c.fill===l.id),u=m.universes.find(u=>u.id===owner?.universe);if(!u)return;u.bounds=u.bounds.map((v,i)=>i<4?v*scale:v);
 for(const parent of m.cells.filter(c=>c.fill===u.id)){
 const refs=(parent.region.match(/[+-]?\d+/g)||[]).map(t=>m.surfaces.find(s=>s.id===Math.abs(Number(t))));
 for(const s of refs){if(s.type==='x-plane')s.params.x0*=scale;if(s.type==='y-plane')s.params.y0*=scale;}
 if(parent.universe===0)m.universes.find(v=>v.id===0).bounds=[...u.bounds];
 }
}
export function addComponent(m,id){
 const source=createModelForTemplate(id),maps={surfaces:new Map(),cells:new Map(),universes:new Map(),lattices:new Map(),materials:new Map()};
 for(const kind of ['materials','surfaces','universes','lattices','cells'])for(const item of source[kind]){
 const n=structuredClone(item);n.id=['universes','lattices'].includes(kind)?Math.max(nextId(m.universes),nextId(m.lattices)):nextId(m[kind]);maps[kind].set(item.id,n.id);m[kind].push(n);
 }
 for(const s of m.surfaces.filter(s=>[...maps.surfaces.values()].includes(s.id)))if(s.boundaryType)s.boundaryType='transmission';
 for(const c of m.cells.filter(c=>[...maps.cells.values()].includes(c.id))){c.universe=maps.universes.get(c.universe);c.material=c.material==null?null:maps.materials.get(c.material);if(c.fill!=null)c.fill=maps.lattices.get(c.fill)??maps.universes.get(c.fill);c.region=c.region.replace(/[+-]?\d+/g,t=>(t.startsWith('-')?'-':'')+maps.surfaces.get(Math.abs(Number(t))));}
 for(const l of m.lattices.filter(l=>[...maps.lattices.values()].includes(l.id))){l.outer=maps.universes.get(l.outer);l.cells.forEach(e=>e.universe=maps.universes.get(e.universe));}
 const u=m.focus?.universe??0,b=source.universes.find(u=>u.id===0).bounds,newId=cell(m,u,source.name,box(m,source.name+' boundary',b),null,maps.universes.get(0));
 const target=m.universes.find(v=>v.id===u);target.bounds=target.bounds.map((v,i)=>i%2?Math.max(v,b[i]):Math.min(v,b[i]));m.kind='geometry';m.selection={kind:'cell',id:newId};return newId;
}

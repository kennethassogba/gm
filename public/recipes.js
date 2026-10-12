import {createPin,createUniform,createLattice,createCell,combineCells,placeUniverse,focusUniverse,enableDomain,syncDomains,rotateCells} from './builder.js';

const layer=(name,radius,material)=>({name,radius,material});
const pin=(key,name,r=.41,p=1.26,h=30,fuel=1,coolant=4,single=false)=>({key,title:name,type:'pin',spec:{name,pitch:p,height:h,coolant,layers:single?[layer('Fuel',r,fuel)]:[layer('Fuel',r,fuel),layer('Gap',r+.008,2),layer('Cladding',r+.065,3)]}});
const uniform=(key,name,material,bounds)=>({key,title:name,type:'universe',spec:{name,material,bounds}});
const rect=(key,name,n,p,fill,outer,h=30,pattern='all')=>({key,title:name,type:'lattice',spec:{name,type:'rectangular',columns:n,rows:n,pitch:p,pitchY:p,fill:'@'+fill,outer:'@'+outer,height:h,pattern}});
const hex=(key,name,rings,p,fill,outer,h=30)=>({key,title:name,type:'lattice',spec:{name,type:'hexagonal',rings,pitch:p,fill:'@'+fill,outer:'@'+outer,height:h}});
const finish=fill=>({key:'root',title:'Set model boundary',type:'place',spec:{fill:'@'+fill,target:0,boundary:'vacuum'}});
const assembly=(kind='pwr',h=30)=>[pin('pin',kind==='pwr'?'PWR pin':'BWR pin',.41,kind==='pwr'?1.26:1.6,h),uniform('water',kind==='pwr'?'Guide tube':'Water channel',4),rect('assembly',kind==='pwr'?'PWR assembly':'BWR assembly',kind==='pwr'?17:9,kind==='pwr'?1.26:1.6,'pin','water',h,kind==='pwr'?'pwr-guides':'bwr-channel')];

const solid=(key,title,type,spec)=>({key,title,type,spec:{type,name:title,universe:0,...spec},environment:true});
const cut=(key,a,b,title)=>({key,title,type:'boolean',spec:{a:'@'+a,b:'@'+b,operation:'difference'},environment:true});
export function getRecipe(id){
 if(id==='drilled-block')return [solid('block','Create a box','box',{name:'Block',size:[10,8,4],material:10}),solid('hole','Add a cylinder','cylinder',{name:'Cutter',radius:2,height:6,material:null}),cut('block','block','hole','Subtract the cylinder')];
 if(id==='joined-pipes')return [solid('pipe','Horizontal cylinder','cylinder',{radius:2,height:10,axis:'x',material:8}),solid('branch','Branch cylinder','cylinder',{radius:2,height:8,axis:'y',position:[1,3,0],material:8}),{key:'pipe',title:'Join the cylinders',type:'boolean',environment:true,spec:{a:'@pipe',b:'@branch',operation:'union',name:'Pipe junction',material:8}},solid('bore','Horizontal bore','cylinder',{radius:1.4,height:12,axis:'x',material:null}),solid('cross','Branch bore','cylinder',{radius:1.4,height:10,axis:'y',position:[1,3,0],material:null}),{key:'bore',title:'Join the bores',type:'boolean',environment:true,spec:{a:'@bore',b:'@cross',operation:'union',name:'Bore',material:null}},cut('pipe','pipe','bore','Hollow the junction')];
 if(id==='spherical-shell')return [solid('shell','Spherical shell','shell',{radius:5,innerRadius:4.2,material:8})];
 if(id==='slab-shield')return [solid('lead','Lead slab','box',{size:[2,12,12],position:[-3,0,0],material:11}),solid('poly','Polyethylene slab','box',{size:[4,12,12],material:12}),solid('steel','Steel slab','box',{size:[2,12,12],position:[3,0,0],material:8})];
 if(id==='shield-duct')return [solid('wall','Concrete wall','box',{size:[24,8,18],material:14}),solid('duct','Duct','cylinder',{radius:2,height:16,axis:'y',material:null}),{key:'duct',title:'Rotate the duct',type:'rotate',environment:true,spec:{ids:['@duct'],angles:[0,0,25],pivot:[0,0,0]}},cut('wall','wall','duct','Cut the duct')];
 if(id==='collimator')return [solid('block','Tungsten block','box',{size:[12,10,6],material:16}),...[-3,0,3].flatMap((x,i)=>[solid('hole'+i,'Bore '+(i+1),'cylinder',{radius:.85,height:8,position:[x,0,0],material:null}),cut('block','block','hole'+i,'Cut bore '+(i+1))])];
 if(id==='detector')return [solid('housing','Aluminium housing','cylinder',{radius:3,height:7,material:10}),solid('cavity','Cavity','cylinder',{radius:2.7,height:6.4,material:null}),cut('housing','housing','cavity','Hollow the housing'),solid('crystal','Germanium crystal','cylinder',{radius:2.4,height:5.6,material:15})];
 if(id==='nested-spheres')return [solid('sphere','Fuel sphere','sphere',{radius:4,material:1}),solid('reflector','Reflector shell','shell',{radius:7,innerRadius:4,material:5})];
 if(id==='pin')return [pin('pin','Fuel pin'),finish('pin')];
 if(id==='pwr17'||id==='bwr9')return [...assembly(id==='pwr17'?'pwr':'bwr'),finish('assembly')];
 if(id==='hex19')return [pin('pin','Fuel pin'),uniform('water','Moderator',4),hex('lattice','Hexagonal lattice',3,1.26,'pin','water'),finish('lattice')];
 if(id==='pwr-core'||id==='bwr-core'){const pwr=id==='pwr-core';return [...assembly(pwr?'pwr':'bwr',80),rect('core','Core',9,pwr?22:15,'assembly','water',80,'round'),finish('core')];}
 if(id==='beavrs'){const f=pin('pin','Fuel pin',.39218,1.25984,10);f.spec.layers[1].radius=.40005;f.spec.layers[2].radius=.4572;return [f,uniform('water','Water',4),rect('assembly','Assembly',17,1.25984,'pin','water',10,'pwr-guides'),rect('core','Core',19,21.50364,'assembly','water',10,'beavrs'),finish('core')];}
 if(id.startsWith('c5g7')){
  const h=id==='c5g7-3d'?214.2:1,steps=[pin('uo2','UO2 pin',.54,1.26,h,1,4,true),pin('mox','MOX pin',.54,1.26,h,6,4,true),uniform('water','Reflector',4),rect('assembly','UO2 assembly',17,1.26,'uo2','water',h,'pwr-guides'),rect('mixed','MOX assembly',17,1.26,'mox','water',h,'pwr-guides')],core=rect('core','Core',3,21.42,'assembly','water',h),map=['@assembly','@mixed','@water','@mixed','@assembly','@water','@water','@water','@water'];
  core.spec.map=h===1?map:Array.from({length:10},(_,z)=>z===9?Array(9).fill('@water'):map).flat();if(h!==1)core.spec.levels=10;return [...steps,core,finish('core')];
 }
 if(id==='candu')return [pin('pin','Fuel element',.61,1.5,50,1,9),uniform('water','Heavy water',9),hex('bundle','37-element bundle',4,1.5,'pin','water',50),rect('core','Pressure tubes',7,15,'bundle','water',50),finish('core')];
 if(id==='fast-hex')return [pin('pin','Fuel pin',.32,1.02,60,1,7),uniform('water','Sodium',7),hex('assembly','Assembly',4,1.02,'pin','water',60),hex('core','Core',4,8,'assembly','water',60),finish('core')];
 if(id==='htgr')return [pin('pin','Fuel compact',.65,2.2,40,1,5,true),uniform('water','Graphite',5),hex('assembly','Graphite block',3,2.2,'pin','water',40),hex('core','Core',4,12,'assembly','water',40),finish('core')];
 if(id==='takeda')return [
  {key:'fuel',title:'Fuel block',type:'box',spec:{name:'Fuel block',size:[20,20,20],material:1,universe:0}},
  {key:'channel',title:'Void channel',type:'box',spec:{name:'Void channel',size:[4,4,20],material:null,universe:0}},
  {key:'fuel',title:'Cut the channel',type:'boolean',spec:{a:'@fuel',b:'@channel',operation:'difference',keepTool:true,name:'Fuel block',material:1}},
  {key:'reflector',title:'Reflector block',type:'box',spec:{name:'Reflector',size:[30,30,30],material:5,universe:0}},
  {key:'reflector',title:'Subtract the fuel',type:'boolean',spec:{a:'@reflector',b:'@fuel',operation:'difference',keepTool:true,name:'Reflector',material:5}},
  {key:'reflector',title:'Subtract the channel',type:'boolean',spec:{a:'@reflector',b:'@channel',operation:'difference',keepTool:true,name:'Reflector',material:5}},
  {key:'boundary',title:'Set model boundary',type:'boundary',spec:{bounds:[-15,15,-15,15,-15,15]}}
 ];
 return [];
}
export function resolveSpec(spec,refs){
 if(Array.isArray(spec))return spec.map(v=>resolveSpec(v,refs));
 if(spec&&typeof spec==='object')return Object.fromEntries(Object.entries(spec).map(([k,v])=>[k,resolveSpec(v,refs)]));
 return typeof spec==='string'&&spec.startsWith('@')?refs[spec.slice(1)]:spec;
}
export function applyRecipeStep(m,step,spec){
 let result;
 if(step.environment)enableDomain(m,0,null);
 if(step.type==='rotate')result=rotateCells(m,spec.ids,spec.angles,spec.pivot);
 else if(step.type==='pin')result=createPin(m,spec);
 else if(step.type==='universe')result=createUniform(m,spec);
 else if(step.type==='lattice')result=createLattice(m,spec);
 else if(step.type==='boolean')result=combineCells(m,spec);
 else if(step.type==='place'){
  result=placeUniverse(m,spec.fill,{target:0,position:spec.position||[0,0,0]});const root=m.universes.find(u=>u.id===0);root.bounds=m.universes.find(u=>u.id===spec.fill).bounds.map((v,i)=>v+(spec.position?.[i>>1]||0));
  const c=m.cells.find(c=>c.id===result);for(const [i,t] of (c.region.match(/[+-]?\d+/g)||[]).entries()){const s=m.surfaces.find(s=>s.id===Math.abs(Number(t)));s.boundaryType=spec.boundary||'vacuum';s.name='Boundary '+'xyz'[i>>1]+(i%2?'+':'-');}focusUniverse(m,0);
 }else if(step.type==='boundary'){
  const u=m.universes.find(u=>u.id===0);enableDomain(m,0,spec.material??null,spec.boundary||'vacuum');u.bounds=[...spec.bounds];u.domain.auto=spec.auto??false;u.domain.boundary=spec.boundary||'vacuum';syncDomains(m);focusUniverse(m,0);
 }else result=createCell(m,step.type==='box'?{...spec,type:'box'}:spec);
 if(['pin','universe','lattice'].includes(step.type))focusUniverse(m,result);
 if(step.environment)syncDomains(m);
 return result;
}

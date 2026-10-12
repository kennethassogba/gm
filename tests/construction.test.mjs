import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyModel,recipes,STARTERS,exportGeometryXML,exportPython,activeGeometry,translateCell,validateModel} from '../public/model.js';
import {createCell,createPin,createLattice,placeUniverse,enableDomain,combineCells,deleteCells,duplicateCells,groupCells,syncDomains,geometryDiagnostics} from '../public/builder.js';
import {compileModel,locate,cellBounds,parseRegion,regionValue,surfaceMesh} from '../public/csg.js';
import {getRecipe,resolveSpec,applyRecipeStep} from '../public/recipes.js';

const fresh=()=>{const m=createEmptyModel();recipes(m);enableDomain(m);return m;};
const at=(m,p)=>locate(compileModel(m),p)?.cell;
test('A reactor can be built from an empty model using a pin and two lattice repetitions',()=>{
 const m=fresh(),pin=createPin(m,{name:'Pin',pitch:1.26,height:30,coolant:4,layers:[{name:'Fuel',radius:.41,material:1},{name:'Gap',radius:.418,material:2},{name:'Cladding',radius:.475,material:3}]});
 const placement=placeUniverse(m,pin),assembly=createLattice(m,{name:'Assembly',type:'rectangular',fill:pin,columns:17,rows:17,pitch:1.26,height:30,outerMaterial:4,pattern:'pwr-guides'});
 const placedAssembly=placeUniverse(m,assembly,{replace:placement}),core=createLattice(m,{name:'Core',type:'rectangular',fill:assembly,columns:3,rows:3,pitch:21.42,height:30,outerMaterial:4});
 placeUniverse(m,core,{replace:placedAssembly});assert.deepEqual(validateModel(m),[]);assert.equal(at(m,[1.26,0,0]).name,'Fuel');assert.ok(!geometryDiagnostics(m).length);
 assert.equal(at(m,[1.26+.43,0,0]).name,'Cladding');assert.ok(exportGeometryXML(m).includes('boundary="vacuum"'));
});
for(const operation of ['union','intersection','difference'])test('Cell '+operation+' preserves canonical geometry and removes the tool',()=>{
 const m=fresh(),a=createCell(m,{type:'sphere',name:'A',radius:1,position:[-.4,0,0],material:1}),b=createCell(m,{type:'sphere',name:'B',radius:1,position:[.4,0,0],material:3});
 combineCells(m,{a,b,operation,name:'Result',material:1});assert.ok(!m.cells.some(c=>c.id===b));
 const c=m.cells.find(c=>c.id===a),surfaces=new Map(m.surfaces.map(s=>[s.id,s])),region=parseRegion(c.region);
 assert.equal(regionValue(region,surfaces,[0,0,0])<0,operation!=='difference');assert.equal(regionValue(region,surfaces,[-1,0,0])<0,operation!=='intersection');assert.equal(regionValue(region,surfaces,[1,0,0])<0,operation==='union');assert.deepEqual(validateModel(m),[]);
 const bounds=cellBounds(c,surfaces,[-2,2,-2,2,-2,2]);assert.ok(surfaceMesh(region,surfaces,bounds,16).length>0);
});
test('Subtracting a void channel retains two disjoint cells and leaves no sampled gaps',()=>{
 const m=fresh(),a=createCell(m,{type:'box',name:'Fuel',size:[2,2,2],material:1}),b=createCell(m,{type:'cylinder',name:'Channel',radius:.3,height:2,material:null});
 combineCells(m,{a,b,operation:'difference',material:1,keepTool:true});assert.equal(at(m,[0,0,0]).id,b);assert.equal(at(m,[.8,0,0]).id,a);assert.deepEqual(geometryDiagnostics(m),[]);
});
test('Moving, duplicating and deleting updates background coverage without moving shared source surfaces',()=>{
 const m=fresh(),id=createCell(m,{type:'sphere',name:'Pellet',radius:.5,material:1}),copy=duplicateCells(m,[id],[2,0,0])[0];
 assert.equal(at(m,[0,0,0]).id,id);assert.equal(at(m,[2,0,0]).id,copy);
 translateCell(m,m.cells.find(c=>c.id===copy),[3,0,0]);syncDomains(m);assert.equal(at(m,[3,0,0]).id,copy);assert.equal(at(m,[2,0,0]).background,true);
 deleteCells(m,[copy]);assert.ok(!exportGeometryXML(m).includes('Pellet copy'));assert.equal(at(m,[0,0,0]).id,id);
});
test('Unplaced definitions are retained in the project and excluded from the exported root',()=>{
 const m=fresh();createCell(m,{type:'box',name:'Block',size:[2,2,2],material:1});const u=createPin(m,{name:'Unused pin',pitch:2,height:4,layers:[{name:'Fuel',radius:.5,material:1}],coolant:4});
 assert.ok(m.cells.some(c=>c.universe===u));assert.ok(!activeGeometry(m).universes.some(x=>x.id===u));assert.ok(!exportGeometryXML(m).includes('Unused pin'));assert.ok(!exportPython(m).includes('from_xml'));
});
test('Grouping material cells creates a reusable component without overlapping its placement',()=>{
 const m=fresh(),a=createCell(m,{type:'sphere',name:'Left',radius:.3,position:[-.5,0,0],material:1}),b=createCell(m,{type:'sphere',name:'Right',radius:.3,position:[.5,0,0],material:3});
 const group=groupCells(m,[a,b],'Pair');assert.equal(at(m,[-.5,0,0]).id,a);assert.equal(at(m,[.5,0,0]).id,b);assert.equal(m.cells.filter(c=>c.universe===0&&!c.background).length,1);assert.equal(m.cells.find(c=>c.id===group.cell).fill,group.universe);
});
test('Overlap diagnostics identify the offending cells',()=>{
 const m=fresh(),a=createCell(m,{type:'sphere',name:'A',radius:1,material:1}),b=createCell(m,{type:'sphere',name:'B',radius:1,material:3});assert.ok(geometryDiagnostics(m).some(x=>x.kind==='overlap'&&x.cells.includes(a)&&x.cells.includes(b)));
});
test('Rectangular lattices retain non-square dimensions and axial indexing',()=>{
 const m=fresh(),pin=createPin(m,{name:'Pin',pitch:1,height:4,layers:[{name:'Fuel',radius:.3,material:1}],coolant:4}),u=createLattice(m,{name:'3D',type:'rectangular',fill:pin,columns:2,rows:3,levels:4,pitch:1,pitchY:1.5,height:4});
 placeUniverse(m,u);const l=m.lattices[0];assert.deepEqual(l.dimension,[2,3,4]);assert.equal(l.cells.length,24);assert.equal(at(m,[-.5,1.5,-1.5]).name,'Fuel');assert.deepEqual(validateModel(m),[]);
});
for(const t of STARTERS)test('Build every step of '+t.name+' with the public construction tools',()=>{
 const m=createEmptyModel(t.name);recipes(m);const refs={};for(const step of getRecipe(t.id)){refs[step.key]=applyRecipeStep(m,step,resolveSpec(step.spec,refs));assert.deepEqual(validateModel(m),[]);}
 assert.ok(activeGeometry(m).cells.length);assert.match(exportPython(m),/openmc.Geometry\(u0\)/);assert.ok(locate(compileModel(m),[.123,.321,.01]));
});

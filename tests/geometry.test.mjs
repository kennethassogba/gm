import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTERS,createModelForTemplate,createEmptyModel,addPrimitive,addComponent,translateCell,updateLatticePitch,hexPositions,latticePosition,cloneOccurrence,validateModel,exportGeometryXML,exportMaterialsXML} from '../public/model.js';
import {compileModel,collectInstances,locate,parseRegion,regionValue,voxelMesh} from '../public/csg.js';
for(const t of STARTERS)test('Editable geometry: '+t.name,()=>{
 const m=createModelForTemplate(t.id);assert.deepEqual(validateModel(m),[]);assert.ok(m.cells.length);const c=compileModel(m),items=collectInstances(c);assert.ok(items.length);assert.ok(items.some(i=>i.cell.material));assert.match(exportGeometryXML(m),/<geometry>/);assert.match(exportMaterialsXML(m),/<materials>/);
 for(const l of m.lattices)assert.ok(l.cells.every(e=>m.universes.some(u=>u.id===e.universe)));
});
test('Boolean intersection, union and subtraction use canonical half-spaces',()=>{
 const s=new Map([[1,{type:'sphere',params:{x0:0,y0:0,z0:0,r:1}}],[2,{type:'sphere',params:{x0:1,y0:0,z0:0,r:1}}]]);
 assert.ok(regionValue(parseRegion('-1 -2'),s,[.5,0,0])<0);assert.ok(regionValue(parseRegion('(-1:-2)'),s,[-.5,0,0])<0);assert.ok(regionValue(parseRegion('-1 ~(-2)'),s,[-.5,0,0])<0);assert.ok(regionValue(parseRegion('-1 ~(-2)'),s,[.5,0,0])>0);
 assert.throws(()=>parseRegion('-1 rubbish'));assert.throws(()=>parseRegion('(-1'));assert.ok(voxelMesh(parseRegion('-1 ~(-2)'),s,[-1,2,-1,1,-1,1],12).length>0);
});
test('Surface editing updates the point query',()=>{const m=createModelForTemplate('pin');assert.equal(locate(compileModel(m),[.43,0,0]).cell.name,'Cladding');m.surfaces[0].params.r=.45;assert.equal(locate(compileModel(m),[.43,0,0]).cell.name,'Fuel');});
test('Occurrence editing keeps the other repeated universes intact',()=>{
 const m=createModelForTemplate('pwr17'),l=m.lattices[0],index=l.cells.findIndex(e=>e.universe===1),p=latticePosition(l,l.cells[index]),hit=locate(compileModel(m),p);const original=m.surfaces[0].params.r,result=cloneOccurrence(m,hit.path,hit.cell.id);m.surfaces.find(s=>s.id===result.surfaceMap.get(1)).params.r=.3;
 assert.equal(m.surfaces[0].params.r,original);assert.notEqual(l.cells[index].universe,1);assert.equal(l.cells.filter(e=>e.universe===result.path[0].universe).length,1);assert.deepEqual(validateModel(m),[]);
});
test('Translation updates surfaces without moving other cells',()=>{const m=createEmptyModel();addPrimitive(m,'sphere');const c=m.cells[0];translateCell(m,c,[1,0,0]);assert.equal(locate(compileModel(m),[1,0,0]).cell.id,c.id);assert.equal(locate(compileModel(m),[0,0,0]),null);assert.ok(!exportGeometryXML(m).includes('translation='));});
test('Components can be added to an existing model without ID collisions',()=>{const m=createEmptyModel();addPrimitive(m,'sphere');addComponent(m,'pwr17');assert.deepEqual(validateModel(m),[]);assert.ok(collectInstances(compileModel(m)).length>1000);});
test('Pitch edits update the parent boundary',()=>{const m=createModelForTemplate('pwr17'),l=m.lattices[0];updateLatticePitch(m,l,1.5);assert.ok(Math.abs(m.universes[0].bounds[1]-12.75)<1e-10);assert.ok(Math.abs(m.surfaces.find(s=>s.name==='Boundary x+').params.x0-12.75)<1e-10);});
test('Hexagonal coordinates are complete and unique',()=>{for(let r=1;r<=5;r++){const p=hexPositions(r);assert.equal(p.length,1+3*r*(r-1));assert.equal(new Set(p.map(p=>p.q+','+p.r)).size,p.length);}});

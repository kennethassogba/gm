import {mkdir,writeFile} from 'node:fs/promises';
import {STARTERS,createModelForTemplate,createEmptyModel,recipes,exportGeometryXML,exportMaterialsXML,exportPython} from '../public/model.js';
import {compileModel,locate} from '../public/csg.js';
import {createCell,createPin,createLattice,placeUniverse,enableDomain,combineCells} from '../public/builder.js';
const directory=process.argv[2]||'/tmp/gm-exports';
const models=STARTERS.map(t=>[t.id,createModelForTemplate(t.id)]);
for(const operation of ['union','intersection','difference']){
 const m=createEmptyModel(operation);recipes(m);enableDomain(m);const a=createCell(m,{type:'sphere',name:'A',radius:1,position:[-.4,0,0],material:1}),b=createCell(m,{type:'sphere',name:'B',radius:1,position:[.4,0,0],material:3});combineCells(m,{a,b,operation,material:1});models.push(['built-'+operation,m]);
}
{
 const m=createEmptyModel('Built reactor');recipes(m);enableDomain(m);const p=createPin(m,{name:'Pin',pitch:1.26,height:30,layers:[{name:'Fuel',radius:.41,material:1},{name:'Gap',radius:.418,material:2},{name:'Cladding',radius:.475,material:3}],coolant:4}),a=createLattice(m,{name:'Assembly',type:'rectangular',fill:p,columns:17,rows:17,pitch:1.26,height:30,pattern:'pwr-guides',outerMaterial:4}),core=createLattice(m,{name:'Core',type:'rectangular',fill:a,columns:3,rows:3,pitch:21.42,height:30,outerMaterial:4});placeUniverse(m,core);models.push(['built-reactor',m]);
}
for(const [id,m] of models){const dir=directory+'/'+id;await mkdir(dir,{recursive:true});await writeFile(dir+'/geometry.xml',exportGeometryXML(m));await writeFile(dir+'/materials.xml',exportMaterialsXML(m));await writeFile(dir+'/model.py',exportPython(m));const c=compileModel(m),b=m.universes[0].bounds,points=[];for(let i=0;i<80;i++){const p=[0,1,2].map(k=>b[k*2]+(b[k*2+1]-b[k*2])*(((i*17+k*31)%83)+.37)/83);const hit=locate(c,p);points.push({point:p,cell:hit?.cell.id??null,material:hit?.cell.material??null});}await writeFile(dir+'/points.json',JSON.stringify(points));}

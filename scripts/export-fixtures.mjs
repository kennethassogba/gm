import {mkdir,writeFile} from 'node:fs/promises';
import {STARTERS,createModelForTemplate,exportGeometryXML,exportMaterialsXML} from '../public/model.js';
import {compileModel,locate} from '../public/csg.js';
import {latticePosition} from '../public/model.js';
const directory=process.argv[2]||'/tmp/gm-exports';
for(const t of STARTERS){const m=createModelForTemplate(t.id),dir=directory+'/'+t.id;await mkdir(dir,{recursive:true});await writeFile(dir+'/geometry.xml',exportGeometryXML(m));await writeFile(dir+'/materials.xml',exportMaterialsXML(m));const c=compileModel(m),b=m.universes[0].bounds,points=[];for(let i=0;i<80;i++){const p=[0,1,2].map(k=>b[k*2]+(b[k*2+1]-b[k*2])*(((i*17+k*31)%83)+.37)/83);const hit=locate(c,p);points.push({point:p,cell:hit?.cell.id??null,material:hit?.cell.material??null});}await writeFile(dir+'/points.json',JSON.stringify(points));}

import {parseRegion,surfaceMesh} from './csg.js';
onmessage=({data})=>{try{const p=surfaceMesh(parseRegion(data.region),new Map(data.surfaces.map(s=>[s.id,s])),data.bounds,42,data.clips);postMessage({id:data.id,positions:p},[p.buffer]);}catch(error){postMessage({id:data.id,error:error.message});}};

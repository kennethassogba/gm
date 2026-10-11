import {parseRegion,voxelMesh} from './csg.js';
onmessage=({data})=>{try{const p=voxelMesh(parseRegion(data.region),new Map(data.surfaces.map(s=>[s.id,s])),data.bounds);postMessage({id:data.id,positions:p},[p.buffer]);}catch(error){postMessage({id:data.id,error:error.message});}};

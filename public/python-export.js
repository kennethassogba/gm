import {activeGeometry} from './model.js';
import {parseRegion} from './csg.js';

const literal=value=>value===null?'None':typeof value==='boolean'?(value?'True':'False'):Array.isArray(value)?'['+value.map(literal).join(', ')+']':JSON.stringify(value);
const region=t=>!t?'None':t.op==='surface'?(t.negative?'-':'+')+'s'+t.id:t.op==='not'?'~('+region(t.a)+')':'('+region(t.a)+(t.op==='and'?' & ':' | ')+region(t.b)+')';
export function pythonModel(model){
 const m=activeGeometry(model),lines=['# '+String(m.name).replace(/[\r\n]/g,' '),'import openmc','','# Materials'];
 for(const mat of m.materials){const n='m'+mat.id;lines.push(n+' = openmc.Material(material_id='+mat.id+', name='+literal(mat.name)+')',n+'.set_density('+literal(mat.densityUnits||'g/cm3')+', '+mat.density+')');for(const x of mat.nuclides||[])lines.push(n+'.add_nuclide('+literal(x.name)+', '+x.fraction+', '+literal(x.basis||'ao')+')');for(const x of mat.elements||[])lines.push(n+'.add_element('+literal(x.name)+', '+x.fraction+', '+literal(x.basis||'ao')+')');}
 lines.push('materials = openmc.Materials(['+m.materials.map(x=>'m'+x.id).join(', ')+'])','','# Surfaces');
 const classes={'x-plane':'XPlane','y-plane':'YPlane','z-plane':'ZPlane',quadric:'Quadric',plane:'Plane',sphere:'Sphere','x-cylinder':'XCylinder','y-cylinder':'YCylinder','z-cylinder':'ZCylinder'};
 for(const s of m.surfaces)lines.push('s'+s.id+' = openmc.'+classes[s.type]+'(surface_id='+s.id+', name='+literal(s.name)+', '+Object.entries(s.params).map(([k,v])=>k+'='+v).join(', ')+(s.boundaryType?', boundary_type='+literal(s.boundaryType):'')+')');
 lines.push('','# Reusable universes');for(const u of m.universes)lines.push('u'+u.id+' = openmc.Universe(universe_id='+u.id+', name='+literal(u.name)+')');
 lines.push('','# Lattices');
 for(const l of m.lattices){const n='l'+l.id;lines.push(n+' = openmc.'+(l.type==='hexagonal'?'Hex':'Rect')+'Lattice(lattice_id='+l.id+', name='+literal(l.name)+')',n+'.pitch = '+literal(l.pitch));if(l.outer!=null)lines.push(n+'.outer = u'+l.outer);
  if(l.type==='rectangular'){
   lines.push(n+'.lower_left = '+literal(l.lowerLeft));const layers=Array.from({length:l.dimension[2]||1},(_,z)=>'['+Array.from({length:l.dimension[1]},(_,y)=>'['+Array.from({length:l.dimension[0]},(_,x)=>'u'+l.cells.find(e=>e.x===x&&e.y===y&&(e.z||0)===z).universe).join(', ')+']').join(',\n    ')+']');lines.push(n+'.universes = '+(l.dimension[2]?'[\n    '+layers.join(',\n    ')+'\n]':layers[0]));
  }else{
   lines.push(n+'.center = '+literal(l.center||[0,0]),n+'.orientation = '+literal(l.orientation||'x'));const rings=[];
   for(let r=l.rings-1;r>0;r--){const entries=l.cells.filter(e=>Math.max(Math.abs(e.q),Math.abs(e.r),Math.abs(e.q+e.r))===r);entries.sort((a,b)=>{
    const angle=e=>{const x=l.orientation==='y'?Math.sqrt(3)/2*e.q:e.q+e.r/2,y=l.orientation==='y'?e.r+e.q/2:Math.sqrt(3)/2*e.r;return (Math.atan2(x,y)+2*Math.PI)%(2*Math.PI);};return angle(a)-angle(b);
   });rings.push('['+entries.map(e=>'u'+e.universe).join(', ')+']');}
   rings.push('[u'+l.cells.find(e=>e.q===0&&e.r===0).universe+']');lines.push(n+'.universes = [\n    '+rings.join(',\n    ')+'\n]');
  }
 }
 lines.push('','# Cells');
 for(const c of m.cells){const fill=c.fill!=null?(m.lattices.some(l=>l.id===c.fill)?'l':'u')+c.fill:c.material!=null?'m'+c.material:'None',n='c'+c.id;lines.push(n+' = openmc.Cell(cell_id='+c.id+', name='+literal(c.name)+', fill='+fill+', region='+region(parseRegion(c.region))+')');if(c.translation)lines.push(n+'.translation = '+literal(c.translation));lines.push('u'+c.universe+'.add_cell('+n+')');}
 lines.push('','geometry = openmc.Geometry(u'+(m.rootUniverse??(m.universes.some(u=>u.id===0)?0:m.universes[0]?.id))+')','materials.export_to_xml()','geometry.export_to_xml()','','# Set cross sections, settings and tallies before running transport.','');return lines.join('\n');
}

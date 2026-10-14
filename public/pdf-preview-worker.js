import {compileModel,locate} from './csg.js';
onmessage=({data})=>{try{
 const {model,axis,id}=data,c=compileModel(model),b=model.universes.find(u=>u.id===0).bounds,axes=axis==='xz'?[0,2,1]:axis==='yz'?[1,2,0]:[0,1,2];
 const [a,z,normal]=axes,position=(b[normal*2]+b[normal*2+1])/2,width=320,height=220,pixels=new Uint8ClampedArray(width*height*4);
 const span=Math.max((b[a*2+1]-b[a*2])/width,(b[z*2+1]-b[z*2])/height)*1.08;
 const colors=new Map(model.materials.map(m=>[m.id,m.color]));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=[0,0,0];p[a]=(b[a*2]+b[a*2+1])/2+(x-width/2)*span;p[z]=(b[z*2]+b[z*2+1])/2-(y-height/2)*span;p[normal]=position;
  const cell=locate(c,p)?.cell;const color=cell&&!cell.background?(colors.get(cell.material)||'#8994b3'):'#17191e';const hex=parseInt(color.slice(1),16),offset=(y*width+x)*4;
  pixels[offset]=hex>>16;pixels[offset+1]=(hex>>8)&255;pixels[offset+2]=hex&255;pixels[offset+3]=255;
 }
 postMessage({id,axis,position,pixels:pixels.buffer},[pixels.buffer]);
}catch(error){postMessage({id:data.id,error:true});}};

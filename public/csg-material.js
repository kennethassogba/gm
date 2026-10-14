import * as THREE from 'three';
import {intersectRayRegion} from './csg-raycast.js';

// The box only schedules fragments. Visible boundaries, normals and depth come
// from ray/surface intersections and the canonical Boolean expression.
export function createCSGMaterial(region,source,selected){
 const color=source.color.clone();if(selected)color.lerp(new THREE.Color('#ffffff'),.22);
 const material=new THREE.ShaderMaterial({
  side:THREE.BackSide,transparent:source.transparent,opacity:source.opacity,depthWrite:source.depthWrite,
  uniforms:{
   coeffA:{value:region.polynomials.map(({q})=>new THREE.Vector4(...q.slice(0,4)))},
   coeffB:{value:region.polynomials.map(({q})=>new THREE.Vector4(...q.slice(4,8)))},
   coeffC:{value:region.polynomials.map(({q})=>new THREE.Vector2(...q.slice(8,10)))},
   origins:{value:region.polynomials.map(({offset})=>new THREE.Vector3(...offset))},
   baseColor:{value:color},alpha:{value:source.opacity},
   selectionGlow:{value:selected?.18:0},cutX:{value:!!source.clippingPlanes?.length}
  },
  vertexShader:`
   varying vec3 localPoint;
   varying vec3 rayOrigin;
   varying vec3 worldOffset;
   void main(){
    mat4 world=modelMatrix*instanceMatrix;
    localPoint=position;
    rayOrigin=(inverse(world)*vec4(cameraPosition,1.0)).xyz;
    worldOffset=world[3].xyz;
    gl_Position=projectionMatrix*viewMatrix*world*vec4(position,1.0);
   }`,
  fragmentShader:`
   uniform vec4 coeffA[${region.polynomials.length}];
   uniform vec4 coeffB[${region.polynomials.length}];
   uniform vec2 coeffC[${region.polynomials.length}];
   uniform vec3 origins[${region.polynomials.length}];
   uniform vec3 baseColor;
   uniform float alpha,selectionGlow;
   uniform bool cutX;
   uniform mat4 projectionMatrix;
   varying vec3 localPoint;
   varying vec3 rayOrigin;
   varying vec3 worldOffset;
   float valueAt(int i,vec3 point){
    vec3 p=point+origins[i];vec4 a=coeffA[i],b=coeffB[i];vec2 c=coeffC[i];
    return dot(a.xyz,p*p)+a.w*p.x*p.y+b.x*p.y*p.z+b.y*p.x*p.z+b.z*p.x+b.w*p.y+c.x*p.z+c.y;
   }
   vec3 normalAt(int i,vec3 point){
    vec3 p=point+origins[i];vec4 a=coeffA[i],b=coeffB[i];
    return 2.0*a.xyz*p+vec3(a.w*p.y+b.y*p.z+b.z,a.w*p.x+b.x*p.z+b.w,b.x*p.y+b.y*p.x+coeffC[i].x);
   }
   bool inside(vec3 point,int surface,float signAtBoundary){
    float f[${region.polynomials.length}];
    for(int i=0;i<${region.polynomials.length};i++)f[i]=i==surface?signAtBoundary:valueAt(i,point);
    return ${region.expression};
   }
   void consider(float t,int surface,vec3 direction,inout float nearest,inout vec3 normal){
    if(t<0.0||t>=nearest)return;
    vec3 p=rayOrigin+t*direction;
    if(cutX&&p.x+worldOffset.x>0.0)return;
    vec3 gradient=normalAt(surface,p);float derivative=dot(gradient,direction);
    if(abs(derivative)<1e-12)return;
    // At an exact root, use the derivative for this surface's two half-spaces.
    // This avoids epsilon stepping and speckling near tangent cylinder rays.
    bool before=inside(p,surface,-derivative),after=inside(p,surface,derivative);
    if(before==after)return;
    vec4 clip=projectionMatrix*viewMatrix*vec4(p+worldOffset,1.0);
    if(clip.z < -clip.w || clip.z > clip.w)return;
    nearest=t;normal=normalize(gradient);
    if((dot(normal,direction)>0.0)==after)normal=-normal;
   }
   void main(){
    vec3 direction=normalize(localPoint-rayOrigin),normal=vec3(0.0);float nearest=1e30;
    for(int i=0;i<${region.polynomials.length};i++){
     vec4 a=coeffA[i],b=coeffB[i];
     float qa=dot(a.xyz,direction*direction)+a.w*direction.x*direction.y+b.x*direction.y*direction.z+b.y*direction.x*direction.z;
     float qb=dot(normalAt(i,rayOrigin),direction),qc=valueAt(i,rayOrigin);
     if(abs(qa)<1e-12){if(abs(qb)>1e-12)consider(-qc/qb,i,direction,nearest,normal);}
     else{
      float disc=qb*qb-4.0*qa*qc;
      if(disc>=0.0){float stable=-0.5*(qb+(qb<0.0?-1.0:1.0)*sqrt(disc));
       if(stable==0.0)consider(-qb/(2.0*qa),i,direction,nearest,normal);
       else{consider(stable/qa,i,direction,nearest,normal);consider(qc/stable,i,direction,nearest,normal);}
      }
     }
    }
    if(nearest==1e30)discard;
    vec3 p=rayOrigin+nearest*direction;
    vec4 clip=projectionMatrix*viewMatrix*vec4(p+worldOffset,1.0);
    gl_FragDepth=clip.z/clip.w*0.5+0.5;
    // Face the shading normal toward the eye when viewing from inside a cell.
    if(dot(normal,direction)>0.0)normal=-normal;
    float diffuse=max(dot(normal,normalize(vec3(30.0,-40.0,70.0))),0.0);
    float hemisphere=0.38+0.16*(normal.z*0.5+0.5);
    gl_FragColor=vec4(baseColor*(hemisphere+0.75*diffuse+selectionGlow),alpha);
    #include <colorspace_fragment>
   }`
 });
 material.color=source.color.clone();material.userData.analyticCSG=true;
 return material;
}

export function installCSGPicking(mesh,region){
 const instance=new THREE.Matrix4(),world=new THREE.Matrix4(),inverse=new THREE.Matrix4(),localRay=new THREE.Ray(),point=new THREE.Vector3();
 const b=region.bounds,box=new THREE.Box3(new THREE.Vector3(b[0],b[2],b[4]),new THREE.Vector3(b[1],b[3],b[5]));
 mesh.raycast=function(raycaster,hits){
  for(let instanceId=0;instanceId<this.count;instanceId++){
   this.getMatrixAt(instanceId,instance);world.multiplyMatrices(this.matrixWorld,instance);inverse.copy(world).invert();localRay.copy(raycaster.ray).applyMatrix4(inverse);
   if(!localRay.intersectBox(box,point))continue;
   const accept=p=>{point.set(...p).applyMatrix4(world);const distance=point.distanceTo(raycaster.ray.origin);return distance>=raycaster.near&&distance<=raycaster.far&&(!this.material.uniforms.cutX.value||point.x<=0);};
   const t=intersectRayRegion(region,localRay.origin.toArray(),localRay.direction.toArray(),accept);if(t==null)continue;
   localRay.at(t,point).applyMatrix4(world);hits.push({distance:point.distanceTo(raycaster.ray.origin),point:point.clone(),object:this,instanceId});
  }
 };
}

// Procedural continuation for unobserved space/time around the learned material.
// Coordinates are in output-height units; the distilled velocity model carries
// this fallback while liquid-appearance.js reconstructs the observed reference.
export const liquidMaterial = `
float materialNoise(vec3 p) {
  vec3 cell=floor(p), f=fract(p);
  f=f*f*(3.-2.*f);
  vec2 a=cell.xy+cell.z*vec2(37.,17.);
  vec2 b=a+vec2(37.,17.);
  return mix(mix(mix(hash(a),hash(a+vec2(1.,0.)),f.x),
                 mix(hash(a+vec2(0.,1.)),hash(a+vec2(1.)),f.x),f.y),
             mix(mix(hash(b),hash(b+vec2(1.,0.)),f.x),
                 mix(hash(b+vec2(0.,1.)),hash(b+vec2(1.)),f.x),f.y),f.z);
}
vec2 materialField(vec2 p,float time) {
  return vec2(materialNoise(vec3(p,time)),materialNoise(vec3(p+vec2(11.7,29.3),time+7.1)))*2.-1.;
}
vec2 materialDomain(vec2 p,float time) {
  float age=max(time,0.)*.78;
  // A continuously evolving volume, rather than crossfading unrelated 2D
  // fields or playing the short measured deformation forwards and backwards.
  vec2 q=p+.19*materialField(p*3.8+vec2(6.2,3.4),age*.19+2.3);
  q+=.090*materialField(q*8.1+vec2(12.3,8.1),age*.22+6.8);
  q+=.024*materialField(q*17.3,age*.25+4.1);
  return q;
}
float materialOpenings(vec2 q,float structure) {
  vec2 p=q*4.7+vec2(14.,18.), cell=floor(p), local=fract(p);
  float surface=10.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 offset=vec2(float(x),float(y)),id=cell+offset;
    vec2 center=.12+.76*vec2(hash(id),hash(id+vec2(17.,31.)));
    float radius=mix(.20,.46,hash(id+vec2(41.,9.)));
    radius+=.035*sin(hash(id+vec2(7.,53.))*6.2831853);
    vec2 delta=offset+center-local;
    float distance=length(delta)-radius;
    float h=clamp(.5+.5*(distance-surface)/.12,0.,1.);
    surface=mix(distance,surface,h)-.12*h*(1.-h);
  }
  return surface*.18+mix(-.012,.020,structure);
}
vec3 materialPalette(float phase) {
  // Seven existing user-editable colors, ordered along a broad color ribbon.
  // Smooth interpolation avoids the narrow repeated contour rings of the old
  // distance-to-edge palette.
  float t=clamp(phase,0.,.99998)*6.;
  int i=int(floor(t));
  return mix(u_paletteColors[i],u_paletteColors[i+1],fract(t))/255.;
}
vec3 materialColor(vec2 q,float opening) {
  // A regional gradient and the thickness of the flowing sheet jointly color
  // the folds. Cavities bend a broad band; they do not repeat a full rainbow.
  float thickness=min(max(opening,0.)*9.,.58);
  float phase=.67+q.x*.6-thickness*(1.-1.4*smoothstep(-.05,.35,q.x));
  phase-=.16*smoothstep(.04,.30,abs(q.y));
  phase+=.12*(noise(q*3.4+vec2(23.,14.))-.5);
  phase+=.035*sin(q.y*8.+q.x*3.);
  // Continue the ribbon on very wide/off-centre selections without clamping
  // an entire region to the first or last color. Reflection is continuous.
  phase=1.-abs(1.-mod(phase,2.));
  return materialPalette(phase);
}
`;

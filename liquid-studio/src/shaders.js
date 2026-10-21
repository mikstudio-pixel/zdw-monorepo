import { LIQUID_REFERENCE } from './liquid-definition.js';
import { FIELD_DISPLACEMENT } from './pointer-field.js';
import { BIRTH_LIFETIME, MAX_BIRTHS } from './liquid-births.js';

export const vertex = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0., 1.);
}`;

// The calibrated mode draws an animated curve live. Only its inverse
// deformation field is sampled from native AE coordinate probes.
export const sourceFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_original;
uniform highp sampler3D u_deformation;
uniform sampler2D u_filteredSource;
uniform sampler2D u_pointerField;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec3 u_background;
uniform float u_time;
uniform float u_interaction;
uniform float u_procedural;
uniform float u_reveal;
uniform float u_repel;
uniform float u_repelStrength;
uniform float u_erase;
uniform int u_birthCount;
uniform vec4 u_births[${MAX_BIRTHS}];

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 s = f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),s.x),
             mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),s.x),s.y);
}
vec2 field(vec2 p) {
  return vec2(noise(p), noise(p+vec2(4.83,9.13))) * 2. - 1.;
}
vec3 palette(float t) {
  vec3 blue = vec3(.638,.707,.99);
  vec3 yellow = vec3(1.,.806,.33);
  vec3 red = vec3(1.,.245,.367);
  t = fract(t);
  if(t < .43) return mix(blue,yellow,smoothstep(.05,.43,t));
  if(t < .66) return mix(yellow,red,smoothstep(.43,.66,t));
  return mix(red,blue,smoothstep(.74,1.,t));
}

vec2 liquidWarp(vec2 p, float time) {
  vec2 q=p;
  q += .19*field(q*6.6+vec2(2.3,5.1));
  q += .038*field(q*10.+vec2(5.3,2.1));
  float angle=6.2831853*fract(q.y*1080./242.5-time*.22);
  float semicircle=.7854-.2846*cos(angle)-.1062*cos(2.*angle)-.0589*cos(3.*angle);
  q.x += (semicircle-.5)*100./1080.;
  return q;
}

// AE tutorial: 259 px gradient stroke, two cubic segments, animated 0–3.6 s.
// Control points are reconstructed from the tutorial, not author-supplied data.
float pathProgress(float time) {
  float x=clamp(time/3.6,0.,1.);
  float lo=0., hi=1.;
  for(int i=0;i<12;i++) {
    float t=(lo+hi)*.5, u=1.-t;
    float bx=3.*u*u*t*.6+3.*u*t*t*.4+t*t*t;
    if(bx<x) lo=t; else hi=t;
  }
  float t=(lo+hi)*.5;
  return t*t*(3.-2.*t);
}
uniform vec3 u_paletteColors[7];
uniform float u_customPalette;
vec3 referencePalette(float t) {
  const float stops[7]=float[7](${LIQUID_REFERENCE.positions.map(v => Number(v).toFixed(5)).join(',')});
  const vec3 colors[7]=vec3[7](${LIQUID_REFERENCE.colors.map(c => `vec3(${c.map(v => Number(v).toFixed(1)).join(',')})`).join(',')});
  t=clamp(t,0.,.99998);
  for(int i=1;i<7;i++) if(t<=stops[i]) return mix(u_customPalette>.5 ? u_paletteColors[i-1] : colors[i-1],u_customPalette>.5 ? u_paletteColors[i] : colors[i],(t-stops[i-1])/(stops[i]-stops[i-1]))/255.;
  return (u_customPalette>.5 ? u_paletteColors[6] : colors[6])/255.;
}
vec2 referencePoint(int index,float t) {
  const vec2 start[7]=vec2[7](${LIQUID_REFERENCE.start.map(p => `vec2(${p.map(v => v.toFixed(6)).join(',')})`).join(',')});
  const vec2 end[7]=vec2[7](${LIQUID_REFERENCE.end.map(p => `vec2(${p.map(v => v.toFixed(6)).join(',')})`).join(',')});
  return mix(start[index],end[index],t);
}
float curveDistance(vec2 q,float progress) {
  float nearest=1e10;
  for(int curve=0;curve<2;curve++) {
    vec2 a=referencePoint(curve*3,progress), b=referencePoint(curve*3+1,progress);
    vec2 c=referencePoint(curve*3+2,progress), d=referencePoint(curve*3+3,progress);
    vec2 previous=a;
    for(int i=1;i<=24;i++) {
      float t=float(i)/24., u=1.-t;
      vec2 current=u*u*u*a+3.*u*u*t*b+3.*u*t*t*c+t*t*t*d;
      vec2 segment=current-previous;
      float h=clamp(dot(q-previous,segment)/max(dot(segment,segment),.00001),0.,1.);
      nearest=min(nearest,length(q-previous-h*segment));
      previous=current;
    }
  }
  return nearest;
}
vec4 referenceStroke(vec2 q,float time,float structure) {
  float progress=pathProgress(time);
  float width=129.5*mix(.72,1.28,structure);
  float sdf=curveDistance(q,progress)-width;
  // Butt caps of the open AE stroke. Only the outward half-plane is clipped.
  vec2 first=referencePoint(0,progress), last=referencePoint(6,progress);
  vec2 startDirection=normalize(referencePoint(1,progress)-first);
  vec2 endDirection=normalize(referencePoint(5,progress)-last);
  if(length(q-first)<width*1.5) sdf=max(sdf,-dot(q-first,startDirection));
  if(length(q-last)<width*1.5) sdf=max(sdf,-dot(q-last,endDirection));
  float alpha=1.-smoothstep(-.6,.6,sdf);
  float phase=1.-length(q-vec2(-16.,-58.))/688.72346;
  return vec4(referencePalette(phase),alpha);
}

vec4 referenceLiquid(vec2 p,float time,float structure) {
  vec2 uv=p*vec2(1080./1920.,-1.)+.5;
  float mapFrame=time<=4.3 ? max(time,0.)*10. : 43.+clamp((time-4.3)/.06,0.,1.);
  float slice=(mapFrame+.5)/45.;
  vec4 map=texture(u_deformation,vec3(uv,slice));
  if(map.a<.999) return vec4(0.);
  vec2 q=(p*vec2(1.,-1.)+map.rg)*1080.;
  vec2 sourceUv=q/vec2(1920.,-1080.)+.5;
  if(any(lessThan(sourceUv,vec2(0.))) || any(greaterThan(sourceUv,vec2(1.)))) return vec4(0.);
  vec4 color=texture(u_filteredSource,sourceUv);
  return vec4(color.rgb/max(color.a,.00001),color.a);
}

vec3 bornLiquid(vec2 p, float aspect) {
  float surface=1.;
  for(int i=0;i<${MAX_BIRTHS};i++) {
    if(i>=u_birthCount) break;
    vec4 birth=u_births[i];
    float age=birth.z;
    vec2 center=(birth.xy-.5)*vec2(aspect,1.);
    vec2 local=(p-center)/.72;
    if(any(greaterThan(abs(local),vec2(.65)))) continue;
    float growth=smoothstep(0.,.85,age);
    float ending=smoothstep(1.65,${BIRTH_LIFETIME.toFixed(1)},age);
    float radius=253.*.89/1080.*growth*(1.-.12*ending);
    float width=117.*.89/1080.*growth*(1.-ending);
    // Born filled, then an opening develops as the ring grows. At the end
    // its walls narrow into nothing; opacity never reveals a hidden pattern.
    width+=.12*growth*(1.-smoothstep(.16,.65,age));
    if(width<.0001) continue;
    // The same turbulent ring and wave as the procedural source, with each
    // deposit's own clock. Subtract the center warp to anchor the birth point.
    vec2 offset=center*1.7;
    vec2 warped=liquidWarp(local+offset,age)-liquidWarp(offset,age);
    vec2 q=mix(local,warped,.82*growth);
    float ring=abs(length(q)-radius)-width;
    // Smoothly join neighboring births into a liquid surface.
    float join=.028;
    float h=max(join-abs(surface-ring),0.)/join;
    surface=min(surface,ring)-h*h*join*.25;
  }
  float alpha=1.-smoothstep(-.004,.009,surface);
  vec3 color=palette(length(p-vec2(.22,0.))*2.9+p.y*.30);
  return mix(u_background,color,alpha);
}

void main() {
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = (v_uv-.5)*vec2(aspect,1.);
  if(u_reveal>.5) { outColor=vec4(bornLiquid(p,aspect),1.); return; }
  vec4 influence=texture(u_pointerField,v_uv);
  if(u_repel>.5 && influence.r>0.) {
    vec2 displacement=(influence.gb*255.-128.)/127.*${FIELD_DISPLACEMENT};
    p-=displacement*u_repelStrength;
  }
  if(u_reveal+u_repel<.5) {
    vec2 pointer = (u_pointer-.5)*vec2(aspect,1.);
    vec2 delta = p-pointer;
    // The displacement modes use a persistent field instead of moving the
    // source or applying a distortion centered on the current pointer.
    p += delta * exp(-dot(delta,delta)*24.) * .16*u_interaction;
  }
  if(u_procedural < .5) {
    vec2 uv = p/vec2(16./9.,1.) + .5;
    uv.y = 1.-uv.y;
    if(any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.)))) {
      outColor=vec4(u_background,1.); return;
    }
    // Texture uploads use top-left image rows with UNPACK_FLIP_Y_WEBGL=false.
    vec3 rgb = texture(u_original,vec2(uv.x,clamp(uv.y*.5,.000232,.499768))).rgb;
    float a = texture(u_original,vec2(uv.x,clamp(.5+uv.y*.5,.500232,.999768))).r;
    outColor = vec4(clamp(rgb+u_background*(1.-a),0.,1.),1.);
    return;
  }
  vec4 liquid=referenceLiquid(p,u_time,.5);
  if(u_erase>.5) liquid.a*=1.-smoothstep(.08,.92,influence.r);
  outColor=vec4(mix(u_background,liquid.rgb,liquid.a),1.);
}`;

export const glassFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_glass;
uniform float u_size;
uniform float u_zoom;
uniform float u_blur;
uniform float u_strength;
uniform float u_aberration;
uniform float u_interaction;
uniform float u_light;

vec3 sampleScene(vec2 uv) {
  return texture(u_scene,clamp(uv,vec2(0.),vec2(1.))).rgb;
}
vec3 sampleGlassBlur(vec2 uv, vec2 d) {
  if(dot(d,d)<1e-12) return sampleScene(uv);
  vec3 color=sampleScene(uv)*4.;
  color+=(sampleScene(uv+vec2(d.x,0.))+sampleScene(uv-vec2(d.x,0.))+
          sampleScene(uv+vec2(0.,d.y))+sampleScene(uv-vec2(0.,d.y)))*2.;
  color+=sampleScene(uv+d)+sampleScene(uv-d)+sampleScene(uv+vec2(d.x,-d.y))+sampleScene(uv+vec2(-d.x,d.y));
  return color/16.;
}
void main() {
  vec3 original=sampleScene(v_uv);
  if(u_glass<.5) { outColor=vec4(original,1.); return; }
  // Reference-space pixels preserve the tile-to-art scale across resolutions.
  vec2 p=(v_uv-.5)*vec2(u_resolution.x/u_resolution.y,1.)*1080.;
  float cubeSize=u_size;
  vec2 tile=floor(p/cubeSize);
  vec2 center=(tile+.5)*cubeSize;
  vec2 local=(p-center)/cubeSize;
  float check=mod(tile.x+tile.y+200.,2.);
  // A study layout: two diagonal bands. The reference images below show the
  // actual compositions; this responsive layout is not claimed as an AE copy.
  float band=1.-step(u_size*2.15,abs(center.y+.55*center.x));
  float extent=1.-step(650.,abs(center.x));
  if(check<.5 || band*extent<.5) { outColor=vec4(original,1.); return; }
  vec2 referenceToUv=1./(1080.*vec2(u_resolution.x/u_resolution.y,1.));
  vec2 tileUv=center*referenceToUv+.5;
  float hover=exp(-dot(v_uv-u_pointer,v_uv-u_pointer)*30.)*u_interaction;
  float magnify=u_zoom;
  float strength=u_strength;

  // Measured from native Figma Glass exports (Refraction/Depth/Splay 100).
  // Box distance controls the falloff; the ray points toward the tile center.
  // Independent x/y bevels cannot reproduce Figma's curved corner lobes.
  vec2 edgeDistance=.5-abs(local);
  vec2 radial=local/max(length(local),.00001);
  float bevelDepth=min(100.,cubeSize*.5);
  float inset=min(edgeDistance.x,edgeDistance.y)*cubeSize;
  float curvature=pow(max(1.-inset/bevelDepth,0.),3.3);
  vec2 bend=-radial*curvature*(bevelDepth*1.045)*strength*referenceToUv;

  // Surface normal is used only for the directional rim lighting.
  float bevelWidth=bevelDepth/cubeSize;
  vec2 t=clamp(edgeDistance/bevelWidth,0.,1.);
  vec2 u=1.-t;
  vec2 height=pow(max(vec2(.0001),1.-u*u*u*u),vec2(.25));
  vec2 gradient=u*u*u/(height*height*height);
  vec2 slope=sign(local)*gradient*height.yx;
  vec3 normal=normalize(vec3(slope,1.));
  vec2 baseUv=tileUv+(v_uv-tileUv)/magnify;
  vec2 uv=baseUv+bend;
  // Figma's Frost 0 still softens fine detail. A small Gaussian footprint
  // smooths the source separately for each refracted wavelength, preserving
  // the RGB separation. Reference pixels keep it consistent on resize/DPR.
  // Keep the flat center crisp; stronger softening follows the curved rim.
  // Independent blur variances add; zero strength + zero frost stays exact.
  float opticalBlur=mix(.75,1.4,smoothstep(0.,.35,curvature))*clamp(strength,0.,1.);
  vec2 d=sqrt(u_blur*u_blur+opticalBlur*opticalBlur)*referenceToUv;
  vec3 color;
  if(u_aberration>0.) {
    // Dispersion follows the refracted ray, so flat glass cannot separate RGB.
    // Integrate a small wavelength band per channel instead of three razor-
    // thin copies. The band collapses with the bend toward the flat center.
    vec2 split=bend*.098*u_aberration;
    color=vec3(0.);
    for(int i=-2;i<=2;i++) {
      float weight=i==0 ? .375 : (abs(i)==1 ? .25 : .0625);
      vec2 spread=split*(float(i)*.30);
      color+=vec3(sampleGlassBlur(uv+split+spread,d).r,
                  sampleGlassBlur(uv+spread,d).g,
                  sampleGlassBlur(uv-split+spread,d).b)*weight;
    }
    // Match the fringe contrast of the Figma exports: spectral highlights
    // need more attenuation than dark fringes. Blend each channel toward
    // the unsplit refracted ray, rather than grading the source palette.
    // Constant colors and zero bend have zero delta and remain unchanged.
    vec3 neutral=sampleGlassBlur(uv,d);
    vec3 spectralDelta=color-neutral;
    color-=max(spectralDelta,vec3(0.))*.28;
  } else color=sampleGlassBlur(uv,d);

  // Reflection and inner shade reveal thickness even over a uniform backdrop.
  // Light follows the pointer gently, while the grid itself stays anchored.
  vec2 lightDirection=normalize(vec2(-.65,.76)+(u_pointer-.5)*hover*.8);
  vec2 edgeNormal=slope/max(length(slope),.0001);
  float facing=dot(edgeNormal,lightDirection);
  vec2 outerBevel=1.-smoothstep(vec2(0.),vec2(.10),edgeDistance);
  float edgeAmount=max(outerBevel.x,outerBevel.y);
  float fresnel=.04+.96*pow(1.-normal.z,5.);
  float shade=edgeAmount*(.045+.12*max(-facing,0.))*strength*u_light;
  color*=1.-shade;
  float reflection=((fresnel-.04)*.32+edgeAmount*.11*max(facing,0.))*strength*u_light;
  color=mix(color,vec3(.96,.98,1.),clamp(reflection,0.,.65));

  // A fine outer glint and a broader inner caustic, rather than a flat border.
  float edge=max(abs(local.x),abs(local.y));
  float antialias=1080./(u_resolution.y*cubeSize);
  float rim=1.-smoothstep(max(antialias,.006),max(antialias*2.,.017),.5-edge);
  float caustic=exp(-pow((.5-edge-.035)/.019,2.));
  float glint=(rim*(.08+.42*pow(max(facing,0.),3.))+
               caustic*.10*pow(max(-facing,0.),2.))*strength*u_light;
  color=mix(color,vec3(1.),clamp(glint,0.,.8));
  float coverage=1.-smoothstep(.5-antialias,.5,edge);
  outColor=vec4(mix(original,clamp(color,0.,1.),coverage),1.);
}`;

import { AREA_DISTANCE_RANGE } from '../shared/liquid-area.js';

// Shape, openings and color all come from one continuous scalar surface.
// Paint gestures only supply its guide; no colored liquid stamps are composited.
export const areaLiquidShader = helpers => helpers + `
uniform sampler2D u_areaDistance;
uniform sampler2D u_areaNextDistance;
uniform float u_keyframeMix;
uniform vec4 u_areaFrom;
uniform vec4 u_areaTo;
uniform float u_areaProgress;
uniform float u_structure;
float areaDistance(vec2 uv) {
  // Selections painted from a screen edge continue naturally beyond it.
  float distance=texture(u_areaDistance,uv).r;
  if(u_keyframeMix>0.) {
    vec4 frame=mix(u_areaFrom,u_areaTo,u_keyframeMix);
    vec2 local=(uv-frame.xy)/frame.zw;
    vec2 a=u_areaFrom.xy+local*u_areaFrom.zw;
    vec2 b=u_areaTo.xy+local*u_areaTo.zw;
    distance=mix(texture(u_areaDistance,a).r,texture(u_areaNextDistance,b).r,u_keyframeMix);
  }
  return (distance*2.-1.)*${AREA_DISTANCE_RANGE};
}
float smoothMinimum(float a,float b,float radius) {
  float h=clamp(.5+.5*(b-a)/radius,0.,1.);
  return mix(b,a,h)-radius*h*(1.-h);
}
vec2 areaEvolution(vec2 p,float time) {
  // Advance through new noise slices while keeping spatial coordinates fixed.
  // Spatially stagger their time phase so the whole field never pauses at once.
  float z=time*.19+dot(p,vec2(.83,1.47));
  float slice=floor(z), blend=fract(z);
  vec2 a=field(p*4.2+vec2(19.,37.)*slice);
  vec2 b=field(p*4.2+vec2(19.,37.)*(slice+1.));
  return mix(a,b,blend*blend*(3.-2.*blend));
}
vec2 areaWarp(vec2 p,float time) {
  // Sample the calibrated reference flow once for the entire surface. Its
  // physical scale stays fixed as the guide grows or gains more gestures.
  // The finite reference evolves forward into a continuing procedural field.
  // Never rewind its clock or reset it at the end of the recorded interval.
  float age=max(time,0.);
  float clock=4.36*(1.-exp(-age*age*.055));
  vec2 uv=p*vec2(1080./1920.,-1.)+.5;
  vec4 flow=texture(u_deformation,vec3(uv,(clock*10.+.5)/45.));
  vec2 q=p+flow.rg*vec2(1.,-1.)*flow.a*.45;
  q+=.11*(areaEvolution(p,age)-areaEvolution(p,0.))*(1.-exp(-age*age*.03));
  // The original source wave runs across x before turbulent deformation.
  float wave=2.*fract((q.x*1080.+960.+.1377)/444.)-1.;
  q.y-=(88.9598*(2.*sqrt(max(0.,1.-wave*wave))-1.)-.2167)/1080.;
  return q;
}
float liquidChannels(vec2 p) {
  // A shared network of unequal cells creates folds and bounded openings at a
  // fixed scale. Its ridges meet before shading, including deep inside a guide.
  vec2 cell=floor(p), local=fract(p);
  float surface=10.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 offset=vec2(float(x),float(y));
    vec2 id=cell+offset;
    vec2 center=.2+.6*vec2(hash(id),hash(id+vec2(17.,31.)));
    float radius=mix(.21,.38,hash(id+vec2(41.,9.)));
    float distance=length(offset+center-local)-radius;
    surface=smoothMinimum(surface,distance,.18);
  }
  return surface;
}
float liquidSurface(vec2 p,float aspect) {
  // Deform one shared domain through the original broad wave and turbulence.
  // All lengths are output-height units, independent of the brush diameter.
  vec2 q=areaWarp(p/1.15,u_time)*1.15;
  float guide=areaDistance(q*vec2(1./aspect,-1.)+.5);
  float fringe=.06*(noise(q*7.+vec2(7.,13.))-.5)
              +.02*(noise(q*12.+vec2(23.,5.))-.5);
  float contour=guide+.026+fringe;
  // Anchor the body before cutting channels into it. The guide must never
  // fill those channels back in, even when it covers the entire canvas.
  float coreDistance=areaDistance(p*vec2(1./aspect,-1.)+.5)-.07;
  float body=-smoothMinimum(-contour,-coreDistance,.035);
  // Narrow branches need smaller openings to keep their roots connected.
  // This bias vanishes in wide areas; it cannot create a solid interior floor.
  float narrow=1.-smoothstep(.025,.10,max(guide,coreDistance+.07));
  float opening=liquidChannels(q*4.7+vec2(18.,31.))*.18
                +mix(-.008,.018,u_structure)+narrow*.045;
  return smoothMinimum(body,opening,.018);
}
void main() {
  float aspect=u_resolution.x/u_resolution.y;
  vec2 p=(v_uv-.5)*vec2(aspect,1.);
  vec2 maskUv=vec2(v_uv.x,1.-v_uv.y);
  float guide=areaDistance(maskUv);
  float surface=mix(guide,liquidSurface(p,aspect),u_areaProgress);
  float edge=max(.0035,fwidth(surface)*.7);
  float alpha=smoothstep(-edge,edge,surface);
  // Color the fused surface once. Interior junctions never average palettes or
  // accumulate opacity; only an actual surface contour creates a color band.
  float depth=max(surface,0.);
  float interior=mix(.42,.99998,smoothstep(.008,.065,depth));
  float phase=mix(.99998,interior,smoothstep(0.,.012,depth));
  vec3 color=referencePalette(phase);
  color=mix(vec3(.38,.73,1.),color,u_areaProgress);
  outColor=vec4(color*alpha,alpha);
}`;

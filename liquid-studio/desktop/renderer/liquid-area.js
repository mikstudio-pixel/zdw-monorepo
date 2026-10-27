import { AREA_DISTANCE_RANGE } from '../shared/liquid-area.js';
import { liquidMaterial } from '../vendor/liquid-material.js';
import { appearanceSampling } from '../vendor/liquid-appearance.js';

// A shared learned material follows the user distance field. The procedural
// field supplies unobserved space and time; gestures do not add colored stamps.
export const areaLiquidShader = helpers => helpers + `
uniform sampler2D u_areaDistance;
uniform sampler2D u_areaNextDistance;
uniform float u_keyframeMix;
uniform vec4 u_areaFrom;
uniform vec4 u_areaTo;
uniform float u_areaProgress;
uniform float u_structure;
uniform sampler2D u_materialFlow;
uniform sampler2D u_materialFlowB;
uniform float u_materialMix;
uniform sampler2D u_appearance;
uniform sampler2D u_appearanceBody;
uniform float u_referenceMix;
uniform float u_referencePalette;
${appearanceSampling}
vec2 areaFlow(sampler2D field,vec2 p) {
  vec4 value=texture(field,p*vec2(9./16.,1.)+.5);
  return (vec2(value.r*256.+value.g,value.b*256.+value.a)*255.-32768.)/4096.;
}
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
${liquidMaterial}
float liquidSurface(vec2 p,vec2 q,float aspect,float opening) {
  // Preserve the area boundary policy: a deformed fringe and an anchored core
  // form one body. Paint, erasure, distance fields and keyframe alignment are
  // still supplied by the existing area system.
  float guide=areaDistance(q*vec2(1./aspect,-1.)+.5);
  float fringe=.06*(noise(q*7.+vec2(7.,13.))-.5)
              +.02*(noise(q*12.+vec2(23.,5.))-.5);
  float contour=guide+.026+fringe;
  float coreDistance=areaDistance(p*vec2(1./aspect,-1.)+.5)-.07;
  float body=-smoothMinimum(-contour,-coreDistance,.035);
  float narrow=1.-smoothstep(.025,.10,max(guide,coreDistance+.07));
  return smoothMinimum(body,opening+narrow*.045,.018);
}
float referenceGuide(vec2 p) {
  vec2 box=abs(p-vec2(0.,.06))-vec2(.41,.27);
  return .060-length(max(box,0.))-min(max(box.x,box.y),0.);
}
vec4 learnedMaterial(vec2 p,float guide,vec3 fallback,float opening) {
  vec2 uv=p*vec2(9./16.,1.)+.5;
  vec4 field=appearanceSample(u_appearance,uv);
  float body=clamp(texture(u_appearanceBody,vec2(uv.x,1.-uv.y)).r,.0001,.9999);
  float canonical=referenceGuide(p);
  float modelDistance=log(body/(1.-body))*.006;
  // Saturated coverage carries no depth information. Restore the guide's
  // interior/exterior depth there so a smaller brush cannot cut out the core.
  modelDistance=mix(modelDistance,max(modelDistance,canonical),smoothstep(.90,.99,body));
  modelDistance=mix(modelDistance,min(modelDistance,canonical),1.-smoothstep(.01,.10,body));
  float distance=modelDistance+guide-canonical;
  float coverage=1./(1.+exp(clamp(-distance/.006,-30.,30.)));
  coverage*=smoothstep(-.10,-.06,guide);
  vec4 intrinsic=clamp(field/max(body,.005),0.,1.);
  vec2 texel=1./vec2(textureSize(u_appearanceBody,0));
  vec2 bodyUv=vec2(uv.x,1.-uv.y);
  vec2 gradient=vec2(texture(u_appearanceBody,bodyUv+vec2(texel.x,0.)).r-texture(u_appearanceBody,bodyUv-vec2(texel.x,0.)).r,
                     texture(u_appearanceBody,bodyUv+vec2(0.,texel.y)).r-texture(u_appearanceBody,bodyUv-vec2(0.,texel.y)).r);
  gradient=vec2(gradient.x,-gradient.y);
  vec4 inward=appearanceSample(u_appearance,uv+gradient/max(length(gradient),.001)*.025);
  vec3 extended=mix(fallback,inward.rgb/max(inward.a,.02),smoothstep(.02,.1,inward.a));
  float known=smoothstep(.18,.75,body);
  float fallbackAlpha=smoothstep(-.004,.004,opening);
  intrinsic=mix(vec4(extended*fallbackAlpha,fallbackAlpha),intrinsic,known);
  float narrow=1.-smoothstep(.015,.060,max(guide,0.));
  float alpha=clamp(intrinsic.a+(u_structure-.5)*.5,0.,1.);
  alpha=mix(alpha,1.,narrow);
  vec3 color=mix(fallback,intrinsic.rgb/max(intrinsic.a,.02),smoothstep(.015,.09,intrinsic.a));
  // The default ribbon preserves the learned RGB exactly. User palettes still
  // replace its colors; a one-color palette remains exactly that one color.
  if(u_referencePalette<.5) {
    const vec3 reference[7]=vec3[7](vec3(233.,154.,230.),vec3(181.,176.,237.),vec3(162.,184.,246.),vec3(244.,212.,94.),vec3(248.,153.,84.),vec3(237.,59.,102.),vec3(32.,88.,63.));
    float best=1e6,phase=0.;
    for(int i=0;i<6;i++) {
      vec3 a=reference[i]/255.,d=(reference[i+1]-reference[i])/255.;
      float t=clamp(dot(color-a,d)/max(dot(d,d),.0001),0.,1.);
      float error=length(color-a-d*t);
      if(error<best){best=error;phase=(float(i)+t)/6.;}
    }
    color=materialPalette(phase);
  }
  return vec4(clamp(color,0.,1.)*alpha,alpha)*coverage;
}
void main() {
  float aspect=u_resolution.x/u_resolution.y;
  vec2 p=(v_uv-.5)*vec2(aspect,1.);
  vec2 maskUv=vec2(v_uv.x,1.-v_uv.y);
  float guide=areaDistance(maskUv);
  vec2 a=areaFlow(u_materialFlow,p),b=areaFlow(u_materialFlowB,p);
  vec2 displacement=mix(a,b,u_materialMix);
  vec2 drift=mix(areaFlow(u_materialFlow,vec2(0.)),areaFlow(u_materialFlowB,vec2(0.)),u_materialMix);
  // Transport the turbulent wave through the selection, while keeping the
  // selection's position anchored. The carrier's translation is not applied
  // to the user's mask or its broad regional gradient.
  vec2 q=materialDomain(p+.04*tanh((displacement-drift)/.08),0.);
  float opening=mix(materialOpenings(materialDomain(p+a,0.),u_structure),materialOpenings(materialDomain(p+b,0.),u_structure),u_materialMix);
  float surface=mix(guide,liquidSurface(p,q,aspect,opening),u_areaProgress);
  // Only raster antialiasing here. The premultiplied optical filter follows
  // this pass, softening both color and alpha with the measured edge profile.
  float edge=max(mix(.0035,.0006,u_areaProgress),fwidth(surface)*.7);
  float alpha=smoothstep(-edge,edge,surface);
  vec3 color=materialColor(q,opening);
  color=mix(vec3(.38,.73,1.),color,u_areaProgress);
  vec4 original=vec4(color*alpha,alpha);
  outColor=mix(original,learnedMaterial(p,guide,color,opening),u_referenceMix*u_areaProgress);
}`;

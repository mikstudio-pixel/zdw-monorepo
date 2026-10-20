import test from 'node:test';
import assert from 'node:assert/strict';
import { PointerField } from '../src/pointer-field.js';

const at = (field, x, y) => field.life[Math.floor(y*field.height)*field.width+Math.floor(x*field.width)];
function advance(field, seconds, fps = 60) {
  const frames = Math.round(seconds*fps);
  for (let i = 0; i < frames; i++) field.update(seconds/frames);
}

test('a new pointer position leaves the earlier displacement anchored in place', () => {
  const field = new PointerField(64);
  field.resize(1.6);
  field.move(.2,.5); field.update(1/60);
  field.move(.8,.5); field.update(1/60);
  assert.ok(at(field,.2,.5) > .9);
  assert.ok(at(field,.8,.5) > .9);
  assert.ok(at(field,.5,.5) > .9, 'fast movement draws a continuous path');
  assert.equal(at(field,.5,.1),0, 'untouched areas stay empty');
});

test('radius controls reach; duration controls how long displacement remains', () => {
  const small=new PointerField(64),large=new PointerField(64);
  for(const field of [small,large]) field.move(.5,.5);
  small.update(.01,{radius:.1,lifetime:.5});
  large.update(.01,{radius:.35,lifetime:6});
  assert.equal(at(small,.75,.5),0);
  assert.ok(at(large,.75,.5)>0);
  small.update(.6,{radius:.1,lifetime:.5});
  large.update(.6,{radius:.35,lifetime:6});
  assert.equal(small.active,false);
  assert.ok(large.active);
  assert.ok(large.pushX.some(v=>Math.abs(v)>0));
});

test('stationary events cannot renew a fading mark', () => {
  const field = new PointerField(64);
  field.move(.4,.6); field.update(1/60);
  for (let i = 0; i < 200; i++) {
    field.move(.4,.6); field.update(1/60);
  }
  assert.equal(field.active,false);
  assert.equal(at(field,.4,.6),0);
  assert.ok(field.pushX.every(v=>v===0));
  assert.ok(field.pushY.every(v=>v===0));
});

test('leaving and returning does not join two unrelated strokes', () => {
  const field = new PointerField(64);
  field.resize(1.6);
  field.move(.1,.5); field.endInput();
  field.move(.9,.5); field.update(1/60);
  assert.ok(at(field,.1,.5) > .9, 'the final pending input survives pointer leave');
  assert.ok(at(field,.9,.5) > .9);
  assert.equal(at(field,.5,.5),0);
});

test('a stroke pushes material to both sides and the displacement recovers', () => {
  const field = new PointerField(64);
  field.move(.5,.25); field.update(1/60);
  field.move(.5,.75); field.update(1/60);
  const index = x => Math.floor(.5*field.height)*field.width+Math.floor(x*field.width);
  assert.ok(field.pushX[index(.4)] < 0);
  assert.ok(field.pushX[index(.6)] > 0);
  const before = Math.abs(field.pushX[index(.4)]);
  advance(field,.5);
  assert.ok(Math.abs(field.pushX[index(.4)]) < before);
  advance(field,3);
  assert.equal(field.active,false);
});

test('pause freezes the field; reset removes marks and queued input', () => {
  const field = new PointerField(64);
  field.move(.5,.5); field.update(1/60);
  const frozen = field.data.slice();
  field.update(0);
  assert.deepEqual(field.data,frozen);
  field.move(.8,.8);
  field.clear(); advance(field,1);
  assert.equal(field.active,false);
  for (let i=0;i<field.data.length;i+=4) assert.deepEqual([...field.data.subarray(i,i+4)],[0,128,128,255]);
});

test('decay is consistent across frame rates and resizing clears stretched marks', () => {
  function run(fps) {
    const field = new PointerField(64);
    field.move(.5,.5); field.update(1/60);
    advance(field,1,fps);
    return field;
  }
  const slow=run(30),fast=run(120);
  assert.ok(Math.abs(at(slow,.5,.5)-at(fast,.5,.5)) < .00001);
  fast.resize(1.6);
  assert.equal(fast.active,false);
  assert.ok(fast.life.every(v=>v===0));
});

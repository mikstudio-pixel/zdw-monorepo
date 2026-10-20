import test from 'node:test';
import assert from 'node:assert/strict';
import { LiquidBirths, BIRTH_LIFETIME, MAX_BIRTHS } from '../src/liquid-births.js';

test('deposits start their own clocks without moving or restarting earlier liquid', () => {
  const births=new LiquidBirths();
  births.move(.2,.3); births.update(.01); births.update(.8);
  births.endInput(); births.move(.8,.7); births.update(.1);
  assert.equal(births.items.length,2);
  const [first,second]=births.items;
  assert.deepEqual([first.x,first.y],[.2,.3]);
  assert.ok(Math.abs(first.age-.9)<1e-10);
  assert.deepEqual(second,{x:.8,y:.7,age:0});
  births.endInput(); births.move(.2,.3); births.update(.1);
  assert.ok(Math.abs(first.age-1)<1e-10,'revisiting creates a new birth, not a reset');
  assert.equal(births.items.at(-1).age,0);
});

test('fast and slow pointer delivery deposit the same continuous path', () => {
  function stroke(events) {
    const births=new LiquidBirths(); births.resize(1.6);
    for(let i=0;i<=events;i++) births.move(.1+.8*i/events,.5);
    births.endInput(); births.update(.01);
    return births.items;
  }
  const fast=stroke(1),slow=stroke(200);
  assert.equal(fast.length,slow.length);
  assert.ok(fast.length>5);
  fast.forEach((item,i)=>assert.ok(Math.abs(item.x-slow[i].x)<1e-10));
});

test('stationary input cannot prolong births; a return does not bridge an empty area', () => {
  const births=new LiquidBirths();
  births.move(.1,.2); births.update(.01);
  for(let i=0;i<200;i++) { births.move(.1,.2); births.update(.02); }
  assert.equal(births.items.length,0);
  births.endInput(); births.move(.9,.8); births.endInput(); births.update(.01);
  assert.equal(births.items.length,1);
  assert.deepEqual(births.items[0],{x:.9,y:.8,age:0});
});

test('pause freezes local ages and pending births; reset and resize clear both', () => {
  const births=new LiquidBirths();
  births.move(.2,.3); births.update(.01); births.update(.4);
  const frozen=births.data.slice();
  births.move(.8,.7); births.update(0);
  assert.deepEqual(births.data,frozen);
  births.clear(); births.update(.01);
  assert.equal(births.items.length,0);
  births.move(.2,.3); births.update(.01); births.move(.8,.7);
  births.resize(1.6); births.update(.01);
  assert.equal(births.items.length,0);
});

test('local animation clocks have the same duration at different frame rates', () => {
  function age(fps) {
    const births=new LiquidBirths(); births.move(.4,.6); births.update(.01);
    for(let i=0;i<fps;i++) births.update(1/fps);
    return births;
  }
  const slow=age(30),fast=age(120);
  assert.ok(Math.abs(slow.items[0].age-fast.items[0].age)<1e-10);
  slow.update(BIRTH_LIFETIME); fast.update(BIRTH_LIFETIME);
  assert.equal(slow.items.length,0); assert.equal(fast.items.length,0);
});

test('dense input stays bounded without evicting animations before their end', () => {
  const births=new LiquidBirths();
  for(let i=0;i<MAX_BIRTHS;i++) { births.endInput(); births.move(.5,.5); }
  births.update(.01); births.update(.4);
  births.endInput(); births.move(.6,.6); births.update(.1);
  assert.equal(births.items.length,MAX_BIRTHS);
  assert.ok(births.items.every(item=>item.x===.5&&item.age===.5));
});

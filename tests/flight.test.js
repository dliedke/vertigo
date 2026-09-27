import assert from 'node:assert/strict';
import {Flight,MISSIONS,TARGET,terrainHeight,clamp,riverX} from '../dist/physics.js';
const dt=1/120;
const wrap=(r)=>Math.atan2(Math.sin(r),Math.cos(r));
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name);}
check('launch clears the platform with deterministic fixed-step physics',()=>{
  const f=new Flight();assert(f.jump());assert.equal(f.jump(),false);
  for(let i=0;i<600;i++)f.step(dt,{});
  assert.equal(f.phase,'flight');assert(f.agl>200);assert(f.position.z<1000);assert(f.speed>55);
});
check('ring scoring uses segment crossing and awards each ring once',()=>{
  const f=new Flight();f.jump();const r=f.rings[0];f.position={x:r.x,y:r.y,z:r.z+.2};f.velocity={x:0,y:0,z:-60};f.heading=0;f.step(dt,{});
  assert(r.passed);assert.equal(f.ringCount,1);assert(f.score>=800);
  const score=f.score;f.step(dt,{});assert.equal(f.score,score);
});
check('parachute decelerates and cannot be deployed twice',()=>{
  const f=new Flight();f.jump();for(let i=0;i<1100;i++)f.step(dt,{});const before=f.speed;assert(f.deploy());assert(!f.deploy());
  for(let i=0;i<480;i++)f.step(dt,{});assert.equal(f.phase,'canopy');assert.equal(f.chute,1);assert(f.speed<before*.6);assert(-f.velocity.y<9);
});
check('braked parachute landing on target is successful',()=>{
  const f=new Flight();f.jump();f.deploy();f.chute=1;f.position={x:TARGET.x,y:35,z:TARGET.z+9};f.velocity={x:0,y:-2.8,z:-8.5};f.heading=0;
  for(let i=0;i<300&&f.phase==='canopy';i++)f.step(dt,{flare:true});
  assert.equal(f.phase,'landed');assert(f.landingAccuracy>.8);assert(f.score>3000);
});
check('impact without a parachute and landing in the river fail',()=>{
  const f=new Flight();f.jump();f.position={x:TARGET.x,y:32.01,z:TARGET.z};f.velocity.y=-30;f.step(dt,{});assert.equal(f.phase,'crashed');
  f.reset();f.jump();f.deploy();f.chute=1;const z=-1800,x=riverX(z);f.position={x,y:terrainHeight(x,z)+2.01,z};f.velocity={x:0,y:-2.8,z:0};f.step(dt,{flare:true});assert.equal(f.phase,'crashed');assert.match(f.reason,/rio/);
});
check('paused or completed flights cannot advance without an active phase',()=>{
  const f=new Flight();const p={...f.position};f.step(dt,{steer:1,pitch:1});assert.deepEqual(f.position,p);assert.equal(f.elapsed,0);
  f.phase='landed';f.step(dt,{});assert.deepEqual(f.position,p);
});
check('all missions allow a pilot to reach all seven ring centers',()=>{
  for(const m of MISSIONS){
    const f=new Flight(m);f.jump();let steps=0;
    while(f.phase==='flight'&&f.ringCount<7&&steps++<18000){
      const r=f.rings.find(r=>!r.passed&&!r.missed);if(!r)break;
      const dx=r.x-f.position.x,dz=r.z-f.position.z,d=Math.hypot(dx,dz),desired=Math.atan2(dx,-dz),steer=clamp(wrap(desired-f.heading)*2,-1,1);
      const slope=(f.position.y-r.y)/Math.max(20,d),pitch=clamp((slope*64-23)/(18-slope*19),-1,1);
      f.step(dt,{steer,pitch});
    }
    console.log('ROUTE',m.id,JSON.stringify(f.snapshot()));assert.equal(f.phase,'flight');assert.equal(f.ringCount,7,m.id+' must have seven reachable rings');assert(f.agl>180);
  }
});
check('invalid frame duration cannot advance a flight by more than one bounded step',()=>{const f=new Flight();f.jump();f.step(1000,{});assert(f.elapsed<=.0334);});
check('complete assisted flights land within 40 m of the target in every mission',()=>{
  for(const m of MISSIONS){
    const f=new Flight(m);f.jump();let frames=0,deployRings=0;
    while(['flight','canopy'].includes(f.phase)&&frames++<30000){
      const r=f.phase==='flight'?f.rings.find(r=>!r.passed&&!r.missed):null;
      const target=r||{x:TARGET.x,y:32,z:TARGET.z};
      const dx=target.x-f.position.x,dz=target.z-f.position.z,distance=Math.hypot(dx,dz);
      let steer=clamp(wrap(Math.atan2(dx,-dz)-f.heading)*2,-1,1);
      if(f.phase==='canopy'&&f.agl<12)steer=0;
      const slope=(f.position.y-target.y)/Math.max(20,distance);
      const pitch=f.phase==='flight'?clamp((slope*64-23)/(18-slope*19),-1,1):clamp((7.4-22*slope)/(6*slope-1.4),-1,1);
      f.step(dt,{steer,pitch,flare:f.agl<18});
      if(f.phase==='flight'&&f.elapsed>4&&f.agl<170){deployRings=f.ringCount;f.deploy();}
    }
    assert.equal(f.phase,'landed',m.id);assert.equal(deployRings,7);assert(f.targetDistance<40,m.id);
    console.log('LANDING',m.id,Math.round(f.targetDistance)+' m from center,',clock(f.elapsed));
  }
});
function clock(t){return t.toFixed(1)+' s';}
console.log(`${checks} meaningful physics checks passed.`);

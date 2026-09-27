export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash(x, z) { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), u), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
export function riverX(z) { return Math.sin(z * .0015) * 150 + Math.sin(z * .0041) * 38; }
export const TARGET = { x: riverX(-2790) + 155, z: -2790 };
export function terrainHeight(x, z) {
  const dist = Math.abs(x - riverX(z));
  const f = noise(x * .0014, z * .0014) * .56 + noise(x * .0032, z * .0032) * .28 + noise(x * .008, z * .008) * .11 + noise(x * .026, z * .026) * .05;
  const valley = 16 + Math.pow(Math.max(0, dist - 90) / 1250, 1.26) * (810 + f * 930);
  const ridges = Math.pow(smoothstep(210, 1700, dist), .65) * (f - .35) * 650;
  const launch = smoothstep(630, 1180, z) * (1 - smoothstep(2400, 3700, z)) * Math.exp(-Math.pow((x + 690) / 590, 4)) * 750;
  let h = Math.max(8, valley + ridges + launch);
  h = lerp(h, 8, 1 - smoothstep(18, 42, dist));
  const landing = Math.hypot((x - TARGET.x) / 130, (z - TARGET.z) / 180);
  h = lerp(30, h, smoothstep(.55, 1, landing));
  return h;
}
export const MISSIONS = [
  { id: 'emilius', name: 'Monte Emilius', subtitle: 'O primeiro salto', label: 'EXPLORAÇÃO', wind: 1.1, ringRadius: 58, multiplier: 1, startX: -600, startZ: 1190, golden: false, difficulty: 'Acessível' },
  { id: 'ridge', name: 'Aresta do vento', subtitle: 'Encontre sua linha', label: 'PRECISÃO', wind: 3.5, ringRadius: 39, multiplier: 1.5, startX: -600, startZ: 1190, golden: false, difficulty: 'Intermediário' },
  { id: 'afterglow', name: 'Última luz', subtitle: 'Um salto ao pôr do sol', label: 'DESAFIO', wind: 5.2, ringRadius: 34, multiplier: 2, startX: -600, startZ: 1190, golden: true, difficulty: 'Avançado' }
];
export function makeRings(mission) {
  const offsets = mission.id === 'ridge' ? [0, -85, 90, -95, 75, -65, 50] : mission.id === 'afterglow' ? [0, 90, -105, 110, -80, 65, -30] : [0, 20, -20, 30, -10, 0, 0];
  return [
    [-500, 1350, 800], [-330, 1140, 280], [-130, 945, -230], [10, 760, -750],
    [50, 570, -1270], [105, 388, -1780], [150, 260, -2200]
  ].map((r, i) => ({x:r[0] + offsets[i], y:i === 6 ? terrainHeight(r[0] + offsets[i], r[2]) + 220 : r[1], z:r[2], radius:mission.ringRadius, passed:false, missed:false}));
}
export class Flight {
  constructor(mission = MISSIONS[0]) { this.reset(mission); }
  reset(mission = this.mission) {
    this.mission = mission;
    this.position = {x:mission.startX, y:terrainHeight(mission.startX, mission.startZ) + 5, z:mission.startZ};
    this.velocity = {x:0,y:0,z:0}; this.heading = .30; this.pitch = 0; this.bank = 0;
    this.phase = 'ready'; this.elapsed = 0; this.distance = 0; this.score = 0; this.proximity = 0;
    this.rings = makeRings(mission); this.ringCount = 0; this.chute = 0; this.deployAltitude = 0;
    this.flare = false; this.combo = 0; this.reason = ''; this.events = []; this.landingAccuracy = 0; this.closest = Infinity;
    this.previous = {...this.position}; return this;
  }
  get agl() { return Math.max(0, this.position.y - terrainHeight(this.position.x, this.position.z)); }
  get speed() { return Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z); }
  get targetDistance() { return Math.hypot(this.position.x - TARGET.x, this.position.z - TARGET.z); }
  jump() {
    if(this.phase !== 'ready') return false;
    this.phase = 'flight'; this.velocity = {x:Math.sin(this.heading)*35,y:5,z:-Math.cos(this.heading)*35};
    this.events.push({type:'jump'}); return true;
  }
  deploy() {
    if(this.phase !== 'flight') return false;
    this.phase = 'canopy'; this.deployAltitude = this.agl; this.chute = .001;
    this.events.push({type:'deploy'}); return true;
  }
  step(dt, input = {}) {
    if(!['flight','canopy'].includes(this.phase)) return;
    dt = clamp(dt, 0, .0334);
    this.previous = {...this.position}; this.elapsed += dt;
    const steer = clamp(input.steer || 0, -1, 1), pitch = clamp(input.pitch || 0, -1, 1);
    this.pitch = lerp(this.pitch, pitch, 1 - Math.exp(-dt * 4));
    this.bank = lerp(this.bank, steer, 1 - Math.exp(-dt * 5));
    let horizontal, sink, response;
    if(this.phase === 'flight') {
      this.heading += steer * .58 * dt;
      horizontal = 64 + this.pitch * 19 + (input.boost ? 15 : 0);
      sink = 23 + this.pitch * 18 + (input.boost ? 17 : 0);
      response = .85;
    } else {
      this.chute = Math.min(1, this.chute + dt / 1.65);
      this.heading += steer * .94 * dt * this.chute;
      this.flare = !!input.flare;
      horizontal = this.flare ? 8.5 : 22 + this.pitch * 6;
      sink = this.flare ? 2.8 : 7.4 + this.pitch * 1.4;
      sink += Math.abs(steer) * 2.2;
      response = this.chute < .55 ? 1.1 : 2.4;
    }
    const wind = this.mission.wind * (Math.sin(this.elapsed * .31) * .6 + .4);
    const t = 1 - Math.exp(-dt * response);
    this.velocity.x = lerp(this.velocity.x, Math.sin(this.heading) * horizontal + wind, t);
    this.velocity.z = lerp(this.velocity.z, -Math.cos(this.heading) * horizontal, t);
    this.velocity.y = lerp(this.velocity.y, -sink, t);
    this.position.x += this.velocity.x * dt; this.position.y += this.velocity.y * dt; this.position.z += this.velocity.z * dt;
    this.distance += Math.hypot(this.velocity.x,this.velocity.z) * dt;
    const ground = terrainHeight(this.position.x,this.position.z);
    const clearance = this.position.y - ground;
    this.closest = Math.min(this.closest, clearance);
    if(this.phase === 'flight' && this.elapsed > 2 && clearance < 90 && clearance > 5) {
      const points = dt * (90 - clearance) * .6 * this.mission.multiplier;
      this.score += points; this.proximity += points;
    }
    for(const ring of this.rings) {
      if(ring.passed || ring.missed) continue;
      if(this.previous.z >= ring.z && this.position.z < ring.z) {
        const u = (this.previous.z - ring.z)/(this.previous.z - this.position.z);
        const dx = lerp(this.previous.x,this.position.x,u)-ring.x, dy = lerp(this.previous.y,this.position.y,u)-ring.y;
        const d = Math.hypot(dx,dy);
        if(d < ring.radius) {
          ring.passed = true; this.ringCount++; this.combo++;
          const perfect = d < ring.radius * .38;
          const points = (perfect ? 800 : 500) * this.mission.multiplier + Math.min(this.combo,5)*100;
          this.score += points; this.events.push({type:'ring',perfect,points,combo:this.combo});
        } else { ring.missed = true; this.combo = 0; this.events.push({type:'miss'}); }
      }
    }
    if(clearance <= 2) {
      this.position.y = ground + 2;
      const impact = -this.velocity.y;
      const safe = this.phase === 'canopy' && this.chute > .9 && impact < 9.3 && Math.abs(this.bank) < .75;
      const inWater = Math.abs(this.position.x-riverX(this.position.z)) < 25;
      if(safe && !inWater) {
        this.phase = 'landed'; this.reason = this.targetDistance < 75 ? 'Na mosca.' : 'Pouso seguro.';
        this.landingAccuracy = Math.max(0,1-this.targetDistance/100);
        this.score += 1000 + Math.round(this.landingAccuracy * 2500) + (this.flare ? 350 : 0);
        this.events.push({type:'landed',accuracy:this.landingAccuracy,impact});
      } else {
        this.reason = inWater ? 'Você caiu no rio.' : this.phase === 'canopy' && this.chute > .9 ? 'Pouso muito forte.' : 'O terreno chegou primeiro.';
        this.phase = 'crashed';
        this.events.push({type:'crashed',impact});
      }
      this.velocity = {x:0,y:0,z:0};
    }
    if(Math.abs(this.position.x)>4700 || this.position.z < -7000 || this.position.z > 4300 || this.elapsed>300) {
      this.phase='crashed'; this.reason='Você saiu da área de voo.'; this.velocity={x:0,y:0,z:0}; this.events.push({type:'crashed'});
    }
  }
  drainEvents() { const out = this.events; this.events = []; return out; }
  snapshot() { return {phase:this.phase,position:{...this.position},speed:Math.round(this.speed*3.6),altitude:Math.round(this.agl),rings:this.ringCount,totalRings:this.rings.length,score:Math.round(this.score),elapsed:this.elapsed,targetDistance:Math.round(this.targetDistance)}; }
}

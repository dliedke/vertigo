import { Flight, MISSIONS, TARGET, terrainHeight, riverX, clamp } from './physics.js';
import { AlpineWorld } from './world.js';

const $ = (id) => document.getElementById(id);
const format = (value) => Math.round(value).toLocaleString('pt-BR');
const clockFormat = (time) => `${String(Math.floor(time / 60)).padStart(2,'0')}:${String(Math.floor(time % 60)).padStart(2,'0')}`;
const storage = {get(key,fallback){try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v);}catch{return fallback;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The game also works with storage disabled. */}}};
let world,flight=new Flight(),mode='menu',paused=false,missionIndex=0,frameTime=0,accumulator=0,hudTime=0,countdown=0,resultDelay=0,toastTime=0;
let soundEnabled=storage.get('vertigo.sound',true),sensitivity=storage.get('vertigo.sensitivity',1),assist=storage.get('vertigo.assist',true),quality=storage.get('vertigo.quality','medium');
let best=storage.get('vertigo.best',{}),keys=new Set(),joystick={x:0,y:0,active:false},touchFlare=false,cameraMode=0;
const touchDevice=matchMedia('(pointer:coarse)').matches;
const mini=$('minimap').getContext('2d');
const dialogs=[...document.querySelectorAll('dialog')];

class WindAudio {
  constructor(){this.ctx=null;this.wind=null;this.master=null;}
  async start(){
    if(!soundEnabled)return;
    try{
      if(!this.ctx){
        const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
        this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=.7;this.master.connect(this.ctx.destination);
        const b=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate),d=b.getChannelData(0);let last=0;
        for(let i=0;i<d.length;i++){last=(last+Math.random()*.035-.0175)*.989;d[i]=last*4;}
        this.source=this.ctx.createBufferSource();this.source.buffer=b;this.source.loop=true;
        this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=500;
        this.wind=this.ctx.createGain();this.wind.gain.value=0;this.source.connect(this.filter);this.filter.connect(this.wind);this.wind.connect(this.master);this.source.start();
      }
      if(this.ctx.state==='suspended')await this.ctx.resume();
    }catch{/* Audio is optional when the browser denies it. */}
  }
  update(){
    if(!this.ctx)return;
    const active=soundEnabled&&!paused&&mode==='playing';
    const volume=active?(flight.phase==='canopy'?.09:.12+flight.speed*.004):mode==='menu'&&soundEnabled?.018:0;
    this.wind.gain.setTargetAtTime(volume,this.ctx.currentTime,.25);
    this.filter.frequency.setTargetAtTime(300+flight.speed*16,this.ctx.currentTime,.2);
  }
  tone(freq=660,duration=.12,volume=.08,type='sine',endFreq=null){
    if(!this.ctx||!soundEnabled)return;
    const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,t+duration);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.014);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);
  }
  ring(){this.tone(740,.18,.08);setTimeout(()=>this.tone(1110,.3,.07),90);}
  chute(){this.tone(130,.65,.12,'triangle',42);}
}
const audio=new WindAudio();
function setSound(value){soundEnabled=value;storage.set('vertigo.sound',value);$('sound-toggle').checked=value;$('sound-button').setAttribute('aria-label',value?'Desativar som':'Ativar som');$('sound-waves').setAttribute('d',value?'M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 5 6m0-6-5 6');if(value)audio.start();}
function toast(title,subtitle=''){const el=$('toast');el.replaceChildren(document.createTextNode(title));if(subtitle){const sm=document.createElement('small');sm.textContent=subtitle;el.append(sm);}el.classList.add('show');toastTime=3;}
function flash(kind){const el=$('flash');el.className=kind;setTimeout(()=>el.className='',kind==='hit'?650:160);}
function closeDialogs(){dialogs.forEach(d=>{if(d.open)d.close();});}
function activeGame(){return mode==='playing'||mode==='countdown';}
function openDialog(id){if(activeGame()){paused=true;keys.clear();}$(id).showModal();audio.update();}
function refreshMenu(){
  const m=MISSIONS[missionIndex];$('mission-name').textContent=m.name;$('mission-difficulty').textContent=m.label;
  $('mission-altitude').innerHTML=`${format(flight.position.y-30)}<small> m</small>`;
  document.querySelector('.route-count').textContent=`0${missionIndex+1} / 03`;
  document.querySelectorAll('.route-tab').forEach((button,i)=>{button.classList.toggle('selected',i===missionIndex);button.setAttribute('aria-pressed',String(i===missionIndex));});
  $('weather-label').textContent=m.golden?'Última luz':'Céu aberto';$('wind-label').textContent=`${Math.round(m.wind*3.6)} km/h NO`;
  $('best-score').textContent=best[m.id]?format(best[m.id]):'—';
}
function selectMission(index){
  if(mode!=='menu'||!Number.isInteger(index)||!MISSIONS[index])return false;
  missionIndex=index;flight.reset(MISSIONS[index]);world.setMission(flight);refreshMenu();audio.tone(500+index*80,.08,.04);return true;
}
function resetRound(){
  flight.reset(MISSIONS[missionIndex]);world.setMission(flight);keys.clear();joystick.x=joystick.y=0;touchFlare=false;accumulator=0;resultDelay=0;toastTime=0;
  $('toast').classList.remove('show');$('game').classList.remove('canopy');$('deploy-button').disabled=false;$('deploy-label').textContent='ABRIR PARAQUEDAS';
  $('ring-progress').replaceChildren(...flight.rings.map(()=>document.createElement('i')));
  $('phase-label').textContent='WINGSUIT / QUEDA LIVRE';$('hud-mission').textContent=flight.mission.name;
  $('warning').className='flight-warning';$('warning').textContent='';$('flash').className='';
  $('deploy-button').querySelector('kbd').textContent='ESPAÇO';
  $('flight-tip').textContent=touchDevice?'Controle à esquerda para pilotar · Toque para abrir':'W/S inclinação · A/D direção · Shift mergulho';
}
function start(){
  if(!world)return;closeDialogs();resetRound();mode='countdown';paused=false;countdown=3.1;
  $('menu').hidden=true;$('hud').hidden=false;$('pause-button').hidden=false;$('mobile-camera').hidden=!touchDevice;$('game').classList.add('playing');$('countdown').hidden=false;$('countdown-value').textContent='3';$('touch-controls').hidden=!touchDevice;
  world.firstCamera=true;audio.start();audio.tone(420,.13,.06);updateHud();
}
function mainMenu(){
  mode='menu';paused=false;closeDialogs();keys.clear();resetRound();$('menu').hidden=false;$('hud').hidden=true;$('countdown').hidden=true;$('touch-controls').hidden=true;$('pause-button').hidden=true;$('mobile-camera').hidden=true;$('game').classList.remove('playing','canopy');world.firstCamera=true;refreshMenu();audio.update();
}
function deploy(){
  if(mode!=='playing'||paused)return;
  if(flight.deploy()){
    $('game').classList.add('canopy');$('deploy-label').textContent='SEGURE PARA FREAR';$('phase-label').textContent='PARAQUEDAS / APROXIMAÇÃO';
    $('flight-tip').textContent=touchDevice?'Faça curvas para alinhar o pouso · Segure FREAR para reduzir':'A/D direção · Faça curvas para alinhar · Segure espaço para frear';
    audio.chute();toast('PARAQUEDAS ABERTO','ALINHE COM O ALVO AO LADO DO RIO');
  }
}
function toggleCamera(){cameraMode=1-cameraMode;world.cameraMode=cameraMode;world.firstCamera=true;$('camera-label').textContent=cameraMode?'1ª PESSOA':'3ª PESSOA';}
function pauseGame(){if(!activeGame())return;if($('pause-dialog').open){$('pause-dialog').close();paused=false;}else if(!dialogs.some(d=>d.open))openDialog('pause-dialog');}
function finish(){
  mode='result';paused=false;keys.clear();$('touch-controls').hidden=true;$('pause-button').hidden=true;$('marker').hidden=true;
  const landed=flight.phase==='landed',score=Math.round(flight.score),newRecord=score>(best[flight.mission.id]||0);
  if(newRecord){best[flight.mission.id]=score;storage.set('vertigo.best',best);}
  $('result-eyebrow').textContent=landed?'SALTO CONCLUÍDO':'O VALE VENCEU ESTA';
  $('result-title').textContent=flight.reason;
  $('result-copy').textContent=landed?(flight.landingAccuracy>.75?'Linha fechada. Um pouso para guardar.':`Você pousou a ${format(flight.targetDistance)} m do centro. Use curvas para alinhar a aproximação.`):'Tente outra linha. Abra o paraquedas antes dos 170 m e freie na aproximação do solo.';
  $('result-grade').textContent=landed?(flight.ringCount>=6&&flight.landingAccuracy>.7?'S':flight.ringCount>=4?'A':'B'):'↺';
  $('result-score').textContent=format(score);$('new-record').hidden=!newRecord;$('result-rings').textContent=`${flight.ringCount} / 7`;$('result-time').textContent=clockFormat(flight.elapsed);$('result-distance').textContent=(flight.distance/1000).toFixed(2).replace('.',',')+' km';
  resultDelay=.8;
}
function handleEvents(){
  for(const ev of flight.drainEvents()){
    if(ev.type==='ring'){audio.ring();toast(ev.perfect?'LINHA PERFEITA':'ARCO CONQUISTADO',`${format(ev.points)} PONTOS${ev.combo>1?' · SEQUÊNCIA ×'+ev.combo:''}`);flash('ring');}
    if(ev.type==='miss')toast('BUSQUE O PRÓXIMO','CONTINUE A LINHA ATÉ O POUSO');
    if(ev.type==='landed'){audio.tone(523,.25,.07);setTimeout(()=>audio.tone(784,.4,.06),160);finish();}
    if(ev.type==='crashed'){flash('hit');audio.tone(65,.5,.16,'triangle',24);finish();}
  }
}
function readInput(){
  return {steer:clamp(((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x)*sensitivity,-1,1),pitch:clamp((keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joystick.y,-1,1),boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),flare:keys.has('Space')||touchFlare};
}
function updateHud(){
  const f=flight,alt=f.agl; $('altitude-value').textContent=format(alt);$('speed-value').textContent=format(f.speed*3.6);$('sink-value').textContent=`${Math.round(-f.velocity.y)} m/s`;$('time-value').textContent=clockFormat(f.elapsed);$('score-value').textContent=String(Math.round(f.score)).padStart(5,'0');
  $('altitude-bar').style.width=`${clamp(alt/1450,0,1)*100}%`;$('heading-value').textContent=`${String(Math.round((f.heading*180/Math.PI+360)%360)).padStart(3,'0')}°`;
  const bearing=((f.heading*180/Math.PI+360)%360),directions=['N','NE','L','SE','S','SO','O','NO'];let direction=Math.round(bearing/45)%8;$('compass-labels').textContent=`${directions[(direction+7)%8]}　·　${directions[direction]}　·　${directions[(direction+1)%8]}`;
  [...$('ring-progress').children].forEach((el,i)=>{el.className=f.rings[i].passed?'passed':f.rings[i].missed?'missed':'';});$('ring-label').textContent=`${f.ringCount} / 7 ARCOS`;$('target-distance').textContent=`POUSO A ${f.targetDistance>1000?(f.targetDistance/1000).toFixed(1).replace('.',',')+' km':format(f.targetDistance)+' m'}`;
  const warn=$('warning');warn.classList.remove('danger');
  if(f.phase==='flight'&&f.elapsed>4){
    if(alt<220){warn.textContent='BAIXA ALTITUDE · ABRA O PARAQUEDAS';warn.classList.add('danger');}
    else if(alt<360&&f.position.z<-1750)warn.textContent='PREPARE O PARAQUEDAS';
    else if(alt<90)warn.textContent='VOO DE PROXIMIDADE';
    else warn.textContent='';
  }else if(f.phase==='canopy'){
    if(alt<24){warn.textContent=touchDevice?'NIVELE E SEGURE FREAR':'NIVELE E SEGURE ESPAÇO PARA FREAR';warn.classList.add('danger');}
    else if(f.targetDistance<85)warn.textContent='ALVO ABAIXO · REDUZA A VELOCIDADE';
    else warn.textContent='ALINHE A APROXIMAÇÃO COM O ALVO';
  }else warn.textContent='';
  $('speed-lines').style.opacity=clamp((f.speed-50)/55,0,.65);drawMap();
}
function drawMap(){
  if(!mini)return;const w=220,h=180;mini.clearRect(0,0,w,h);
  const px=(x)=>110+x*.072,pz=(z)=>15+(1250-z)*.035;
  mini.strokeStyle='#b6d3c021';mini.lineWidth=1;for(let x=20;x<220;x+=40){mini.beginPath();mini.moveTo(x,0);mini.lineTo(x,h);mini.stroke();}for(let y=20;y<180;y+=35){mini.beginPath();mini.moveTo(0,y);mini.lineTo(w,y);mini.stroke();}
  mini.strokeStyle='#71b6b27a';mini.lineWidth=4;mini.beginPath();for(let z=1300;z>-3200;z-=50)mini.lineTo(px(riverX(z)),pz(z));mini.stroke();
  mini.strokeStyle='#e6efb04a';mini.setLineDash([3,4]);mini.lineWidth=1;mini.beginPath();mini.moveTo(px(-600),pz(1190));flight.rings.forEach(r=>mini.lineTo(px(r.x),pz(r.z)));mini.lineTo(px(TARGET.x),pz(TARGET.z));mini.stroke();mini.setLineDash([]);
  for(const r of flight.rings){mini.strokeStyle=r.passed?'#def77c':r.missed?'#b77358':'#dce5d39a';mini.fillStyle=r.passed?'#def77c':'#163638';mini.beginPath();mini.arc(px(r.x),pz(r.z),2.8,0,Math.PI*2);mini.fill();mini.stroke();}
  mini.strokeStyle='#def77c';mini.lineWidth=1.3;mini.beginPath();mini.arc(px(TARGET.x),pz(TARGET.z),5,0,Math.PI*2);mini.stroke();
  const x=clamp(px(flight.position.x),8,212),y=clamp(pz(flight.position.z),8,172);mini.save();mini.translate(x,y);mini.rotate(flight.heading);mini.fillStyle='#f4fbe9';mini.beginPath();mini.moveTo(0,-6);mini.lineTo(-4,4);mini.lineTo(0,2);mini.lineTo(4,4);mini.closePath();mini.fill();mini.restore();
}
function updateMarker(){
  if(mode!=='playing'){$('marker').hidden=true;return;}
  const r=flight.phase==='canopy'?null:flight.rings.find(r=>!r.passed&&!r.missed);
  const destination=r||{x:TARGET.x,y:38,z:TARGET.z},p=world.project(destination),el=$('marker');
  el.hidden=!p.visible;if(p.visible){el.style.left=`${clamp(p.x,55,innerWidth-55)}px`;el.style.top=`${clamp(p.y-55,140,innerHeight-120)}px`;}
  $('marker-label').textContent=r?'PRÓXIMO ARCO':'ZONA DE POUSO';$('marker-distance').textContent=`${format(Math.hypot(destination.x-flight.position.x,destination.y-flight.position.y,destination.z-flight.position.z))} m`;
}
function frame(ms){
  requestAnimationFrame(frame);const dt=Math.min(.065,(ms-frameTime)/1000||.016);frameTime=ms;
  if(!paused){
    if(mode==='countdown'){
      const old=Math.ceil(countdown);countdown-=dt;const current=Math.ceil(countdown);
      if(current!==old && current>0){$('countdown-value').textContent=String(current);audio.tone(420+Math.max(0,3-current)*120,.12,.07);}
      if(countdown<=0){mode='playing';flight.jump();$('countdown').hidden=true;toast('SOLTE O MUNDO','SIGA OS ARCOS ATÉ O VALE');audio.tone(900,.2,.07);}
    }
    if(mode==='playing'){
      accumulator+=dt;const input=readInput();let steps=0;
      while(accumulator>=1/120 && steps<8 && mode==='playing'){
        flight.step(1/120,input);accumulator-=1/120;steps++;
        if(assist&&flight.phase==='flight'&&flight.elapsed>4&&flight.agl<170)deploy();
        handleEvents();
      }
    }
    if(mode==='result'&&resultDelay>0){resultDelay-=dt;if(resultDelay<=0)$('result-dialog').showModal();}
    if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').classList.remove('show');}
  }
  world.update(dt,flight,mode,paused);updateMarker();hudTime+=dt;
  if(hudTime>.09){if(mode!=='menu')updateHud();audio.update();hudTime=0;}
}

$('start-button').addEventListener('click',start);$('retry-button').addEventListener('click',start);$('restart-button').addEventListener('click',start);
$('result-menu-button').addEventListener('click',mainMenu);$('quit-button').addEventListener('click',mainMenu);
$('home').addEventListener('click',e=>{e.preventDefault();if(activeGame())pauseGame();else mainMenu();});
$('settings-button').addEventListener('click',()=>openDialog('settings-dialog'));$('help-button').addEventListener('click',()=>openDialog('help-dialog'));
$('pause-button').addEventListener('click',pauseGame);$('resume-button').addEventListener('click',()=>{$('pause-dialog').close();paused=false;});
$('camera-button').addEventListener('click',toggleCamera);$('mobile-camera').addEventListener('click',toggleCamera);
$('sound-button').addEventListener('click',()=>setSound(!soundEnabled));$('sound-toggle').addEventListener('change',e=>setSound(e.target.checked));
$('quality-select').value=quality;$('quality-select').addEventListener('change',e=>{quality=e.target.value;world.setQuality(quality);storage.set('vertigo.quality',quality);});
$('sensitivity').value=sensitivity;$('sensitivity').addEventListener('input',e=>{sensitivity=Number(e.target.value);storage.set('vertigo.sensitivity',sensitivity);});
$('assist-toggle').checked=assist;$('assist-toggle').addEventListener('change',e=>{assist=e.target.checked;storage.set('vertigo.assist',assist);});
for(const button of document.querySelectorAll('.route-tab'))button.addEventListener('click',()=>selectMission(Number(button.dataset.mission)));
for(const d of dialogs)d.addEventListener('close',()=>{if(!dialogs.some(x=>x.open)&&activeGame())paused=false;keys.clear();touchFlare=false;});
$('result-dialog').addEventListener('cancel',e=>e.preventDefault());
$('deploy-button').addEventListener('pointerdown',e=>{if(flight.phase==='flight'){deploy();}else{touchFlare=true;}e.currentTarget.setPointerCapture(e.pointerId);});
$('deploy-button').addEventListener('pointerup',()=>touchFlare=false);$('deploy-button').addEventListener('pointercancel',()=>touchFlare=false);
$('deploy-button').addEventListener('click',e=>{if(e.detail===0)deploy();});
$('touch-flare').addEventListener('pointerdown',e=>{touchFlare=true;e.currentTarget.setPointerCapture(e.pointerId);});
for(const event of ['pointerup','pointercancel'])$('touch-flare').addEventListener(event,()=>touchFlare=false);
const stick=$('joystick'),knob=$('joystick-knob');
function moveStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,limit=r.width*.35,length=Math.hypot(dx,dy),scale=length>limit?limit/length:1;joystick.x=dx*scale/limit;joystick.y=dy*scale/limit;knob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;}
stick.addEventListener('pointerdown',e=>{e.preventDefault();joystick.active=true;stick.setPointerCapture(e.pointerId);moveStick(e);});
stick.addEventListener('pointermove',e=>{if(joystick.active)moveStick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,()=>{joystick.active=false;joystick.x=joystick.y=0;knob.style.transform='';});
const gameCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','KeyC','KeyP','KeyR','KeyM','Escape'];
window.addEventListener('keydown',e=>{
  if(!gameCodes.includes(e.code))return;
  const inputElement=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);
  if(dialogs.some(d=>d.open)||inputElement){if(e.code==='Escape'&&$('pause-dialog').open){e.preventDefault();$('pause-dialog').close();paused=false;}return;}
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat){keys.add(e.code);return;}
  if(e.code==='KeyM'){setSound(!soundEnabled);return;}
  if(e.code==='Escape'||e.code==='KeyP'){pauseGame();return;}
  if(e.code==='KeyC'&&mode!=='menu'){toggleCamera();return;}
  if(e.code==='KeyR'&&activeGame()){start();return;}
  if(e.code==='Space'&&mode==='menu'){start();return;}
  if(e.code==='Space'&&flight.phase==='flight')deploy();keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
function blur(){keys.clear();joystick.x=joystick.y=0;touchFlare=false;if(activeGame()&&!dialogs.some(d=>d.open))pauseGame();}
window.addEventListener('blur',blur);document.addEventListener('visibilitychange',()=>{if(document.hidden)blur();});

function registerTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const life=new AbortController();window.addEventListener('pagehide',()=>life.abort(),{once:true});
  const tools=[
    {name:'read_flight_status',title:'Ler estado do voo',description:'Lê a rota, a fase, a altitude, a velocidade e a pontuação do jogo VERTIGO.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error('Não são aceitos parâmetros.');return{mode,paused,mission:flight.mission.id,...flight.snapshot()};}},
    {name:'start_base_jump',title:'Iniciar salto',description:'Escolhe uma das três rotas e inicia a contagem para um novo salto. Reinicia o voo atual.',inputSchema:{type:'object',properties:{mission:{type:'string',enum:MISSIONS.map(m=>m.id)}},required:['mission'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='mission'))throw new Error('Informe apenas mission.');const i=MISSIONS.findIndex(m=>m.id===input.mission);if(i<0)throw new Error('Rota desconhecida.');mainMenu();selectMission(i);start();return{mode,mission:flight.mission.id,countdown:3};}},
    {name:'deploy_parachute',title:'Abrir paraquedas',description:'Abre o paraquedas do salto em andamento. Disponível apenas durante o voo de wingsuit sem pausa.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error('Não são aceitos parâmetros.');if(mode!=='playing'||paused||flight.phase!=='flight')throw new Error('O wingsuit precisa estar em voo.');deploy();return flight.snapshot();}}
  ];
  for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{/* Progressive enhancement. */}}
}
async function init(){
  try{
    world=new AlpineWorld($('world'));world.setMission(flight);world.setQuality(quality);setSound(soundEnabled);refreshMenu();resetRound();registerTools();
    // Compile before revealing the valley so the first jump has no shader stall.
    await world.renderer.compileAsync(world.scene,world.camera);
    $('loading').hidden=true;frameTime=performance.now();requestAnimationFrame(frame);
  }catch(error){console.error('VERTIGO initialization failed',error);$('loading').hidden=true;$('error').hidden=false;$('error-text').textContent='Não foi possível iniciar o cenário 3D. Use um navegador com WebGL 2 e aceleração gráfica ativada.';}
}
init();

import * as THREE from './vendor/three.module.js';
import { terrainHeight, riverX, TARGET, clamp, lerp, noise } from './physics.js';

let seed = 42;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mat = (color, roughness = .86, extra = {}) => new THREE.MeshStandardMaterial({color,roughness,...extra});
const V = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
function mesh(geometry, material, position = [0,0,0], parent) {
  const m = new THREE.Mesh(geometry,material); m.position.set(...position); if(parent)parent.add(m); return m;
}
function cylinderBetween(a,b,r,material,parent) {
  const d=new THREE.Vector3().subVectors(b,a),m=mesh(new THREE.CylinderGeometry(r,r,d.length(),6),material,[...a.clone().add(b).multiplyScalar(.5)],parent);
  m.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());return m;
}
export class AlpineWorld {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.15;
    this.renderer.shadowMap.enabled=true; this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#a7c9d4');
    this.scene.fog=new THREE.FogExp2('#a7c9d4',.00019);
    this.camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.2,22000);
    this.sun=new THREE.DirectionalLight('#fff0ce',3.15);this.sun.position.set(-2600,4200,-3000);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-180;this.sun.shadow.camera.right=180;this.sun.shadow.camera.top=180;this.sun.shadow.camera.bottom=-180;this.sun.shadow.camera.near=1;this.sun.shadow.camera.far=1200;this.sun.shadow.bias=-.00035;this.sun.shadow.normalBias=1.5;
    this.scene.add(this.sun,this.sun.target);
    this.hemi=new THREE.HemisphereLight('#d3edf7','#314b34',2.4);this.scene.add(this.hemi);
    this.fill=new THREE.AmbientLight('#a7cfd1',.18);this.scene.add(this.fill);
    this.clock=0;this.menuTime=0;this.firstCamera=true;this.cameraMode=0;this.quality='medium';
    this.temp=V();this.lookTarget=V();this.golden=false;
    this.buildSky(); this.buildTerrain(); this.buildWater(); this.buildForest(); this.buildDetails(); this.buildPlayer();this.buildClouds();this.buildBirds();this.buildWind();
    this.ringGroup=new THREE.Group();this.scene.add(this.ringGroup);this.ringVisuals=[];
    this.player.visible=false;
    window.addEventListener('resize',()=>this.resize());
  }
  buildSky(){
    const geometry=new THREE.SphereGeometry(14000,32,20);
    const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#477f9e')},horizon:{value:new THREE.Color('#c6dbdc')},sunColor:{value:new THREE.Color('#fff7d5')},sunDirection:{value:V(-.52,.48,-.68).normalize()}},vertexShader:'varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vDir;uniform vec3 top;uniform vec3 horizon;uniform vec3 sunColor;uniform vec3 sunDirection;void main(){vec3 d=normalize(vDir);float h=pow(max(d.y,0.),.5);vec3 c=mix(horizon,top,h);float sun=max(0.,dot(d,sunDirection));c+=sunColor*(pow(sun,28.)*.16+pow(sun,800.)*.5+pow(sun,3000.)*1.4);gl_FragColor=vec4(c,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    this.sky=mesh(geometry,material,[0,0,0],this.scene);
  }
  buildTerrain(){
    const nx=236,nz=282,w=9200,d=11800;
    const geo=new THREE.PlaneGeometry(w,d,nx,nz);geo.rotateX(-Math.PI/2);geo.translate(0,0,-1200);
    const p=geo.attributes.position,c=new Float32Array(p.count*3),color=new THREE.Color();
    const grassLow=new THREE.Color('#5e7855'),grassHigh=new THREE.Color('#8b9870'),rock=new THREE.Color('#919990'),darkRock=new THREE.Color('#626f6d'),snow=new THREE.Color('#e4e9e6');
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),z=p.getZ(i),y=terrainHeight(x,z);p.setY(i,y);
      const grad=Math.hypot(terrainHeight(x+8,z)-terrainHeight(x-8,z),terrainHeight(x,z+8)-terrainHeight(x,z-8))/16;
      const n=noise(x*.015,z*.015), detail=noise(x*.12,z*.12);
      color.copy(grassLow).lerp(grassHigh,n*.8);
      const rocky=clamp((y-460)/1100+Math.max(0,grad-.6)*.65,0,1);
      const r=darkRock.clone().lerp(rock,n);color.lerp(r,rocky);
      const snowline=2050+noise(x*.003,z*.003)*380;
      const snowAmount=clamp((y-snowline)/290,0,1)*clamp(1.75-grad*.48,0,1);
      color.lerp(snow,snowAmount);color.multiplyScalar(.86+detail*.24);
      if(Math.abs(x-riverX(z))<55)color.lerp(new THREE.Color('#a9b39b'),.46);
      c[i*3]=color.r;c[i*3+1]=color.g;c[i*3+2]=color.b;
    }
    geo.setAttribute('color',new THREE.BufferAttribute(c,3));geo.computeVertexNormals();
    const material=mat('#ffffff',.98,{vertexColors:true});
    material.onBeforeCompile=(shader)=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainPosition;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainPosition=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrainPosition;\nfloat terrainHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}');
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat strata=sin(vTerrainPosition.y*.055+sin(vTerrainPosition.x*.014)*3.+sin(vTerrainPosition.z*.006)*4.);float grain=terrainHash(floor(vTerrainPosition*1.6));diffuseColor.rgb*=.92+strata*.045+grain*.13;');
    };
    this.terrain=mesh(geo,material,[0,0,0],this.scene);this.terrain.receiveShadow=true;
    this.terrain.castShadow=false;
    // Distant peaks give the valley a full horizon without expensive detail.
    const peakMat=mat('#a3b8b9',1);
    for(let i=0;i<22;i++) {
      const a=(i/22)*Math.PI*2,rad=7600+random()*1800,x=Math.cos(a)*rad,z=Math.sin(a)*rad-1800;
      const h=2000+random()*2400,r=1100+random()*1200;
      const g=new THREE.ConeGeometry(r,h,7,5);const pos=g.attributes.position;
      for(let j=0;j<pos.count;j++){pos.setX(j,pos.getX(j)+(random()-.5)*230);pos.setZ(j,pos.getZ(j)+(random()-.5)*230);}
      g.computeVertexNormals(); const m=mesh(g,peakMat,[x,h*.5-200,z],this.scene);m.rotation.y=random()*Math.PI;
      mesh(new THREE.ConeGeometry(r*.23,h*.24,7),mat('#e2e8e6'),[x,h*.88-200,z],this.scene);
    }
  }
  buildWater(){
    const positions=[],uv=[],indices=[],banks=[],bi=[];
    const length=14000,steps=440;
    for(let i=0;i<=steps;i++){
      const z=4300-i*length/steps,x=riverX(z),width=23+Math.sin(z*.005)*4;
      positions.push(x-width,10.2,z,x+width,10.2,z);uv.push(0,i/12,1,i/12);
      banks.push(x-width-8,10.4,z,x-width+1,10.4,z,x+width-1,10.4,z,x+width+8,10.4,z);
      if(i<steps){const v=i*2;indices.push(v,v+2,v+1,v+1,v+2,v+3);const b=i*4;bi.push(b,b+4,b+1,b+1,b+4,b+5,b+2,b+6,b+3,b+3,b+6,b+7);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    const waterMat=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:false,uniforms:{time:{value:0},color:{value:new THREE.Color('#4eaaa8')},fogColor:{value:this.scene.fog.color},fogDensity:{value:.00019}},vertexShader:'varying vec2 vUv; varying float vDepth;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;}',fragmentShader:'uniform float time;uniform vec3 color;uniform vec3 fogColor;uniform float fogDensity;varying vec2 vUv;varying float vDepth;void main(){float a=sin(vUv.y*52.-time*2.4+sin(vUv.x*9.)*2.);float b=sin(vUv.y*123.-time*3.2+vUv.x*43.);float streak=pow(max(0.,a*b),9.);float edge=pow(abs(vUv.x-.5)*2.,5.);vec3 c=color+vec3(.10,.15,.13)*streak+vec3(.16)*edge;float fog=1.-exp(-fogDensity*fogDensity*vDepth*vDepth);gl_FragColor=vec4(mix(c,fogColor,fog),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    this.water=mesh(g,waterMat,[0,0,0],this.scene);
    const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(banks,3));bg.setIndex(bi);bg.computeVertexNormals();mesh(bg,mat('#b4c2ac',1,{side:THREE.DoubleSide}),[0,0,0],this.scene);
  }
  buildForest(){
    const count=5700;const trunkGeo=new THREE.CylinderGeometry(.85,1.4,12,5);trunkGeo.translate(0,6,0);
    const foliageGeo=new THREE.ConeGeometry(5.5,20,7);foliageGeo.translate(0,16,0);
    const smallGeo=new THREE.ConeGeometry(4.5,14,7);smallGeo.translate(0,22,0);
    this.forest=new THREE.Group();this.scene.add(this.forest);
    const trunks=new THREE.InstancedMesh(trunkGeo,mat('#635e4a'),count),trees=new THREE.InstancedMesh(foliageGeo,mat('#385746'),count),tops=new THREE.InstancedMesh(smallGeo,mat('#42644d'),count);
    const dummy=new THREE.Object3D(),col=new THREE.Color();let j=0;
    for(let tries=0;tries<count*10 && j<count;tries++){
      const x=(random()-.5)*4700,z=2600-random()*8500,y=terrainHeight(x,z),r=Math.abs(x-riverX(z));
      const slope=Math.hypot(terrainHeight(x+8,z)-terrainHeight(x-8,z),terrainHeight(x,z+8)-terrainHeight(x,z-8))/16;
      if(y>1460 || y<20 || r<42 || slope>1.18 || Math.hypot(x-TARGET.x,z-TARGET.z)<100 || (z>1080 && z<1290 && Math.abs(x+600)<45))continue;
      const s=.65+random()*1.6;dummy.position.set(x,y-1,z);dummy.rotation.set(0,random()*6.28,0);dummy.scale.set(s,s*(.8+random()*.5),s);dummy.updateMatrix();
      trunks.setMatrixAt(j,dummy.matrix);trees.setMatrixAt(j,dummy.matrix);tops.setMatrixAt(j,dummy.matrix);
      col.setHSL(.32+random()*.065,.16+random()*.12,.21+random()*.12);trees.setColorAt(j,col);tops.setColorAt(j,col.clone().multiplyScalar(1.08));j++;
    }
    trunks.count=trees.count=tops.count=j;trees.castShadow=true;trunks.castShadow=true;this.forest.add(trunks,trees,tops);
    // Rock outcrops on the valley floor and lower slopes.
    const stones=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),mat('#879187'),600);
    for(let i=0;i<600;i++){const z=1700-random()*6800,x=(random()-.5)*2500,y=terrainHeight(x,z),s=2+random()*11;dummy.position.set(x,y,z);dummy.rotation.set(random()*2,random()*5,random()*2);dummy.scale.set(s*1.3,s*.8,s);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);}this.scene.add(stones);
  }
  buildDetails(){
    this.platform=new THREE.Group();const px=-600,pz=1190,py=terrainHeight(px,pz)+2;this.platform.position.set(px,py,pz);this.scene.add(this.platform);
    const wood=mat('#8b8270'),steel=mat('#343f3e',.6),mark=mat('#dbed83');
    for(let i=0;i<18;i++)mesh(new THREE.BoxGeometry(12,.35,.65),wood,[0,0,5.5-i*.7],this.platform);
    for(const x of [-5.3,5.3]){mesh(new THREE.BoxGeometry(.3,.5,13),steel,[x,-.45,0],this.platform);for(const z of [4,0,-4])mesh(new THREE.CylinderGeometry(.11,.11,1.8,6),steel,[x,.8,z],this.platform);mesh(new THREE.BoxGeometry(.12,.12,9.5),steel,[x,1.7,.1],this.platform);}
    mesh(new THREE.BoxGeometry(10,.03,.3),mark,[0,.2,-6],this.platform);
    const windsock=new THREE.Group();windsock.position.set(9,0,2);this.platform.add(windsock);
    mesh(new THREE.CylinderGeometry(.07,.12,8,8),steel,[0,4,0],windsock);
    const sock=new THREE.Group();sock.position.y=8;windsock.add(sock);sock.rotation.z=-.35;
    for(let i=0;i<5;i++){const segment=mesh(new THREE.CylinderGeometry(.48-i*.05,.44-i*.05,.65,12,1,true),mat(i%2?'#e9e4d2':'#eb8053',.8,{side:THREE.DoubleSide}),[.3+i*.63,0,0],sock);segment.rotation.z=Math.PI/2;}this.windsock=sock;
    // Landing bullseye, luminous locator beam, flags, and a small alpine refuge.
    const landY=terrainHeight(TARGET.x,TARGET.z);
    this.landing=new THREE.Group();this.landing.position.set(TARGET.x,landY+.18,TARGET.z);this.scene.add(this.landing);
    const disk=mesh(new THREE.CircleGeometry(50,80),mat('#e7e6cb'),[0,0,0],this.landing);disk.rotation.x=-Math.PI/2;
    for(let i=0;i<3;i++){const m=mesh(new THREE.RingGeometry(9+i*14,15+i*14,80),mat(i===2?'#e5eb75':'#456456',.9,{side:THREE.DoubleSide}),[0,.04+i*.015,0],this.landing);m.rotation.x=-Math.PI/2;}
    mesh(new THREE.BoxGeometry(13,.1,2),mark,[0,.11,0],this.landing);mesh(new THREE.BoxGeometry(2,.1,13),mark,[0,.11,0],this.landing);
    this.beam=mesh(new THREE.CylinderGeometry(3,3,230,12,1,true),new THREE.MeshBasicMaterial({color:'#e0f799',transparent:true,opacity:.085,depthWrite:false,side:THREE.DoubleSide}),[0,115,0],this.landing);
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const x=Math.cos(a)*59,z=Math.sin(a)*59;mesh(new THREE.CylinderGeometry(.13,.13,9,6),steel,[x,4.5,z],this.landing);mesh(new THREE.PlaneGeometry(4,1.7),new THREE.MeshBasicMaterial({color:'#dcf575',side:THREE.DoubleSide}),[x+2,8,z],this.landing);}
    const hx=TARGET.x+180,hz=TARGET.z-50,hy=terrainHeight(hx,hz);const hut=new THREE.Group();hut.position.set(hx,hy,hz);this.scene.add(hut);
    mesh(new THREE.BoxGeometry(28,15,20),mat('#c6ba97'),[0,7.5,0],hut);
    const roof=mesh(new THREE.ConeGeometry(24,10,4),mat('#59615a'),[0,19,0],hut);roof.rotation.y=Math.PI/4;roof.scale.z=.78;
    const windows=mat('#213b40',.2);for(const x of [-8,8])mesh(new THREE.BoxGeometry(4,5,.15),windows,[x,9,10.1],hut);mesh(new THREE.BoxGeometry(4,8,.15),wood,[0,4,10.1],hut);
    // Path to the landing zone.
    const pathPoints=[];for(let i=0;i<=28;i++){const t=i/28,x=lerp(TARGET.x+65,hx,t),z=lerp(TARGET.z,hz,t);pathPoints.push(V(x,terrainHeight(x,z)+.25,z));}
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pathPoints),45,2,5,false),mat('#b6ad91'),[0,0,0],this.scene);
  }
  buildPlayer(){
    this.player=new THREE.Group();this.scene.add(this.player);this.rig=new THREE.Group();this.player.add(this.rig);
    const suit=mat('#e0ed65',.63),dark=mat('#202f32',.72),strap=mat('#404d43'),helmet=mat('#e9e9d7',.34),visor=mat('#172f39',.18,{metalness:.45});
    // Local forward is -Z. The wingsuit lies face down in flight.
    const torso=mesh(new THREE.CapsuleGeometry(.44,.95,6,10),suit,[0,0,0],this.rig);torso.rotation.x=Math.PI/2;
    mesh(new THREE.BoxGeometry(.62,.28,.86),dark,[0,.38,.02],this.rig);
    for(const x of [-.28,.28])mesh(new THREE.BoxGeometry(.07,.08,1.17),strap,[x,.42,-.04],this.rig);
    mesh(new THREE.SphereGeometry(.36,16,12),helmet,[0,.03,-.99],this.rig);
    const v=mesh(new THREE.SphereGeometry(.318,16,12,Math.PI*.45,Math.PI*1.1,Math.PI*.27,Math.PI*.6),visor,[0,.02,-1.05],this.rig);v.rotation.y=Math.PI;
    mesh(new THREE.BoxGeometry(.18,.18,.2),dark,[0,.38,-1.04],this.rig);
    this.arms=[];this.legs=[];
    for(const s of [-1,1]){
      const arm=new THREE.Group();arm.position.set(s*.38,0,-.55);this.rig.add(arm);this.arms.push(arm);
      const a=cylinderBetween(V(0,0,0),V(s*1.09,-.04,.38),.16,suit,arm);mesh(new THREE.SphereGeometry(.145,8,6),dark,[s*1.15,-.04,.4],arm);
      const leg=new THREE.Group();leg.position.set(s*.24,0,.53);this.rig.add(leg);this.legs.push(leg);
      cylinderBetween(V(),V(s*.43,-.05,1.08),.19,suit,leg);const boot=mesh(new THREE.BoxGeometry(.29,.22,.43),dark,[s*.46,-.02,1.27],leg);boot.rotation.y=-s*.16;
      const wingGeo=new THREE.BufferGeometry();wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([s*.35,-.05,-.65,s*1.55,-.08,-.12,s*.76,-.08,1.53,s*.24,-.07,.7],3));wingGeo.setIndex([0,1,2,0,2,3]);wingGeo.computeVertexNormals();mesh(wingGeo,mat('#d8e768',.67,{side:THREE.DoubleSide}),[0,0,0],this.rig);
      const trimPoints=[V(s*1.54,-.04,-.12),V(s*.77,-.04,1.52)];mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trimPoints),1,.04,4,false),dark,[0,0,0],this.rig);
    }
    const legWing=new THREE.BufferGeometry();legWing.setAttribute('position',new THREE.Float32BufferAttribute([-.23,-.04,.62,.23,-.04,.62,.66,-.04,1.68,-.66,-.04,1.68],3));legWing.setIndex([0,1,2,0,2,3]);legWing.computeVertexNormals();mesh(legWing,mat('#dbe976',.7,{side:THREE.DoubleSide}),[0,0,0],this.rig);
    this.chuteGroup=new THREE.Group();this.player.add(this.chuteGroup);this.chuteGroup.visible=false;
    const panels=13,span=12,depth=4.3;
    for(let panel=0;panel<panels;panel++){
      const pos=[],ix=[],segments=8;
      for(let i=0;i<=1;i++)for(let j=0;j<=segments;j++){
        const u=(panel+i)/panels,v=j/segments,x=(u-.5)*span,y=6.3+Math.cos((u-.5)*2.1)*2.5+Math.sin(v*Math.PI)*.55,z=(v-.5)*depth;
        pos.push(x,y,z);
      }
      for(let j=0;j<segments;j++){const a=j,b=j+segments+1;ix.push(a,b,a+1,a+1,b,b+1);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ix);g.computeVertexNormals();
      const color=panel<2||panel>10?'#172f31':panel===6?'#f2f0d9':'#dcea73';
      mesh(g,mat(color,.75,{side:THREE.DoubleSide}),[0,0,0],this.chuteGroup);
      for(const front of [-1,1]){const u=(panel+.5)/panels,x=(u-.5)*span,y=6.3+Math.cos((u-.5)*2.1)*2.5;const points=[V(x,y,front*depth*.48),V(Math.sign(x)*.3,.55,-.22)];const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#e4e4cf',transparent:true,opacity:.7}));this.chuteGroup.add(line);}
    }
    // Thin contrails behind both wing tips.
    this.trails=[];for(let i=0;i<2;i++){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(42*3),3));const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#e8f4e8',transparent:true,opacity:.3,depthWrite:false}));line.frustumCulled=false;this.scene.add(line);this.trails.push({line,points:Array.from({length:42},()=>V())});}
    this.player.scale.setScalar(1.7);
  }
  buildClouds(){
    this.clouds=new THREE.Group();this.scene.add(this.clouds);
    const g=new THREE.SphereGeometry(1,10,6),m=new THREE.MeshBasicMaterial({color:'#e6eeee',transparent:true,opacity:.13,depthWrite:false,fog:true});
    for(let i=0;i<36;i++){
      const x=(random()-.5)*10000,y=2100+random()*1200,z=2000-random()*11000;
      for(let j=0;j<3;j++){const puff=mesh(g,m,[x+j*220,y+random()*65,z],this.clouds);puff.scale.set(240+random()*280,35+random()*55,140+random()*240);}
    }
  }
  buildBirds(){
    this.birds=[];const m=new THREE.LineBasicMaterial({color:'#253b40'});
    for(let i=0;i<15;i++){const g=new THREE.BufferGeometry().setFromPoints([V(-2,0,0),V(),V(2,0,0)]),b=new THREE.Line(g,m);this.scene.add(b);this.birds.push({mesh:b,phase:random()*6.28,radius:120+random()*180,y:700+random()*550,z:-200-random()*2200});}
  }
  buildWind(){
    this.windGroup=new THREE.Group();this.scene.add(this.windGroup);this.windSegments=[];
    const material=new THREE.LineBasicMaterial({color:'#e4f3f4',transparent:true,opacity:.24,depthWrite:false});
    for(let i=0;i<55;i++){const x=(random()-.5)*100,y=(random()-.5)*70,z=-random()*180;const g=new THREE.BufferGeometry().setFromPoints([V(0,0,0),V(0,0,3+random()*5)]),m=new THREE.Line(g,material);m.position.set(x,y,z);this.windGroup.add(m);this.windSegments.push(m);}
    this.windGroup.visible=false;
  }
  setMission(flight){
    this.golden=flight.mission.golden;const gold=this.golden;
    this.scene.fog.color.set(gold?'#c9b3a2':'#a7c9d4');this.scene.background.copy(this.scene.fog.color);
    this.sky.material.uniforms.top.value.set(gold?'#6a798b':'#477f9e');this.sky.material.uniforms.horizon.value.set(gold?'#f0c6a0':'#c6dbdc');
    this.sun.color.set(gold?'#ffc086':'#fff0ce');this.sun.intensity=gold?2.7:3.15;this.hemi.color.set(gold?'#bdc3d8':'#d3edf7');
    this.renderer.toneMappingExposure=gold?1.03:1.15;
    this.ringGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});this.ringGroup.clear();this.ringVisuals=[];
    flight.rings.forEach((r,i)=>{
      const group=new THREE.Group();group.position.set(r.x,r.y,r.z);
      const ring=mesh(new THREE.TorusGeometry(r.radius,1.05,7,80),new THREE.MeshBasicMaterial({color:'#e5f991',transparent:true,opacity:.84}),[0,0,0],group);
      const glow=mesh(new THREE.TorusGeometry(r.radius,2.6,6,70),new THREE.MeshBasicMaterial({color:'#e3ffb5',transparent:true,opacity:.12,depthWrite:false}),[0,0,0],group);
      for(let j=0;j<4;j++){const a=j*Math.PI/2;const tick=mesh(new THREE.BoxGeometry(1.2,6,1.1),new THREE.MeshBasicMaterial({color:'#f9ffe3'}),[Math.sin(a)*r.radius,Math.cos(a)*r.radius,0],group);tick.rotation.z=-a;}
      this.ringGroup.add(group);this.ringVisuals.push({group,ring,glow,trigger:0});
    });
    this.firstCamera=true;this.player.visible=false;for(const t of this.trails){t.line.visible=false;t.points.forEach(p=>p.set(flight.position.x,flight.position.y,flight.position.z));}
  }
  setQuality(q){
    this.quality=q;this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?2:q==='low'?1:1.5));
    this.renderer.shadowMap.enabled=q!=='low';this.clouds.visible=q!=='low';
    this.forest.children.forEach(o=>{if(o.userData.fullCount===undefined)o.userData.fullCount=o.count;o.count=q==='low'?Math.floor(o.userData.fullCount*.55):o.userData.fullCount;});
  }
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);}
  update(dt,flight,mode,paused){
    if(!paused)this.clock+=dt;
    const p=flight.position,active=mode==='playing'||mode==='countdown'||mode==='result';
    this.water.material.uniforms.time.value=this.clock;this.windsock.rotation.y=Math.sin(this.clock*1.7)*.1;
    this.clouds.position.x=Math.sin(this.clock*.006)*180;
    this.player.visible=active && this.cameraMode===0;this.player.position.set(p.x,p.y,p.z);this.player.rotation.set(0,-flight.heading,0);
    const chute=flight.phase==='canopy'||flight.phase==='landed';
    this.rig.rotation.set(chute?1.3:flight.pitch*.26+.07,0,-flight.bank*.56);
    this.chuteGroup.visible=chute;this.chuteGroup.scale.set(lerp(.08,1,flight.chute),lerp(.05,1,flight.chute),lerp(.15,1,flight.chute));
    this.chuteGroup.rotation.z=-flight.bank*.16+Math.sin(this.clock*2)*.018;
    this.player.position.y+=(chute?.8:0)+(active?Math.sin(this.clock*3)*.055:0);
    this.windGroup.visible=mode==='playing' && flight.phase==='flight' && flight.speed>48;
    this.windGroup.position.copy(this.player.position);this.windGroup.rotation.y=-flight.heading;
    if(!paused)for(const s of this.windSegments){s.position.z+=dt*flight.speed*1.8;if(s.position.z>30)s.position.z=-170;}
    this.birds.forEach((b,i)=>{const a=this.clock*.065+b.phase;b.mesh.position.set(Math.cos(a)*b.radius,b.y+Math.sin(a*1.7)*25,b.z+Math.sin(a)*b.radius);b.mesh.rotation.y=-a;const pos=b.mesh.geometry.attributes.position;pos.setY(0,Math.sin(this.clock*3+i)*1.4);pos.setY(2,Math.sin(this.clock*3+i)*1.4);pos.needsUpdate=true;});
    for(let i=0;i<this.ringVisuals.length;i++){
      const v=this.ringVisuals[i],r=flight.rings[i];
      if(r.passed){v.ring.material.opacity=lerp(v.ring.material.opacity,0,dt*3);v.group.scale.addScalar(dt*.3);v.glow.material.opacity=0;if(v.ring.material.opacity<.01)v.group.visible=false;}
      else if(r.missed){v.ring.material.color.set('#819994');v.ring.material.opacity=.15;v.glow.material.opacity=0;}
      else {v.glow.material.opacity=.09+Math.sin(this.clock*1.8+i)*.035;v.group.rotation.z=Math.sin(this.clock*.22+i)*.02;}
    }
    for(let side=0;side<2;side++){
      const t=this.trails[side];t.line.visible=mode==='playing' && flight.phase==='flight' && this.cameraMode===0 && flight.speed>35;
      if(!paused){const tip=V((side?1:-1)*2.5,0,.6).applyAxisAngle(V(0,1,0),-flight.heading).add(this.player.position);t.points.pop();t.points.unshift(tip);}
      const arr=t.line.geometry.attributes.position;for(let j=0;j<t.points.length;j++)arr.setXYZ(j,t.points[j].x,t.points[j].y,t.points[j].z);arr.needsUpdate=true;
    }
    this.updateCamera(dt,flight,mode,paused);
    this.sun.position.set(p.x-330,p.y+520,p.z-260);this.sun.target.position.set(p.x,p.y,p.z);this.sun.target.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene,this.camera);
  }
  updateCamera(dt,flight,mode,paused){
    const p=flight.position;const forward=V(Math.sin(flight.heading),0,-Math.cos(flight.heading));let target=V(),look=V();
    if(mode==='menu'){
      this.menuTime+=dt;const sway=Math.sin(this.menuTime*.09);
      target.set(-330+sway*32,terrainHeight(-600,1190)+98,1350+Math.cos(this.menuTime*.06)*32);
      look.set(100,510,-1250);this.camera.fov=61;
    }else if(mode==='result'){
      const a=this.clock*.1;target.set(p.x+Math.cos(a)*19,p.y+12,p.z+Math.sin(a)*19);look.set(p.x,p.y+2,p.z);this.camera.fov=62;
    }else if(this.cameraMode===1){
      target.set(p.x,p.y+1.1,p.z).addScaledVector(forward,1.9);
      look.copy(target).addScaledVector(forward,100);look.y-=flight.phase==='canopy'?17:26+flight.pitch*19;
      this.camera.fov=lerp(this.camera.fov,flight.phase==='canopy'?74:86+flight.speed*.09,dt*3);
    }else{
      const canopy=flight.phase==='canopy'||flight.phase==='landed';
      const behind=canopy?25:13+flight.speed*.045;
      target.set(p.x,p.y+(canopy?10:5.5),p.z).addScaledVector(forward,-behind);
      target.x+=flight.bank*2;
      look.set(p.x,p.y+(canopy?1:-2.4),p.z).addScaledVector(forward,34);
      this.camera.fov=lerp(this.camera.fov,canopy?65:69+flight.speed*.15,dt*3);
    }
    const ground=terrainHeight(target.x,target.z);target.y=Math.max(target.y,ground+3);
    if(this.firstCamera){this.camera.position.copy(target);this.lookTarget.copy(look);this.firstCamera=false;}
    else{const s=1-Math.exp(-dt*(mode==='menu'?1.2:this.cameraMode===1?16:7));this.camera.position.lerp(target,s);this.lookTarget.lerp(look,s);}
    this.camera.up.set(Math.sin(flight.bank*.08),1,0);this.camera.lookAt(this.lookTarget);
    if(mode==='playing' && flight.phase==='flight' && !paused && !matchMedia('(prefers-reduced-motion: reduce)').matches){this.camera.rotation.z+=Math.sin(this.clock*17)*Math.max(0,flight.speed-55)*.00012;}
    this.camera.updateProjectionMatrix();
  }
  project(position){const p=V(position.x,position.y,position.z).project(this.camera);return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight,visible:p.z<1&&p.z>0&&Math.abs(p.x)<1.4&&Math.abs(p.y)<1.4};}
}

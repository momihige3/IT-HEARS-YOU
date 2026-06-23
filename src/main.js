import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const $ = (s) => document.querySelector(s);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060906);
scene.fog = new THREE.FogExp2(0x080b08, 0.022);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .05, 100);
camera.position.set(0, 1.68, 24);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
$('#game').append(renderer.domElement);
const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = .45;

const state = { started:false, ended:false, hidden:false, key:false, flashlight:true, battery:100, detection:0, alert:'UNNOTICED', moveMode:'WALKING', noise:0, nearLocker:null, bob:0, settingsOpen:false };
const keys = {}; const colliders=[]; const lockers=[];

const mat = (color, rough=.82, metal=.05) => new THREE.MeshStandardMaterial({ color, roughness:rough, metalness:metal });
const wallMat=mat(0x1c2420,.98), trimMat=mat(0x111713,.75), floorMat=mat(0x181c19,.58), metalMat=mat(0x27302a,.42,.65), darkMat=mat(0x080b09,.8);
function box(x,y,z,w,h,d,material, collide=false){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);if(collide)colliders.push({x,z,hw:w/2,hz:d/2});return m; }

// Hall shell and ceiling beams
box(0,-.12,0,7.6,.25,62,floorMat); box(-4,2.1,0,.25,4.5,62,wallMat,true); box(4,2.1,0,.25,4.5,62,wallMat,true); box(0,4.3,0,8.2,.2,62,darkMat);
for(let z=-28;z<=28;z+=4){ box(0,.04,z,7.4,.035,.045,trimMat); box(0,4.12,z,8,.15,.22,trimMat); }
for(const side of [-1,1]) for(let z=-27;z<=27;z+=6) box(side*3.82,1.05,z,.08,.5,3.6,trimMat);

// Pipes
for(const x of [-2.9,-2.55]){ const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,60,8),metalMat);pipe.rotation.x=Math.PI/2;pipe.position.set(x,3.88,0);scene.add(pipe); }

// Sickly ceiling lights
for(let z=-24;z<=24;z+=12){
  box(0,4.02,z,1.5,.1,.35,mat(0x9eaa8e,.3));
  const l=new THREE.PointLight(z===0?0xaaba94:0xc0c8a6,14,15,1.65);l.position.set(0,3.83,z);l.castShadow=false; scene.add(l);
}
scene.add(new THREE.HemisphereLight(0x617062,0x0b0e0b,.48));
scene.add(new THREE.AmbientLight(0x29322b,.34));

function makeLocker(x,z,side){
  const group=new THREE.Group(); const body=box(0,0,0,1.05,2.45,.82,metalMat); scene.remove(body);group.add(body);
  const door=box(0,0,.43,.92,2.25,.07,mat(0x313b34,.5,.7));scene.remove(door);group.add(door);
  for(let y=.35;y<.8;y+=.13){const slit=box(0,y,.475,.52,.035,.02,darkMat);scene.remove(slit);group.add(slit);}
  const handle=box(.31,-.18,.49,.055,.25,.04,mat(0x0b0d0c,.35,.8));scene.remove(handle);group.add(handle);
  group.position.set(x,1.23,z); group.rotation.y=side>0?-Math.PI/2:Math.PI/2;scene.add(group);
  const data={group,x,z,side};lockers.push(data);colliders.push({x,z,hw:side? .45:.55,hz:.55});return data;
}
[-20,-8,7,19].forEach((z,i)=>makeLocker(i%2?3.42:-3.42,z,i%2?1:-1));

// Utility clutter and end walls
box(0,2.1,-30,8,4.4,.25,wallMat,true); box(0,2.1,30,8,4.4,.25,wallMat,true);
for(const [x,z] of [[-2.8,-13],[2.9,13],[-2.6,2]]){box(x,.42,z,.75,.75,.75,mat(0x332c22,.9),true);box(x,.9,z,.62,.2,.62,mat(0x2c281f,.9));}

// Exit door at far end
const exitDoor=box(0,1.45,-29.82,2.15,2.9,.16,mat(0x252d28,.48,.6));
box(0,3.05,-29.7,2.45,.18,.25,trimMat); box(-1.16,1.5,-29.7,.17,3.25,.25,trimMat); box(1.16,1.5,-29.7,.17,3.25,.25,trimMat);
const exitSign=box(0,3.48,-29.55,1.1,.38,.08,mat(0x16432e,.4)); const exitLight=new THREE.PointLight(0x20a66c,2.6,4);exitLight.position.set(0,3.4,-28.8);scene.add(exitLight);

// Key
const keyGroup=new THREE.Group(); const keyMat=mat(0xb69b4a,.25,.85); const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.035,8,18),keyMat);ring.rotation.x=Math.PI/2;keyGroup.add(ring);const stem=new THREE.Mesh(new THREE.BoxGeometry(.055,.035,.35),keyMat);stem.position.z=.24;keyGroup.add(stem);const tooth=new THREE.Mesh(new THREE.BoxGeometry(.13,.035,.06),keyMat);tooth.position.set(.04,0,.4);keyGroup.add(tooth);keyGroup.position.set(2.8,1.12,15);keyGroup.rotation.z=.3;scene.add(keyGroup);const keyLight=new THREE.PointLight(0xd0b55d,.7,2);keyLight.position.copy(keyGroup.position);scene.add(keyLight);

// Enemy silhouette
const enemy=new THREE.Group();
const enemyBody=new THREE.Mesh(new THREE.CapsuleGeometry(.38,1.15,7,10),mat(0x111512,.8));enemyBody.position.y=1.05;enemyBody.castShadow=true;enemy.add(enemyBody);
const enemyHead=new THREE.Mesh(new THREE.SphereGeometry(.31,12,9),mat(0x151916,.85));enemyHead.position.y=2.0;enemy.add(enemyHead);
const eyeMat=new THREE.MeshBasicMaterial({color:0xa51c15});for(const x of [-.1,.1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.025,6,6),eyeMat);e.position.set(x,2.04,.285);enemy.add(e);}
enemy.position.set(0,0,-8);scene.add(enemy);
const enemyData={dir:1,speed:1.15,lastSeen:null};

// Procedural ambience and spatial footsteps: no downloaded audio assets needed.
let audio=null;
function initAudio(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  const ctx=new AC(),master=ctx.createGain();master.gain.value=.34;master.connect(ctx.destination);
  const hum=ctx.createOscillator(),humGain=ctx.createGain();hum.type='sawtooth';hum.frequency.value=48;humGain.gain.value=.018;hum.connect(humGain).connect(master);hum.start();
  const lfo=ctx.createOscillator(),lfoGain=ctx.createGain();lfo.frequency.value=.17;lfoGain.gain.value=.009;lfo.connect(lfoGain).connect(humGain.gain);lfo.start();
  const near=ctx.createOscillator(),nearGain=ctx.createGain();near.type='sine';near.frequency.value=31;nearGain.gain.value=0;near.connect(nearGain).connect(master);near.start();
  const noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*.12,ctx.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
  audio={ctx,master,nearGain,noiseBuffer,nextStep:0,nextEnemyStep:0,nextBeat:0};
}
function thump(volume=.12,frequency=72){
  if(!audio)return;const {ctx,master}=audio,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(frequency,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(38,ctx.currentTime+.13);g.gain.setValueAtTime(volume,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.2);o.connect(g).connect(master);o.start();o.stop(ctx.currentTime+.22);
}
function playFootstep(volume,pitch=1,pan=0){
  if(!audio||volume<=.004)return;const {ctx,master,noiseBuffer}=audio,src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=noiseBuffer;src.playbackRate.value=pitch;filter.type='lowpass';filter.frequency.value=430*pitch;filter.Q.value=.8;gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.13);src.connect(filter).connect(gain);if(ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=THREE.MathUtils.clamp(pan,-1,1);gain.connect(p).connect(master);}else gain.connect(master);src.start();
}
function updateAudio(time){
  if(!audio)return;const dist=enemy.position.distanceTo(camera.position),proximity=THREE.MathUtils.clamp(1-dist/14,0,1);audio.nearGain.gain.setTargetAtTime(proximity*.055,audio.ctx.currentTime,.18);
  const moving=state.noise>0&&!state.hidden;if(moving&&time>audio.nextStep){playFootstep(state.moveMode==='RUNNING'?.34:state.moveMode==='CROUCHING'?.075:.19,state.moveMode==='RUNNING'?1.22:1,0);audio.nextStep=time+(state.moveMode==='RUNNING'?.27:state.moveMode==='CROUCHING'?.68:.44);}
  if(time>audio.nextEnemyStep){camera.getWorldDirection(forward);forward.y=0;forward.normalize();const camRight=new THREE.Vector3().crossVectors(forward,camera.up).normalize(),enemyDir=new THREE.Vector3().subVectors(enemy.position,camera.position).normalize(),pan=camRight.dot(enemyDir);playFootstep(proximity*.48,.64,pan);audio.nextEnemyStep=time+(enemyData.speed>1.5?.38:.58);}
  if(proximity>.08&&time>audio.nextBeat){const beatVolume=.035+proximity*.34;thump(beatVolume,82+proximity*18);setTimeout(()=>thump(beatVolume*.72,72+proximity*12),105);audio.nextBeat=time+THREE.MathUtils.lerp(1.22,.38,proximity);}
}

// Flashlight
const flashlight=new THREE.SpotLight(0xf2f0dc,56,25,Math.PI/9,.48,1.35);flashlight.castShadow=true;flashlight.shadow.mapSize.set(512,512);scene.add(flashlight);scene.add(flashlight.target);
const fillLight=new THREE.PointLight(0xcbd5c1,.22,2.2);scene.add(fillLight);

function canMoveTo(x,z){ if(x<-3.62||x>3.62||z<-29.2||z>29.2)return false;return !colliders.some(c=>Math.abs(x-c.x)<c.hw+.26&&Math.abs(z-c.z)<c.hz+.26); }
function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove('show'),2100);}
function interact(){
  if(state.hidden){state.hidden=false;document.body.classList.remove('hidden-in-locker');showToast('ロッカーから出た');return;}
  if(state.nearLocker){state.hidden=true;document.body.classList.add('hidden-in-locker');keys.KeyW=keys.KeyA=keys.KeyS=keys.KeyD=false;showToast('息を殺して、やり過ごせ');return;}
  if(!state.key&&camera.position.distanceTo(keyGroup.position)<1.7){state.key=true;keyGroup.visible=false;keyLight.visible=false;$('#objective-text').textContent='出口へ向かえ';showToast('古びた鍵を手に入れた');return;}
  if(camera.position.distanceTo(exitDoor.position)<2.1){if(state.key)endGame(true);else showToast('鍵がかかっている');}
}
function endGame(win){state.ended=true;controls.unlock();$('#message-kicker').textContent=win?'YOU MADE IT OUT':'IT FOUND YOU';$('#message-title').textContent=win?'ESCAPED':'CAUGHT';$('#message-body').textContent=win?'背後で、まだ何かが扉を叩いている。':'速すぎた。うるさすぎた。もう一度、静かに。';$('#message-screen').classList.add('visible');}

function openSettings(){state.settingsOpen=true;$('#settings-screen').classList.add('visible');$('#settings-close').textContent=state.started?'ゲームに戻る':'閉じる';$('#settings-quit').disabled=!state.started;if(controls.isLocked)controls.unlock();}
function closeSettings(){state.settingsOpen=false;$('#settings-screen').classList.remove('visible');if(state.started&&!state.ended)controls.lock(true);}
const sensitivitySlider=$('#sensitivity-slider');
sensitivitySlider.addEventListener('input',()=>{const value=Number(sensitivitySlider.value);controls.pointerSpeed=value/100;$('#sensitivity-value').textContent=String(value);localStorage.setItem('mouseSensitivity',String(value));});
const savedSensitivity=Number(localStorage.getItem('mouseSensitivity'));if(savedSensitivity>=15&&savedSensitivity<=120){sensitivitySlider.value=String(savedSensitivity);sensitivitySlider.dispatchEvent(new Event('input'));}
$('#settings-button').addEventListener('click',openSettings);$('#settings-close').addEventListener('click',closeSettings);
$('#settings-quit').addEventListener('click',()=>location.reload());
controls.addEventListener('unlock',()=>{if(state.started&&!state.ended&&!state.settingsOpen)openSettings();});
$('#start-button').addEventListener('click',()=>{state.started=true;initAudio();$('#start-screen').classList.remove('visible');controls.lock(true);});
$('#restart-button').addEventListener('click',()=>location.reload());
renderer.domElement.addEventListener('click',()=>{if(state.started&&!state.ended&&!state.settingsOpen&&!controls.isLocked)controls.lock(true);});
addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Escape'&&state.started&&!state.ended&&!e.repeat){state.settingsOpen?closeSettings():openSettings();}if(e.code==='KeyE'&&!e.repeat)interact();if(e.code==='KeyF'&&!e.repeat){state.flashlight=!state.flashlight;showToast(state.flashlight?'懐中電灯 ON':'懐中電灯 OFF');}});
addEventListener('keyup',e=>keys[e.code]=false);

const clock=new THREE.Clock(); const forward=new THREE.Vector3(), right=new THREE.Vector3(), move=new THREE.Vector3(), toPlayer=new THREE.Vector3();
function updatePlayer(dt,time){
  if(!controls.isLocked||state.hidden)return;
  camera.getWorldDirection(forward); forward.y=0;forward.normalize();right.crossVectors(forward,camera.up).normalize();
  move.set(0,0,0); if(keys.KeyW)move.add(forward);if(keys.KeyS)move.sub(forward);if(keys.KeyD)move.add(right);if(keys.KeyA)move.sub(right);
  const active=move.lengthSq()>0; if(active)move.normalize();
  const crouch=keys.ControlLeft||keys.ControlRight, run=(keys.ShiftLeft||keys.ShiftRight)&&!crouch;
  const speed=crouch?1.25:run?4.7:2.35;state.moveMode=crouch?'CROUCHING':run?'RUNNING':'WALKING';state.noise=active?(crouch?13:run?88:38):0;
  const nx=camera.position.x+move.x*speed*dt,nz=camera.position.z+move.z*speed*dt;if(canMoveTo(nx,camera.position.z))camera.position.x=nx;if(canMoveTo(camera.position.x,nz))camera.position.z=nz;
  const targetY=crouch?1.05:1.68;camera.position.y=THREE.MathUtils.lerp(camera.position.y,targetY,dt*9);
  if(active){state.bob+=dt*speed*(run?2.1:1.65);camera.position.y+=Math.sin(state.bob*3.6)*(crouch?.008:run?.038:.022);}
  if(state.flashlight){state.battery=Math.max(0,state.battery-dt*.22);if(state.battery<=0)state.flashlight=false;}
}
function updateEnemy(dt,time){
  if(state.ended)return;
  const dist=enemy.position.distanceTo(camera.position);toPlayer.subVectors(camera.position,enemy.position);toPlayer.y=0;
  if(state.detection>=72&&!state.hidden){ enemyData.lastSeen=camera.position.clone(); }
  if(enemyData.lastSeen){
    const target=enemyData.lastSeen;const dir=target.clone().sub(enemy.position);dir.y=0;if(dir.length()<.65)enemyData.lastSeen=null;else{dir.normalize();enemy.position.addScaledVector(dir,dt*2.7);enemy.rotation.y=Math.atan2(dir.x,dir.z);}
  }else{
    enemy.position.z+=enemyData.dir*enemyData.speed*dt;if(enemy.position.z>20||enemy.position.z<-22)enemyData.dir*=-1;enemy.rotation.y=enemyData.dir>0?0:Math.PI;
  }
  const enemyForward=new THREE.Vector3(0,0,1).applyQuaternion(enemy.quaternion); const facing=enemyForward.dot(toPlayer.clone().normalize());
  let gain=0;
  if(!state.hidden){if(dist<10&&facing>.35)gain+=(11-dist)*11;if(dist<state.noise*.14+1.5)gain+=state.noise*.52;if(dist<2.2)gain+=80;}
  state.detection=THREE.MathUtils.clamp(state.detection+(gain>0?gain*dt:-18*dt),0,100);
  state.alert=state.detection>72?'HUNTING':state.detection>28?'SUSPICIOUS':'UNNOTICED';enemyData.speed=state.alert==='HUNTING'?2.1:1.15;
  if(state.hidden&&dist<5){$('#danger-flash').style.opacity=String(.1+Math.sin(time*4)*.045);document.body.style.setProperty('--near','1');}else $('#danger-flash').style.opacity=state.alert==='HUNTING'?String(.16+Math.sin(time*7)*.08):'0';
  if(dist<.78&&!state.hidden)endGame(false);
  // subtle gait
  enemy.position.y=Math.abs(Math.sin(time*3.5))*.035;
}
function updateInteraction(){
  state.nearLocker=null;let best=1.45;for(const l of lockers){const d=Math.hypot(camera.position.x-l.x,camera.position.z-l.z);if(d<best){best=d;state.nearLocker=l;}}
  let prompt='';if(state.hidden)prompt='[ E ] ロッカーから出る';else if(state.nearLocker)prompt='[ E ] ロッカーに隠れる';else if(!state.key&&camera.position.distanceTo(keyGroup.position)<1.7)prompt='[ E ] 鍵を拾う';else if(camera.position.distanceTo(exitDoor.position)<2.1)prompt=state.key?'[ E ] 鍵を使って脱出':'[ E ] 扉を調べる';$('#prompt').textContent=prompt;
}
function updateHUD(){
  $('#noise-bar').style.width=state.noise+'%';$('#noise-value').textContent=String(Math.round(state.noise)).padStart(2,'0');
  $('#detect-bar').style.width=state.detection+'%';$('#detect-value').textContent=String(Math.round(state.detection)).padStart(2,'0');
  $('#alert-text').textContent=state.alert;$('#alert-text').parentElement.classList.toggle('danger',state.alert==='HUNTING');
  $('#move-mode').textContent=state.hidden?'HIDING':state.moveMode;$('#battery-value').textContent=Math.ceil(state.battery)+'%';$('#battery-bar').style.width=state.battery+'%';
}
function updateLight(time){
  flashlight.visible=state.flashlight&&!state.hidden;fillLight.visible=flashlight.visible;camera.getWorldDirection(forward);flashlight.position.copy(camera.position);flashlight.position.addScaledVector(forward,.12);flashlight.target.position.copy(camera.position).addScaledVector(forward,8);fillLight.position.copy(camera.position);
  flashlight.intensity=(Math.random()<.006?12:56)*(state.battery<15?(.55+Math.sin(time*17)*.35):1);
  keyGroup.rotation.y=time*.9;keyGroup.position.y=1.12+Math.sin(time*2)*.06;
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04),time=clock.elapsedTime;if(state.started&&!state.ended){updatePlayer(dt,time);updateEnemy(dt,time);updateInteraction();updateHUD();updateLight(time);updateAudio(time);}renderer.render(scene,camera);}
animate();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

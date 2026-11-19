import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

type Pose = { p: number[]; q: number[] };
type State = { time: number; phase: string; running: boolean; error?: string; accepted: number; rejected: number; contacts: number; warnings: number; joints: number[]; bodies: Record<string, Pose>; geoms: { p: number[]; r: number[] }[]; events: { time: number; phase: string; can: number }[] };
type Scene = { engine: string; links: Record<string, number[]>; geoms: { id: number; name: string; type: number; size: number[]; color: number[]; mesh?: string; meshPosition?: number[]; meshQuaternion?: number[] }[] };

function Viewer({ scene, state }: { scene: Scene; state?: State }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(state); latest.current = state;
  const [error, setError] = useState("");
  useEffect(() => {
    const holder = host.current!;
    let alive = true;
    const world = new THREE.Scene(); world.background = new THREE.Color("#101d26");
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", "Live SO-101 articulated robot and MuJoCo sorting workcell");
    holder.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(40, 1, .005, 20); camera.up.set(0,0,1); camera.position.set(.65,-.65,.55);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(.12,0,.08); controls.enableDamping=true; controls.minDistance=.2; controls.maxDistance=3;
    world.add(new THREE.HemisphereLight(0xe8f5ff, 0x405060, 3));
    const light = new THREE.DirectionalLight(0xffffff,3); light.position.set(1,-1,2); world.add(light);
    const fill = new THREE.DirectionalLight(0x80bcff,1.5); fill.position.set(-1,1,1); world.add(fill);
    const bodies = new Map<string, THREE.Group>(), geoms = new Map<number, THREE.Object3D>();
    const draco = new DRACOLoader(); draco.setDecoderPath('/draco/');
    const gltf = new GLTFLoader().setDRACOLoader(draco), stl = new STLLoader();
    const fail = (e: unknown) => { if (alive) setError(`Robot mesh could not load: ${String(e)}`); };
    for (const [name, offset] of Object.entries(scene.links)) {
      const group = new THREE.Group(); world.add(group); bodies.set(name,group);
      gltf.load(`/robots/so101/visual/${name}.glb`, asset => {
        if (!alive) return;
        asset.scene.position.set(offset[0]!,offset[1]!,offset[2]!); group.add(asset.scene);
      }, undefined, fail);
    }
    for (const g of scene.geoms) {
      let geometry: THREE.BufferGeometry;
      const [x=0,y=0,z=0]=g.size;
      if (g.type===0) geometry=new THREE.PlaneGeometry(4,4);
      else if (g.type===5) { geometry=new THREE.CylinderGeometry(x,x,y*2,40); geometry.rotateX(Math.PI/2); }
      else if (g.type===3) { geometry=new THREE.CapsuleGeometry(x,y*2,8,20); geometry.rotateX(Math.PI/2); }
      else if (g.type===2) geometry=new THREE.SphereGeometry(x,24,16);
      else if (g.type===7) geometry=new THREE.BufferGeometry();
      else geometry=new THREE.BoxGeometry(x*2,y*2,z*2);
      const mat = new THREE.MeshStandardMaterial({ color:new THREE.Color(g.color[0]!,g.color[1]!,g.color[2]!),roughness:g.name.startsWith("can")?.3:.6,metalness:g.name.startsWith("can")?.65:.15 });
      const mesh = new THREE.Mesh(geometry,mat); world.add(mesh); geoms.set(g.id,mesh);
      if (g.mesh) stl.load(g.mesh, loaded => {
        if (!alive) { loaded.dispose(); return; }
        // MuJoCo recenters STL vertices into principal-inertia coordinates.
        const p=g.meshPosition!,q=g.meshQuaternion!;
        loaded.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p[0],p[1],p[2]),new THREE.Quaternion(q[1],q[2],q[3],q[0]),new THREE.Vector3(1,1,1)).invert());
        mesh.geometry.dispose(); mesh.geometry=loaded;
      }, undefined, fail);
    }
    // Labels annotate work zones; their positions use the same world frame as MuJoCo.
    for (const [text,x,y] of [["ACCEPT",.16,-.24],["QUARANTINE",.16,.24],["INSPECT / PICK",.37,0],["SO-101",-.10,0]] as const) {
      const canvas=document.createElement("canvas");canvas.width=512;canvas.height=96;
      const ctx=canvas.getContext("2d")!;ctx.fillStyle="#d4f3ff";ctx.font="bold 34px sans-serif";ctx.textAlign="center";ctx.fillText(text,256,55);
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));sprite.position.set(x,y,.015);sprite.scale.set(.17,.032,1);world.add(sprite);
    }
    const rotation=new THREE.Matrix4();
    const resize=new ResizeObserver(() => { const {width,height}=holder.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix(); });resize.observe(holder);
    renderer.setAnimationLoop(() => {
      const s=latest.current;
      if (s) {
        bodies.forEach((obj,name) => { const pose=s.bodies[name];if(pose){obj.position.fromArray(pose.p);obj.quaternion.set(pose.q[1]!,pose.q[2]!,pose.q[3]!,pose.q[0]!);} });
        geoms.forEach((obj,id) => { const pose=s.geoms[id];if(pose){const r=pose.r;rotation.set(r[0]!,r[1]!,r[2]!,0,r[3]!,r[4]!,r[5]!,0,r[6]!,r[7]!,r[8]!,0,0,0,0,1);obj.position.fromArray(pose.p);obj.quaternion.setFromRotationMatrix(rotation);} });
      }
      controls.update();renderer.render(world,camera);
    });
    return () => { alive=false;resize.disconnect();controls.dispose();draco.dispose();renderer.setAnimationLoop(null);world.traverse(o => { const mesh=o as THREE.Mesh;mesh.geometry?.dispose();const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];mats.forEach(m=>m?.dispose()); });renderer.dispose();renderer.forceContextLoss();holder.replaceChildren(); };
  },[scene]);
  return <><div className="so101-canvas" ref={host}/>{error && <p role="alert">{error}</p>}</>;
}

export function LiveSO101() {
  const [scene,setScene]=useState<Scene>();const [state,setState]=useState<State>();const [error,setError]=useState("");const [pending,setPending]=useState(false);
  useEffect(() => {
    let alive=true;let timer: ReturnType<typeof setTimeout>;
    const abort=new AbortController();
    const update=async () => {
      try { const r=await fetch('/api/so101',{signal:abort.signal});if(!r.ok)throw new Error('Local MuJoCo server unavailable');const data=await r.json() as {scene?:Scene;state?:State;error?:string};if(alive){if(data.scene)setScene(previous=>previous??data.scene);if(data.state)setState(data.state);setError(data.error??"");} }
      catch(e){if(alive)setError((e as Error).message);}
      if(alive)timer=setTimeout(update,80);
    };void update();return()=>{alive=false;abort.abort();clearTimeout(timer);void fetch('/api/so101',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'pause'})});};
  },[]);
  async function command(command: string) {
    setPending(true);
    try { const r=await fetch('/api/so101',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});if(!r.ok)throw new Error((await r.json() as {error:string}).error); }
    catch(e){setError((e as Error).message);}finally{setPending(false);}
  }
  return <article className="live-so101">
    <div className="so101-toolbar"><div><span className="eyebrow">LIVE PHYSICS · MUJOCO {scene?.engine}</span><h3>SO-101 inspection & sorting station</h3></div><span className={`live-status ${state?.running?'running':''}`}>{state?.phase??'Starting physics engine…'}</span></div>
    <div className="so101-controls"><button disabled={!state||pending||state.running||['complete','fault'].includes(state.phase)} onClick={()=>void command('start')}>{state?.time?'Resume':'Run autonomous task'}</button><button disabled={!state?.running||pending} onClick={()=>void command('pause')}>Pause</button><button disabled={!state||state.running||pending||['complete','fault'].includes(state.phase)} onClick={()=>void command('step')}>Step 100 ms</button><button disabled={!state||pending} onClick={()=>void command('reset')}>Reset cell</button></div>
    {(error||state?.error) && <p role="alert">{error||state?.error}</p>}
    {scene && <Viewer scene={scene} state={state}/>}
    <div className="spaces-facts"><span>{state?.time.toFixed(2)??'0'} s simulated</span><span>{state?.accepted??0} accepted / 2</span><span>{state?.rejected??0} quarantined / 1</span><span>{state?.contacts??0} active contacts</span><span>{state?.warnings??0} physics warnings</span></div>
    <p className="space-hint">Drag to orbit · scroll to inspect the joints and gripper. Start runs a live Python/MuJoCo process; the browser displays its measured body transforms.</p>
    <div className="so101-joints">{['Shoulder pan','Shoulder lift','Elbow','Wrist flex','Wrist roll','Gripper'].map((name,i)=><span key={name}>{name}<b>{((state?.joints[i]??0)*180/Math.PI).toFixed(1)}°</b></span>)}</div>
    <details><summary>Robot assets, task scope & live event log</summary><p>Articulated arm GLBs from your NYCRoboGarden SO-101 asset pack. Matching upstream SO-101 model adds the missing sixth-axis gripper. Native-scale arm, servo torque limits, gravity, contact and friction run in MuJoCo. Finger-pad collision proxies preserve the grasp opening. No attachment welds or object teleportation.</p><p>Bench-scale task: sort three 36 mm × 60 mm aluminum sample cans from presentation pucks into two receiving trays. The red can's reject classification is a scripted inspection fixture, not camera inference. This station replaces the oversized gantry demonstration; full-size can-line packing is outside this task.</p><ol>{state?.events.map((e,i)=><li key={i}>{e.time.toFixed(2)}s · {e.phase} · can {e.can+1}</li>)}</ol></details>
  </article>;
}

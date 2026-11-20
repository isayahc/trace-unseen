import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { factoryAssetLoader, type FactoryAsset } from "./factoryAssets.js";

type Pose = { p: number[]; q: number[] };
type State = { time: number; phase: string; running: boolean; error?: string; accepted: number; rejected: number; totalCans?: number; expectedAccepted?: number; expectedRejected?: number; delivered?: number; belts?: Record<string, { speed: number; distance: number }>; contacts: number; warnings: number; joints: number[]; bodies: Record<string, Pose>; geoms: { p: number[]; r: number[] }[]; events: { time: number; phase: string; can: number }[] };
type Scene = { engine: string; factory?: boolean; assets?: FactoryAsset[]; links: Record<string, number[]>; geoms: { id: number; name: string; type: number; size: number[]; color: number[]; mesh?: string; meshPosition?: number[]; meshQuaternion?: number[] }[] };

function Viewer({ scene, state }: { scene: Scene; state?: State }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(state); latest.current = state;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(0);
  const view = useRef<(name: string) => void>(() => {});
  useEffect(() => {
    const holder = host.current!;
    let alive = true;
    const world = new THREE.Scene(); world.background = new THREE.Color("#101d26");
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
    renderer.domElement.setAttribute("aria-label", "Live SO-101 articulated robot and MuJoCo sorting workcell");
    holder.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(40, 1, .005, 60); camera.up.set(0,0,1);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping=true; controls.minDistance=.15; controls.maxDistance=24;
    view.current = name => {
      const presets: Record<string, number[][]> = { 'Factory floor': [[8,-10,7],[0,.4,.1]], 'Working cell': [[1.7,-2.4,1.6],[.12,-.1,-.1]], Gripper: [[.65,-.65,.55],[.12,0,.08]], Dispatch: [[.65,-1.9,.5],[.14,-1.2,0]] };
      const [position,target]=presets[name]!; camera.position.fromArray(position!); controls.target.fromArray(target!); controls.update();
    };
    view.current('Working cell');
    world.add(new THREE.HemisphereLight(0xe8f5ff, 0x405060, 3));
    const light = new THREE.DirectionalLight(0xffffff,3); light.position.set(1,-1,2); world.add(light);
    const fill = new THREE.DirectionalLight(0x80bcff,1.5); fill.position.set(-1,1,1); world.add(fill);
    const bodies = new Map<string, THREE.Group>(), geoms = new Map<number, THREE.Object3D>();
    const draco = new DRACOLoader(); draco.setDecoderPath('/draco/');
    const gltf = new GLTFLoader().setDRACOLoader(draco), stl = new STLLoader();
    const fail = (e: unknown) => { if (alive) setError(`Robot mesh could not load: ${String(e)}`); };
    const manager = new THREE.LoadingManager();
    manager.onError = url => { if (alive) setError(`Factory asset could not load: ${url}`); };
    const loadAsset = factoryAssetLoader(manager);
    setLoading(scene.assets?.length ?? 0);
    for (const asset of scene.assets ?? []) void loadAsset(asset).then(model => {
      if (alive) { world.add(model); setLoading(n => n - 1); }
    }).catch(e => { if (alive) { setError(`Factory asset ${asset.id}: ${String(e)}`); setLoading(n => n - 1); } });
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
    for (const [text,x,y] of [["POWERED OUTFEED",.14,-.7],["QUARANTINE",.06,.24],["INSPECT / PICK",.37,0],["SO-101",-.10,0],["INFEED",.24,.7],["DISPATCH",.14,-1.6]] as const) {
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
  return <><div className="so101-controls" aria-label="Camera views">{['Factory floor','Working cell','Gripper','Dispatch'].map(name=><button key={name} onClick={()=>view.current(name)}>{name}</button>)}{loading>0 && <span>Loading {loading} factory assets…</span>}</div><div className="so101-canvas" ref={host}/>{error && <p role="alert">{error}</p>}</>;
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
    <div className="so101-toolbar"><div><span className="eyebrow">LIVE FACTORY · MUJOCO {scene?.engine}</span><h3>Infeed → SO-101 sorting → dispatch</h3></div><span className={`live-status ${state?.running?'running':''}`}>{state?.phase??'Starting physics engine…'}</span></div>
    <div className="so101-controls"><button disabled={!state||pending||state.running||['complete','fault'].includes(state.phase)} onClick={()=>void command('start')}>{state?.time?'Resume':'Run autonomous task'}</button><button disabled={!state?.running||pending} onClick={()=>void command('pause')}>Pause</button><button disabled={!state||state.running||pending||['complete','fault'].includes(state.phase)} onClick={()=>void command('step')}>Step 100 ms</button><button disabled={!state||pending} onClick={()=>void command('reset')}>Reset cell</button></div>
    {(error||state?.error) && <p role="alert">{error||state?.error}</p>}
    {scene && <Viewer scene={scene} state={state}/>}
    <div className="spaces-facts"><span>{state?.time.toFixed(2)??'0'} s simulated</span><span>{state?.totalCans??'…'} cans in batch</span><span>{state?.accepted??0} accepted / {state?.expectedAccepted??'…'}</span><span>{state?.rejected??0} quarantined / {state?.expectedRejected??'…'}</span><span>{state?.contacts??0} active contacts</span><span>{state?.warnings??0} physics warnings</span></div>
    <div className="spaces-facts"><span>{state?.delivered??0} delivered to dispatch</span>{Object.entries(state?.belts??{}).map(([name,belt])=><span key={name}>{name}: {state?.running ? (belt.speed*1000).toFixed(0) : '0'} mm/s · travel {belt.distance.toFixed(2)} m</span>)}</div>
    <p className="space-hint">Drag to orbit · scroll to inspect the joints and gripper. Start runs a live Python/MuJoCo process; the browser displays its measured body transforms.</p>
    <div className="so101-joints">{['Shoulder pan','Shoulder lift','Elbow','Wrist flex','Wrist roll','Gripper'].map((name,i)=><span key={name}>{name}<b>{((state?.joints[i]??0)*180/Math.PI).toFixed(1)}°</b></span>)}</div>
    <details><summary>Factory asset sources, simulation scope & event log</summary><p>Native-scale SO-101 from <a href="https://github.com/isayahc/NYCRoboGarden/tree/main/assets/robots/so101">NYCRoboGarden</a>, with upstream gripper geometry. Powered infeed and outfeed use <a href="https://github.com/IFRA-Cranfield/IFRA_ConveyorBelt">IFRA / Cranfield conveyor CAD</a>, width-adapted to the arm. Factory building, storage racks, inventory and pallet jack come from <a href="https://github.com/aws-robotics/aws-robomaker-small-warehouse-world">AWS RoboMaker</a>. Inspection fixture: <a href="https://github.com/realsenseai/realsense-ros">RealSense D435</a>.</p><p>{state?.totalCans??'…'} sample cans (36 × 60 mm) move through MuJoCo contact friction, physical finger grasping and a dispatch chute. Imported meshes supply appearance; authored collision proxies supply physics. Surrounding warehouse assets and upstream extension are context, not automated machinery. Inspection classification is scripted, not camera inference. Layout and adapted dimensions are demonstration assumptions.</p><p><a href="/factory/provenance.json">Pinned sources & hashes</a> · <a href="/factory/conveyor/LICENSE">Conveyor license</a> · <a href="/factory/warehouse/LICENSE">Warehouse license</a> · <a href="/factory/camera/LICENSE">Camera license</a></p><ol>{state?.events.map((e,i)=><li key={i}>{e.time.toFixed(2)}s · {e.phase} · can {e.can+1}</li>)}</ol></details>
  </article>;
}

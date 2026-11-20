import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./spaces.css";
import { LiveSO101 } from "./LiveSO101.js";

type Item = { id: string; label: string; center_m: [number, number, number]; size_m: [number, number, number]; category: string; description: string };
type Layout = {
  scenario: string; title: string; objects: Item[]; routine_onsite_roles: number;
  tasks: { task: string; owner: string; status: string }[]; exceptions: string[]; limitations: string[];
  sources: { id: string; url: string; title: string; quote: string; scope: string }[];
};
const colors: Record<string, string> = { structure: "#122b37", conveyor: "#47798d", sensor: "#7de4d2", reject: "#e87869", pallet: "#c2a478", storage: "#627780", robot: "#71b6ff", guard: "#afcae0", manual: "#eeb85b", human: "#ffcc67" };

function Cell({ layout, onSelect, top }: { layout: Layout; onSelect: (item: Item) => void; top: boolean }) {
  const holder = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect); select.current = onSelect;
  const [error, setError] = useState("");
  useEffect(() => {
    const element = holder.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError("3D unavailable. Use the equipment list and download the native CAD below."); return; }
    setError("");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-label", `${layout.title}: interactive 3D envelope layout`);
    renderer.domElement.setAttribute("role", "img");
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#08151d");
    const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
    if (top) camera.position.set(6,20,4.01); else camera.position.set(15,13,16);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(6, .3, 4); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2.04;
    controls.minDistance = 7; controls.maxDistance = 30; controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x243b4a, 2.8));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 12, 6); scene.add(light);
    const targets: THREE.Mesh[] = [];
    for (const item of layout.objects) {
      // Same authored envelope coordinates used by Forma's native CAD build; Z-up → Three Y-up.
      const [w,d,h] = item.size_m, [x,y,z] = item.center_m;
      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = new THREE.MeshStandardMaterial({ color: colors[item.category] ?? "#8da0b0", roughness: .65,
        metalness: .15, transparent: item.category === "guard", opacity: item.category === "guard" ? .3 : 1 });
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x,z,y); mesh.userData.item = item; scene.add(mesh);
      if (item.id !== "floor") targets.push(mesh);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: "#c5e3e9", transparent: true, opacity: .18 }));
      mesh.add(outline);
    }
    const aisle = new THREE.Mesh(new THREE.PlaneGeometry(12,1.2), new THREE.MeshBasicMaterial({ color: "#225347", side: THREE.DoubleSide }));
    aisle.rotation.x = -Math.PI/2; aisle.position.set(6,.015,.6); scene.add(aisle);
    // Flow arrows annotate direction only. They are not a timed simulation.
    for (const x of [1.3,3.3,5.6,7.7,10.4]) scene.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(x,1.15,4), .65, 0x9af5df, .18,.12));
    const grid = new THREE.GridHelper(12,12,0x41677a,0x1d3b49); grid.position.set(6,.01,4); scene.add(grid);
    const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    let down = [0,0];
    const pointerDown = (e: PointerEvent) => { down = [e.clientX,e.clientY]; };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX-down[0],e.clientY-down[1])>5) return;
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      ray.setFromCamera(pointer,camera); const hit = ray.intersectObjects(targets,false)[0];
      if (hit) select.current(hit.object.userData.item as Item);
    };
    renderer.domElement.addEventListener("pointerdown",pointerDown); renderer.domElement.addEventListener("pointerup",pointerUp);
    const resize = new ResizeObserver(() => { const {width,height}=element.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width,height); camera.aspect=width/height; camera.updateProjectionMatrix(); }); resize.observe(element);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene,camera); });
    return () => {
      resize.disconnect(); controls.dispose(); renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown",pointerDown); renderer.domElement.removeEventListener("pointerup",pointerUp);
      scene.traverse((o) => { const mesh = o as THREE.Mesh; mesh.geometry?.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; materials.forEach((m) => m?.dispose()); });
      renderer.dispose(); renderer.forceContextLoss(); element.replaceChildren();
    };
  }, [layout,top]);
  return <><div className="cell-canvas" ref={holder}/>{error && <p role="alert">{error}</p>}</>;
}

export function AutomationSpaces() {
  const [layouts,setLayouts] = useState<Layout[]>([]);
  const [error,setError] = useState(""); const [top,setTop] = useState(false);
  const [selected,setSelected] = useState<{ space: string; item: Item }>();
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(["human","autonomous"].map(async (id) => { const response=await fetch(`/spaces/${id}/layout.json`,{signal:controller.signal}); if (!response.ok) throw new Error("Could not load saved Forma spaces"); return response.json() as Promise<Layout>; }))
      .then(setLayouts).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  },[]);
  return <section className="spaces-view">
    <div className="spaces-heading"><span className="eyebrow">AUTONOMOUS WORKSPACE</span><h2>A connected factory cell.</h2><p>Sourced industrial assets · powered conveyors · SO-101 sorting · verified dispatch</p></div>
    {error && <p role="alert">{error}</p>}{!layouts.length && !error && <p>Loading saved Forma spaces…</p>}
    <LiveSO101/>
    <details className="earlier-spaces"><summary>Earlier Forma floor-plan concepts and CAD downloads</summary>
    <button onClick={() => setTop(!top)}>{top ? "Perspective view" : "Top-down view"}</button>
    <div className="space-pair">{layouts.map((layout,i) => <article className={`space-card ${layout.scenario}`} key={layout.scenario}>
      <div className="space-title"><span>0{i+1}</span><h3>{i===0 ? "Human in the loop" : "Autonomous cell"}</h3><small>{i===0 ? "Operators + mechanized flow" : "Normal-operation concept"}</small></div>
      <Cell layout={layout} top={top} onSelect={(item) => setSelected({ space: layout.title,item })}/>
      <div className="space-staff"><strong>{layout.routine_onsite_roles}</strong><span>assumed routine in-cell roles<br/><small>Maintenance and replenishment remain external.</small></span></div>
      <div className="space-downloads"><a href={`/spaces/${layout.scenario}/cell.step`} download>STEP ↓</a><a href={`/spaces/${layout.scenario}/cell.stl`} download>STL ↓</a><a href={`/spaces/${layout.scenario}/forma-project.json`} download>Forma project ↓</a></div>
      <details><summary>Equipment & task allocation</summary>{layout.objects.filter((o) => o.id!=="floor").map((item) => <button key={item.id} onClick={() => setSelected({space:layout.title,item})}>{item.label}</button>)}<ul>{layout.tasks.map((t) => <li key={t.task}><b>{t.task}</b><br/>{t.owner}<br/><small>{t.status}</small></li>)}</ul></details>
    </article>)}</div>
    <p className="space-legend"><span style={{color:colors.human}}>● Human / assisted tasks</span><span style={{color:colors.robot}}>● Automation</span><span style={{color:colors.sensor}}>● Inspection / controls</span><span style={{color:colors.reject}}>● Quarantine</span></p>
    <p className="space-hint">Drag to orbit · scroll to zoom · click equipment for details. Colored geometry shows the same conceptual envelopes used for the CAD exports.</p>
    {selected && <article className="space-selection"><button onClick={() => setSelected(undefined)}>Close</button><small>{selected.space}</small><h3>{selected.item.label}</h3><p>{selected.item.description}</p><p>Assumed envelope: {selected.item.size_m.join(" × ")} m</p></article>}
    <div className="space-comparison"><h3>What changes?</h3><p>Human exception review and assisted layer handling become automatic quarantine, gantry layer transfer and automated pallet movement. Both layouts retain inspection and reject handling.</p><p><b>Not a measured factory:</b> layout, target rate and staffing are authored assumptions. Cell energy, labor time, defect escape rate, capital cost and payback are unknown. No operational performance or labor-saving percentage is claimed.</p></div>
    {layouts[0] && <details><summary>Source evidence and validation scope</summary>{layouts[0].sources.map((s) => <blockquote key={s.id}>{s.quote}<p><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a></p><small>{s.scope}</small></blockquote>)}<p>OpenForma MechanicalIR / ProcessIR validation and native OCCT CAD export passed. These are static envelopes, not a verified robot simulation or factory reconstruction. SpaceIR is owned by a separate provider and was not used.</p><p><a href="/spaces/human/forma-validation.json">Human-cell validation</a> · <a href="/spaces/autonomous/forma-validation.json">Autonomous-cell validation</a></p></details>}
    </details>
  </section>;
}

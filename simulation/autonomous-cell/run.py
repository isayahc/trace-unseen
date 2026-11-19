"""Observed-state autonomous small-batch demonstration, SI units and Z-up."""
import argparse
import json
from pathlib import Path
import sys
import hashlib
import mujoco as mj
import numpy as np
import imageio.v2 as imageio

ROOT = Path(__file__).resolve().parents[2]

def model_xml():
    layout = json.loads((ROOT/'public/spaces/autonomous/layout.json').read_text())
    visuals = ''
    for o in layout['objects']:
        if o['id'] in ['floor', 'pallet', 'outfeed', 'infeed', 'inspection-belt', 'reject', 'accumulator', 'quarantine', 'gripper']:
            continue
        visuals += f'<geom name="envelope-{o["id"]}" type="box" pos="{" ".join(map(str,o["center_m"]))}" size="{" ".join(str(v/2) for v in o["size_m"])}" contype="0" conaffinity="0" rgba=".18 .3 .38 .18"/>'
    cans = ''.join(f'<body name="can{i}" pos="{1+i*.15} 3 .058"><freejoint name="can{i}-free"/><geom name="can{i}-geom" type="cylinder" size=".033 .058" mass=".014" rgba="{ " .95 .25 .15 1" if i==2 else ".4 .85 .85 1"}"/></body>' for i in range(5))
    welds = ''.join(f'<weld name="vacuum{i}" body1="tool" body2="can{i}" active="false" solref=".006 1"/>' for i in range(5))
    return f'''<mujoco model="trace-unseen-autonomous"><option timestep=".002" integrator="implicitfast"/><visual><global offwidth="1280" offheight="720"/><rgba haze=".06 .1 .14 1"/></visual>
    <default><geom friction="1 .01 .001" solref=".006 1"/><joint damping="10"/><position kp="3000" kv="250"/></default>
    <worldbody><light pos="6 4 10" diffuse=".9 .9 .9"/><geom name="floor" type="plane" size="12 8 .1" rgba=".07 .12 .16 1"/>{visuals}
    <geom name="quarantine-base" type="box" pos="4.4 5.1 .3" size=".4 .4 .05" rgba=".55 .15 .1 1"/>
    <body name="carrier" pos="1.3 4 .95"><joint name="infeed-axis" type="slide" axis="1 0 0"/><geom name="carrier-top" type="box" size=".18 .16 .05" mass="4" rgba=".3 .5 .6 1"/></body>
    <body name="pallet" pos="8.6 4 .2"><joint name="outfeed-axis" type="slide" axis="1 0 0"/><geom name="pallet-top" type="box" size=".6 .6 .2" mass="20" rgba=".65 .48 .25 1"/></body>
    <body name="tool" pos="0 0 0"><joint name="x" type="slide" axis="1 0 0"/><joint name="y" type="slide" axis="0 1 0"/><joint name="z" type="slide" axis="0 0 1"/><geom name="tool-geom" type="cylinder" size=".025 .025" mass="1" contype="0" conaffinity="0" rgba=".3 .55 1 1"/></body>{cans}</worldbody>
    <equality>{welds}</equality><actuator><position joint="infeed-axis"/><position joint="outfeed-axis"/><position joint="x"/><position joint="y"/><position joint="z"/></actuator></mujoco>'''

class Cell:
    def __init__(self, output, video, fault):
        self.output, self.fault = output, fault
        output.mkdir(parents=True, exist_ok=True)
        xml = model_xml()
        (output/'model.xml').write_text(xml)
        self.m = mj.MjModel.from_xml_string(xml)
        self.d = mj.MjData(self.m)
        self.events, self.samples = [], []
        self.state = 'initialize'
        self.d.qpos[self.m.joint('x').qposadr[0]] = 1.3
        self.d.qpos[self.m.joint('y').qposadr[0]] = 4
        self.d.qpos[self.m.joint('z').qposadr[0]] = 1.7
        self.d.ctrl[:] = [0, 0, 1.3, 4, 1.7]
        mj.mj_forward(self.m, self.d)
        self.renderer = mj.Renderer(self.m, height=720, width=1280) if video else None
        self.writer = imageio.get_writer(output/'replay.mp4', fps=30, codec='libx264', quality=7) if video else None
        self.camera = mj.MjvCamera()
        self.camera.lookat[:] = [6, 4.3, .6]
        self.camera.distance, self.camera.azimuth, self.camera.elevation = 11, 90, -45
        self.steps = 0

    def pos(self, name):
        return self.d.body(name).xpos.copy()

    def event(self, state, **extra):
        self.state = state
        self.events.append(dict(time_s=round(self.d.time, 4), state=state, **extra))
        print(json.dumps(self.events[-1]), flush=True)

    def step(self, seconds):
        for _ in range(round(seconds/self.m.opt.timestep)):
            mj.mj_step(self.m, self.d)
            self.steps += 1
            if not np.isfinite(self.d.qpos).all() or sum(w.number for w in self.d.warning):
                raise RuntimeError('physics instability or MuJoCo warning')
            if self.steps % 100 == 0:
                self.samples.append(dict(time_s=round(self.d.time,3), state=self.state, cans=[self.pos(f'can{i}').tolist() for i in range(5)], tool=self.pos('tool').tolist(), pallet=self.pos('pallet').tolist()))
            # Render at 5x simulated speed; sampling is genuine physics state.
            if self.writer and self.steps % 83 == 0:
                self.renderer.update_scene(self.d, camera=self.camera)
                self.writer.append_data(self.renderer.render())

    def move(self, indices, target, speed=.8):
        indices = np.array(indices)
        start = self.d.ctrl[indices].copy()
        target = np.array(target)
        duration = max(.4, np.max(np.abs(target-start))/speed*1.6)
        for t in np.arange(.02, duration+.02, .02):
            u = min(1, t/duration)
            self.d.ctrl[indices] = start+(target-start)*(3*u*u-2*u*u*u)
            self.step(.02)
        self.step(.4)
        joints = ['infeed-axis','outfeed-axis','x','y','z']
        actual = np.array([self.d.qpos[self.m.joint(joints[i]).qposadr[0]] for i in indices])
        if np.max(np.abs(actual-target)) > .015:
            raise RuntimeError('axis failed to reach target')

    def supported(self, i, geom):
        a, b = self.m.geom(f'can{i}-geom').id, self.m.geom(geom).id
        return any({c.geom1,c.geom2} == {a,b} for c in self.d.contact)

    def settled(self, i):
        adr = self.m.joint(f'can{i}-free').dofadr[0]
        return np.linalg.norm(self.d.qvel[adr:adr+6]) < .03

    def run(self):
        accepted = []
        for i in range(5):
            self.move([0], [0])
            # Only boundary insertion changes a can pose. All downstream transport is physics.
            adr = self.m.joint(f'can{i}-free').qposadr[0]
            self.d.qpos[adr:adr+7] = [1.3,4,1.065,1,0,0,0]
            self.d.qvel[self.m.joint(f'can{i}-free').dofadr[0]:self.m.joint(f'can{i}-free').dofadr[0]+6] = 0
            mj.mj_forward(self.m,self.d)
            self.event('infeed', can=i)
            self.step(.5)
            self.move([0], [1.9], speed=.5)
            if not self.supported(i,'carrier-top') or np.linalg.norm(self.pos(f'can{i}')[:2]-[3.2,4]) > .08:
                raise RuntimeError('can missing at inspection')
            self.event('inspection', can=i, classifier='scripted test fixture')
            if self.fault == 'inspection-unavailable':
                raise RuntimeError('inspection unavailable: stopped before quality bypass')
            reject = i == 2
            self.event('reject' if reject else 'accept', can=i)
            self.move([0], [3.1 if reject else 4.8], speed=.5)
            p = self.pos(f'can{i}')
            self.move([2,3,4], [p[0],p[1],1.7])
            self.move([4], [p[2]+.083], speed=.25)
            p = self.pos(f'can{i}')
            delta = p-self.pos('tool')
            if np.linalg.norm(delta-[0,0,-.083]) > .015 or not self.supported(i,'carrier-top'):
                raise RuntimeError('vacuum pickup proximity/support interlock')
            eq = self.m.equality(f'vacuum{i}').id
            self.m.eq_data[eq,3:6] = delta
            self.m.eq_data[eq,6:10] = self.d.qpos[adr+3:adr+7]
            self.d.eq_active[eq] = 1
            self.event('vacuum-transfer', can=i)
            self.move([4],[1.7],speed=.4)
            n = len(accepted)
            x,y = (4.4,5.1) if reject else (8.4+(n%2)*.4,3.8+(n//2)*.4)
            self.move([2,3],[x,y])
            self.move([4],[ (.35 if reject else .4)+.058+.083+.012],speed=.3)
            self.d.eq_active[eq] = 0
            self.step(.8)
            surface = 'quarantine-base' if reject else 'pallet-top'
            if not self.supported(i,surface) or not self.settled(i):
                raise RuntimeError(f'can {i} not settled on {surface}')
            self.event('quarantined' if reject else 'packed',can=i, observed_position=self.pos(f'can{i}').tolist(), support_contact=True)
            if not reject: accepted.append(i)
            self.move([4],[1.7])
        self.event('pallet-outfeed')
        if self.fault == 'outfeed-blocked':
            raise RuntimeError('outfeed blocked: loaded pallet held at packing station')
        self.move([1],[2],speed=.25)
        self.step(1)
        for i in accepted:
            p = self.pos(f'can{i}')-self.pos('pallet')
            if abs(p[0])>.55 or abs(p[1])>.55 or not self.supported(i,'pallet-top') or not self.settled(i):
                raise RuntimeError('pallet delivery containment/support failed')
        if not self.supported(2,'quarantine-base') or not self.settled(2) or abs(self.pos('pallet')[0]-10.6)>.015:
            raise RuntimeError('final quarantine or outfeed verification failed')
        self.event('complete', accepted=4, rejected=1, delivered=4)

    def finish(self, error):
        if self.writer: self.writer.close()
        if self.renderer: self.renderer.close()
        report = dict(status='failed' if error else 'passed', error=error, engine='MuJoCo', version=mj.__version__, fault=self.fault,
            simulated_seconds=self.d.time, physics_steps=self.steps, warning_count=int(sum(w.number for w in self.d.warning)),
            model_sha256=hashlib.sha256((self.output/'model.xml').read_bytes()).hexdigest(), events=self.events,
            final_positions={f'can{i}':self.pos(f'can{i}').tolist() for i in range(5)},
            assumptions=['Scripted classification: can 2 is defective; no vision model.', 'Ideal vacuum weld with proximity and support interlocks; no suction physics.', 'Serial single-can transfer, not the proposed full-layer palletizer.', 'Carrier shuttle substitutes for continuous belt/reject gate.', 'Rigid cans; no crushing, air drag, jam clearing, separator dispensing or replenishment.', '5x replay; 60 cans/minute is not validated.', 'Forma envelopes are visual-only; carrier, pallet, quarantine and cans have collision geometry.'])
        (self.output/'result.json').write_text(json.dumps(report,indent=2))
        (self.output/'telemetry.json').write_text(json.dumps(self.samples))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'public/simulation/autonomous')
    parser.add_argument('--video',action='store_true')
    parser.add_argument('--fault',choices=['inspection-unavailable','outfeed-blocked'])
    args=parser.parse_args()
    cell=Cell(args.output,args.video,args.fault)
    error=None
    try: cell.run()
    except Exception as exc:
        error=str(exc)
        cell.event('stopped',reason=error)
    finally: cell.finish(error)
    sys.exit(1 if error else 0)

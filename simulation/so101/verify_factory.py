"""Execute the connected factory line and inspect actual delivery/contact outcomes."""
import json
import numpy as np
from factory import FactoryCell
from factory_scene import CAN_COUNT
from cell import ROOT

def run(fault=None):
    c=FactoryCell();c.fault_input=fault;c.command('start');last=''
    for _ in range(250000):
        c.tick()
        if c.phase!=last:
            print(round(c.d.time,2),c.index,c.phase,c.error,c.d.body(f'can{min(c.index,CAN_COUNT-1)}').xpos,flush=True);last=c.phase
        if not c.running:break
    return c

if __name__=='__main__':
    c=run()
    (ROOT/'data').mkdir(exist_ok=True)
    (ROOT/'data/factory-verification.json').write_text(json.dumps(c.state(),indent=2))
    assert c.phase=='complete',c.error
    assert c.accepted==CAN_COUNT-1 and c.rejected==1 and len(c.delivered)==CAN_COUNT-1
    assert c.m.neq==0 and all(c.placed(i) for i in range(CAN_COUNT))
    assert not any(w.number for w in c.d.warning)
    print('PASS connected factory: physical infeed, finger grasp, reject, powered outfeed, settled dispatch')
    c.command('reset');c.command('start')
    for _ in range(250):c.tick()
    c.command('pause');before=c.d.qpos.copy();t=c.d.time
    for _ in range(100):c.tick()
    assert c.d.time==t and np.array_equal(before,c.d.qpos)
    c.command('start');c.tick();assert c.d.time>t
    c.command('reset')
    assert c.phase=='ready' and c.d.time==0 and not c.delivered
    for fault,expected in [('inspection-unavailable','Inspection unavailable'),('outfeed-blocked','Outfeed blocked')]:
        failed=run(fault)
        assert failed.phase=='fault' and expected in failed.error
        assert failed.accepted==0 and not failed.delivered
    for name in ['fixed-pad','moving-pad']:
        i=c.m.geom(name).id;c.m.geom_contype[i]=0;c.m.geom_conaffinity[i]=0
    c.command('start')
    for _ in range(30000):
        c.tick()
        if not c.running:break
    assert c.phase=='fault' and 'Grasp failed' in c.error
    assert c.accepted==0 and not c.delivered
    print('PASS pause/resume/reset; inspection, blocked-outfeed and missing-finger faults stop the line')

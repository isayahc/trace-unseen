"""Real-physics integration checks; never accepts a commanded pose as task success."""
import json
import numpy as np
from cell import Cell, ROOT

c=Cell()
assert c.m.neq==0, 'No weld/attachment constraints permitted'
c.command('start')
for _ in range(250):c.tick()
c.command('pause')
before=c.d.qpos.copy();t=c.d.time
for _ in range(100):c.tick()
assert c.d.time==t and np.array_equal(before,c.d.qpos),'Pause must freeze physics'
c.command('start')
for _ in range(150000):
    c.tick()
    if not c.running:break
assert c.phase=='complete',c.error
assert (c.accepted,c.rejected)==(2,1)
assert all(c.placed(i) for i in range(3))
assert not any(w.number for w in c.d.warning)
report={'normal':c.state(),'checks':['bilateral finger contact','unconstrained friction lift','tray containment and contact','settled velocity','pause/resume','no equality constraints']}
print('PASS real SO101: 2 accepted, 1 quarantined, all settled in trays; zero warnings')
c.command('reset')
assert c.phase=='ready' and c.d.time==0 and c.accepted==0 and c.rejected==0
for name in ['fixed-pad','moving-pad']:
    i=c.m.geom(name).id;c.m.geom_contype[i]=0;c.m.geom_conaffinity[i]=0
c.command('start')
for _ in range(30000):
    c.tick()
    if not c.running:break
assert c.phase=='fault' and 'Grasp failed' in c.error,c.state()
assert c.accepted==0 and c.rejected==0
report['disabled_fingers']=c.state()
(ROOT/'data').mkdir(exist_ok=True)
(ROOT/'data/so101-verification.json').write_text(json.dumps(report,indent=2))
print('PASS reset; disabled finger contacts cause observed grasp failure, never success')

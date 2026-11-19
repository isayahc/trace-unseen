from cell import Cell
import mujoco as mj
import imageio.v2 as im
from pathlib import Path
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--images',action='store_true')
args=parser.parse_args()
c=Cell();c.command('start');last=''
r=mj.Renderer(c.m,480,640) if args.images else None
cam=mj.MjvCamera();cam.lookat[:]=[.15,0,.1];cam.distance=.7;cam.azimuth=135;cam.elevation=-35
for i in range(150000):
    c.tick()
    if c.phase!=last:
        print(c.phase,c.error,'can',c.d.body(f'can{min(c.index,2)}').xpos,'tool',c.d.site_xpos[c.site],flush=True)
        if r:
            r.update_scene(c.d,camera=cam)
            im.imwrite(Path.home()/f'AppData/Local/Temp/opencode/so101-{c.index}-{c.phase}.png',r.render())
        last=c.phase
    if not c.running: break
if r:r.close()
print('time',c.d.time,'counts',c.accepted,c.rejected)
raise SystemExit(0 if c.phase=='complete' else 1)

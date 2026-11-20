"""Factory layout: sourced display assets plus explicitly authored physics proxies."""
import xml.etree.ElementTree as E
from copy import deepcopy

FLOOR=-.733
CAN_COUNT=6
CONVEYOR='/factory/conveyor/conveyorbelt_gazebo/models/conveyor_belt/meshes/conveyor_belt.dae'

def warehouse(name):
    return f'/factory/warehouse/models/aws_robomaker_warehouse_{name}_01/meshes/aws_robomaker_warehouse_{name}_01_visual.DAE'

def assets():
    # Assets are bottom-centered and fitted to these recorded dimensions in meters.
    result=[
        dict(id='infeed-machine',url=CONVEYOR,position=[.24,.51,FLOOR],size=[.20,1.2,.743],rotation=0,source='IFRA / Cranfield conveyor',role='active'),
        dict(id='outfeed-machine',url=CONVEYOR,position=[.14,-.69,FLOOR],size=[.20,1.2,.743],rotation=0,source='IFRA / Cranfield conveyor',role='active'),
        dict(id='upstream-machine',url=CONVEYOR,position=[.24,1.71,FLOOR],size=[.20,1.2,.743],rotation=0,source='IFRA / Cranfield conveyor',role='context'),
        dict(id='receiving-line',url=CONVEYOR,position=[1.8,1.5,FLOOR],size=[.463,1.2,.743],rotation=1.570796,source='IFRA / Cranfield conveyor',role='context'),
        dict(id='inspection-camera',url='/factory/camera/d435.dae',position=[.24,.11,.31],size=[.09,.025,.025],rotation=0,source='RealSense D435 / realsense-ros',role='fixture'),
        dict(id='building-floor',url=warehouse('GroundB'),position=[0,0,FLOOR-.04],size=[12,8,.04],rotation=0,source='AWS RoboMaker warehouse',role='context'),
        dict(id='building-back',url=warehouse('WallB'),position=[0,3.94,FLOOR],size=[12,.12,3.2],rotation=0,source='AWS RoboMaker warehouse',role='context'),
        dict(id='building-side',url=warehouse('WallB'),position=[-5.94,0,FLOOR],size=[8,.12,3.2],rotation=1.570796,source='AWS RoboMaker warehouse',role='context'),
    ]
    for i,x in enumerate([-3.9,-1.1,1.7,4.5]):
        result.append(dict(id=f'storage-rack-{i}',url=warehouse('ShelfF'),position=[x,2.9,FLOOR],size=[2.3,.75,2.1],rotation=0,source='AWS RoboMaker warehouse',role='context'))
    for name,id,p,size,angle in [
        ('DeskC','control-desk',[-1.7,.6,FLOOR],[1.25,.65,.8],0),
        ('PalletJackB','dispatch-pallet-jack',[1.2,-2.5,FLOOR],[.7,1.4,1.2],-.5),
        ('ClutteringA','incoming-inventory',[2.4,1.4,FLOOR],[1.1,.8,.7],0),
        ('ClutteringA','dispatch-inventory',[2.5,-2.2,FLOOR],[1.1,.8,.7],1.57),
        ('TrashCanC','waste-container',[-1,.9,FLOOR],[.45,.45,.65],0),
        ('Lamp','overhead-light-left',[-2,0,2.2],[1.2,.35,.15],0),
        ('Lamp','overhead-light-right',[2,0,2.2],[1.2,.35,.15],0),
    ]:
        result.append(dict(id=id,url=warehouse(name),position=p,size=size,rotation=angle,source='AWS RoboMaker warehouse',role='context'))
    return result

def configure(root):
    world=root.find('worldbody')
    for g in list(world.findall('geom')):
        name=g.get('name','')
        if name in ['workbench','floor','inspection-camera','camera-lens','camera-post','camera-arm'] or name.startswith(('leg','feed-puck','accept-','reject-')):
            world.remove(g)
    E.SubElement(world,'geom',name='factory-floor-collision',type='plane',pos=f'0 0 {FLOOR}',size='6 4 .01',group='3')
    # Mounting hardware is an authored adapter, not a vendor machine mesh.
    for name,z,r,h in [('pedestal',-.38,.055,.35),('foot',FLOOR+.014,.12,.014),('mount',-.009,.085,.009)]:
        E.SubElement(world,'geom',name=name,type='cylinder',pos=f'0 0 {z}',size=f'{r} {h}',rgba='.25 .29 .32 1')
    E.SubElement(world,'geom',name='camera-support',type='capsule',fromto='.40 .11 -.70 .40 .11 .34',size='.009',rgba='.4 .45 .5 1')
    E.SubElement(world,'geom',name='camera-bracket',type='capsule',fromto='.40 .11 .34 .24 .11 .34',size='.009',rgba='.4 .45 .5 1')
    # Reject pocket is outside the incoming belt and inside the real arm reach.
    for name,x,y,sx,sy in [('reject',.08,.16,.05,.065),('dispatch',.14,-1.42,.10,.16)]:
        tray=E.SubElement(world,'geom',name=name+'-tray',type='box',pos=f'{x} {y} .003',size=f'{sx} {sy} .005',rgba=('.65 .16 .1 1' if name=='reject' else '.12 .35 .29 1'))
        if name=='dispatch':
            tray.set('pos',f'{x} {y} -.010');tray.set('euler','.08 0 0');tray.set('friction','.025 .003 .0001');tray.set('priority','2')
        E.SubElement(world,'geom',name=name+'-stand',type='cylinder',pos=f'{x} {y} -.38',size='.035 .34',rgba='.3 .35 .38 1')
        walls=[(-sx,0,.003,sy),(sx,0,.003,sy),(0,sy,sx,.003),(0,-sy,sx,.003)]
        for j,(dx,dy,wx,wy) in enumerate(walls):
            if name=='dispatch' and dy>0:continue
            E.SubElement(world,'geom',name=f'{name}-wall-{j}',type='box',pos=f'{x+dx} {y+dy} .01',size=f'{wx} {wy} .04',rgba=('.65 .16 .1 1' if name=='reject' else '.12 .35 .29 1'))
    for i in range(3,CAN_COUNT):
        body=deepcopy(world.find('body[@name="can0"]'))
        for element in body.iter():
            if element.get('name')=='can0':element.set('name',f'can{i}')
        world.append(body)
    for i in range(CAN_COUNT):
        y=.12+i*.17
        world.find(f'body[@name="can{i}"]').set('pos',f'.24 {y} .041')
        world.find(f'body[@name="can{i}"]/geom').set('conaffinity','3')
    for g in world.find('body[@name="base"]').iter('geom'):
        if g.get('class')=='collision' and g.get('contype')!='0' or g.get('name') in ['fixed-pad','moving-pad']:
            g.set('conaffinity','3')
    # Periodic sliding-surface belt proxy, following the supplied conveyor's own
    # prismatic-surface approach. Only the uniform belt phase wraps, never products.
    act=root.find('actuator')
    for line,x,start,end in [('infeed',.24,-.065,1.085),('outfeed',.14,-1.265,-.115)]:
        body=E.SubElement(world,'body',name=f'{line}-belt',pos=f'{x} {(start+end)/2} .005')
        E.SubElement(body,'joint',name=f'{line}-belt',type='slide',axis='0 -1 0',damping='.1')
        E.SubElement(body,'geom',name=f'{line}-surface',type='box',size=f'.087 {(end-start)/2+.015} .005',mass='5',friction='1.2 .01 .001',condim='4',solref='.005 1',contype='2',conaffinity='0',group='3')
        E.SubElement(act,'velocity',name=f'{line}-drive',joint=f'{line}-belt',kv='500',forcerange='-50 50')
        for side in [-1,1]:
            E.SubElement(world,'geom',name=f'{line}-rail-{side}',type='box',pos=f'{x+side*.094} {(start+end)/2} -.002',size=f'.006 {(end-start)/2+.02} .012',group='3')
    # Static collision footprints for the surrounding imported equipment.
    for a in assets():
        if not a['id'].startswith(('storage-rack','control-desk','dispatch-pallet-jack','incoming-inventory','dispatch-inventory')):continue
        x,y,z=a['position'];w,d,h=a['size']
        E.SubElement(world,'geom',name=a['id']+'-collision',type='box',pos=f'{x} {y} {z+h/2}',size=f'{w/2} {d/2} {h/2}',euler=f'0 0 {a["rotation"]}',group='3')

"""One connected factory process: powered infeed → robot sort → powered dispatch."""
import numpy as np
import mujoco as mj
from cell import Cell
from factory_scene import assets, CAN_COUNT

class FactoryCell(Cell):
    def __init__(self):
        super().__init__(factory=True)
        self.drives={line:np.array([i for i in range(self.m.nu) if mj.mj_id2name(self.m,mj.mjtObj.mjOBJ_ACTUATOR,i).startswith(line+'-drive')]) for line in ['infeed','outfeed']}
        self.belt_speed={'infeed':0.,'outfeed':0.}
        self.belt_distance={'infeed':0.,'outfeed':0.}
        self.delivered=[]
        self.fault_input=None

    def command(self, command):
        if command=='reset':self.__init__();return
        if command=='start' and self.phase=='ready':self.goto('infeed')
        if command=='start' and self.phase not in ['fault','complete']:self.running=True
        if command=='pause':self.running=False

    def drive(self,line,speed):
        self.belt_speed[line]+=float(np.clip(speed-self.belt_speed[line],-.00015,.00015))
        self.d.ctrl[self.drives[line]]=self.belt_speed[line]

    def settled(self,i):
        adr=self.m.joint(f'can{i}').dofadr[0]
        return np.linalg.norm(self.d.qvel[adr:adr+6])<.035

    def placed(self,i):
        p=self.d.body(f'can{i}').xpos
        if i==1:return self.contact(i,'reject-tray') and abs(p[0]-.08)<.05 and abs(p[1]-.16)<.065 and self.settled(i)
        return self.contact(i,'dispatch-tray') and abs(p[0]-.14)<.10 and -1.58<p[1]<-1.28 and self.settled(i)

    def tick(self):
        if not self.running:return
        try:
            p=self.d.body(f'can{min(self.index,CAN_COUNT-1)}').xpos.copy()
            self.drive('infeed',.045 if self.phase=='infeed' and p[1]>.012 else 0.)
            self.drive('outfeed',.07 if self.phase=='outfeed' and p[1]>-1.37 else 0.)
            if self.target is not None:self.d.ctrl[:5]+=np.clip(self.target-self.d.ctrl[:5],-.002,.002)
            mj.mj_step(self.m,self.d)
            for line,ids in self.drives.items():
                joint=self.m.actuator_trnid[ids[0],0]
                self.belt_distance[line]+=float(self.d.qvel[self.m.jnt_dofadr[joint]])*self.m.opt.timestep
                adr=self.m.jnt_qposadr[joint]
                if self.d.qpos[adr]>.01:self.d.qpos[adr]-=.01
            if any(w.number for w in self.d.warning) or not np.isfinite(self.d.qpos).all():raise RuntimeError('MuJoCo instability')
            elapsed=self.d.time-self.phase_time
            reached=self.target is None or np.max(np.abs(self.target-self.d.qpos[:5]))<.025
            p=self.d.body(f'can{min(self.index,CAN_COUNT-1)}').xpos.copy()
            dest=np.array([.08,.16,.048]) if self.index==1 else np.array([.14,-.135,.048])
            if elapsed>80:raise RuntimeError(self.phase+' timeout')
            if self.phase=='infeed' and p[1]<=.012 and abs(self.belt_speed['infeed'])<.001:
                if abs(p[0]-.24)>.025 or p[2]<.03:raise RuntimeError('Infeed failed: can not upright at inspection')
                self.goto('inspect')
            elif self.phase=='inspect' and elapsed>.5:
                if self.fault_input=='inspection-unavailable':raise RuntimeError('Inspection unavailable: line stopped')
                self.goto('approach',p+np.array([0,0,.06]),.8)
            elif self.phase=='approach' and reached and elapsed>1:self.goto('descend',p,.8)
            elif self.phase=='descend' and reached and elapsed>.6:self.goto('grasp',grip=-.1)
            elif self.phase=='grasp' and elapsed>1.5:
                if not self.contact(self.index,'fixed-pad') or not self.contact(self.index,'moving-pad'):raise RuntimeError('Grasp failed: bilateral finger contact absent')
                self.goto('lift',p+np.array([0,0,.045]))
            elif self.phase=='lift' and reached and elapsed>1:
                if p[2]<.065:raise RuntimeError('Grasp failed: can did not rise')
                self.goto('transfer',dest+np.array([0,0,.04]))
            elif self.phase=='transfer' and reached and elapsed>1:self.goto('place',dest)
            elif self.phase=='place' and reached and elapsed>1:self.goto('release',grip=.8)
            elif self.phase=='release' and elapsed>1:self.goto('retreat',dest+np.array([0,0,.055]))
            elif self.phase=='retreat' and reached and elapsed>1:
                if self.index==1:self.goto('verify')
                else:
                    if self.fault_input=='outfeed-blocked':raise RuntimeError('Outfeed blocked: accepted can held upstream')
                    self.goto('outfeed')
            elif self.phase=='outfeed' and p[1]<-1.34 and self.contact(self.index,'dispatch-tray') and abs(self.belt_speed['outfeed'])<.001:self.goto('verify')
            elif self.phase=='verify' and elapsed>.6:
                if not all(self.placed(i) for i in range(self.index+1)):
                    if elapsed<8:return
                    raise RuntimeError('Receiving verification failed: support/containment/settling')
                if self.index==1:self.rejected+=1
                else:self.accepted+=1;self.delivered.append(self.index)
                self.index+=1
                if self.index==CAN_COUNT:self.goto('complete');self.running=False
                else:
                    self.goto('park',[.20,0,.10],.8)
            elif self.phase=='park' and reached and elapsed>1:self.goto('infeed')
        except Exception as exc:
            self.error=str(exc);self.phase='fault';self.running=False
            for ids in self.drives.values():self.d.ctrl[ids]=0

    def scene(self):
        result=super().scene()
        result.update(factory=True,assets=assets(),footprint=[12,8],revision='factory-v1')
        return result

    def state(self):
        result=super().state()
        result.update(belts={k:dict(speed=round(v,4),distance=self.belt_distance[k]) for k,v in self.belt_speed.items()},delivered=len(self.delivered),activeCan=min(self.index,CAN_COUNT-1),factory=True,totalCans=CAN_COUNT,expectedAccepted=CAN_COUNT-1,expectedRejected=1)
        return result

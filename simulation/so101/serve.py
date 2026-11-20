"""Line-delimited JSON bridge. Runs real-time physics; no renderer/video required."""
import json
import queue
import sys
import threading
import time
from factory import FactoryCell

commands=queue.Queue()
def reader():
    for line in sys.stdin:
        try:commands.put(json.loads(line))
        except ValueError:pass
    commands.put({'command':'shutdown'})
threading.Thread(target=reader,daemon=True).start()
cell=FactoryCell()
def emit(kind,value):print(json.dumps({'type':kind,'value':value},allow_nan=False),flush=True)
emit('scene',cell.scene())
last=0
while True:
    start=time.monotonic()
    while not commands.empty():
        item=commands.get()
        cmd=item.get('command')
        if cmd=='shutdown':sys.exit(0)
        try:
            if cmd=='step':
                cell.command('start')
                for _ in range(50):cell.tick()
                cell.running=False
            else:cell.command(cmd)
        except Exception as exc:
            cell.error=str(exc);cell.phase='fault';cell.running=False
    for _ in range(10):cell.tick()
    if start-last>=.05:
        emit('state',cell.state());last=start
    time.sleep(max(0,.02-(time.monotonic()-start)))

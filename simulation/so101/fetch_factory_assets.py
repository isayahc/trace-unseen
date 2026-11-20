"""Download pinned, attributed industrial meshes; no procedural replacement assets."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[2]/'public/factory'
ROOT.mkdir(parents=True,exist_ok=True)
SOURCES=[
    ('conveyor','IFRA-Cranfield/IFRA_ConveyorBelt','2316a816b99ac76dc4d72af55a13370a5578a3d5'),
    ('warehouse','aws-robotics/aws-robomaker-small-warehouse-world','ee0af733315e78432408c3cd98d378ecee5f767c'),
]
selected=['ShelfF','PalletJackB','DeskC','GroundB','WallB','ClutteringA','Lamp','TrashCanC']
manifest=[]
for folder,repo,commit in SOURCES:
    tree=json.load(urllib.request.urlopen(f'https://api.github.com/repos/{repo}/git/trees/{commit}?recursive=1'))['tree']
    files=[]
    for f in tree:
        path=f['path']
        if f['type']!='blob':continue
        if path in ['LICENSE','README.md']:
            files.append(path)
        elif folder=='conveyor' and path.startswith('conveyorbelt_gazebo/models/conveyor_belt/'):
            files.append(path)
        elif folder=='warehouse' and any(path.startswith(f'models/aws_robomaker_warehouse_{n}_01/') for n in selected) and not path.endswith(('.DS_Store','.psd')):
            files.append(path)
    def download(path):
        url=f'https://raw.githubusercontent.com/{repo}/{commit}/{path}'
        out=ROOT/folder/path
        out.parent.mkdir(parents=True,exist_ok=True)
        content=urllib.request.urlopen(url).read()
        out.write_bytes(content)
        return dict(path=str(out.relative_to(ROOT)).replace('\\','/'),source=url,bytes=len(content),sha256=hashlib.sha256(content).hexdigest())
    with ThreadPoolExecutor(max_workers=8) as pool:
        entries=list(pool.map(download,files))
    manifest.append(dict(id=folder,repository=f'https://github.com/{repo}',commit=commit,files=entries))
    print(folder,len(entries),'files downloaded',flush=True)
(ROOT/'provenance.json').write_text(json.dumps(manifest,indent=2))

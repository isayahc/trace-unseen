"""Fetch the upstream full SO101, including the jaw omitted by the supplied arm URDF."""
import concurrent.futures
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[2]/'public/robots/so101/upstream'
root.mkdir(parents=True, exist_ok=True)
repo = 'TheRobotStudio/SO-ARM100'
commit = json.load(urllib.request.urlopen(f'https://api.github.com/repos/{repo}/commits/main'))['sha']
base = f'https://raw.githubusercontent.com/{repo}/{commit}/Simulation/SO101/'
xml = urllib.request.urlopen(base+'so101_new_calib.xml').read()
(root/'so101.xml').write_bytes(xml)
files = [m.attrib['file'] for m in ET.fromstring(xml).find('asset').findall('mesh')]
(root/'assets').mkdir(exist_ok=True)
def download(name):
    (root/'assets'/name).write_bytes(urllib.request.urlopen(base+'assets/'+name).read())
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    list(pool.map(download, files))
(root/'provenance.json').write_text(json.dumps({'repository':repo,'commit':commit,'source':base,'files':files},indent=2))
print(f'Downloaded {len(files)} original meshes, commit {commit}')

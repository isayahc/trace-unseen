"""Integration checks: real simulation, expected fault stops, and output evidence."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
for fault, expected in [('inspection-unavailable','inspection unavailable'), ('outfeed-blocked','outfeed blocked')]:
    output = root/'public/simulation'/fault
    run = subprocess.run([sys.executable, str(Path(__file__).with_name('run.py')), '--fault', fault, '--output', str(output)], capture_output=True, text=True, timeout=120)
    report = json.loads((output/'result.json').read_text())
    assert run.returncode == 1 and report['status'] == 'failed', run.stdout + run.stderr
    assert expected in report['error'] and report['warning_count'] == 0, report
    assert not any(e['state']=='complete' for e in report['events'])
    if fault == 'inspection-unavailable':
        assert not any(e['state'] in ['accept','packed'] for e in report['events'])
    else:
        assert len([e for e in report['events'] if e['state']=='packed']) == 4
        assert all(p[0]<9.5 for p in report['final_positions'].values())
    print(f'PASS {fault}: controlled stop, no false completion')

# Autonomous cell — actual MuJoCo execution

From the repository root (Python 3.13 used on Windows):

```powershell
python -m venv .venv-mujoco
.venv-mujoco\Scripts\python.exe -m pip install -r simulation/autonomous-cell/requirements.txt
.venv-mujoco\Scripts\python.exe simulation/autonomous-cell/run.py --video
.venv-mujoco\Scripts\python.exe simulation/autonomous-cell/verify.py
```

Open the app's **Automation spaces** tab for the replay and evidence links.
Omit `--video` for a fast physics-only run. Video rendering requires working OpenGL.
Use `--output <directory>` to retain separate runs. A failing run writes a failed
result and exits 1; only a passing result is presented as completed in the UI.
There is no continuously running physics service: the command executes a complete
batch, exits, and the app plays its recorded output.

## Verified baseline

MuJoCo 3.17.0 executed 135,210 steps (270.42 simulated seconds) with zero solver
warnings. Five cans crossed the infeed boundary; can index 2 was quarantined;
four accepted cans were placed on the pallet and transported from X=8.6 to X=10.6.
The replay contains about 54 seconds at 5× simulation speed.

The controller advances through infeed, observed inspection arrival, accept/reject,
vacuum pickup, transfer, gravity release, supported settling, and loaded outfeed.
Axis moves have bounded durations and observed-position checks. Pickup requires
proximity and carrier contact. Final completion requires can/pallet contact,
low linear/angular velocity, XY containment, quarantine support and pallet arrival.
Every physics step checks finite positions and MuJoCo warnings.

`verify.py` executes two additional actual physics runs with injected *logical*
fault inputs: inspection unavailable and outfeed blocked. Both must stop without
a complete event. The latter checks that four cans remain packed upstream. These
are controller interlock tests, not physical obstruction or camera-failure models.

## Model scope and Forma mapping

`run.py` reads `public/spaces/autonomous/layout.json` to preserve the authored
Forma equipment IDs as `envelope-<id>` visual geoms. It authors a separate MJCF
physics proxy; this is not a native Forma machine-package export or CAD-to-physics
conversion. Existing CAD/ProcessIR artifacts remain conceptual.

- `infeed-axis`: position-actuated carrier shuttle, substituting for a belt.
- `x/y/z`: Cartesian vacuum transfer tool. Ideal attachment weld is enabled only
  after observed proximity/support checks; cans remain free bodies after release.
- `outfeed-axis`: position-actuated pallet; cans travel through contact friction.
- `quarantine-base`: reject receiving platform, not a detailed reject gate/bin.
- Five 14 g rigid cylinders, radius 33 mm and height 116 mm: assumed empty cans.
- Gravity and contact run in MuJoCo. Only upstream insertion writes can poses;
  downstream poses are never overwritten to manufacture completion.
- Other Forma envelopes are visual-only, so this does not certify machine collision
  avoidance. No detailed robot arm, suction/leak model, crushing, actual vision,
  layer forming, separators, replenishment, or jam recovery is implemented.
- The defect verdict is a scripted fixture. Serial single-can handling proves this
  reduced task sequence, not full-layer palletizing or the assumed 60 cans/min rate.

## Evidence

`public/simulation/autonomous/` contains generated `model.xml`, `result.json`,
`telemetry.json` and `replay.mp4`. The report includes the model SHA-256, engine
version, timestamped transitions, final observed positions and limitations.
Telemetry samples actual can/tool/pallet positions every 0.2 simulated seconds.
Fault-run evidence is stored in sibling directories named after each fault.

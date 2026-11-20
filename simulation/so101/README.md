# Live SO-101 factory cell

Run the app, open **Automation spaces**, and press **Run autonomous task**.
The workspace uses the actual articulated SO-101 link assets supplied by the user:
https://github.com/isayahc/NYCRoboGarden/tree/main/assets/robots/so101

This view is a live, interactive 3D client of a local MuJoCo physics process.
There is no video, prerecorded trajectory, browser-owned kinematic animation,
vacuum weld, or can-position rewriting during the task.

## Start

From the repository root:

```powershell
python -m venv .venv-mujoco
.venv-mujoco\Scripts\python.exe -m pip install -r simulation/autonomous-cell/requirements.txt
npm.cmd run dev
```

Open the Vite URL, then **Automation spaces**. The Python process starts on first
access. **Run/Resume**, **Pause**, **Step 100 ms**, and **Reset cell** operate on
the physics process. Leaving the tab pauses it; stopping Vite terminates it.
The workstation supports one shared simulation instance, not concurrent sessions.
The static built frontend alone cannot run Python; use Vite dev or preview with
the local API plugin and virtual environment present.

## What is implemented

- Five articulated arm joints and the sixth-axis moving gripper, with native
  link dimensions, masses, inertias, joint limits and torque-limited actuators.
- Detailed Draco-compressed GLBs for the arm from NYCRoboGarden; the full upstream
  wrist-roll follower and moving-jaw STLs supply the omitted gripper.
- Six free rigid-body 36 mm diameter × 60 mm tall, 14 g aluminum sample cans.
- Sourced IFRA/Cranfield conveyor CAD, AWS RoboMaker warehouse building,
  storage racks, pallet jack, inventory, desk and RealSense D435 CAD.
  The assumed factory footprint is 12 × 8 m. Conveyor width is adapted to
  native SO-101 reach; surrounding warehouse equipment is static context.
- Connected process: powered infeed → scripted inspection → physical finger
  grasp → quarantine or powered outfeed → settled dispatch verification.
- Red can goes to quarantine; the other five go to dispatch. This is
  a **scripted classifier fixture**, not image inference. The camera is visual.
- MuJoCo handles gravity, torque-driven joints, finger contact, friction, release,
  belt/can contacts, and settling. Browser poses come from `mjData`.
- Belts use velocity-actuated sliding collision surfaces. Uniform belt phase
  wraps periodically; product positions are never rewritten. Imported display
  geometry is paired with authored physics proxies and mounting hardware.

The original concave finger meshes produce unusable filled-in convex collision
hulls when passed directly to MuJoCo. The detailed visible meshes remain intact;
two explicitly authored rubber-pad collision proxies model the opposing finger
surfaces. The pad coefficients/servo tuning are simulation assumptions and have
not been calibrated against physical hardware. Other arm parts use the upstream
collision model. This is a physics-backed demonstration, not hardware validation.

## Success checks

Before lifting: both finger pads must actually contact the active can.
After lifting: the free can must rise above the feed surface.
After placement: every processed can must contact its intended tray, remain within
its interior, and settle below the velocity threshold. MuJoCo warning counters
and non-finite states stop the controller. Phase timeouts stop failed moves.

```powershell
.venv-mujoco\Scripts\python.exe simulation/so101/verify.py
.venv-mujoco\Scripts\python.exe simulation/so101/verify_factory.py
```

This runs actual physics and verifies all three placements, pause/resume, reset,
and a negative test: disabling finger contacts must cause grasp failure without
counting any can as sorted. Evidence is written to `data/so101-verification.json`.
The factory verification additionally checks powered transport, dispatch contact,
inspection-unavailable and blocked-outfeed fault stops. Normal factory state is
saved in `data/factory-verification.json`; six cans complete in about 177 simulated seconds.
`diagnose.py` prints transitions; optional `--images` saves debugging screenshots
in the approved local temporary directory. No video is produced.

## Architecture

- `cell.py`: constructs the workcell around the upstream MJCF, solves constrained
  end-effector IK, controls joint targets, and verifies contact-driven outcomes.
- `factory.py` / `factory_scene.py`: connected-line controller, sourced asset
  placements, belt actuators and collision proxies. `Cell` retains the earlier
  tabletop test; the live bridge instantiates `FactoryCell`.
- `web/factoryAssets.ts`: cached Collada loading, units/up-axis handling and
  bottom-center fitting to the explicit scene dimensions.
- `serve.py`: line-delimited JSON bridge with a 500 Hz simulation step, paced in
  20 ms wall-clock batches; state publication approximately 20 Hz. Expensive IK
  can temporarily reduce real-time speed; time shown is simulation time.
- `src/server/so101.ts`: local Vite API/process lifecycle. GET `/api/so101` returns
  the scene descriptor and live state; POST `{ "command": "start" }` (or `pause`,
  `step`, `reset`) controls the same process. Inputs are allowlisted.
- `web/LiveSO101.tsx`: Three.js mesh renderer and controls. MuJoCo body and geom
  transforms are authoritative. STL principal-inertia centering is inverted
  explicitly to keep native mesh coordinates aligned with physics.

## Asset provenance

`public/factory/provenance.json` records pinned IFRA and AWS source revisions,
URLs, file sizes and hashes. `public/factory/camera/provenance.json` records the
RealSense source. Each asset family retains its license. `fetch_factory_assets.py`
downloads the pinned conveyor and warehouse assets. The viewer exposes source
links and Factory floor / Working cell / Gripper / Dispatch camera presets.

`public/robots/so101/` retains the supplied README, Apache-2.0 license, five-joint
URDF, collision meshes and original visual GLBs without geometric modification.
The supplied URDF explicitly removes the moving-jaw joint and child body.

`public/robots/so101/upstream/` adds TheRobotStudio/SO-ARM100's full six-axis
SO101 MJCF and 13 referenced meshes, pinned at
`a758567c3978dfeefe282ede0500085a48fe8f78`.
`provenance.json` records source URLs and filenames. `fetch_assets.py` can refresh
these assets explicitly (it resolves upstream main and records the new commit).
No download occurs when the simulation runs.

`public/draco/` contains Three.js's bundled glTF Draco decoder so mesh loading
works without an external CDN. Earlier Forma artifacts and the earlier simulator
remain in the repository for provenance, but the recorded replay is no longer
part of the workspace UI.

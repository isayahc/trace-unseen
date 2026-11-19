# Two OpenForma process spaces

Open **Automation spaces** in Trace Unseen. This compares the inspection-to-pallet
portion of the aluminum-can process on one assumed 12 × 8 m footprint.

## What was built

| | Human in the loop | Autonomous normal operation |
|---|---|---|
| Inspection | Vision + operator exception review | Vision + automatic quarantine |
| Layer handling | Operator-assisted transfer | Concept gantry / layer gripper |
| Separators | Operator places sheets | Automatic sheet feeder |
| Pallet exchange | Human authorization / handling equipment | Automatic magazine and pallet conveying concept |
| Routine in-cell roles | 2 assumed | 0 assumed |
| Maintenance / replenishment | External personnel | External personnel |

Both cells have the same assumed comparison target of 60 cans/minute. This is
not calculated capacity and the layout is not a reconstruction of an existing
facility. Unknown costs, labor times, electricity per unit and payback remain null.
Actual industrial can production already uses automation; the baseline deliberately
includes vision inspection and powered conveying rather than inventing an all-manual
factory. Fully autonomous life-cycle operation is not claimed.

## Native artifacts in `human/` and `autonomous/`

- `cell.step`, `cell.stl`: real native OCCT multi-solid exports, millimeters.
- `model.py`, `cell.tree.json`: OpenCAD source and feature history.
- `mechanical.json`: OpenForma MechanicalIR with component dimensions/identities.
- `process.json`: OpenForma ProcessIR with directed ports, material streams and
  scenario-specific responsibility descriptions. No invented rate measurements.
- `forma-product.json`: composed native-domain bundle.
- `forma-validation.json`: actual OpenForma schema/reference/topology validation.
- `forma-project.json`: portable local project manifest, artifact sizes and SHA-256s;
  engineering report remains `partial` because performance/physical qualification
  is unresolved, even though schema validation passed.
- `layout.json`: annotated envelope positions, tasks, exceptions and source excerpts.
- `layout-checks.json`: limited authored floor-boundary / reserved-aisle checks.

The browser uses the same box-envelope dimensions as the native CAD source. It is
an interactive static layout viewer, not a dynamics simulation. STEP exports are
multi-body envelope compounds, not detailed vendor machine models. The gantry
bridge is intentionally above the pallet-building envelope. Geometry is not checked
for dynamic reach, grasping, ergonomic suitability or robot swept-volume collisions.

## Forma integration

Used the local checkout of https://github.com/Mapped-Assembly/OpenForma:

1. Created two UUID project workspaces using Forma's `create_project.py`.
2. Authored MechanicalIR and ProcessIR; composed and validated with
   `forma_core.domains.tools.call_domain_tool`.
3. Generated STEP and STL through Forma's `scripts/cad.py build` adapter using
   OpenCAD 0.2.4 and the native OCCT backend; exchange-file validation passed.
4. Ran `forma-oss status --path <workspace>`; both report `Validation: ok`.

The hosted MCP generation request failed without a job ID. These are locally
authored and locally validated projects, not claimed cloud generations. SpaceIR's
external owner was not available through this workflow; the deliverables use
OpenForma's native MechanicalIR and ProcessIR instead.

Local authoring workspaces:
- Human: `C:\Users\isaya\forma-workspace\3626872a-3a8f-46d0-be4b-c4dcf1ee83fa`
- Autonomous: `C:\Users\isaya\forma-workspace\004d6684-afe7-4ab7-872d-88481564948f`

The first workspace also retains `author_spaces.py` and `package_spaces.py`.
The installed OpenCAD wheel lacked kinematics; the checked-out compatible OpenCAD
source was used via process-local `PYTHONPATH`, and Forma's native runtime check
then returned `valid: true, occt: true`.

Example rebuild from the OpenForma checkout (replace paths for another machine):

```powershell
$env:PYTHONPATH='C:\Users\isaya\code_projects\mapped-assembly\OpenCAD\packages\opencad\src'
python .agents/skills/forma-hardware/scripts/cad.py build <workspace>/model.py <workspace>/rebuilt.step --tree-output <workspace>/rebuilt.tree.json
```

## Evidence boundaries

The Aluminum Association's 2021 can LCA, section 3.2.3, supports quality control,
plastic pallets and separator layers. FILTEC describes commercial empty-can vision
inspection. The latter is advertised before filling; using it here is a proposed
integration, not evidence that this exact cell exists. URLs and excerpts are embedded
in each `layout.json`.

Whole-can-manufacturing energy (109 MJ/1,000 cans) and a separate full-line capacity
benchmark (1,800 cans/minute) must not be assigned to this inspection/packing cell.

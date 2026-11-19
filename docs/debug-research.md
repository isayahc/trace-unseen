# Debug a saved research failure

Open this repository folder in VS Code. Select **Debug saved journey — offline replay**
in Run and Debug and press F5. Accept the default run folder to replay the latest
captured chips failure, or enter another `data/runs/<id>` directory.

The debugger pauses before validation. Inspect `parsed.value`, `sources` and
`manifest`. Enable **Uncaught Exceptions** in the Breakpoints panel, then continue
to stop at the failing validation. In `src/research/journey.ts`, inspect `stage.tasks`,
`assessment.task` and `index` for task failures, or `item`, `citation` and `source`
for evidence failures. Step into `validateJourney` to follow the checks in order.

This replay reads the original model answer and sources. It makes no research/API
calls and writes nothing, including on success. Existing failed artifacts stay intact.
The live research profiles make new calls; `finalize-journey.ts` persists results
and is not this read-only debugger.

CLI replay (expected nonzero exit for invalid results):

```powershell
.\node_modules\node\bin\node.exe --inspect --import tsx src/jobs/debug-journey.ts data/runs/2026-11-19T19-58-27-161Z-e2db9139
```

## Chips failures investigated

- `2026-11-19T19-58-27-161Z-e2db9139`: all six automation task labels differ
  from their parent process task strings. For example, the farming assessment names
  "remote crop monitoring, yield forecasting, water-stress detection, and disease
  early warning", while its closest task is "monitor crop stage, pests, disease,
  and irrigation". These are not interchangeable exact references. All saved quote
  checks passed in a separate evidence audit; validation stops first on the task link.
- `2026-11-19T19-51-35-399Z-d4c91fd8`: ten citations fail matching against S4,
  including "Salt, spices and other flavourings are applied while the chips remain
  slightly warm, allowing better adhesion to the chip surface." These are not merely
  whitespace/Markdown differences. A failed quote check cannot establish whether a
  claim is false, only that the captured source does not substantiate that quotation.
- The browser displayed a generic failure because subprocess stderr was discarded
  and jobs did not retain their run ID. New jobs retain that ID and show recognized
  validation errors from their own manifest. Existing job records are unchanged.
- Manifest injection-molding fields were unrelated defaults; the journey prompt uses
  the product. New journey runs leave those task-only fields null and use the product
  as the SDK session title. Source counts now update even on failed validation
  (the captured runs actually contain 12 and 10 sources, respectively).

The agent contract now explicitly requires exact task references. Validation remains
strict: this improves future instructions but does not repair old outputs or guarantee
future model compliance. No new paid research run was made during this investigation.

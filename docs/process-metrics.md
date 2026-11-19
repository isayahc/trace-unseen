# Process-unit resource metrics and automation

Each process declares its own output basis: material ID, positive quantity, unit,
and quality/specification. Examples: 1 kg yarn, 1 m² finished fabric, one cut set,
or one assembled item. There is no global per-hoodie denominator.

Metrics cover material consumption, energy, waste, resource cost, labor, throughput,
and yield. Every observation keeps its numerator unit and explicit output basis,
baseline/proposed scenario, reported/measured/estimate/unknown status, value OR range,
currency where applicable, source period, geography, technology, assumptions,
rationale, and exact source excerpts. Throughput retains its rate unit (kg/hour,
items/hour); output_basis specifies what is counted and is not another divisor.

Known metrics need citations whose visible text matches an extracted source.
Unknown observations have null values, never default zero. Ranges must be ordered;
cost observations require an ISO currency. Denominators must reference process
outputs. Values quoted from benchmarks are not automatically validated as applicable
to a particular brand, factory or process technology; that scope lives in rationale.

Task automation assessments distinguish technical feasibility from economic viability.
Evidence is required for non-unknown conclusions. Each assessment records constraints
and an output basis; the task must belong to that process. Numeric automation scores
and automatic payback estimates are not fabricated.

SQLite appends observations by research-run/process/metric ID in `process_metrics`,
and task assessments in `automation_assessments`. Full records are also included in
the journey and process graph snapshots, so sources and context survive serialization.
Existing snapshots stay unquantified until new research supplies evidence.

The frontend process details show metric values, units, denominators, provenance,
and automation assessments. The research agent is instructed to seek quantitative
benchmarks and preserve missing information. Its search budget remains bounded;
uncovered categories become research gaps rather than invented values.

No cross-process totals or automatic unit/price conversions are computed. Resource
cost excludes unspecified labor/capital overhead. Future calculations must account
for yields, currency/date/location and avoid charging scrap acquisition or purchased
intermediate costs twice. Baseline and proposed scenarios require matching output
specifications and conditions before a defensible comparison can be made.

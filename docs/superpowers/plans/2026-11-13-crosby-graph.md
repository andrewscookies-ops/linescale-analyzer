# Crosby graph adjustments

**Goal:** Implement the six Crosby graph changes in the user's request while preserving the existing workflows, data, report setup, imports, shading, and exports.

**Architecture:** Keep the existing Chart.js graph and Crosby module. Default to fitCrosbyView; retain focus as an explicit action. Snap each marker independently to the nearest timestamp in the loaded recording with ties choosing the earlier sample. Do not store a snap mode or change the view, measurements, or report setup. Preserve fractional input and dragging; show elapsed seconds to millisecond precision, matching parsed CSV precision.

**Files:** crosby-report-v1.js, both equivalent HTML entry points (asset version only), tests/crosby-graph.test.cjs.

**Checks and implementation:**
- [x] Add executable regression cases for full-recording opening, automatic markers, fractional dragging/editing, nearest-sample snap (including missing seconds, ties, reversed/coincident markers, no imports), precision, retained view, ticks/dots, and batch limits. Observe relevant failures first.
- [x] Change Crosby defaults, add and bind the one-shot button, update help text, and remove avoidable precision loss. Keep parsing/report/shading logic intact.
- [x] Run regression tests, inspect the graph in a browser, exercise navigation and exports, review the focused diff independently.
- [ ] Commit the verified changes on the task branch and prepare a reviewable GitHub pull request.

**Review focus:** Missing sample seconds must not be invented; snap must not remain active; marker edits must not change zoom; switching recordings must retain independent settings; zero/coincident/reversed markers must remain valid.

**Decision:** The detailed request defines the behavior; no new product design decision is required. Use a fresh local checkout and task branch. Main and the live deployment remain untouched until the change is reviewed.

## Verification

- All 18 dependency-free regression checks pass (`node tests/crosby-graph.test.cjs`). Executed through the available Node runtime; this computer has no standalone `node` on its shell PATH.
- The initial 16 checks produced 12 expected failures against the original source and all passed after implementation. Review identified a decimal midpoint tie; its additional test failed before the tolerance correction and passed afterward.
- Browser verification: example opens at 0–35 seconds with original markers 10/24; edits 10.125/24.147 display 14.022 s; snap restores 10/24; dragging remains fractional. Focus, pan, wheel zoom, reset, second labels, dots, shading, and workflow switching were exercised.
- Browser Word/PDF downloads succeeded with test data. Editable Word text/comments and the embedded graph were checked; PDF contains the graph image.
- Export check found the existing cdnjs jsPDF 2.5.2 URL returned HTTP 404. Changed only its source to jsDelivr, keeping version 2.5.2 (HTTP 200), and repeated PDF export successfully. Word dependency and report construction are unchanged.
- The two HTML entry points remain identical; only their Crosby asset cache token changed. LineScale code and shading assets are unchanged.

- Follow-up batch import fix: browser reproduced selecting three files but importing only one because resetting the picker empties its live FileList during the first asynchronous read. Snapshot the selection before reading. New regression failed with 1 != 3, then all 18 checks passed; browser now imports all three selected CSVs.

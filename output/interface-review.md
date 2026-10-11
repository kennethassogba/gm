# GM interface review

2026-10-12

## Coverage

Accessibility, layout, typography, writing, colors and UI surfaces reviewed across the library, editor, lattice layout, dialogs, imports and exports. Skills: better-interface and avoid-ai-writing.

## Fixed

- Hidden geometry canvases caused by an invalid CSS attribute selector.
- The former 2D sketch behind the 3D control replaced with GPU rendering.
- Editor constrained to the viewport with scroll inside the hierarchy and properties.
- Live CSG updates in all four views; undo handles an active numeric edit.
- Separate shared-universe and occurrence edits with copied IDs and surfaces.
- Lattice positions moved to the central workspace with targets of at least 24 px.
- Functional type at least 12 px, visible focus styles, named icon buttons and native dialogs.
- Product prose removed; sources kept in model metadata and technical documentation.
- Generic link preview and requested product / LinkedIn links.
- No em dashes or en dashes in project copy. No design detector ignores retained.

## Evidence

- All 13 examples opened in the browser, GPU canvas rendered, no console errors or warnings.
- At 1280 × 720, document height and width match the viewport.
- Radius edits changed the rendered pixels in 3D, XY, XZ and YZ.
- Occurrence edit created one universe and four cells; undo restored the original structure.
- Hexagonal geometry.xml and materials.xml imported through the application file picker.
- OpenMC 0.15.3 Python API parsed and re-exported all 13 examples, with matching cell queries on 1040 points.

## Limits of this review

- The browser viewport override did not change the IAB surface; mobile styles received source review only.
- No screen reader session or transport calculation was run.
- Complex Boolean 3D surfaces use an approximate mesh; sections and exports preserve CSG regions.

# Construction

## OpenMC model

A surface divides space into positive and negative half-spaces. A region combines them with intersection, union and complement. A cell gives a region a material, void, universe or lattice fill. Universes are reusable definitions; only definitions reachable from the root are exported.

The editor keeps this structure as model data. Creating a shape creates surfaces and a cell region. Combining cells rewrites the region of cell A. The result replaces A and B, except subtraction can keep B as a separately filled region. Undo retains the original operands.

A pin is a universe of concentric radial cells. A placement bounds that universe. A lattice repeats universes using OpenMC's row and ring ordering. A core repeats assembly universes. All 13 library recipes use these same construction operations.

Moving a material cell copies and translates its region surfaces. Moving a filled cell also translates its fill. Shared edits change a universe definition. Editing one lattice occurrence first clones its containing universe path.

## Browser agent API

`window.gmStudio.construct(operation, spec)` edits the local document. WebMCP exposes `geometry_construct` with the same arguments. The stateless endpoint exposes `geometry.construct` and additionally requires an explicit `model` document. `geometry.empty` starts a document there.

| Operation | Spec |
| --- | --- |
| `cell` | `type`: `box`, `sphere`, `cylinder`, `hexprism` or `region`; `name`, `material`, `target`, `position: [x,y,z]`; dimensions below |
| `pin` | `name`, `pitch`, `height`, `coolant`, `layers: [{name,radius,material}]` |
| `lattice` | `name`, `type`: `rectangular` or `hexagonal`, `fill`, `pitch`, `height`, `columns`, `rows`, `levels`, `rings`, `outerMaterial` |
| `universe` | `name`, `material` |
| `place` | `fill`, `target`, `position`, optional `replace` cell ID |
| `combine` | `a`, `b`, `operation`: `union`, `intersection` or `difference`, `name`, `material`, `keepTool` |
| `move` | `id`, `position: [x,y,z]` |
| `duplicate` | `ids`, `offset: [x,y,z]` |
| `delete` | `ids` |
| `group` | `ids`, `name` |

All dimensions are in cm. Box dimensions use `size: [x,y,z]`; sphere uses `radius`; cylinder uses `radius`, `height`, `axis`; hexagonal prism uses `width` across flats and `height`. Region uses an OpenMC `region` expression with existing surface IDs. `material: null` means void. Components are placed by default; `place: false` creates a reusable definition only. Rectangular lattices accept `pitchY` and axial `levels`. Hexagonal lattices accept `orientation: "x"` or `"y"`.

## Geometry fidelity

XML and Python exports retain the analytical surfaces and Boolean regions. Section queries evaluate those regions directly. Display meshes are approximations generated from the same regions in a worker. Pin detail crops display bounds only. It does not change exported pin height.

The UI check samples an 18 x 18 x 18 grid in the focused universe. It can identify overlaps and unfilled regions at those points, but cannot establish that an entire model is free of geometry errors. Check the exported model with OpenMC before running transport. No transport, cross-section library or physics validation is bundled.

## DAGMC

DAGMC models use a watertight faceted CAD boundary representation, typically in an `.h5m` file. Building one requires imprint/merge, volume and material tags, meshing and mesh checks. OpenMC can fill a CSG cell with a `DAGMCUniverse`; an STL preview alone would not supply that workflow. This release does not import or generate DAGMC files.

## References

- [OpenMC geometry guide](https://docs.openmc.org/en/stable/usersguide/geometry.html)
- [OpenMC geometry XML](https://docs.openmc.org/en/stable/io_formats/geometry.html)
- [OpenMC Cell transformations](https://docs.openmc.org/en/stable/pythonapi/generated/openmc.Cell.html)
- [OpenMC DAGMCUniverse](https://docs.openmc.org/en/stable/pythonapi/generated/openmc.DAGMCUniverse.html)
- [DAGMC CAD preparation](https://svalinn.github.io/DAGMC/usersguide/cubit_workflow.html)
- [DAGMC with OpenMC](https://svalinn.github.io/DAGMC/usersguide/codes/openmc.html)

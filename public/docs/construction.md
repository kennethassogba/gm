# Construction

## OpenMC model

A surface divides space into positive and negative half-spaces. A region combines them with intersection, union and complement. A cell gives a region a material, void, universe or lattice fill. Universes are reusable definitions; only definitions reachable from the root are exported.

The editor keeps this structure as model data. Creating a shape creates surfaces and a cell region. Combining cells rewrites the region of cell A. The result replaces A and B, except subtraction can keep B as a separately filled region. Undo retains the original operands.

A pin is a universe of concentric radial cells. A placement bounds that universe. A lattice repeats universes using OpenMC's row and ring ordering. A core repeats assembly universes. All 21 library recipes use these same construction operations.

Moving a material cell copies and translates its region surfaces. Moving a filled cell also translates its fill. Shared edits change a universe definition. Editing one lattice occurrence first clones its containing universe path.

## Browser agent API

`window.gmStudio.construct(operation, spec)` edits the local document. WebMCP exposes `geometry_construct` with the same arguments. The stateless endpoint exposes `geometry.construct` and additionally requires an explicit `model` document. `geometry.empty` starts a document there.

| Operation | Spec |
| --- | --- |
| `cell` | `type`: `box`, `sphere`, `shell`, `cylinder`, `tube`, `hexprism` or `region`; `name`, `material`, `target`, `position: [x,y,z]`; dimensions below |
| `pin` | `name`, `pitch`, `height`, `coolant`, `layers: [{name,radius,material}]` |
| `lattice` | `name`, `type`: `rectangular` or `hexagonal`, `fill`, `pitch`, `height`, `columns`, `rows`, `levels`, `rings`, `outerMaterial` |
| `universe` | `name`, `material` |
| `place` | `fill`, `target`, `position`, optional `replace` cell ID |
| `combine` | `a`, `b`, `operation`: `union`, `intersection` or `difference`, `name`, `material`, `keepTool` |
| `move` | `id`, `position: [x,y,z]` |
| `duplicate` | `ids`, `offset: [x,y,z]` |
| `delete` | `ids` |
| `group` | `ids`, `name` |

All dimensions are in cm. Box dimensions use `size: [x,y,z]`; sphere uses `radius`; cylinder uses `radius`, `height`, `axis`; tube and spherical shell also use `innerRadius`; hexagonal prism uses `width` across flats and `height`. Region uses an OpenMC `region` expression with existing surface IDs. `material: null` means void. Components are placed by default; `place: false` creates a reusable definition only. Rectangular lattices accept `pitchY` and axial `levels`. Hexagonal lattices accept `orientation: "x"` or `"y"`.

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


## General CSG workflow

The library opens on general geometry. Reactor components, architectures and benchmarks remain available in separate categories. Solids create material or void cells in the current universe. The managed background is the complement of those cells inside the model boundary.

- **Edit dimensions** redefines a primitive cell. It does not replay earlier Boolean operations. Raw surface edits or a Boolean operation switch that cell to general CSG editing.
- **Rotate** applies active X, then Y, then Z rotations about the chosen pivot. Surface coefficients change in the canonical model. Oblique cylinders become OpenMC quadrics; conservative bounding planes retain finite rendering bounds. Universe-fill rotation is not supported.
- **Array** makes independent translated copies of selected cells. Counts include the original. A lattice remains the option for repeated shared universe definitions.
- **Tube** and **Spherical shell** use inner and outer analytical surfaces. Their interior is filled by the background unless another cell occupies it.

Agent operations use the same engine: `edit` takes a primitive `id` and dimensions; `rotate` takes `ids`, `angles` and `pivot`; `array` takes `ids`, `counts` and `spacing`. Angles are in degrees; positions and spacing are in cm. Arrays are limited to 500 output cells per operation.

## General examples and sources

The eight new examples are GM teaching geometries, version 1. Their dimensions and simplified material compositions are illustrative, not benchmark specifications. They do not include sources, settings or tallies, and no shielding performance, detector response or criticality result is claimed.

| Example | Editable construction |
| --- | --- |
| Drilled block | Box, cylinder, subtraction |
| Pipe junction | Two outer cylinders, union, two bores, union, subtraction |
| Spherical shell | Concentric spherical surfaces |
| Layered shield | Lead, polyethylene and steel slabs |
| Shield with duct | Concrete block, rotated cylindrical cut |
| Collimator | Tungsten block with three cylindrical cuts |
| Detector housing | Hollow aluminium housing and germanium crystal |
| Reflected sphere | Fuel sphere and graphite shell |

Product direction was informed by OpenMC's [neutron/photon transport modes](https://docs.openmc.org/en/stable/), its [CSG geometry guide](https://docs.openmc.org/en/stable/usersguide/geometry.html), and forum discussions about [source-detector geometry and unfilled space](https://openmc.discourse.group/t/fixed-source-transport-simulation-error/1258) and [detector construction](https://openmc.discourse.group/t/surface-dose-calculation/3709). These discussions identify user workflows; their posted models are not treated as validated reference cases. Rotation conventions follow [OpenMC Surface.rotate](https://docs.openmc.org/en/stable/pythonapi/generated/openmc.Surface.html), with coefficients exported as [Quadric](https://docs.openmc.org/en/stable/pythonapi/generated/openmc.Quadric.html) where needed.

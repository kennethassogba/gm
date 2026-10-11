export const BENCHMARKS = [
  {
    id: "beavrs", family: "benchmarks", name: "BEAVRS",
    subtitle: "Two-cycle full-core PWR depletion benchmark",
    source: "MIT Computational Reactor Physics Group",
    version: "BEAVRS specification 2.0.2",
    href: "https://github.com/mit-crpg/BEAVRS",
    sourceNote: "Public benchmark repository and specification. The archive is not bundled here.",
    simplification: "No BEAVRS core is loaded by this starter. Use the linked specification and source files to build or import a model."
  },
  {
    id: "c5g7-2d", family: "benchmarks", name: "C5G7 · 2D",
    subtitle: "UO₂ and MOX assembly benchmark",
    source: "OECD Nuclear Energy Agency",
    version: "NEA/NSC/DOC(2003)16 · 2003",
    href: "https://www.oecd-nea.org/science/wprs/eg3drtb/",
    sourceNote: "Original C5G7 MOX benchmark specification, published by OECD/NEA.",
    simplification: "Reference only in this release. No assembly map, multigroup material set or reference result is bundled."
  },
  {
    id: "c5g7-3d", family: "benchmarks", name: "C5G7 · 3D extension",
    subtitle: "3D MOX fuel assembly extension",
    source: "OECD Nuclear Energy Agency",
    version: "NEA/NSC/DOC(2005)16 · 2005",
    href: "https://www.oecd-nea.org/jcms/pl_13946/benchmark-on-deterministic-transport-calculations-without-spatial-homogenisation",
    sourceNote: "OECD/NEA 3D extension report, including configurations with control-rod insertions.",
    simplification: "Reference only in this release. Axial zones, control rods and benchmark results are not implemented."
  },
  {
    id: "takeda", family: "benchmarks", name: "Takeda",
    subtitle: "3D transport benchmarks with void regions",
    source: "OECD Nuclear Energy Agency",
    version: "NEA/NSC/DOC(2000)4 · 2000",
    href: "https://www.oecd-nea.org/jcms/pl_17440/3-d-radiation-transport-benchmarks-for-simple-geometries-with-void-region",
    sourceNote: "Report includes the Takeda benchmark family, first organised under NEACRP-L-330 (1991).",
    simplification: "Reference only in this release. No model variant or transport result is bundled."
  }
];

export const STARTERS = [
  { id: "pin", family: "components", name: "Fuel pin", subtitle: "Fuel, gap, cladding and moderator", status: "Editable starter", kind: "editable", glyph: "◉", modelType: "pin", note: "Parametric concentric-cylinder example. Dimensions and material recipes are illustrative; they are not tied to a benchmark." },
  { id: "pwr17", family: "components", name: "PWR 17 × 17", subtitle: "Repeated pin universe in a rectangular lattice", status: "Schematic lattice", kind: "editable", glyph: "▦", modelType: "pwr17", note: "17 × 17 display grid with shared pin universe. The guide and instrument positions are schematic, not a licensed assembly specification." },
  { id: "bwr9", family: "components", name: "BWR assembly", subtitle: "Rectangular lattice starter", status: "Schematic lattice", kind: "editable", glyph: "▦", modelType: "bwr9", note: "Simplified lattice illustration. Water rods, channel box, enrichment zones and operating details are not modeled." },
  { id: "hex19", family: "components", name: "Hexagonal lattice", subtitle: "19 positions · shared pin universe", status: "Editable starter", kind: "editable", glyph: "⬡", modelType: "hex19", note: "Small hexagonal repetition example. It is a geometry exercise, not a reactor or benchmark input." },
  ...BENCHMARKS.map((entry) => ({ ...entry, status: "Source reference", kind: "reference", glyph: entry.id.startsWith("c5g7") ? "▤" : "◎" })),
  { id: "pwr-core", family: "architectures", name: "PWR", subtitle: "Generic pressurised-water layout", status: "Illustrative", kind: "generic", glyph: "◉", modelType: "pwr-core", note: "Generic core outline only. Not a reactor design, safety analysis model or benchmark." },
  { id: "bwr-core", family: "architectures", name: "BWR", subtitle: "Generic boiling-water layout", status: "Illustrative", kind: "generic", glyph: "◉", modelType: "bwr-core", note: "Generic core outline only. Not a reactor design, safety analysis model or benchmark." },
  { id: "candu", family: "architectures", name: "CANDU", subtitle: "Generic pressure-tube layout", status: "Illustrative", kind: "generic", glyph: "◉", modelType: "candu", note: "Generic pressure-tube layout, shown as a spacing exercise. Not a reactor design or analysis model." },
  { id: "fast-hex", family: "architectures", name: "Fast reactor · hexagonal", subtitle: "Generic hexagonal core layout", status: "Illustrative", kind: "generic", glyph: "⬡", modelType: "fast-hex", note: "Generic hexagonal layout. Fuel, blanket, reflector and control zoning are not specified." },
  { id: "htgr", family: "architectures", name: "HTGR", subtitle: "Generic graphite-block layout", status: "Illustrative", glyph: "▦", kind: "generic", modelType: "htgr", note: "Generic block lattice illustration. Fuel compact construction, burnable poisons and graphite grades are not specified." }
];

function surface(id, name, type, params, role = "") {
  return { id, name, type, params, role, visible: true };
}

export function createEmptyModel(name = "Untitled geometry") {
  return {
    schema: "gm-openmc-model/v1",
    id: crypto.randomUUID?.() ?? `gm-${Date.now()}`,
    name,
    kind: "empty",
    units: "cm",
    metadata: { source: "Created in GM Studio", status: "editable", exportable: false, notes: "Empty CSG model. Add surfaces, cells and materials before export." },
    surfaces: [],
    cells: [],
    materials: [],
    universes: [{ id: 0, name: "Root", cells: [] }],
    lattices: [],
    selection: { kind: null, id: null, surfaceIds: [] },
    view: "3d",
    cutaway: true,
    exploded: false,
    colorBy: "material",
    rotation: -0.42,
    zoom: 1
  };
}

export function createPinModel(name = "Fuel pin · starter") {
  const model = createEmptyModel(name);
  model.kind = "pin";
  model.metadata.exportable = true;
  model.metadata.notes = "Parametric concentric-cylinder example. Dimensions and material recipes are illustrative and have not been validated against OpenMC.";
  model.metadata.status = "illustrative";
  model.dimensions = { fuelRadius: 0.410, gapRadius: 0.418, cladRadius: 0.475, pitch: 1.260, height: 30.0 };
  model.surfaces = [
    surface(10, "Pellet outer radius", "z-cylinder", { x0: 0, y0: 0, r: model.dimensions.fuelRadius }, "fuel"),
    surface(11, "Gap outer radius", "z-cylinder", { x0: 0, y0: 0, r: model.dimensions.gapRadius }, "gap"),
    surface(12, "Cladding outer radius", "z-cylinder", { x0: 0, y0: 0, r: model.dimensions.cladRadius }, "clad"),
    surface(20, "Pin box · west", "x-plane", { x0: -model.dimensions.pitch / 2 }, "boundary"),
    surface(21, "Pin box · east", "x-plane", { x0: model.dimensions.pitch / 2 }, "boundary"),
    surface(22, "Pin box · south", "y-plane", { y0: -model.dimensions.pitch / 2 }, "boundary"),
    surface(23, "Pin box · north", "y-plane", { y0: model.dimensions.pitch / 2 }, "boundary"),
    surface(30, "Bottom face", "z-plane", { z0: -model.dimensions.height / 2 }, "boundary"),
    surface(31, "Top face", "z-plane", { z0: model.dimensions.height / 2 }, "boundary")
  ];
  model.materials = [
    { id: 1, name: "UO₂ · example", color: "#f29a55", density: 10.4, densityUnits: "g/cm3", nuclides: [{ name: "U235", fraction: 0.04, basis: "ao" }, { name: "U238", fraction: 0.96, basis: "ao" }, { name: "O16", fraction: 2.0, basis: "ao" }], note: "Example atom fractions. Enrichment and density are editable; this is not a benchmark material." },
    { id: 2, name: "Helium · example", color: "#dfe7e3", density: 0.0016, densityUnits: "g/cm3", nuclides: [{ name: "He4", fraction: 1, basis: "ao" }], note: "Illustrative gap material." },
    { id: 3, name: "Zirconium alloy · example", color: "#60c2ca", density: 6.55, densityUnits: "g/cm3", nuclides: [{ name: "Zr90", fraction: 1, basis: "ao" }], note: "Single-isotope placeholder for a zirconium alloy; replace with the intended alloy composition." },
    { id: 4, name: "Light water · example", color: "#557f9b", density: 0.997, densityUnits: "g/cm3", nuclides: [{ name: "H1", fraction: 2, basis: "ao" }, { name: "O16", fraction: 1, basis: "ao" }], note: "Illustrative moderator recipe." }
  ];
  model.cells = [
    { id: 1, name: "Fuel pellet", universe: 0, material: 1, materialKey: "fuel", region: "-10", role: "fuel", surfaceIds: [10] },
    { id: 2, name: "Helium gap", universe: 0, material: 2, materialKey: "gap", region: "10 -11", role: "gap", surfaceIds: [10, 11] },
    { id: 3, name: "Cladding", universe: 0, material: 3, materialKey: "clad", region: "11 -12", role: "clad", surfaceIds: [11, 12] },
    { id: 4, name: "Moderator", universe: 0, material: 4, materialKey: "water", region: "12 20 -21 22 -23 30 -31", role: "water", surfaceIds: [12, 20, 21, 22, 23, 30, 31] }
  ];
  model.universes = [{ id: 0, name: "Root", cells: [1, 2, 3, 4] }, { id: 1, name: "Fuel pin", cells: [1, 2, 3, 4] }];
  model.selection = { kind: "cell", id: 1, surfaceIds: [] };
  return model;
}

export function createLatticeModel(template) {
  const { width, height, name, pitch, fuelCount, kind, note } = template;
  const model = createPinModel(`${name} · starter`);
  model.kind = "lattice";
  model.metadata.notes = note;
  model.metadata.status = "schematic";
  model.dimensions.pitch = pitch;
  for (const item of model.surfaces) {
    if (item.type === "x-plane" && item.name.startsWith("Pin box")) item.params.x0 = item.name.endsWith("west") ? -pitch / 2 : pitch / 2;
    if (item.type === "y-plane" && item.name.startsWith("Pin box")) item.params.y0 = item.name.endsWith("south") ? -pitch / 2 : pitch / 2;
  }
  const lower = -width * pitch / 2;
  const halfHeight = model.dimensions.height / 2;
  model.surfaces.push(
    surface(40, "Assembly west", "x-plane", { x0: lower }, "boundary"),
    surface(41, "Assembly east", "x-plane", { x0: -lower }, "boundary"),
    surface(42, "Assembly south", "y-plane", { y0: lower }, "boundary"),
    surface(43, "Assembly north", "y-plane", { y0: -lower }, "boundary"),
    surface(44, "Assembly bottom", "z-plane", { z0: -halfHeight }, "boundary"),
    surface(45, "Assembly top", "z-plane", { z0: halfHeight }, "boundary")
  );
  model.cells.forEach((cell) => { cell.universe = 1; });
  model.cells.push({ id: 5, name: "Guide / water position", universe: 2, material: 4, materialKey: "water", region: "20 -21 22 -23 30 -31", role: "water", surfaceIds: [20, 21, 22, 23, 30, 31] });
  model.cells.push({ id: 6, name: "Assembly boundary", universe: 0, material: null, fill: 20, region: "40 -41 42 -43 44 -45", role: "lattice", surfaceIds: [40, 41, 42, 43, 44, 45] });
  model.universes = [
    { id: 0, name: "Root", cells: [6] },
    { id: 1, name: "Fuel pin", cells: [1, 2, 3, 4] },
    { id: 2, name: "Guide / water", cells: [5] }
  ];
  model.lattices = [{ id: 20, name: `${name} lattice`, type: "rectangular", dimension: [width, height], pitch: [pitch, pitch], lowerLeft: [lower, lower], outer: 2, cells: [] }];
  const total = width * height;
  const map = Array.from({ length: total }, (_, index) => ({
    x: index % width,
    y: Math.floor(index / width),
    universe: index < fuelCount ? 1 : 2,
    role: index < fuelCount ? "fuel" : "guide",
    material: index < fuelCount ? "fuel" : "water"
  }));
  if (kind === "bwr") {
    const center = Math.floor(width / 2);
    map.forEach((entry) => {
      const dx = Math.abs(entry.x - center), dy = Math.abs(entry.y - Math.floor(height / 2));
      if ((dx === 0 && dy === 0) || (dx === 1 && dy === 0) || (dx === 0 && dy === 1)) entry.role = "water";
      if (entry.role === "water") entry.universe = 2;
    });
  }
  model.lattices[0].cells = map;
  model.lattices[0].sharedUniverse = 1;
  model.lattices[0].instanceEdit = "shared";
  model.lattices[0].universes = map.map((entry) => entry.universe);
  model.selection = { kind: "lattice", id: 20, surfaceIds: [] };
  model.dimensions.pitch = pitch;
  return model;
}

export function createHexModel() {
  const model = createPinModel("Hexagonal lattice · starter");
  model.kind = "hex";
  model.metadata.exportable = false;
  model.metadata.notes = "19-position hexagonal lattice example with a shared pin universe. The pattern is for geometry editing practice, not a benchmark.";
  model.metadata.status = "illustrative";
  const cells = [{ q: 0, r: 0, role: "fuel" }];
  const directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const [dq, dr] of directions) cells.push({ q: dq, r: dr, role: "fuel" });
  for (let i = 0; i < directions.length; i++) {
    let q = -directions[i][0], r = -directions[i][1];
    for (let step = 0; step < 2; step++) {
      cells.push({ q, r, role: (q === 0 && r === 0) ? "water" : "fuel" });
      q += directions[(i + 1) % 6][0];
      r += directions[(i + 1) % 6][1];
    }
  }
  model.lattices = [{ id: 20, name: "Hexagonal lattice", type: "hexagonal", rings: 3, pitch: [1.26], cells, sharedUniverse: 1, instanceEdit: "shared" }];
  model.selection = { kind: "lattice", id: 20, surfaceIds: [] };
  return model;
}

export function createArchitectureModel(template) {
  const model = createEmptyModel(`${template.name} · generic layout`);
  model.kind = "architecture";
  model.metadata = { source: "Generated schematic", status: "illustrative", notes: template.note };
  model.metadata.exportable = false;
  const radius = template.modelType === "candu" ? 0.22 : 0.37;
  const n = template.modelType === "fast-hex" ? 4 : 7;
  model.dimensions = { radius, pitch: 1.18, height: 2.0, fuelRadius: radius, gapRadius: radius, cladRadius: radius };
  model.surfaces = [surface(10, "Core envelope radius", "z-cylinder", { x0: 0, y0: 0, r: 5.0 }, "boundary")];
  const color = template.modelType === "fast-hex" ? "#c57945" : "#508fa2";
  model.materials = [{ id: 1, name: "Generic fuel region", color, density: 0, densityUnits: "g/cm3", nuclides: [], note: "No composition assigned." }];
  const cells = [];
  let id = 1;
  for (let row = -n; row <= n; row++) {
    for (let col = -n; col <= n; col++) {
      if (Math.hypot(row, col) <= n + 0.2) cells.push({ id: id++, name: `Region ${id - 1}`, universe: 0, material: 1, materialKey: "fuel", region: "-10", role: "fuel", x: col, y: row, surfaceIds: [10] });
    }
  }
  model.cells = cells;
  model.universes = [{ id: 0, name: "Generic core outline", cells: cells.map((cell) => cell.id) }];
  model.lattices = [{ id: 20, name: `${template.name} schematic`, type: template.modelType === "fast-hex" ? "hexagonal" : "rectangular", dimension: [n * 2 + 1, n * 2 + 1], pitch: [1.18, 1.18], cells: cells.map((cell) => ({ x: cell.x, y: cell.y, universe: 1, role: "fuel", material: "fuel" })), sharedUniverse: 1, instanceEdit: "shared" }];
  model.selection = { kind: "lattice", id: 20, surfaceIds: [] };
  return model;
}

export function createModelForTemplate(templateId) {
  const item = STARTERS.find((entry) => entry.id === templateId);
  if (!item || item.kind === "reference") return null;
  if (item.modelType === "pin") return createPinModel(`${item.name} · starter`);
  if (item.modelType === "pwr17") return createLatticeModel({ width: 17, height: 17, name: item.name, pitch: 1.26, fuelCount: 264, kind: "pwr", note: item.note });
  if (item.modelType === "bwr9") return createLatticeModel({ width: 9, height: 9, name: item.name, pitch: 1.6, fuelCount: 72, kind: "bwr", note: item.note });
  if (item.modelType === "hex19") return createHexModel();
  return createArchitectureModel(item);
}

export function validateModel(model) {
  const issues = [];
  const surfaceList = model.surfaces.map((item) => String(item.id));
  const surfaceIds = new Set(surfaceList);
  const materialIds = new Set(model.materials.map((item) => String(item.id)));
  const cellIds = new Set();
  for (const cell of model.cells) {
    if (cellIds.has(String(cell.id))) issues.push(`Cell ID ${cell.id} is used more than once.`);
    cellIds.add(String(cell.id));
    if (cell.material != null && !materialIds.has(String(cell.material))) issues.push(`Cell “${cell.name}” refers to missing material ${cell.material}.`);
    const refs = [...String(cell.region ?? "").matchAll(/[+-]?\d+/g)].map((match) => match[0].replace(/^[+-]/, ""));
    for (const ref of refs) if (!surfaceIds.has(ref)) issues.push(`Cell “${cell.name}” refers to missing surface ${ref}.`);
  }
  for (const surfaceId of new Set(surfaceList.filter((id, index) => surfaceList.indexOf(id) !== index))) issues.push(`Surface ID ${surfaceId} is used more than once.`);
  if (model.surfaces.length && !model.cells.length) issues.push("Add a cell that uses one or more surfaces.");
  if (model.cells.length && !model.universes.length) issues.push("Add a root universe to contain the cells.");
  const universeIds = new Set((model.universes ?? []).map((universe) => String(universe.id)));
  for (const cell of model.cells) if (!universeIds.has(String(cell.universe ?? 0))) issues.push(`Cell “${cell.name}” refers to missing universe ${cell.universe ?? 0}.`);
  for (const lattice of model.lattices ?? []) {
    if (lattice.type === "rectangular") {
      const expected = Number(lattice.dimension?.[0] ?? 0) * Number(lattice.dimension?.[1] ?? 0);
      const actual = (lattice.universes ?? lattice.cells?.map((item) => item.universe) ?? []).length;
      if (!expected || actual !== expected) issues.push(`Lattice “${lattice.name}” needs ${expected} universe entries; found ${actual}.`);
      const missing = [...new Set((lattice.universes ?? lattice.cells?.map((item) => item.universe) ?? []).filter((id) => !universeIds.has(String(id))))];
      if (missing.length) issues.push(`Lattice “${lattice.name}” refers to missing universe${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`);
    }
  }
  return issues;
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function exportGeometryXML(model) {
  if (!model.metadata?.exportable) throw new Error("This schematic or empty model is not ready for OpenMC XML export. Export the GM model JSON to keep editing it.");
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<geometry>'];
  for (const item of model.surfaces) {
    let coeffs = [];
    if (item.type === "z-cylinder") coeffs = [item.params.x0 ?? 0, item.params.y0 ?? 0, item.params.r ?? 0];
    if (item.type === "x-plane") coeffs = [item.params.x0 ?? 0];
    if (item.type === "y-plane") coeffs = [item.params.y0 ?? 0];
    if (item.type === "z-plane") coeffs = [item.params.z0 ?? 0];
    if (item.type === "sphere") coeffs = [item.params.x0 ?? 0, item.params.y0 ?? 0, item.params.z0 ?? 0, item.params.r ?? 1];
    const boundary = item.role === "outer-boundary" ? ' boundary="vacuum"' : "";
    lines.push(`  <surface id="${Number(item.id)}" name="${xmlEscape(item.name)}" type="${xmlEscape(item.type)}"${boundary} coeffs="${coeffs.map(Number).join(" ")}" />`);
  }
  for (const cell of model.cells) {
    const fill = cell.fill != null ? ` fill="${Number(cell.fill)}"` : "";
    const material = cell.material == null ? (fill ? "" : ' material="void"') : ` material="${Number(cell.material)}"`;
    const region = cell.region ? ` region="${xmlEscape(cell.region)}"` : "";
    lines.push(`  <cell id="${Number(cell.id)}" name="${xmlEscape(cell.name)}" universe="${Number(cell.universe ?? 0)}"${material}${fill}${region} />`);
  }
  for (const lattice of model.lattices ?? []) {
    if (lattice.displayOnly) continue;
    if (lattice.type === "rectangular") {
      const values = lattice.universes ?? lattice.cells.map((item) => item.universe);
      const width = lattice.dimension[0];
      const rows = [];
      for (let row = 0; row < lattice.dimension[1]; row++) rows.push(`      ${values.slice(row * width, (row + 1) * width).join(" ")}`);
      lines.push(`  <lattice id="${Number(lattice.id)}" name="${xmlEscape(lattice.name)}" dimension="${lattice.dimension.map(Number).join(" ")}" outer="${Number(lattice.outer)}">`);
      lines.push(`    <lower_left>${lattice.lowerLeft.map(Number).join(" ")}</lower_left>`, `    <pitch>${lattice.pitch.map(Number).join(" ")}</pitch>`, "    <universes>", ...rows, "    </universes>", "  </lattice>");
    } else if (lattice.type === "hexagonal") {
      throw new Error("Hexagonal XML export is not enabled in this preview. Export the GM model JSON to preserve its lattice layout.");
    }
  }
  lines.push("</geometry>", "");
  return lines.join("\n");
}

export function exportMaterialsXML(model) {
  if (!model.metadata?.exportable) throw new Error("This model is a schematic or empty starter. Export the GM model JSON to keep editing it.");
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<materials>'];
  for (const material of model.materials) {
    lines.push(`  <material id="${Number(material.id)}" name="${xmlEscape(material.name)}">`);
    if (Number(material.density) > 0) lines.push(`    <density value="${Number(material.density)}" units="${xmlEscape(material.densityUnits || "g/cm3")}" />`);
    for (const nuclide of material.nuclides ?? []) lines.push(`    <nuclide name="${xmlEscape(nuclide.name)}" ${nuclide.basis === "wo" ? "wo" : "ao"}="${Number(nuclide.fraction)}" />`);
    lines.push("  </material>");
  }
  lines.push("</materials>", "");
  return lines.join("\n");
}

function pyString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function exportPython(model) {
  const rows = [
    "# Generated by GM Studio. Review the geometry and material recipes before use.",
    "# This starter has not been run against an installed OpenMC release.",
    "import openmc",
    "",
    "materials = openmc.Materials.from_xml('materials.xml')",
    "geometry = openmc.Geometry.from_xml('geometry.xml', materials=materials)",
    "",
    "# OpenMC reads the exported CSG and lattice definitions from the XML files.",
    "# Add settings and tallies for the calculation you intend to run.",
    "geometry.export_to_xml(path='geometry.xml')",
    "materials.export_to_xml(path='materials.xml')",
    ""
  ];
  return rows.join("\n");
}

export function importGeometryXML(text) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The XML document could not be parsed.");
  const root = document.querySelector("geometry");
  if (!root) throw new Error("Choose an OpenMC geometry.xml file.");
  const model = createEmptyModel("Imported geometry");
  const supportedTypes = new Set(["z-cylinder", "x-plane", "y-plane", "z-plane", "sphere"]);
  model.surfaces = [...root.querySelectorAll(":scope > surface")].map((node) => {
    const id = Number(node.getAttribute("id"));
    const type = node.getAttribute("type") || "unknown";
    const c = (node.getAttribute("coeffs") || "").trim().split(/\s+/).map(Number);
    if (!supportedTypes.has(type)) model.metadata.unsupportedSurfaceTypes = [...(model.metadata.unsupportedSurfaceTypes || []), type];
    let params = {};
    if (type === "z-cylinder") params = { x0: c[0] || 0, y0: c[1] || 0, r: c[2] || 0 };
    if (type === "x-plane") params = { x0: c[0] || 0 };
    if (type === "y-plane") params = { y0: c[0] || 0 };
    if (type === "z-plane") params = { z0: c[0] || 0 };
    if (type === "sphere") params = { x0: c[0] || 0, y0: c[1] || 0, z0: c[2] || 0, r: c[3] || 1 };
    return surface(id, node.getAttribute("name") || `${type} ${id}`, type, params);
  });
  model.cells = [...root.querySelectorAll(":scope > cell")].map((node) => ({
    id: Number(node.getAttribute("id")), name: node.getAttribute("name") || `Cell ${node.getAttribute("id")}`,
    universe: Number(node.getAttribute("universe") || 0), material: node.getAttribute("material") === "void" ? null : Number(node.getAttribute("material")),
    fill: node.getAttribute("fill"), region: node.getAttribute("region") || "", role: "imported",
    surfaceIds: [...(node.getAttribute("region") || "").matchAll(/[+-]?\d+/g)].map((match) => Number(match[0].replace(/^[+-]/, "")))
  }));
  model.kind = "imported";
  model.metadata = { ...model.metadata, status: "imported subset", notes: "Imported XML. This editor renders a subset of OpenMC surface types and region features. The source file remains untouched until you export a new file." };
  const universeIds = [...new Set(model.cells.map((cell) => cell.universe))];
  model.universes = universeIds.map((id) => ({ id, name: id === 0 ? "Root" : `Universe ${id}`, cells: model.cells.filter((cell) => cell.universe === id).map((cell) => cell.id) }));
  model.selection = model.cells.length ? { kind: "cell", id: model.cells[0].id, surfaceIds: [] } : { kind: null, id: null, surfaceIds: [] };
  if (model.metadata.unsupportedSurfaceTypes?.length) model.metadata.notes += ` Unsupported surface types: ${[...new Set(model.metadata.unsupportedSurfaceTypes)].join(", ")}.`;
  return model;
}

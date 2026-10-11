import {
  BENCHMARKS,
  STARTERS,
  createEmptyModel,
  createModelForTemplate,
  exportGeometryXML,
  exportMaterialsXML,
  exportPython,
  focusBeavrsModel,
  importGeometryXML,
  validateModel
} from "/model.js";

const STORAGE_KEY = "gm.studio.model.v1";
const state = { page: "library", model: null, undo: [], redo: [], filter: "all", transaction: null, toastTimer: 0, resizeObserver: null };
const byId = (id) => document.getElementById(id);
const clone = (value) => structuredClone(value);
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const palette = ["#d47a47", "#548e9a", "#7c78a4", "#8a9b63", "#c17c92", "#777f89"];

function toast(message) {
  const node = byId("toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { node.hidden = true; }, 3300);
}

function setSaveState(label, saved = true) {
  const node = byId("save-state");
  node.lastElementChild.textContent = label;
  node.querySelector(".save-dot").style.background = saved ? "#27805d" : "#ad5427";
  byId("model-save-text").textContent = saved ? "Saved locally" : "Unsaved change";
}

function saveLocal() {
  if (!state.model) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.model));
    setSaveState("Saved on this device", true);
    byId("open-last-button").hidden = false;
  } catch {
    setSaveState("Local save unavailable", false);
    toast("This browser could not save the model. Export a copy before closing this tab.");
  }
}

function updateHistoryButtons() {
  byId("undo-button").disabled = state.undo.length === 0;
  byId("redo-button").disabled = state.redo.length === 0;
}

function pushUndo(snapshot = state.model) {
  if (!snapshot) return;
  state.undo.push(clone(snapshot));
  if (state.undo.length > 60) state.undo.shift();
  state.redo = [];
  updateHistoryButtons();
}

function mutate(change, options = {}) {
  if (!state.model) return;
  if (options.record !== false && !state.transaction) pushUndo();
  change(state.model);
  saveLocal();
  if (options.render !== false && !state.transaction) renderStudio();
  updateHistoryButtons();
  window.dispatchEvent(new CustomEvent("gm:modelchange", { detail: { model: clone(state.model) } }));
}

function undo() {
  if (!state.model || !state.undo.length) return;
  state.redo.push(clone(state.model));
  state.model = state.undo.pop();
  saveLocal(); render(); updateHistoryButtons(); toast("Last change undone.");
}

function redo() {
  if (!state.model || !state.redo.length) return;
  state.undo.push(clone(state.model));
  state.model = state.redo.pop();
  saveLocal(); render(); updateHistoryButtons(); toast("Change restored.");
}

function setPage(page) {
  state.page = page;
  byId("library-screen").hidden = page !== "library";
  byId("studio-screen").hidden = page !== "studio";
  byId("crumb-current").textContent = page === "library" ? "Model library" : "Geometry editor";
  document.title = page === "library" ? "GM Studio · OpenMC geometry" : `${state.model?.name || "Geometry editor"} · GM Studio`;
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.page === page;
    button.classList.toggle("is-active", active);
    if (button.dataset.page === "studio") button.disabled = !state.model;
    if (button.dataset.page === "library") button.setAttribute("aria-current", active ? "page" : "false");
  });
  byId("export-button").disabled = !state.model;
  byId("export-workspace-button").disabled = !state.model;
  render();
  requestAnimationFrame(() => byId(page === "library" ? "library-title" : "model-title").focus({ preventScroll: true }));
  if (page === "studio") requestAnimationFrame(resizeCanvas);
}

function openModel(model) {
  if (!model) return;
  state.model = model;
  state.undo = []; state.redo = []; state.transaction = null;
  saveLocal();
  setPage("studio");
}

function templateCard(item) {
  const category = item.family === "components" ? "Component" : item.family === "benchmarks" ? "Benchmark" : "Architecture";
  const statusClass = item.kind === "editable" ? "editable" : item.kind === "reference" ? "reference" : "";
  const artClass = item.id === "hex19" || item.id === "fast-hex" ? "hex" : item.kind === "reference" ? "benchmark" : item.kind === "generic" ? "generic" : "";
  const info = item.kind === "reference" ? `<button type="button" data-notes="${esc(item.id)}">View source & limits <span aria-hidden="true">↗</span></button>` : `<button type="button" data-open="${esc(item.id)}">${item.id === "beavrs" ? "Open 2D slice" : item.kind === "generic" ? "Open schematic" : "Open starter"} <span aria-hidden="true">→</span></button>`;
  return `<article class="template-card" data-family="${esc(item.family)}">
    <div class="card-top"><span class="card-art ${artClass}" aria-hidden="true">${esc(item.glyph)}</span><span class="status-pill ${statusClass}">${esc(item.status)}</span></div>
    <h3>${esc(item.name)}</h3><p>${esc(item.subtitle)}</p>
    <div class="card-footer"><span>${category}</span>${info}</div>
  </article>`;
}

function renderLibrary() {
  const list = [...STARTERS].filter((entry) => state.filter === "all" || entry.family === state.filter);
  byId("template-grid").innerHTML = list.map(templateCard).join("");
  document.querySelectorAll(".filter-chip").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    byId("open-last-button").hidden = !saved;
  } catch { byId("open-last-button").hidden = true; }
}

function allTreeItems() {
  if (!state.model) return [];
  const model = state.model;
  const rows = [];
  for (const universe of model.universes ?? []) {
    rows.push({ kind: "universe", id: universe.id, name: universe.name, level: 0 });
    const cells = model.cells.filter((cell) => cell.universe === universe.id);
    for (const cell of cells) rows.push({ kind: "cell", id: cell.id, name: cell.name, level: 1, role: cell.role });
  }
  if (model.lattices?.length) for (const lattice of model.lattices) rows.push({ kind: "lattice", id: lattice.id, name: lattice.name, level: 0 });
  if (model.surfaces.length) {
    rows.push({ kind: "group", id: "surfaces", name: `Surfaces · ${model.surfaces.length}`, level: 0 });
    for (const item of model.surfaces) rows.push({ kind: "surface", id: item.id, name: item.name, level: 1, role: item.role });
  }
  return rows;
}

function renderTree() {
  const model = state.model;
  if (!model) return;
  const selected = model.selection ?? { kind: null, id: null, surfaceIds: [] };
  byId("tree-list").innerHTML = allTreeItems().map((item) => {
    if (item.kind === "group") return `<div class="tree-item group-label" role="presentation">${esc(item.name)}</div>`;
    const selectedItem = selected.kind === item.kind && String(selected.id) === String(item.id);
    const multiSelected = item.kind === "surface" && selected.surfaceIds?.includes(Number(item.id));
    const icon = item.kind === "universe" ? "◌" : item.kind === "lattice" ? "▦" : item.kind === "surface" ? "⌒" : "◈";
    return `<button class="tree-item level-${Math.min(item.level, 2)}${selectedItem || multiSelected ? " is-selected" : ""}" role="treeitem" aria-level="${item.level + 1}" aria-selected="${selectedItem || multiSelected}" data-kind="${item.kind}" data-id="${esc(item.id)}" title="${esc(item.name)}"><span class="tree-chevron" aria-hidden="true">${item.kind === "universe" ? "▾" : ""}</span><span class="tree-symbol" aria-hidden="true">${icon}</span><span class="tree-item-name">${esc(item.name)}</span><span class="tree-id">${item.kind === "cell" ? `C${esc(item.id)}` : item.kind === "surface" ? `S${esc(item.id)}` : item.kind === "universe" ? `U${esc(item.id)}` : ""}</span></button>`;
  }).join("");
  byId("material-list").innerHTML = model.materials.map((material) => `<div class="material-row" title="${esc(material.name)}"><span class="material-swatch" style="background:${esc(material.color || "#89969c")}"></span><span>${esc(material.name)}</span></div>`).join("") || `<span class="material-row">No materials yet</span>`;
  byId("status-count").textContent = `${model.cells.length} cells · ${model.materials.length} materials`;
}

function currentLattice() {
  const model = state.model;
  if (!model?.lattices?.length) return null;
  if (Object.hasOwn(model, "activeLatticeId")) return model.lattices.find((item) => Number(item.id) === Number(model.activeLatticeId)) ?? null;
  return model.lattices[0];
}
function getCell(id) { return state.model?.cells.find((cell) => String(cell.id) === String(id)); }
function getSurface(id) { return state.model?.surfaces.find((surface) => String(surface.id) === String(id)); }
function currentOccurrenceDimensions() {
  const model = state.model;
  const lattice = currentLattice();
  if (!model || !lattice || lattice.instanceEdit !== "occurrence" || !model.activeOccurrence) return model?.dimensions ?? {};
  const key = `${model.activeOccurrence.x},${model.activeOccurrence.y}`;
  return { ...model.dimensions, ...(lattice.overrides?.[key] ?? {}) };
}
function dimSurfaceId(key) { return ({ fuelRadius: 10, gapRadius: 11, cladRadius: 12 })[key]; }
function surfaceForDimension(key) { return getSurface(dimSurfaceId(key)); }
function dimValue(key) {
  const local = currentOccurrenceDimensions();
  if (key in local) return Number(local[key]);
  const surface = surfaceForDimension(key);
  return surface?.params?.r ?? surface?.params?.x0 ?? 0;
}
function updateLatticePitch(model, value) {
  const lattice = model.lattices?.find((item) => Number(item.id) === Number(model.activeLatticeId)) ?? model.lattices?.[0];
  if (!lattice) return;
  const pitch = Number(value);
  lattice.pitch = lattice.pitch.map(() => pitch);
  const [width, height] = lattice.dimension ?? [0, 0];
  lattice.lowerLeft = [-width * pitch / 2, -height * pitch / 2];
  if (model.kind === "beavrs" && lattice.display === "core") {
    model.dimensions.assemblyPitch = pitch;
    model.dimensions.corePitch = pitch;
    for (const surface of model.surfaces) {
      if (surface.id === 40) surface.params.x0 = -width * pitch / 2;
      if (surface.id === 41) surface.params.x0 = width * pitch / 2;
      if (surface.id === 42) surface.params.y0 = -height * pitch / 2;
      if (surface.id === 43) surface.params.y0 = height * pitch / 2;
    }
    return;
  }
  model.dimensions.pitch = pitch;
  if (model.kind === "beavrs") return;
  for (const surface of model.surfaces) {
    if (surface.name === "Pin box · west") surface.params.x0 = -pitch / 2;
    if (surface.name === "Pin box · east") surface.params.x0 = pitch / 2;
    if (surface.name === "Pin box · south") surface.params.y0 = -pitch / 2;
    if (surface.name === "Pin box · north") surface.params.y0 = pitch / 2;
    if (surface.name === "Assembly west") surface.params.x0 = -width * pitch / 2;
    if (surface.name === "Assembly east") surface.params.x0 = width * pitch / 2;
    if (surface.name === "Assembly south") surface.params.y0 = -height * pitch / 2;
    if (surface.name === "Assembly north") surface.params.y0 = height * pitch / 2;
  }
}
function setDimension(key, value, { record = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  mutate((model) => {
    const lattice = model.lattices?.[0];
    if (lattice?.instanceEdit === "occurrence" && model.activeOccurrence) {
      const occurrenceKey = `${model.activeOccurrence.x},${model.activeOccurrence.y}`;
      lattice.overrides ??= {};
      lattice.overrides[occurrenceKey] ??= {};
      lattice.overrides[occurrenceKey][key] = n;
    } else {
      model.dimensions ??= {};
      model.dimensions[key] = n;
      const surfaceId = dimSurfaceId(key);
      const surface = model.surfaces.find((item) => Number(item.id) === surfaceId);
      if (surface) surface.params.r = n;
      if (key === "pitch") {
        const pitchSurfaces = model.surfaces.filter((item) => String(item.name).startsWith("Pin box"));
        const coords = [-n / 2, n / 2];
        let i = 0;
        for (const surface of pitchSurfaces) {
          if (surface.type === "x-plane") surface.params.x0 = coords[i++ % 2];
          if (surface.type === "y-plane") surface.params.y0 = coords[i++ % 2];
        }
        updateLatticePitch(model, n);
      }
    }
  }, { record, render: record });
  if (!record) drawCanvas();
}
function setLatticePitch(value, { record = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  mutate((model) => updateLatticePitch(model, n), { record, render: record });
  if (!record) drawCanvas();
}

function rangeRow(key, title, min, max, step, unit = "cm") {
  const value = dimValue(key);
  const shown = value.toFixed(3);
  const shared = currentLattice()?.instanceEdit !== "occurrence";
  return `<div class="dimension-control"><label for="dim-${key}"><span>${esc(title)}</span><span>${shared ? "Shared" : "This cell"}</span></label><div class="range-line"><input type="range" id="dim-${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(title)}" /><output for="dim-${key}">${shown} ${unit}</output></div></div>`;
}

function selectedCellSurfaceIds(cell) {
  if (!cell) return [];
  if (cell.role === "fuel") return [10];
  if (cell.role === "gap") return [11];
  if (cell.role === "clad") return [12];
  return cell.surfaceIds ?? [];
}

function renderCellInspector(cell) {
  const sourceSurfaces = selectedCellSurfaceIds(cell).map(getSurface).filter(Boolean);
  const radiusKey = cell.role === "fuel" ? "fuelRadius" : cell.role === "gap" ? "gapRadius" : cell.role === "clad" ? "cladRadius" : null;
  const label = cell.role === "fuel" ? "Fuel radius" : cell.role === "gap" ? "Gap radius" : cell.role === "clad" ? "Cladding radius" : "Boundary";
  const dimControl = radiusKey ? rangeRow(radiusKey, label, 0.25, 0.62, 0.001) : cell.role === "water" && state.model.kind !== "beavrs" ? rangeRow("pitch", "Pin pitch", 0.8, 2.2, 0.005) : "";
  const regions = `<div class="property-block"><div class="property-label"><span>Region</span><small>OpenMC half-spaces</small></div><div class="formula">${esc(cell.region || "whole universe")}</div><div class="metadata-note">Shift-select two surfaces in the tree to combine their regions with a Boolean operation.</div></div>`;
  const lattice = currentLattice();
  const occurrenceEditor = state.model.kind === "beavrs"
    ? `<div class="property-block"><div class="property-label"><span>Repeated pin</span><small>shared universe U2</small></div><div class="metadata-note">Radius edits update the shared pin in this representative layout. Editing one pin occurrence is not available in this slice.</div></div>`
    : lattice ? `<div class="property-block"><div class="property-label"><span>Repeated universe</span><small>${lattice.instanceEdit === "occurrence" ? "one position" : "shared definition"}</small></div><div class="shared-edit"><label><input type="radio" name="instance-scope" value="shared" ${lattice.instanceEdit !== "occurrence" ? "checked" : ""} /> Edit shared universe</label><label><input type="radio" name="instance-scope" value="occurrence" ${lattice.instanceEdit === "occurrence" ? "checked" : ""} ${modelOccurrenceReady() ? "" : "disabled"} /> Edit selected occurrence</label></div><div class="metadata-note">${modelOccurrenceReady() ? `Selected position: ${state.model.activeOccurrence?.x ?? "—"}, ${state.model.activeOccurrence?.y ?? "—"}.` : "Select a pin in the lattice view to edit one occurrence."}</div></div>` : "";
  return `<div class="property-block"><label class="property-label" for="cell-name"><span>Name</span><small>cell ${esc(cell.id)}</small></label><div class="property-field"><input id="cell-name" value="${esc(cell.name)}" aria-label="Cell name" /></div></div>
    <div class="property-block"><label class="property-label" for="cell-material"><span>Material</span><small>${esc(cell.materialKey || "CSG")}</small></label><div class="property-field"><select id="cell-material" aria-label="Cell material"><option value="" ${cell.material == null ? "selected" : ""}>Void</option>${state.model.materials.map((m) => `<option value="${Number(m.id)}" ${Number(m.id) === Number(cell.material) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></div></div>
    <div class="property-block"><div class="property-label"><span>Dimensions</span><span class="unit-switch" role="group" aria-label="Length unit"><button type="button" class="is-active" data-units="cm" aria-pressed="true">cm</button><button type="button" data-units="mm" aria-pressed="false">mm</button></span></div><div class="dimension-list">${dimControl || `<span class="material-row">No parametric dimension is linked to this cell.</span>`}</div>${sourceSurfaces.length ? `<div class="metadata-note">Bound by ${sourceSurfaces.map((item) => esc(item.name)).join(", ")}.</div>` : ""}</div>
    ${regions}${occurrenceEditor}<button type="button" class="delete-item" data-delete-cell="${Number(cell.id)}">Delete cell <span aria-hidden="true">⌫</span></button>`;
}

function modelOccurrenceReady() { return Boolean(state.model?.activeOccurrence); }

function renderSurfaceInspector(surface) {
  const isRadius = Number.isFinite(surface.params.r);
  const main = isRadius
    ? `<div class="dimension-control"><label for="surface-radius"><span>Radius</span><span>cm</span></label><div class="range-line"><input type="range" id="surface-radius" min="0.01" max="2.5" step="0.001" value="${surface.params.r}" aria-label="Surface radius" /><output for="surface-radius">${Number(surface.params.r).toFixed(3)} cm</output></div></div>`
    : Object.entries(surface.params).map(([key, value]) => `<label class="property-label" for="surface-${esc(key)}"><span>${esc(key)}</span><small>cm</small></label><div class="property-field"><input id="surface-${esc(key)}" data-param="${esc(key)}" type="number" step="0.001" value="${Number(value)}" aria-label="${esc(surface.name)} ${esc(key)}" /><span class="unit">cm</span></div>`).join("");
  const selectedIds = state.model.selection?.surfaceIds ?? [];
  const canBoolean = selectedIds.length >= 2;
  const target = state.model.cells.find((cell) => cell.role !== "water") ?? state.model.cells[0];
  return `<div class="property-block"><label class="property-label" for="surface-name"><span>Name</span><small>surface ${esc(surface.id)}</small></label><div class="property-field"><input id="surface-name" value="${esc(surface.name)}" aria-label="Surface name" /></div></div>
    <div class="property-block"><div class="property-label"><span>${esc(surface.type)}</span><small>cm</small></div><div class="dimension-list">${main}</div></div>
    <div class="property-block"><div class="property-label"><span>Boolean region</span><small>${canBoolean ? `${selectedIds.length} surfaces` : "Select 2 surfaces"}</small></div><div class="boolean-tools"><button data-boolean="union" ${canBoolean ? "" : "disabled"}>Union ∪</button><button data-boolean="intersection" ${canBoolean ? "" : "disabled"}>Intersect ∩</button><button data-boolean="difference" ${canBoolean ? "" : "disabled"}>Subtract −</button></div><div class="metadata-note">${target ? `Apply to “${esc(target.name)}”.` : "Add a cell before combining surfaces."} Hold Shift while selecting surfaces in the tree.</div></div>
    <button type="button" class="delete-item" data-delete-surface="${Number(surface.id)}">Delete surface <span aria-hidden="true">⌫</span></button>`;
}

function renderLatticeInspector(lattice) {
  const pitchLabel = state.model.kind === "beavrs" && lattice.display === "core" ? "Assembly pitch" : state.model.kind === "beavrs" ? "Fuel-pin pitch" : "Pitch";
  const minPitch = state.model.kind === "beavrs" && lattice.display === "core" ? 20 : 0.4;
  const maxPitch = state.model.kind === "beavrs" && lattice.display === "core" ? 23 : state.model.kind === "beavrs" ? 1.5 : 2.5;
  const pitchStep = state.model.kind === "beavrs" ? 0.0001 : 0.01;
  const sharedNote = state.model.kind === "beavrs" ? "This lattice is a shared OpenMC universe. Changes to its pitch apply to all matching positions." : "Repeated cells point to universe definitions. Editing U1 updates each position that uses it.";
  return `<div class="property-block"><div class="property-label"><span>Layout</span><small>${esc(lattice.type)}</small></div><div class="dimension-list"><div class="dimension-control"><label><span>Positions</span><span>${lattice.cells.length}</span></label></div><div class="dimension-control"><label for="lattice-pitch"><span>${pitchLabel}</span><span>cm</span></label><div class="range-line"><input type="range" id="lattice-pitch" min="${minPitch}" max="${maxPitch}" step="${pitchStep}" value="${Number(lattice.pitch[0])}" aria-label="${pitchLabel}" /><output for="lattice-pitch">${Number(lattice.pitch[0]).toFixed(4)} cm</output></div></div></div></div>
    <div class="property-block"><div class="property-label"><span>Editing scope</span><small>${lattice.instanceEdit === "occurrence" ? "single occurrence" : "shared universe"}</small></div><div class="shared-edit"><label><input type="radio" name="lattice-scope" value="shared" ${lattice.instanceEdit !== "occurrence" ? "checked" : ""} /> Edit shared universe</label><label><input type="radio" name="lattice-scope" value="occurrence" ${lattice.instanceEdit === "occurrence" ? "checked" : ""} ${modelOccurrenceReady() ? "" : "disabled"} /> Edit selected occurrence</label></div><div class="metadata-note">${modelOccurrenceReady() ? `Position ${state.model.activeOccurrence.x + 1}, ${state.model.activeOccurrence.y + 1}.` : "Select a position in the view to set a single occurrence."}</div></div>
    <div class="property-block"><div class="property-label"><span>Fill universes</span><small>reused</small></div><div class="formula">${esc([...new Set(lattice.universes ?? lattice.cells.map((cell) => cell.universe))].map((id) => `U${id}`).join("  ·  "))}</div><div class="metadata-note">${sharedNote}</div></div>`;
}

function renderInspector() {
  const model = state.model;
  const selection = model?.selection;
  const title = byId("inspector-title");
  const content = byId("inspector-content");
  if (!model || !selection?.kind) {
    title.textContent = "No selection";
    content.innerHTML = `<div class="inspector-placeholder"><span class="placeholder-ring">◎</span><p>Select an item in the tree or view to edit its dimensions.</p></div>`;
    return;
  }
  if (selection.kind === "cell") {
    const cell = getCell(selection.id);
    title.textContent = cell?.name ?? "Cell";
    content.innerHTML = cell ? renderCellInspector(cell) : `<div class="inspector-placeholder"><p>Cell not found.</p></div>`;
  } else if (selection.kind === "surface") {
    const surface = getSurface(selection.id);
    title.textContent = surface?.name ?? "Surface";
    content.innerHTML = surface ? renderSurfaceInspector(surface) : `<div class="inspector-placeholder"><p>Surface not found.</p></div>`;
  } else if (selection.kind === "lattice") {
    const lattice = model.lattices.find((item) => Number(item.id) === Number(selection.id)) ?? model.lattices[0];
    title.textContent = lattice?.name ?? "Lattice";
    content.innerHTML = lattice ? renderLatticeInspector(lattice) : `<div class="inspector-placeholder"><p>Choose a lattice in the tree.</p></div>`;
  } else if (selection.kind === "universe") {
    const universe = model.universes.find((item) => Number(item.id) === Number(selection.id));
    title.textContent = universe?.name ?? "Universe";
    content.innerHTML = `<div class="property-block"><div class="property-label"><span>Universe ID</span><small>U${Number(universe?.id ?? 0)}</small></div><div class="formula">${universe?.cells.length ?? 0} cells · ${universe?.cells.map((id) => `C${id}`).join(", ") ?? ""}</div></div>${currentLattice() ? `<div class="property-block"><div class="property-label"><span>Shared definition</span><small>repeated instances</small></div><div class="metadata-note">Choose “Edit shared universe” to apply a dimension change to every cell that fills this universe.</div></div>` : ""}`;
  }
}

function renderStudio() {
  const model = state.model;
  if (!model) return;
  byId("model-title").textContent = model.name;
  const statusLabel = model.metadata?.status === "benchmark-slice" ? "Source-based 2D slice · simplified" : model.metadata?.status === "illustrative" ? "Illustrative geometry" : model.metadata?.status === "schematic" ? "Schematic lattice" : model.metadata?.status === "imported subset" ? "Imported XML subset" : model.kind === "empty" ? "Empty CSG model" : "Starter CSG subset";
  byId("model-subtitle").textContent = `${statusLabel} · cm`;
  const occurrenceNote = byId("occurrence-note");
  occurrenceNote.hidden = !model.lattices?.length;
  occurrenceNote.innerHTML = model.kind === "beavrs"
    ? `<span class="note-icon" aria-hidden="true">⌘</span><span>One representative 17 × 17 layout stands in for the core entries. Fuel-pin edits change shared universe U2; per-occurrence edits are unavailable.</span>`
    : `<span class="note-icon" aria-hidden="true">⌘</span><span>Choose a repeated universe to edit the shared definition or this occurrence.</span>`;
  byId("render-status").textContent = model.metadata?.status === "benchmark-slice" ? "BEAVRS source slice · OpenMC not run" : model.metadata?.status === "illustrative" ? "Illustrative preview" : model.metadata?.status === "schematic" ? "Schematic preview" : "Model preview";
  byId("canvas-empty").hidden = Boolean(model.surfaces.length);
  renderTree(); renderInspector(); drawCanvas(); updateHistoryButtons();
  const current = document.querySelector(`.view-tab[data-view="${CSS.escape(model.view || "3d")}"]`);
  document.querySelectorAll(".view-tab").forEach((button) => {
    const active = button === current;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  byId("cutaway-button").setAttribute("aria-pressed", String(Boolean(model.cutaway)));
  byId("explode-button").setAttribute("aria-pressed", String(Boolean(model.exploded)));
  byId("measure-button").setAttribute("aria-pressed", String(Boolean(model.measureMode)));
  byId("axis-label").textContent = model.view === "3d" ? "3D SKETCH / ORBIT" : `${model.view.toUpperCase()} / SECTION`;
  const lattice = currentLattice();
  byId("bounds-label").textContent = lattice ? `${lattice.dimension?.join(" × ") ?? lattice.cells.length} · ${Number(lattice.pitch[0]).toFixed(2)} cm pitch` : `PIN CELL · ${Number(model.dimensions?.pitch ?? 1).toFixed(2)} cm`;
  const focusedAssembly = model.kind === "beavrs" && model.activeLatticeId === 21 ? model.focusPath?.assembly : null;
  byId("selection-status").textContent = model.activeOccurrence
    ? `Position ${model.activeOccurrence.x + 1}, ${model.activeOccurrence.y + 1}`
    : focusedAssembly
      ? `Map entry ${focusedAssembly.position}`
      : model.selection?.kind === "cell"
        ? getCell(model.selection.id)?.name ?? "Cell selected"
        : model.selection?.kind === "surface"
          ? getSurface(model.selection.id)?.name ?? "Surface selected"
          : "Select a cell or surface";
  byId("zoom-label").textContent = `${Math.round((model.zoom || 1) * 100)}%`;
  byId("pointer-coordinates").textContent = model.lastPoint ?? "x 0.000 · y 0.000 cm";
  renderFocusPath();
  const firstCell = model.cells[0];
  if (!firstCell && !model.surfaces.length) byId("canvas-empty").hidden = false;
}

function renderFocusPath() {
  const path = byId("focus-path");
  const model = state.model;
  if (!path) return;
  if (model?.kind !== "beavrs") { path.hidden = true; path.innerHTML = ""; return; }
  path.hidden = false;
  const assembly = model.focusPath?.assembly;
  const pin = model.focusPath?.pin;
  const coreStep = `<button type="button" class="path-step" data-focus-step="core" ${model.activeLatticeId === 20 ? 'aria-current="step"' : ""}>Core · 19 × 19</button>`;
  const assemblyStep = assembly ? `<span class="path-separator" aria-hidden="true">/</span><button type="button" class="path-step" data-focus-step="assembly" ${model.activeLatticeId === 21 ? 'aria-current="step"' : ""}>Map entry ${esc(assembly.position)}</button>` : "";
  const pinStep = pin ? `<span class="path-separator" aria-hidden="true">/</span><span class="path-current">Fuel pin · ${pin.x + 1}, ${pin.y + 1}</span>` : "";
  path.innerHTML = `${coreStep}${assemblyStep}${pinStep}<span class="path-hint">Representative layout · shared pins</span>`;
}

function render() {
  renderLibrary();
  if (state.page === "studio") renderStudio();
  updateHistoryButtons();
}

function canvasSize() {
  const canvas = byId("geometry-canvas");
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  return { width: rect.width, height: rect.height, dpr };
}

function gridBackground(ctx, width, height, dpr) {
  ctx.fillStyle = "#14232c"; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(107,139,149,.12)"; ctx.lineWidth = 1;
  const spacing = 28;
  for (let x = 0; x < width; x += spacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.strokeStyle = "rgba(144,175,183,.35)";
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(width / 2, height * .19); ctx.lineTo(width / 2, height * .82); ctx.stroke();
  ctx.setLineDash([]);
}

function drawSurfaceRing(ctx, cx, cy, radius, color, line = false) {
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  if (line) { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); }
}

function activeRole() {
  if (state.model?.selection?.kind === "cell") return getCell(state.model.selection.id)?.role;
  if (state.model?.selection?.kind === "surface") return getSurface(state.model.selection.id)?.role;
  return "";
}

function drawPinXY(ctx, width, height, dpr, dimensions) {
  const cx = width / 2, cy = height / 2 + 8;
  const span = Math.min(width * .59, height * .64) * Number(state.model.zoom || 1);
  const unit = span / (Number(dimensions.pitch || 1.26));
  const outer = Number(dimensions.cladRadius || .475) * unit;
  const gap = Number(dimensions.gapRadius || .418) * unit;
  const fuel = Number(dimensions.fuelRadius || .410) * unit;
  ctx.fillStyle = "#213842"; ctx.fillRect(cx - span / 2, cy - span / 2, span, span);
  ctx.strokeStyle = "#6b8b95"; ctx.lineWidth = 1; ctx.strokeRect(cx - span / 2, cy - span / 2, span, span);
  ctx.strokeStyle = "rgba(202,222,223,.23)"; ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.moveTo(cx, cy - span / 2 - 16); ctx.lineTo(cx, cy + span / 2 + 16); ctx.stroke(); ctx.setLineDash([]);
  drawSurfaceRing(ctx, cx, cy, outer, "#438b95");
  drawSurfaceRing(ctx, cx, cy, outer, "#9ddfe0", true);
  drawSurfaceRing(ctx, cx, cy, gap, "#e2e9e5");
  drawSurfaceRing(ctx, cx, cy, fuel, "#ec9959");
  drawSurfaceRing(ctx, cx, cy, fuel, "#ffd29c", true);
  if (state.model.cutaway) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + outer * 1.02, cy - outer * .1); ctx.strokeStyle = "#f5d3ac"; ctx.lineWidth = 1.2; ctx.stroke();
  }
  const role = activeRole();
  if (role === "fuel") drawSurfaceRing(ctx, cx, cy, fuel + 4, "#fff1db", true);
  else if (role === "clad") drawSurfaceRing(ctx, cx, cy, outer + 4, "#fff1db", true);
  else if (role === "gap") drawSurfaceRing(ctx, cx, cy, (fuel + gap) / 2, "#ffffff", true);
  drawAxes(ctx, cx, cy, span);
  ctx.fillStyle = "#d4e1e4"; ctx.font = "12px ui-monospace, SFMono-Regular, monospace"; ctx.textAlign = "center";
  ctx.fillText(`r ${Number(dimensions.cladRadius || .475).toFixed(3)} cm`, cx, cy + outer + 26);
}

function drawAxes(ctx, cx, cy, size) {
  const a = Math.max(35, size * .43);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#78a9b0"; ctx.beginPath(); ctx.moveTo(cx - a, cy); ctx.lineTo(cx + a, cy); ctx.stroke();
  ctx.strokeStyle = "#ba9473"; ctx.beginPath(); ctx.moveTo(cx, cy - a); ctx.lineTo(cx, cy + a); ctx.stroke();
  ctx.font = "12px ui-monospace, SFMono-Regular, monospace"; ctx.textAlign = "left";
  ctx.fillStyle = "#9bcbd0"; ctx.fillText("x", cx + a + 5, cy + 3); ctx.fillStyle = "#d7ad89"; ctx.fillText("y", cx + 4, cy - a - 5);
}

function drawPinSide(ctx, width, height, dimensions, axis) {
  const cx = width / 2, cy = height / 2;
  const span = Math.min(width * .66, height * .67) * Number(state.model.zoom || 1);
  const pitch = Number(dimensions.pitch || 1.26), scale = span / pitch;
  const clad = Number(dimensions.cladRadius || .475) * scale;
  const gap = Number(dimensions.gapRadius || .418) * scale;
  const fuel = Number(dimensions.fuelRadius || .410) * scale;
  const axialHeight = Math.min(span * .72, 230);
  const x0 = cx - span / 2, y0 = cy - axialHeight / 2;
  ctx.fillStyle = "#233d47"; ctx.fillRect(x0, y0, span, axialHeight);
  ctx.strokeStyle = "#b2cbd0"; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, span, axialHeight);
  ctx.fillStyle = "#478893"; ctx.fillRect(cx - clad, y0, clad * 2, axialHeight);
  ctx.fillStyle = "#e3e9e5"; ctx.fillRect(cx - gap, y0, gap * 2, axialHeight);
  ctx.fillStyle = "#ef9a57"; ctx.fillRect(cx - fuel, y0, fuel * 2, axialHeight);
  ctx.strokeStyle = "rgba(255,240,220,.68)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - span / 2 - 16, cy); ctx.lineTo(cx + span / 2 + 16, cy); ctx.stroke();
  ctx.setLineDash([4, 5]); ctx.strokeStyle = "rgba(203,223,223,.28)"; ctx.beginPath(); ctx.moveTo(cx, y0 - 30); ctx.lineTo(cx, y0 + axialHeight + 30); ctx.stroke(); ctx.setLineDash([]);
  if (state.model.cutaway) {
    ctx.beginPath(); ctx.moveTo(cx + clad, cy); ctx.lineTo(cx + clad + 15, cy - 8); ctx.lineTo(cx + clad + 15, cy + 8); ctx.closePath(); ctx.fillStyle = "#f2bf88"; ctx.fill();
  }
  const role = activeRole();
  const radius = role === "fuel" ? fuel : role === "gap" ? gap : clad;
  if (role) { ctx.strokeStyle = "#fff0dc"; ctx.lineWidth = 1.5; ctx.strokeRect(cx - radius - 2, y0 - 2, radius * 2 + 4, axialHeight + 4); }
  ctx.fillStyle = "#d4e1e4"; ctx.font = "12px ui-monospace, SFMono-Regular, monospace"; ctx.textAlign = "center";
  ctx.fillText(`${axis.toUpperCase()}Z · axial section`, cx, 26);
  ctx.fillStyle = "#9bb1b8"; ctx.fillText(`${Number(dimensions.height || 30).toFixed(1)} cm`, cx + span / 2 + 25, cy + 3);
  ctx.fillText("fuel", cx, cy + 4);
}

function drawPin3D(ctx, width, height, dimensions) {
  const cx = width / 2, topY = height * .28, bodyH = Math.min(height * .45, 220);
  const pitch = Number(dimensions.pitch || 1.26);
  const maxR = Math.min(width * .28, height * .33) * Number(state.model.zoom || 1);
  const unit = maxR / (pitch / 2);
  const radii = [Number(dimensions.cladRadius || .475), Number(dimensions.gapRadius || .418), Number(dimensions.fuelRadius || .410)].map((value) => value * unit);
  const ry = Math.max(13, radii[0] * .29);
  const rotation = Number(state.model.rotation || 0);
  const offset = Math.sin(rotation) * 7;
  const bottomY = topY + bodyH;
  ctx.fillStyle = "rgba(5,15,20,.35)"; ctx.beginPath(); ctx.ellipse(cx + 10, bottomY + 19, radii[0] * 1.2, ry * .53, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - radii[0], topY); ctx.lineTo(cx - radii[0] + offset, bottomY); ctx.lineTo(cx + radii[0] + offset, bottomY); ctx.lineTo(cx + radii[0], topY); ctx.closePath();
  const shell = ctx.createLinearGradient(cx - radii[0], 0, cx + radii[0], 0); shell.addColorStop(0, "#25535e"); shell.addColorStop(.45, "#428b95"); shell.addColorStop(1, "#22515a"); ctx.fillStyle = shell; ctx.fill();
  ctx.strokeStyle = "#8dd6d8"; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, topY, radii[0], ry, 0, 0, Math.PI * 2); ctx.fillStyle = "#70c7ca"; ctx.fill(); ctx.strokeStyle = "#b4edef"; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, topY, radii[1], ry * (radii[1] / radii[0]), 0, 0, Math.PI * 2); ctx.fillStyle = "#dfe7e3"; ctx.fill(); ctx.strokeStyle = "#f2f3eb"; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, topY, radii[2], ry * (radii[2] / radii[0]), 0, 0, Math.PI * 2); ctx.fillStyle = "#f0a260"; ctx.fill(); ctx.strokeStyle = "#ffd6a3"; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx + offset, bottomY, radii[0], ry, 0, 0, Math.PI); ctx.strokeStyle = "rgba(190,225,225,.6)"; ctx.stroke();
  if (state.model.cutaway) {
    const cutX = cx + radii[0] * .27;
    ctx.beginPath(); ctx.moveTo(cutX, topY + 1); ctx.lineTo(cutX + offset, bottomY); ctx.lineTo(cx + radii[0] + offset, bottomY); ctx.lineTo(cx + radii[0], topY + 1); ctx.closePath();
    const cut = ctx.createLinearGradient(cutX, 0, cx + radii[0], 0); cut.addColorStop(0, "rgba(13,30,38,.1)"); cut.addColorStop(1, "rgba(10,27,35,.76)"); ctx.fillStyle = cut; ctx.fill();
    const sliceX = cutX + 8, sliceW = Math.max(24, (cx + radii[0] - cutX) * .62);
    const bands = [
      { width: sliceW, color: "#428b95" },
      { width: sliceW * (radii[1] / radii[0]), color: "#dfe7e3" },
      { width: sliceW * (radii[2] / radii[0]), color: "#ef9a57" }
    ];
    for (const [i, band] of bands.entries()) {
      const dy = state.model.exploded ? (i - 1) * 12 : 0;
      ctx.fillStyle = band.color; ctx.globalAlpha = .86;
      ctx.fillRect(sliceX + (sliceW - band.width) / 2, topY + dy, band.width, bodyH - Math.abs(dy));
      ctx.globalAlpha = 1;
    }
  }
  if (state.model.exploded) {
    ctx.strokeStyle = "rgba(230,243,241,.38)"; ctx.setLineDash([3, 4]);
    for (const radius of radii) { ctx.beginPath(); ctx.moveTo(cx + radius, topY + 8); ctx.lineTo(cx + radius + 14, bottomY - 6); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  const role = activeRole();
  if (role) {
    const index = role === "fuel" ? 2 : role === "clad" ? 0 : 1;
    ctx.beginPath(); ctx.ellipse(cx, topY, radii[index] + 4, ry * (radii[index] / radii[0]) + 3, 0, 0, Math.PI * 2); ctx.strokeStyle = "#fff0d7"; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.fillStyle = "#d7e4e7"; ctx.font = "12px ui-monospace, SFMono-Regular, monospace"; ctx.textAlign = "left";
  ctx.fillText(`OD ${Number(dimensions.cladRadius || .475).toFixed(3)} cm`, cx + radii[0] + 21, topY + bodyH * .53);
  ctx.fillStyle = "#8fa8af"; ctx.fillText("DRAG TO ORBIT · SCROLL TO ZOOM", 18, height - 38);
  ctx.strokeStyle = "#7fb6bc"; ctx.beginPath(); ctx.moveTo(cx - radii[0], topY - 26); ctx.lineTo(cx + radii[0], topY - 26); ctx.moveTo(cx - radii[0], topY - 31); ctx.lineTo(cx - radii[0], topY - 21); ctx.moveTo(cx + radii[0], topY - 31); ctx.lineTo(cx + radii[0], topY - 21); ctx.stroke();
  ctx.textAlign = "center"; ctx.fillStyle = "#b6c9ce"; ctx.fillText(`${pitch.toFixed(3)} cm pitch`, cx, height - 20);
}

function drawLattice(ctx, width, height, lattice) {
  if (!lattice) return;
  const cells = lattice.cells ?? [];
  const isHex = lattice.type === "hexagonal";
  const n = Math.max(3, Math.sqrt(cells.length));
  const cell = Math.min(width * .72 / (isHex ? n * 1.4 : n + 1), height * .67 / (n + 1)) * Number(state.model.zoom || 1);
  const cx = width / 2, cy = height / 2 + 7;
  for (const item of cells) {
    const point = latticePosition(lattice, item, width, height, cell);
    const x = point.x, y = point.y;
    const key = isHex ? `${item.q},${item.r}` : `${item.x},${item.y}`;
    const selected = state.model.activeOccurrence && (isHex ? `${state.model.activeOccurrence.x},${state.model.activeOccurrence.y}` === key : state.model.activeOccurrence.x === item.x && state.model.activeOccurrence.y === item.y);
    if (lattice.display === "core" && state.model.view !== "3d") {
      const tile = Math.max(2, cell * .88);
      ctx.fillStyle = item.role === "assembly" ? "#b96d42" : "#28434d";
      ctx.fillRect(x - tile / 2, y - tile / 2, tile, tile);
      ctx.strokeStyle = selected ? "#fff1d9" : item.role === "assembly" ? "#e5a16e" : "#48636b";
      ctx.lineWidth = selected ? 2 : .65;
      ctx.strokeRect(x - tile / 2, y - tile / 2, tile, tile);
      if (item.role === "assembly" && tile > 14) {
        ctx.fillStyle = "#f7cfaa";
        ctx.beginPath(); ctx.arc(x, y, Math.min(2.2, tile * .11), 0, Math.PI * 2); ctx.fill();
      }
    } else if (state.model.view === "3d") {
      const depth = cell * .22;
      ctx.beginPath(); ctx.moveTo(x, y - cell * .44); ctx.lineTo(x + cell * .5, y - depth); ctx.lineTo(x, y + depth); ctx.lineTo(x - cell * .5, y - depth); ctx.closePath();
      ctx.fillStyle = item.role === "fuel" ? "#bd7244" : item.role === "water" ? "#46717f" : "#3d7377"; ctx.fill();
      ctx.strokeStyle = selected ? "#fff1d9" : "#78a2a9"; ctx.lineWidth = selected ? 1.8 : .7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - cell * .5, y - depth); ctx.lineTo(x, y + depth); ctx.lineTo(x, y + depth + cell * .35); ctx.lineTo(x - cell * .5, y + cell * .01); ctx.closePath(); ctx.fillStyle = "#263f49"; ctx.fill(); ctx.strokeStyle = "rgba(156,190,196,.5)"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + cell * .5, y - depth); ctx.lineTo(x, y + depth); ctx.lineTo(x, y + depth + cell * .35); ctx.lineTo(x + cell * .5, y + cell * .01); ctx.closePath(); ctx.fillStyle = "#1c333d"; ctx.fill(); ctx.strokeStyle = "rgba(156,190,196,.4)"; ctx.stroke();
    } else if (isHex) {
      const rr = cell * .40;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; const px = x + rr * Math.cos(a), py = y + rr * Math.sin(a); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath();
      ctx.fillStyle = item.role === "water" ? "#477486" : "#bf7447"; ctx.fill(); ctx.strokeStyle = selected ? "#fff1d9" : "#89aeb2"; ctx.lineWidth = selected ? 2 : .7; ctx.stroke();
    } else {
      const occurrenceKey = `${item.x},${item.y}`;
      const localDimensions = lattice.instanceEdit === "occurrence"
        ? { ...state.model.dimensions, ...(lattice.overrides?.[occurrenceKey] ?? {}) }
        : state.model.dimensions;
      const radiusRatio = Math.min(.45, Math.max(.08, Number(localDimensions?.cladRadius ?? .475) / Math.max(.01, Number(lattice.pitch?.[0] ?? 1.26)) * .45));
      const rr = Math.max(1, cell * radiusRatio);
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = item.role === "fuel" ? "#ef9a57" : item.role === "water" ? "#557f9b" : "#4c8b94"; ctx.fill();
      ctx.strokeStyle = selected ? "#fff1d9" : "rgba(186,219,220,.7)"; ctx.lineWidth = selected ? 2 : .7; ctx.stroke();
    }
  }
  if (lattice.display === "core" && state.model.view !== "3d") {
    ctx.textAlign = "center"; ctx.font = "12px ui-monospace, SFMono-Regular, monospace"; ctx.fillStyle = "#cad9dc";
    ctx.fillText("CORE POSITION MAP · 193 ASSEMBLIES", cx, 28);
  } else if (state.model.view === "3d") {
    ctx.textAlign = "center"; ctx.font = "12px ui-monospace, SFMono-Regular, monospace"; ctx.fillStyle = "#cad9dc";
    ctx.fillText(lattice.name, cx, 28); ctx.fillStyle = "#94aab1"; ctx.fillText("REPEATED UNIVERSE · CLICK A POSITION", cx, height - 20);
  }
}

function latticePosition(lattice, item, width, height, cell) {
  const cx = width / 2, cy = height / 2 + 7;
  if (lattice.type === "hexagonal") return { x: cx + (Number(item.q) + Number(item.r) / 2) * cell * .88, y: cy - Number(item.r) * cell * .76 };
  const dx = Number(item.x) - (lattice.dimension?.[0] - 1) / 2;
  const dy = Number(item.y) - (lattice.dimension?.[1] - 1) / 2;
  if (state.model.view !== "3d") return { x: cx + dx * cell, y: cy + dy * cell };
  const angle = Number(state.model.rotation || 0) + Math.PI / 4;
  const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
  return { x: cx + (rx - ry) * cell * .48, y: cy + (rx + ry) * cell * .24 };
}

function drawCanvas() {
  if (state.page !== "studio" || !state.model) return;
  const canvas = byId("geometry-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height, dpr } = canvasSize();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  gridBackground(ctx, width, height, dpr);
  const model = state.model;
  const lattice = currentLattice();
  if (!model.surfaces.length && !lattice) return;
  if (lattice && (model.kind === "lattice" || model.kind === "hex" || model.kind === "architecture" || model.kind === "beavrs")) drawLattice(ctx, width, height, lattice);
  else if (model.view === "xy") drawPinXY(ctx, width, height, dpr, currentOccurrenceDimensions());
  else if (model.view === "xz" || model.view === "yz") drawPinSide(ctx, width, height, currentOccurrenceDimensions(), model.view);
  else drawPin3D(ctx, width, height, currentOccurrenceDimensions());
}

function resizeCanvas() { drawCanvas(); }

function renderNotes(item) {
  const benchmark = BENCHMARKS.find((entry) => entry.id === item.id);
  const selectedBeavrs = state.model?.kind === "beavrs" && item.id === "beavrs";
  const note = selectedBeavrs ? state.model.metadata.notes : benchmark?.simplification ?? item.note ?? "No further notes are available.";
  const source = selectedBeavrs ? state.model.metadata.source : benchmark?.source ?? item.source ?? "GM Studio";
  const version = selectedBeavrs ? state.model.metadata.sourceVersion : benchmark?.version ?? (item.kind === "generic" ? "Generic illustration" : "Starter geometry");
  const href = selectedBeavrs ? state.model.metadata.sourceUrl : benchmark?.href;
  byId("notes-content").innerHTML = `<p><strong>Type:</strong> ${esc(item.kind === "reference" ? "Benchmark source reference" : item.kind === "generic" ? "Illustrative architecture" : "Editable starter")}</p><p><strong>Source:</strong> ${esc(source)}</p><p><strong>Version:</strong> ${esc(version)}</p><p><strong>In this workspace:</strong> ${esc(note)}</p>${href ? `<p><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open source specification ↗</a></p>` : ""}`;
  byId("notes-dialog-title").textContent = item.kind === "reference" ? `${item.name} · source` : `${item.name} · notes`;
  byId("notes-dialog").showModal();
}

function openTemplate(id) {
  const item = STARTERS.find((entry) => entry.id === id);
  if (!item) return;
  if (item.kind === "reference") { renderNotes(item); return; }
  const model = createModelForTemplate(id);
  if (model) openModel(model);
}

function addSurfaceAndCell(kind) {
  const model = state.model;
  const sid = Math.max(0, ...model.surfaces.map((item) => Number(item.id))) + 1;
  const cid = Math.max(0, ...model.cells.map((item) => Number(item.id))) + 1;
  const surfaces = [];
  if (kind === "sphere") surfaces.push({ id: sid, name: `Sphere ${sid}`, type: "sphere", params: { x0: 0, y0: 0, z0: 0, r: .5 }, role: "custom", visible: true });
  else if (kind === "cylinder") surfaces.push({ id: sid, name: `Cylinder ${sid}`, type: "z-cylinder", params: { x0: 0, y0: 0, r: .5 }, role: "custom", visible: true });
  else {
    const coords = kind === "box" ? [
      ["x-plane", { x0: -.5 }], ["x-plane", { x0: .5 }], ["y-plane", { y0: -.5 }], ["y-plane", { y0: .5 }], ["z-plane", { z0: -.5 }], ["z-plane", { z0: .5 }]
    ] : [];
    for (let i = 0; i < coords.length; i++) surfaces.push({ id: sid + i, name: `${kind === "box" ? "Box" : "Primitive"} face ${i + 1}`, type: coords[i][0], params: coords[i][1], role: "custom", visible: true });
  }
  let region = surfaces.length === 6 ? `${sid} -${sid + 1} ${sid + 2} -${sid + 3} ${sid + 4} -${sid + 5}` : `-${sid}`;
  mutate((next) => {
    next.surfaces.push(...surfaces);
    const root = next.universes.find((universe) => Number(universe.id) === 0) ?? next.universes[0];
    const material = next.materials[0]?.id ?? null;
    next.cells.push({ id: cid, name: kind === "box" ? `Box cell ${cid}` : `${kind[0].toUpperCase()}${kind.slice(1)} cell ${cid}`, universe: root?.id ?? 0, material, region, role: "custom", surfaceIds: surfaces.map((item) => item.id) });
    if (root) root.cells.push(cid);
    next.selection = { kind: "cell", id: cid, surfaceIds: [] };
  });
  byId("add-dialog").close();
  toast(`${kind === "box" ? "Box" : kind[0].toUpperCase() + kind.slice(1)} cell added. Choose its material and dimensions in the inspector.`);
}

function addCell() { addSurfaceAndCell("sphere"); }

function addMaterial() {
  if (!state.model) return;
  const id = Math.max(0, ...state.model.materials.map((item) => Number(item.id))) + 1;
  const material = { id, name: `Material ${id}`, color: palette[(id - 1) % palette.length], density: 0, densityUnits: "g/cm3", nuclides: [], note: "Set density and nuclide fractions before transport use." };
  mutate((model) => { model.materials.push(material); });
  toast(`Material ${id} added. Set its name, density and composition before export.`);
}

function applyBoolean(op) {
  const ids = state.model.selection?.surfaceIds ?? [];
  if (ids.length < 2) return;
  const cell = state.model.cells.find((item) => item.id === state.model.selection.id) ?? state.model.cells.find((item) => item.role === "fuel") ?? state.model.cells[0];
  if (!cell) { toast("Add a cell before applying a Boolean operation."); return; }
  const terms = ids.slice(0, 2).map((id) => `-${Number(id)}`);
  const region = op === "union" ? `${terms[0]} | ${terms[1]}` : op === "intersection" ? `${terms[0]} ${terms[1]}` : `${terms[0]} ${Number(ids[1])}`;
  mutate((model) => {
    const target = model.cells.find((item) => item.id === cell.id);
    target.region = region;
    target.surfaceIds = [...new Set([...(target.surfaceIds ?? []), ...ids.slice(0, 2).map(Number)])];
    model.selection = { kind: "cell", id: target.id, surfaceIds: [] };
  });
  toast(`${op[0].toUpperCase() + op.slice(1)} applied to ${cell.name}.`);
}

function deleteCell(id) {
  mutate((model) => {
    model.cells = model.cells.filter((cell) => Number(cell.id) !== Number(id));
    for (const universe of model.universes) universe.cells = universe.cells.filter((cellId) => Number(cellId) !== Number(id));
    model.selection = { kind: null, id: null, surfaceIds: [] };
  });
  toast("Cell deleted. Use Undo to restore it.");
}

function deleteSurface(id) {
  mutate((model) => {
    model.surfaces = model.surfaces.filter((surface) => Number(surface.id) !== Number(id));
    model.selection = { kind: null, id: null, surfaceIds: [] };
  });
  toast("Surface deleted. Any region references are reported in model checks; use Undo to restore it.");
}

function startRangeTransaction(control = document.activeElement) {
  if (state.transaction || !state.model) return;
  state.transaction = { snapshot: clone(state.model), controlId: control?.id ?? "" };
}
function finishRangeTransaction() {
  if (!state.transaction) return;
  const { snapshot, controlId } = state.transaction;
  const restoreFocus = Boolean(controlId && document.activeElement?.id === controlId);
  const changed = JSON.stringify(snapshot) !== JSON.stringify(state.model);
  state.transaction = null;
  if (changed) pushUndo(snapshot);
  renderStudio();
  if (restoreFocus) byId(controlId)?.focus({ preventScroll: true });
  updateHistoryButtons();
}

function updateFieldValue(kind, id, key, value) {
  mutate((model) => {
    const target = kind === "cell" ? model.cells.find((item) => Number(item.id) === Number(id)) : model.surfaces.find((item) => Number(item.id) === Number(id));
    if (target) target[key] = value;
  });
}

function makeXmlDownload(name, content, mime = "application/xml") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doExport(format) {
  if (!state.model) return;
  try {
    if (format === "geometry") makeXmlDownload("geometry.xml", exportGeometryXML(state.model));
    if (format === "materials") makeXmlDownload("materials.xml", exportMaterialsXML(state.model));
    if (format === "python") {
      if (!state.model.metadata?.exportable) throw new Error("This schematic or empty model is not ready for Python/OpenMC export. Export the GM model JSON to keep editing it.");
      makeXmlDownload("model.py", exportPython(state.model), "text/x-python");
    }
    if (format === "project") makeXmlDownload("model.gm.json", JSON.stringify(state.model, null, 2), "application/json");
    byId("export-dialog").close();
    toast("File generated in this browser. Run the exported inputs through the OpenMC version and cross-section data you intend to use.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "This file could not be exported from the current model.");
  }
}

async function importFiles(files) {
  try {
    const fileData = await Promise.all([...files].map(async (file) => ({ name: file.name, text: await file.text() })));
    let nextModel = null, materialsFile = null;
    for (const entry of fileData) {
      if (entry.name.toLowerCase().endsWith(".json")) {
        const parsed = JSON.parse(entry.text);
        if (parsed.schema !== "gm-openmc-model/v1") throw new Error("This JSON file is not a GM Studio model.");
        nextModel = parsed;
      } else {
        const xml = new DOMParser().parseFromString(entry.text, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error(`${entry.name}: XML could not be parsed.`);
        if (xml.documentElement.localName === "geometry") nextModel = importGeometryXML(entry.text);
        else if (xml.documentElement.localName === "materials") materialsFile = xml;
        else throw new Error(`${entry.name}: choose geometry.xml, materials.xml or model.gm.json.`);
      }
    }
    if (!nextModel) nextModel = state.model ? clone(state.model) : createEmptyModel("Imported materials");
    if (materialsFile) {
      const materialNodes = [...materialsFile.querySelectorAll(":scope > material")];
      nextModel.materials = materialNodes.map((node, index) => {
        const density = node.querySelector("density");
        const nuclides = [...node.querySelectorAll("nuclide")].map((nuclide) => ({ name: nuclide.getAttribute("name") || "", fraction: Number(nuclide.getAttribute("ao") ?? nuclide.getAttribute("wo") ?? 0), basis: nuclide.hasAttribute("wo") ? "wo" : "ao" }));
        return { id: Number(node.getAttribute("id") || index + 1), name: node.getAttribute("name") || `Material ${index + 1}`, color: palette[index % palette.length], density: Number(density?.getAttribute("value") || 0), densityUnits: density?.getAttribute("units") || "g/cm3", nuclides, note: "Imported material composition. Confirm the source library and intended units." };
      });
    }
    nextModel.name = fileData.find((file) => file.name.endsWith(".json"))?.name.replace(/\.gm\.json$|\.json$/i, "") || nextModel.name;
    openModel(nextModel);
    const issues = validateModel(nextModel);
    toast(issues.length ? `Opened locally with ${issues.length} structure note${issues.length === 1 ? "" : "s"}. Run “Check model structure” for details.` : "Files opened in this browser. The editor renders a supported subset of OpenMC geometry.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "The selected files could not be opened.");
  } finally { byId("file-input").value = ""; }
}

function checkModel() {
  if (!state.model) return;
  const issues = validateModel(state.model);
  const dock = byId("dock-content");
  dock.classList.remove("is-error", "is-ok");
  if (issues.length) {
    dock.classList.add("is-error");
    dock.innerHTML = `<span>${issues.length} structure note${issues.length === 1 ? "" : "s"}: ${esc(issues.slice(0, 2).join(" "))}${issues.length > 2 ? ` + ${issues.length - 2} more.` : ""}</span><button id="validate-button" class="text-button">Check again</button>`;
  } else {
    dock.classList.add("is-ok");
    dock.innerHTML = `<span>IDs and surface references are present. This is a structure check; it does not run OpenMC or verify physics.</span><button id="validate-button" class="text-button">Check again</button>`;
  }
  toast(issues.length ? `${issues.length} model structure issue${issues.length === 1 ? "" : "s"} found.` : "Basic geometry structure looks consistent.");
}

function handleTreeClick(button, event) {
  const kind = button.dataset.kind;
  const id = button.dataset.id;
  if (kind === "surface" && event.shiftKey) {
    const current = state.model.selection?.surfaceIds ?? [];
    const numberId = Number(id);
    const nextIds = current.includes(numberId) ? current.filter((value) => value !== numberId) : [...current, numberId];
    mutate((model) => { model.selection = { kind: "surface", id: numberId, surfaceIds: nextIds }; }, { record: false });
    return;
  }
  mutate((model) => { model.selection = { kind, id: kind === "lattice" || kind === "universe" ? Number(id) : id === "null" ? null : Number(id), surfaceIds: kind === "surface" ? [Number(id)] : [] }; }, { record: false });
}

function chooseLatticePosition(event) {
  const lattice = currentLattice();
  if (!lattice) return false;
  const rect = byId("geometry-canvas").getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  const cells = lattice.cells ?? [];
  const width = rect.width, height = rect.height;
  const isHex = lattice.type === "hexagonal";
  const n = Math.max(3, Math.sqrt(cells.length));
  const size = Math.min(width * .72 / (isHex ? n * 1.4 : n + 1), height * .67 / (n + 1)) * Number(state.model.zoom || 1);
  let chosen = null, distance = Infinity;
  for (const item of cells) {
    const projected = latticePosition(lattice, item, width, height, size);
    const px = projected.x, py = projected.y;
    const d = Math.hypot(px - x, py - y);
    if (d < distance) { distance = d; chosen = item; }
  }
  if (chosen && distance < size * .6) {
    if (state.model.kind === "beavrs" && lattice.display === "core") {
      mutate((model) => {
        if (chosen.role === "assembly") {
          model.focusPath = { assembly: { position: chosen.position, x: chosen.x, y: chosen.y }, pin: null };
          model.activeLatticeId = 21;
          model.activeOccurrence = null;
          model.selection = { kind: "lattice", id: 21, surfaceIds: [] };
        } else {
          model.activeOccurrence = { x: chosen.x, y: chosen.y, universe: chosen.universe };
          model.selection = { kind: "cell", id: 14, surfaceIds: [] };
        }
      }, { record: false });
      return true;
    }
    if (state.model.kind === "beavrs" && lattice.display === "assembly") {
      mutate((model) => {
        model.focusPath.pin = { x: chosen.x, y: chosen.y, role: chosen.role };
        model.activeLatticeId = null;
        model.activeOccurrence = { x: chosen.x, y: chosen.y, universe: chosen.universe };
        model.selection = { kind: "cell", id: chosen.role === "fuel" ? 10 : 14, surfaceIds: [] };
        model.view = "xy";
      }, { record: false });
      return true;
    }
    mutate((model) => {
      model.activeOccurrence = isHex ? { x: chosen.q, y: chosen.r, universe: chosen.universe } : { x: chosen.x, y: chosen.y, universe: chosen.universe };
      model.selection = { kind: "cell", id: chosen.universe === 1 ? 1 : 5, surfaceIds: [] };
    }, { record: false });
    return true;
  }
  return false;
}

function handleCanvasClick(event) {
  if (!state.model || state.dragged) { state.dragged = false; return; }
  if (currentLattice() && chooseLatticePosition(event)) return;
  const rect = byId("geometry-canvas").getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
  const dims = currentOccurrenceDimensions();
  const unit = Math.min(rect.width * .59, rect.height * .64) / Number(dims.pitch || 1.26);
  const r = Math.hypot(x, y);
  const role = r < Number(dims.fuelRadius || .410) * unit ? "fuel" : r < Number(dims.gapRadius || .418) * unit ? "gap" : r < Number(dims.cladRadius || .475) * unit ? "clad" : "water";
  const cell = state.model.cells.find((item) => item.role === role);
  if (state.model.measureMode) {
    mutate((model) => { model.lastPoint = `x ${((x / unit) || 0).toFixed(3)} · y ${((y / unit) || 0).toFixed(3)} cm`; }, { record: false });
  } else if (cell) mutate((model) => { model.selection = { kind: "cell", id: cell.id, surfaceIds: [] }; }, { record: false });
}

function initializeBindings() {
  document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; renderLibrary(); }));
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
  byId("empty-model-button").addEventListener("click", () => openModel(createEmptyModel()));
  byId("open-last-button").addEventListener("click", () => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) openModel(JSON.parse(saved)); } catch { toast("The recent model could not be restored from this browser."); }
  });
  byId("template-grid").addEventListener("click", (event) => {
    const open = event.target.closest("[data-open]");
    const notes = event.target.closest("[data-notes]");
    if (open) openTemplate(open.dataset.open);
    if (notes) { const item = STARTERS.find((entry) => entry.id === notes.dataset.notes); if (item) renderNotes(item); }
  });
  byId("undo-button").addEventListener("click", undo); byId("redo-button").addEventListener("click", redo);
  byId("export-button").addEventListener("click", () => byId("export-dialog").showModal());
  byId("export-workspace-button").addEventListener("click", () => byId("export-dialog").showModal());
  byId("export-dialog").addEventListener("click", (event) => { const button = event.target.closest("[data-export]"); if (button) doExport(button.dataset.export); });
  byId("open-file-button").addEventListener("click", () => byId("file-input").click());
  byId("file-input").addEventListener("change", (event) => { if (event.target.files?.length) importFiles(event.target.files); });
  byId("tree-list").addEventListener("click", (event) => { const button = event.target.closest("[role=treeitem]"); if (button) handleTreeClick(button, event); });
  byId("tree-list").addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = [...byId("tree-list").querySelectorAll("[role=treeitem]")];
    const index = rows.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    event.preventDefault(); rows[next]?.focus();
  });
  byId("add-geometry-button").addEventListener("click", () => byId("add-dialog").showModal());
  byId("add-first-primitive").addEventListener("click", () => { byId("add-dialog").showModal(); });
  byId("add-cell-button").addEventListener("click", addCell);
  byId("add-material-button").addEventListener("click", addMaterial);
  byId("add-dialog").addEventListener("click", (event) => { const button = event.target.closest("[data-primitive]"); if (button) addSurfaceAndCell(button.dataset.primitive); });
  byId("inspector-content").addEventListener("focusin", (event) => { if (event.target.matches("input[type=range]")) startRangeTransaction(event.target); });
  byId("inspector-content").addEventListener("pointerdown", (event) => { if (event.target.matches("input[type=range]")) startRangeTransaction(event.target); });
  byId("inspector-content").addEventListener("focusout", () => { setTimeout(() => { if (state.transaction && !document.activeElement?.matches("input[type=range]")) finishRangeTransaction(); }, 0); });
  byId("inspector-content").addEventListener("change", (event) => {
    const node = event.target;
    if (node.id === "cell-name") { const id = state.model.selection.id; updateFieldValue("cell", id, "name", node.value); }
    if (node.id === "surface-name") { const id = state.model.selection.id; updateFieldValue("surface", id, "name", node.value); }
    if (node.id === "cell-material") { const id = state.model.selection.id; mutate((model) => { const cell = model.cells.find((item) => item.id === id); if (cell) { cell.material = node.value === "" ? null : Number(node.value); cell.materialKey = model.materials.find((material) => Number(material.id) === Number(node.value))?.name ?? "void"; } }); }
    if (node.id.startsWith("surface-") && node.dataset.param) { const id = state.model.selection.id, key = node.dataset.param, value = Number(node.value); mutate((model) => { const item = model.surfaces.find((surface) => Number(surface.id) === Number(id)); if (item) item.params[key] = value; }); }
    if (node.name === "instance-scope" || node.name === "lattice-scope") { mutate((model) => { const lattice = model.lattices?.[0]; if (lattice) lattice.instanceEdit = node.value; }); }
    if (node.matches("input[type=range]") && state.transaction) finishRangeTransaction();
  });
  byId("inspector-content").addEventListener("input", (event) => {
    const node = event.target;
    if (node.id === "dim-fuelRadius") { const value = Number(node.value); setDimension("fuelRadius", value, { record: false }); const out = document.querySelector('output[for="dim-fuelRadius"]'); if (out) out.value = `${value.toFixed(3)} cm`; }
    if (node.id === "dim-gapRadius") { const value = Number(node.value); setDimension("gapRadius", value, { record: false }); const out = document.querySelector('output[for="dim-gapRadius"]'); if (out) out.value = `${value.toFixed(3)} cm`; }
    if (node.id === "dim-cladRadius") { const value = Number(node.value); setDimension("cladRadius", value, { record: false }); const out = document.querySelector('output[for="dim-cladRadius"]'); if (out) out.value = `${value.toFixed(3)} cm`; }
    if (node.id === "dim-pitch") { const value = Number(node.value); setDimension("pitch", value, { record: false }); }
    if (node.id === "surface-radius") {
      const value = Number(node.value), surfaceId = Number(state.model.selection.id);
      const key = ({ 10: "fuelRadius", 11: "gapRadius", 12: "cladRadius" })[surfaceId];
      if (key) setDimension(key, value, { record: false });
      else mutate((model) => { const surface = model.surfaces.find((item) => Number(item.id) === surfaceId); if (surface) surface.params.r = value; }, { record: false, render: false });
      const out = document.querySelector('output[for="surface-radius"]'); if (out) out.value = `${value.toFixed(3)} cm`;
    }
    if (node.id === "lattice-pitch") {
      const value = Number(node.value);
      setLatticePitch(value, { record: false });
      const out = document.querySelector('output[for="lattice-pitch"]'); if (out) out.value = `${value.toFixed(2)} cm`;
    }
  });
  byId("inspector-content").addEventListener("pointerup", finishRangeTransaction);
  byId("inspector-content").addEventListener("pointercancel", finishRangeTransaction);
  byId("inspector-content").addEventListener("click", (event) => {
    const boolean = event.target.closest("[data-boolean]"); if (boolean && !boolean.disabled) applyBoolean(boolean.dataset.boolean);
    const delCell = event.target.closest("[data-delete-cell]"); if (delCell) deleteCell(delCell.dataset.deleteCell);
    const delSurface = event.target.closest("[data-delete-surface]"); if (delSurface) deleteSurface(delSurface.dataset.deleteSurface);
    const unit = event.target.closest("[data-units]"); if (unit) { document.querySelectorAll("[data-units]").forEach((button) => { button.classList.toggle("is-active", button === unit); button.setAttribute("aria-pressed", String(button === unit)); }); }
  });
  byId("focus-path").addEventListener("click", (event) => {
    const step = event.target.closest("[data-focus-step]")?.dataset.focusStep;
    if (!step || state.model?.kind !== "beavrs") return;
    mutate((model) => {
      if (step === "core") {
        model.activeLatticeId = 20;
        model.focusPath = { assembly: null, pin: null };
        model.activeOccurrence = null;
        model.selection = { kind: "lattice", id: 20, surfaceIds: [] };
      } else if (step === "assembly" && model.focusPath?.assembly) {
        model.activeLatticeId = 21;
        model.focusPath.pin = null;
        model.activeOccurrence = null;
        model.selection = { kind: "lattice", id: 21, surfaceIds: [] };
      }
    }, { record: false });
  });
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.addEventListener("click", () => mutate((model) => { model.view = button.dataset.view; }, { record: false }));
    button.addEventListener("keydown", (event) => { if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return; event.preventDefault(); const tabs = [...document.querySelectorAll(".view-tab")]; const i = tabs.indexOf(button); const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length; tabs[index].focus(); tabs[index].click(); });
  });
  byId("cutaway-button").addEventListener("click", () => mutate((model) => { model.cutaway = !model.cutaway; }, { record: false }));
  byId("explode-button").addEventListener("click", () => mutate((model) => { model.exploded = !model.exploded; }, { record: false }));
  byId("measure-button").addEventListener("click", () => mutate((model) => { model.measureMode = !model.measureMode; }, { record: false }));
  byId("rotate-button").addEventListener("click", () => mutate((model) => { model.rotation = Number(model.rotation || 0) + Math.PI / 12; }, { record: false }));
  byId("fit-button").addEventListener("click", () => mutate((model) => { model.zoom = 1; model.rotation = -0.42; }, { record: false }));
  byId("zoom-in").addEventListener("click", () => mutate((model) => { model.zoom = Math.min(2.4, Number(model.zoom || 1) + .1); }, { record: false }));
  byId("zoom-out").addEventListener("click", () => mutate((model) => { model.zoom = Math.max(.5, Number(model.zoom || 1) - .1); }, { record: false }));
  byId("geometry-canvas").addEventListener("click", handleCanvasClick);
  byId("geometry-canvas").addEventListener("pointerdown", (event) => { state.pointerStart = { x: event.clientX, y: event.clientY }; state.dragged = false; });
  byId("geometry-canvas").addEventListener("pointermove", (event) => {
    if (!state.model || !state.pointerStart || !(event.buttons & 1)) return;
    const dx = event.clientX - state.pointerStart.x, dy = event.clientY - state.pointerStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.dragged = true;
    if (state.model.view === "3d") {
      state.model.rotation = Number(state.model.rotation || 0) + dx * .008;
      state.pointerStart = { x: event.clientX, y: event.clientY };
      drawCanvas();
    }
  });
  byId("geometry-canvas").addEventListener("pointerup", () => { state.pointerStart = null; });
  byId("geometry-canvas").addEventListener("wheel", (event) => {
    event.preventDefault(); mutate((model) => { model.zoom = Math.max(.5, Math.min(2.4, Number(model.zoom || 1) + (event.deltaY < 0 ? .04 : -.04))); }, { record: false });
  }, { passive: false });
  byId("geometry-canvas").addEventListener("pointermove", (event) => {
    const rect = byId("geometry-canvas").getBoundingClientRect();
    const units = Number(currentOccurrenceDimensions().pitch || 1.26) / Math.min(rect.width * .59, rect.height * .64);
    const x = (event.clientX - rect.left - rect.width / 2) * units;
    const y = (event.clientY - rect.top - rect.height / 2) * units;
    byId("pointer-coordinates").textContent = `x ${x.toFixed(3)} · y ${y.toFixed(3)} cm`;
  });
  byId("dock-content").addEventListener("click", (event) => { if (event.target.closest("#validate-button")) checkModel(); });
  byId("model-info-button").addEventListener("click", () => {
    const item = STARTERS.find((entry) => entry.modelType === state.model?.kind || entry.id === state.model?.id) ?? { name: state.model?.name, kind: "editable", note: state.model?.metadata?.notes, source: state.model?.metadata?.source };
    renderNotes(item);
  });
  byId("notes-done").addEventListener("click", () => byId("notes-dialog").close());
  document.addEventListener("keydown", (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    else if (mod && event.key.toLowerCase() === "o") { event.preventDefault(); byId("file-input").click(); }
    else if (event.key === "Escape") { document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close()); }
  });
  state.resizeObserver = new ResizeObserver(resizeCanvas);
  state.resizeObserver.observe(byId("canvas-wrap"));
}

function setupAgentAPI() {
  const api = {
    name: "GM Studio",
    capabilities: ["catalog.list", "model.read", "dimension.update", "history.undo", "export.geometryXML", "model.validate"],
    listTemplates: () => STARTERS.map(({ id, name, family, kind, status, subtitle }) => ({ id, name, family, kind, status, subtitle })),
    getModel: () => state.model ? clone(state.model) : null,
    selectTemplate: (id) => { const model = createModelForTemplate(id); if (!model) throw new Error("This entry is a reference, not a bundled model."); openModel(model); return clone(state.model); },
    focus: (level, x, y) => { if (!state.model) throw new Error("Open a model first."); mutate((model) => focusBeavrsModel(model, { level, x, y })); return clone(state.model); },
    setDimension: (key, value) => { if (!state.model) throw new Error("Open a model first."); setDimension(key, value); return clone(state.model); },
    selectView: (view) => { if (!["3d", "xy", "xz", "yz"].includes(view)) throw new Error("Choose 3d, xy, xz or yz."); if (!state.model) throw new Error("Open a model first."); mutate((model) => { model.view = view; }, { record: false }); return view; },
    validate: () => state.model ? validateModel(state.model) : ["Open a model first."],
    exportGeometry: () => { if (!state.model) throw new Error("Open a model first."); return exportGeometryXML(state.model); },
    undo: () => undo()
  };
  Object.defineProperty(window, "openmcStudio", { value: api, configurable: false, writable: false });
  const context = navigator.modelContext;
  if (context && typeof context.registerTool === "function") {
    try {
      context.registerTool({ name: "geometry_catalog", description: "List available OpenMC geometry starters and source references.", inputSchema: { type: "object", properties: {} }, execute: () => api.listTemplates() });
      context.registerTool({ name: "geometry_read_current", description: "Read the current local model document in this browser tab.", inputSchema: { type: "object", properties: {} }, execute: () => api.getModel() });
      context.registerTool({ name: "geometry_focus", description: "Focus the core, an assembly row/column, or a pin row/column in the editable BEAVRS 2D slice. Lattice coordinates are zero-based.", inputSchema: { type: "object", required: ["level"], properties: { level: { type: "string", enum: ["core", "assembly", "pin"] }, x: { type: "integer", description: "Zero-based column; required for assembly or pin." }, y: { type: "integer", description: "Zero-based row; required for assembly or pin." } } }, execute: ({ level, x, y }) => api.focus(level, x, y) });
      context.registerTool({ name: "geometry_set_dimension", description: "Set a named dimension on the current local model.", inputSchema: { type: "object", required: ["key", "value"], properties: { key: { type: "string", enum: ["fuelRadius", "gapRadius", "cladRadius", "pitch"] }, value: { type: "number" } } }, execute: ({ key, value }) => api.setDimension(key, value) });
      context.registerTool({ name: "geometry_validate_structure", description: "Check cell, material and surface references without running OpenMC.", inputSchema: { type: "object", properties: {} }, execute: () => api.validate() });
    } catch (error) { console.warn("Optional browser WebMCP registration was unavailable.", error); }
  }
}

initializeBindings();
setupAgentAPI();
render();
try {
  const recent = localStorage.getItem(STORAGE_KEY);
  if (recent) {
    const parsed = JSON.parse(recent);
    if (parsed?.schema === "gm-openmc-model/v1") byId("open-last-button").hidden = false;
  }
} catch { /* Storage can be disabled by the browser; the model still opens for this tab. */ }

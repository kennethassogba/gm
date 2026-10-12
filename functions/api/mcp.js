import { STARTERS, BENCHMARKS, createEmptyModel, createModelForTemplate, focusModel, validateModel, exportGeometryXML, exportMaterialsXML, exportPython } from "../../public/model.js";
import {constructGeometry,syncDomains} from '../../public/builder.js';

const PROTOCOL_VERSION = "2025-11-25";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version",
  "cache-control": "no-store"
};
const tools = [
  {name:"geometry.empty",description:"Create an empty geometry document.",inputSchema:{type:"object",properties:{name:{type:"string"}}}},
  {name:"geometry.construct",description:"Build or edit canonical OpenMC geometry. Dimensions and positions are in cm. Cell spec: type cylinder/tube/sphere/shell/box/hexprism/region, name, material, radius/innerRadius/height/size/width/region, target, position. Pin spec: name, pitch, height, coolant, layers [{name,radius,material}]. Lattice spec: type rectangular/hexagonal, fill universe ID, pitch, pitchY, height, columns, rows, levels, rings, outerMaterial. Components use place:false to remain definitions. Combine spec: a,b cell IDs, operation union/intersection/difference, name, material, keepTool. Move: id, position. Rotate: ids, angles [X,Y,Z] in degrees, pivot [x,y,z] in cm; material cells only. Array: ids, counts [nx,ny,nz], spacing [dx,dy,dz]; original included in counts. Edit: id and primitive spec. Delete/duplicate/group: ids, offset or name. Place: fill, target, position, replace cell ID.",inputSchema:{type:"object",required:["model","operation","spec"],properties:{model:{type:"object"},operation:{type:"string",enum:["cell","pin","lattice","universe","place","combine","move","rotate","array","edit","delete","duplicate","group"]},spec:{type:"object"}}}},
  { name: "geometry.set_surface", description: "Edit surface coefficients in a model document.", inputSchema: {type:"object",required:["model","id","params"],properties:{model:{type:"object"},id:{type:"integer"},params:{type:"object",additionalProperties:{type:"number"}}}} },
  { name: "catalog.list", description: "List editable model examples and their metadata.", inputSchema: { type: "object", properties: {} } },
  { name: "geometry.template", description: "Create an editable model from the catalog.", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", enum: STARTERS.filter((item) => item.kind !== "reference").map((item) => item.id) } } } },
  { name: "geometry.focus", description: "Focus the root or a rectangular lattice position. Coordinates start at zero.", inputSchema: { type: "object", required: ["model", "level"], properties: { model: { type: "object", description: "A GM model document." }, level: { type: "string", enum: ["core", "assembly", "pin"] }, x: { type: "integer", description: "Zero-based lattice column; required for assembly and pin focus." }, y: { type: "integer", description: "Zero-based lattice row; required for assembly and pin focus." } } } },
  { name: "geometry.validate", description: "Check model IDs, references and dimensions.", inputSchema: { type: "object", required: ["model"], properties: { model: { type: "object", description: "A GM Studio document with schema gm-openmc-model/v1." } } } },
  { name: "geometry.export", description: "Export OpenMC XML or a Python script.", inputSchema: { type: "object", required: ["model", "file"], properties: { model: { type: "object" }, file: { type: "string", enum: ["geometry.xml", "materials.xml", "model.py"] } } } }
];

function reply(id, result, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { status, headers });
}
function fail(id, code, message, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { status, headers });
}
function toolResult(value, isError = false) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], ...(typeof value === "string" ? {} : {structuredContent: value}), isError };
}
function validateDocument(model) {
  if (!model || model.schema !== "gm-openmc-model/v1" || !Array.isArray(model.surfaces) || !Array.isArray(model.cells) || !Array.isArray(model.materials)) {
    throw new Error("Provide a GM Studio document with schema gm-openmc-model/v1 and surfaces, cells and materials arrays.");
  }
  if (JSON.stringify(model).length > 500_000) throw new Error("The model document exceeds the 500 KB request limit.");
}
function callTool(name, args) {
  if(name==='geometry.empty')return createEmptyModel(args.name);
  if(name==='geometry.construct'){validateDocument(args.model);const model=structuredClone(args.model);constructGeometry(model,args.operation,args.spec);const issues=validateModel(model);if(issues.length)throw new Error(issues.join(' '));return model;}
  if (name === "catalog.list") return { entries: STARTERS.map(({ id, name, family, kind, status, subtitle, source, version, href, simplification, note }) => ({ id, name, family, kind, status, subtitle, ...(source ? { source, version, href, simplification } : { note }) })), benchmarks: BENCHMARKS.map(({ id, name, source, version, href, simplification }) => ({ id, name, source, version, href, simplification })) };
  if (name === "geometry.template") {
    const model = createModelForTemplate(args.id);
    if (!model) throw new Error("Model not found.");
    return model;
  }
  if(name === "geometry.set_surface"){validateDocument(args.model);const model=structuredClone(args.model),s=model.surfaces.find(s=>s.id===args.id);if(!s)throw new Error("Surface not found.");for(const [key,value] of Object.entries(args.params||{})){if(!(key in s.params)||!Number.isFinite(value)||(key==="r"&&value<=0))throw new Error("Invalid surface coefficient.");s.params[key]=value;}for(const c of model.cells)if((c.region.match(/[+-]?\d+/g)||[]).some(t=>Math.abs(Number(t))===s.id))delete c.primitive;syncDomains(model);return model;}
  if (name === "geometry.focus") {
    validateDocument(args.model);
    return focusModel(structuredClone(args.model), args);
  }
  if (name === "geometry.validate") {
    validateDocument(args.model);
    return { issues: validateModel(args.model), scope: "Structure only; OpenMC and physics were not run." };
  }
  if (name === "geometry.export") {
    validateDocument(args.model);
    if (args.file === "geometry.xml") return exportGeometryXML(args.model);
    if (args.file === "materials.xml") return exportMaterialsXML(args.model);
    if (args.file === "model.py") return exportPython(args.model);
    throw new Error("Choose geometry.xml, materials.xml or model.py.");
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method === "GET") return new Response(JSON.stringify({ name: "GM Studio", endpoint: "/api/mcp", protocolVersion: PROTOCOL_VERSION, tools: tools.map(({ name, description }) => ({ name, description })), transport: "JSON-RPC over HTTP POST; stateless; no model persistence" }), { headers });
  if (request.method !== "POST") return new Response("Use JSON-RPC POST. See /openapi.json.", { status: 405, headers: { ...headers, allow: "GET, POST, OPTIONS" } });
  let body;
  try { body = await request.json(); } catch { return fail(null, -32700, "Parse error."); }
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") return fail(body?.id ?? null, -32600, "Invalid JSON-RPC request.");
  if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") return new Response(null, { status: 202, headers });
  if (body.method === "initialize") return reply(body.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "GM Studio", version: "0.3.0" }, instructions: "CSG, transport and reactor examples. Supplied documents are processed for one request and not stored." });
  if (body.method === "ping") return reply(body.id, {});
  if (body.method === "tools/list") return reply(body.id, { tools: tools.map(({ inputSchema, ...item }) => ({ ...item, inputSchema })) });
  if (body.method === "tools/call") {
    try { return reply(body.id, toolResult(callTool(body.params?.name, body.params?.arguments ?? {}))); }
    catch (error) { return reply(body.id, toolResult(error instanceof Error ? error.message : "The tool call failed.", true)); }
  }
  return fail(body.id ?? null, -32601, `Method not found: ${body.method}`);
}

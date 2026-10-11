import { STARTERS, BENCHMARKS, createModelForTemplate, validateModel, exportGeometryXML, exportMaterialsXML } from "../../public/model.js";

const PROTOCOL_VERSION = "2025-11-25";
const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version",
  "cache-control": "no-store"
};
const tools = [
  { name: "catalog.list", description: "List starter geometries and public benchmark source notes. Returns labels and references; benchmark models are not bundled.", inputSchema: { type: "object", properties: {} } },
  { name: "geometry.template", description: "Create an editable GM Studio starter document by catalog id. The result is a schematic starter, not a validated reactor model.", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", enum: STARTERS.filter((item) => item.kind !== "reference").map((item) => item.id) } } } },
  { name: "geometry.validate", description: "Check IDs and references in a GM Studio model document. This does not run OpenMC or verify physical results.", inputSchema: { type: "object", required: ["model"], properties: { model: { type: "object", description: "A GM Studio document with schema gm-openmc-model/v1." } } } },
  { name: "geometry.export", description: "Export starter-subset geometry.xml or materials.xml from a GM Studio document. The output still needs validation with the target OpenMC release.", inputSchema: { type: "object", required: ["model", "file"], properties: { model: { type: "object" }, file: { type: "string", enum: ["geometry.xml", "materials.xml"] } } } }
];

function reply(id, result, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { status, headers });
}
function fail(id, code, message, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), { status, headers });
}
function toolResult(value, isError = false) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], structuredContent: value, isError };
}
function validateDocument(model) {
  if (!model || model.schema !== "gm-openmc-model/v1" || !Array.isArray(model.surfaces) || !Array.isArray(model.cells) || !Array.isArray(model.materials)) {
    throw new Error("Provide a GM Studio document with schema gm-openmc-model/v1 and surfaces, cells and materials arrays.");
  }
  if (JSON.stringify(model).length > 500_000) throw new Error("The model document exceeds the 500 KB request limit.");
}
function callTool(name, args) {
  if (name === "catalog.list") return { entries: STARTERS.map(({ id, name, family, kind, status, subtitle, source, version, href, simplification, note }) => ({ id, name, family, kind, status, subtitle, ...(source ? { source, version, href, simplification } : { note }) })), benchmarks: BENCHMARKS.map(({ id, name, source, version, href, simplification }) => ({ id, name, source, version, href, simplification })) };
  if (name === "geometry.template") {
    const model = createModelForTemplate(args.id);
    if (!model) throw new Error("That catalog entry is a benchmark source reference, not a bundled model.");
    return model;
  }
  if (name === "geometry.validate") {
    validateDocument(args.model);
    return { issues: validateModel(args.model), scope: "Structure only; OpenMC and physics were not run." };
  }
  if (name === "geometry.export") {
    validateDocument(args.model);
    if (args.file === "geometry.xml") return exportGeometryXML(args.model);
    if (args.file === "materials.xml") return exportMaterialsXML(args.model);
    throw new Error("Choose geometry.xml or materials.xml.");
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
  if (body.method === "initialize") return reply(body.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "GM Studio", version: "0.1.0" }, instructions: "Model references and schematic starters only. User documents are processed for a single request and are not stored." });
  if (body.method === "ping") return reply(body.id, {});
  if (body.method === "tools/list") return reply(body.id, { tools: tools.map(({ inputSchema, ...item }) => ({ ...item, inputSchema })) });
  if (body.method === "tools/call") {
    try { return reply(body.id, toolResult(callTool(body.params?.name, body.params?.arguments ?? {}))); }
    catch (error) { return reply(body.id, toolResult(error instanceof Error ? error.message : "The tool call failed.", true)); }
  }
  return fail(body.id ?? null, -32601, `Method not found: ${body.method}`);
}

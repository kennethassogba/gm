import { onRequest } from "../functions/api/mcp.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/mcp") return onRequest({ request, env });
    return env.ASSETS.fetch(request);
  }
};

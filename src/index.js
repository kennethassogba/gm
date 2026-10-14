import { onRequest } from "../functions/api/mcp.js";
import {assistantRequest} from './assistant.js';
export {AssistantLedger} from './assistant.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if(url.pathname.startsWith('/api/assistant'))return assistantRequest(request,env);
    if (url.pathname === "/api/mcp") return onRequest({ request, env });
    return env.ASSETS.fetch(request);
  }
};

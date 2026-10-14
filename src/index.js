import {pdfImportRequest} from './pdf-import.js';
export {PDFImportLimits} from './pdf-import.js';
import {onRequest} from '../functions/api/mcp.js';
import {subscriptionRequest} from './subscriptions.js';
export {SubscriptionStore} from './subscriptions.js';

export default {
  async fetch(request,env){
    const {pathname}=new URL(request.url);
    if(pathname==='/api/import/pdf')return pdfImportRequest(request,env);
    if(pathname==='/api/mcp')return onRequest({request,env});
    if(['/api/preferences','/api/subscribe','/api/subscribers'].includes(pathname))return subscriptionRequest(request,env);
    if(pathname.startsWith('/api/'))return Response.json({error:'Not found.'},{status:404});
    return env.ASSETS.fetch(request);
  }
};

const $=id=>document.getElementById(id);
export const pdfCard=`<button class="model-card pdf-card" data-pdf-import><span class="art"><svg viewBox="0 0 230 112" aria-hidden="true"><path d="M79 18h43l18 18v58H79Z M122 18v20h18 M91 52h35 M91 62h23 M91 72h17"/><path class="pdf-cube" d="m155 52 20 11v23l-20 11-20-11V63Zm-20 11 20 11 20-11m-20 11v23"/></svg></span><span class="card-name"><span>From PDF</span><span class="arrow" aria-hidden="true">+</span></span></button>`;
export function installPDFImport({openModel}){
 const dialog=$('pdf-dialog'),form=$('pdf-form'),status=$('pdf-status');let file=null,result=null,controller=null,worker=null,job=0,url=null,sourcePages=[];
 const text=(id,value)=>$(id).textContent=value;
 function list(id,values){$(id).replaceChildren(...values.map(value=>{const li=document.createElement('li');li.textContent=value;return li;}));}
 function preview(axis='xy'){
  if(!result?.model)return;
  if(!worker){worker=new Worker('/pdf-preview-worker.js',{type:'module'});worker.onmessage=({data})=>{if(data.id!==job)return;if(data.error){text('pdf-preview-label','Preview unavailable. Open the model to inspect it.');return;}$('pdf-preview').getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.pixels),320,220),0,0);text('pdf-preview-label',data.axis.toUpperCase()+' section - '+data.position.toFixed(2)+' cm');};worker.onerror=()=>text('pdf-preview-label','Preview unavailable. Open the model to inspect it.');}
  worker.postMessage({id:++job,model:result.model,axis});
  document.querySelectorAll('[data-pdf-axis]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pdfAxis===axis)));
 }
 function resetResult(){result=null;$('pdf-result').hidden=true;$('pdf-review').hidden=true;$('pdf-open').hidden=true;$('pdf-generate').hidden=false;list('pdf-needs',[]);status.textContent='';}
 function selectFile(next){
  if(controller)return;resetResult();file=null;$('pdf-generate').disabled=true;
  if(!next)return;
  if(next.size>15*1024*1024){status.textContent='Choose a PDF smaller than 15 MB, or export just the relevant pages.';return;}
  if(!/\.pdf$/i.test(next.name)){status.textContent='Choose a PDF file.';return;}
  file=next;text('pdf-file-name',next.name);text('pdf-file-detail','Choose another PDF');$('pdf-generate').disabled=false;
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([next],{type:'application/pdf'}));$('pdf-source').href=url;
 }
 function open(){dialog.showModal();$('pdf-file').focus();}
 document.addEventListener('click',event=>{if(event.target.closest('[data-pdf-import]'))open();const axis=event.target.closest('[data-pdf-axis]')?.dataset.pdfAxis;if(axis)preview(axis);});
 $('pdf-file').onchange=event=>selectFile(event.target.files[0]);
 const drop=$('pdf-drop');drop.ondragover=event=>{event.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=event=>{event.preventDefault();drop.classList.remove('dragging');selectFile(event.dataTransfer.files[0]);};
 $('pdf-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{controller?.abort();worker?.terminate();worker=null;job++;});
 $('pdf-open').onclick=()=>{if(result?.model){const model=result.model;dialog.close();openModel(model);}};
 $('pdf-case').oninput=()=>{if(result?.model){resetResult();text('pdf-status','Case changed. Create a new preview to apply it.');}};
 form.onsubmit=async event=>{
  event.preventDefault();if(!file||controller)return;resetResult();
  controller=new AbortController();const active=controller;const timeout=setTimeout(()=>active.abort(),190000);
  form.setAttribute('aria-busy','true');$('pdf-generate').disabled=true;$('pdf-file').disabled=true;$('pdf-case').disabled=true;text('pdf-status','Reading the PDF and building geometry...');
  try{
   const session=await fetch('/api/import/pdf',{signal:active.signal});if(!session.ok){const data=await session.json();throw new Error(data.error);}
   const response=await fetch('/api/import/pdf',{method:'POST',headers:{'content-type':'application/pdf','x-pdf-name':encodeURIComponent(file.name),'x-pdf-case':encodeURIComponent($('pdf-case').value)},body:file,signal:active.signal});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'The import failed. Try another PDF.');
   result=data;text('pdf-status',data.summary);list('pdf-needs',data.needs||[]);
   if(data.model){
    $('pdf-result').hidden=false;$('pdf-open').hidden=false;$('pdf-generate').hidden=true;
    text('pdf-result-title',data.model.name);text('pdf-result-count',data.model.cells.filter(c=>!c.background).length+' cells - '+data.model.materials.length+' materials');
    sourcePages=[...new Set(data.model.metadata.pdf.steps.flatMap(s=>s.pages))].sort((a,b)=>a-b);
    text('pdf-source','Source PDF - pages '+sourcePages.join(', '));$('pdf-source').href=url+'#page='+(sourcePages[0]||1);
    list('pdf-notes',data.notes||[]);$('pdf-review').hidden=!data.notes?.length;text('pdf-review-title','Review '+(data.notes?.length||0)+' notes');
    preview();$('pdf-open').focus();
   }else{list('pdf-needs',data.needs||[]);text('pdf-status',data.summary||'Add the missing details below, then create the model again.');}
  }catch(error){text('pdf-status',active.signal.aborted?'Import stopped. You can try again.':error.message||'The import failed. Try again.');}
  finally{clearTimeout(timeout);controller=null;form.removeAttribute('aria-busy');$('pdf-generate').disabled=!file;$('pdf-file').disabled=false;$('pdf-case').disabled=false;}
 };
}

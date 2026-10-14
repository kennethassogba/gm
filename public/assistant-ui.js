const $=id=>document.getElementById(id);
const fingerprint=m=>JSON.stringify([m.id,m.name,m.surfaces,m.cells,m.materials,m.universes,m.lattices,m.focus]);
const preference=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch{/* In-memory settings still work. */}};
const money=value=>'$'+Number(value||0).toFixed(3);

export function installAssistant({getModel,prepareModel,ensureModel,applyModel,undo,notice}){
  let enabled=preference('gm.assistant.enabled','true')!=='false',busy=false,proposal=null,lastApplied=null,recognition=null;
  function setEnabled(value){
    enabled=value;remember('gm.assistant.enabled',String(value));$('assistant').hidden=!value;
    $('assistant-enabled').checked=value;$('assistant-toggle').setAttribute('aria-pressed',String(value));
    if(!value)recognition?.abort();
  }
  setEnabled(enabled);
  const say=text=>{$('assistant-status').textContent=text;$('assistant-status').hidden=!text;};
  const usage=data=>{
    $('usage-value').textContent=money(data.spent)+' / $0.50';$('usage-meter').value=Math.min(data.spent||0,.5);
    $('usage-reset').textContent='Resets '+new Date(data.resetsAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' (midnight UTC).';
    $('mailing-list').hidden=!data.mailingList;
  };
  async function refreshUsage(){
    $('usage-value').textContent='Loading...';
    try{const response=await fetch('/api/assistant/usage',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error);usage(data);$('assistant-connection').textContent=data.available?'Prompts and geometry context go to OpenAI when you send.':'OpenAI is not connected yet.';}
    catch{$('usage-value').textContent='Unavailable';$('usage-reset').textContent='Connect to the internet to check your allowance.';}
  }
  $('assistant-toggle').onclick=()=>{ensureModel();setEnabled(true);$('assistant-prompt').focus();};
  $('assistant-close').onclick=()=>{setEnabled(false);$('assistant-toggle').focus();};
  $('assistant-enabled').onchange=e=>setEnabled(e.target.checked);
  $('preferences').onclick=()=>{$('preferences-dialog').showModal();refreshUsage();};
  $('assistant-usage').onclick=()=>{$('preferences-dialog').showModal();refreshUsage();};
  $('preferences-close').onclick=()=>$('preferences-dialog').close();
  $('assistant-form').onsubmit=async e=>{
    e.preventDefault();if(busy||!enabled)return;
    const prompt=$('assistant-prompt').value.trim();if(!prompt)return;
    ensureModel();const before=fingerprint(getModel());let model;
    try{model=prepareModel();}catch{say('Select the cell again before editing this occurrence.');return;}proposal=null;lastApplied=null;
    busy=true;$('assistant-submit').disabled=true;$('assistant-prompt').readOnly=true;$('assistant').setAttribute('aria-busy','true');
    $('assistant-download').hidden=true;$('assistant-undo').hidden=true;say('Building geometry...');
    try{
      const response=await fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,model})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not generate geometry. Try again.');
      if(data.model){
        proposal=data.model;$('assistant-download').hidden=false;
        if(enabled&&fingerprint(getModel())===before){
          applyModel(data.model);lastApplied=fingerprint(getModel());$('assistant-undo').hidden=false;$('assistant-prompt').value='';
          say(data.message||'Geometry updated.');
        }else say(enabled?'Your geometry changed while I was working. Download the proposal to keep both versions.':'The assistant was disabled. Your proposal is available as JSON.');
      }else say(data.message||'Add the dimensions or describe the shape.');
    }catch(error){say(error.message==='Failed to fetch'?'You are offline. Reconnect to use the assistant.':error.message);}
    finally{busy=false;$('assistant-submit').disabled=false;$('assistant-prompt').readOnly=false;$('assistant').removeAttribute('aria-busy');if(enabled)$('assistant-prompt').focus();}
  };
  $('assistant-prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('assistant-form').requestSubmit();}if(e.key==='Escape'){e.preventDefault();$('view-3d').focus();}};
  $('assistant-undo').onclick=()=>{if(lastApplied&&fingerprint(getModel())===lastApplied){undo();say('Change undone.');}else notice('Use the undo button to step back through your changes.');$('assistant-undo').hidden=true;};
  $('assistant-download').onclick=()=>{
    if(!proposal)return;const blob=new Blob([JSON.stringify(proposal,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='gm-proposal.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SpeechRecognition){
    $('assistant-mic').hidden=false;
    $('assistant-mic').onclick=()=>{
      if(recognition){recognition.stop();return;}if(busy)return;
      recognition=new SpeechRecognition();recognition.lang=navigator.language;recognition.interimResults=false;
      recognition.onresult=e=>{$('assistant-prompt').value=($('assistant-prompt').value+' '+e.results[0][0].transcript).trim().slice(0,3000);say('Review the text, then send.');};
      recognition.onerror=()=>say('Dictation stopped. You can type your request.');
      recognition.onend=()=>{recognition=null;$('assistant-mic').setAttribute('aria-pressed','false');};
      try{recognition.start();$('assistant-mic').setAttribute('aria-pressed','true');say('Listening with your browser. Tap the microphone to stop.');}catch{recognition=null;say('Dictation is unavailable. Type your request.');}
    };
  }
  $('mailing-form').onsubmit=async e=>{
    e.preventDefault();const button=$('mailing-submit');button.disabled=true;
    try{const response=await fetch('/api/assistant/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('mailing-email').value,consent:$('mailing-consent').checked,website:$('mailing-website').value})}),data=await response.json();if(!response.ok)throw new Error(data.error);$('mailing-status').textContent='You are on the list.';$('mailing-form').reset();}
    catch(error){$('mailing-status').textContent=error.message||'Could not subscribe. Try again.';}finally{button.disabled=false;}
  };
  $('mailing-remove').onclick=async()=>{
    try{const response=await fetch('/api/assistant/subscribe',{method:'DELETE'});if(!response.ok)throw new Error();$('mailing-status').textContent='Subscription removed for this browser.';}catch{$('mailing-status').textContent='Could not remove the subscription. Try again.';}
  };
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='a'&&!document.querySelector('dialog[open]')){e.preventDefault();$('assistant-toggle').click();}});
}

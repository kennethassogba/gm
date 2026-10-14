const $=id=>document.getElementById(id);
const fingerprint=m=>JSON.stringify([m.id,m.name,m.surfaces,m.cells,m.materials,m.universes,m.lattices,m.focus]);
const preference=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const remember=(key,value)=>{try{localStorage.setItem(key,value);}catch{/* In-memory settings still work. */}};
const money=value=>'$'+Number(value||0).toFixed(3);

export function installAssistant({getModel,prepareModel,applyModel,undo,notice}){
  let enabled=preference('gm.assistant.enabled','true')!=='false',busy=false,proposal=null,lastApplied=null,recognition=null;
  const clean=text=>String(text??'').replace(/[\u2013\u2014]/g,'-');
  let messages=[];
  try{const saved=JSON.parse(preference('gm.chat.v1','[]'));if(Array.isArray(saved))messages=saved.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-60).map(m=>({...m,content:clean(m.content).slice(0,4000)}));}catch{}
  function renderHistory(){
    const list=$('chat-history-messages');list.replaceChildren();
    if(!messages.length){const p=document.createElement('p');p.className='muted';p.textContent='Your conversation will appear here.';list.append(p);}
    for(const message of messages){const row=document.createElement('article'),label=document.createElement('span'),body=document.createElement('p');row.className='chat-message '+message.role;label.className='chat-speaker';label.textContent=message.role==='user'?'You':'GM';body.textContent=message.content;row.append(label,body);list.append(row);}
    $('chat-clear').disabled=busy||!messages.length;
  }
  function append(role,content){messages.push({role,content:clean(content).slice(0,4000)});messages=messages.slice(-60);remember('gm.chat.v1',JSON.stringify(messages));renderHistory();}
  function recentHistory(){const result=[];let size=0;for(const message of messages.slice(-12).reverse()){const n=new TextEncoder().encode(JSON.stringify(message)).length;if(size+n>30000)break;result.unshift({role:message.role,content:message.content});size+=n;}return result;}
  $('assistant-history').onclick=()=>{renderHistory();$('chat-history-dialog').showModal();$('chat-history-messages').scrollTop=$('chat-history-messages').scrollHeight;};
  $('chat-history-close').onclick=()=>$('chat-history-dialog').close();
  $('chat-continue').onclick=()=>{$('chat-history-dialog').close();$('assistant-prompt').focus({preventScroll:true});};
  $('chat-clear').onclick=()=>{if(busy||!confirm('Clear the chat history saved in this browser?'))return;messages=[];remember('gm.chat.v1','[]');renderHistory();say('');};
  function setEnabled(value){
    enabled=value;remember('gm.assistant.enabled',String(value));$('assistant').hidden=!value;
    $('assistant-enabled').checked=value;$('assistant-toggle').setAttribute('aria-pressed',String(value));
    if(!value)recognition?.abort();
  }
  setEnabled(enabled);
  const say=text=>{$('assistant-status').textContent=clean(text);$('assistant-status').hidden=!text;};
  const usage=data=>{
    $('usage-value').textContent=money(data.spent)+' / $0.50';$('usage-meter').value=Math.min(data.spent||0,.5);
    $('usage-reset').textContent='Resets '+new Date(data.resetsAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' (midnight UTC).';
    $('mailing-list').hidden=!data.mailingList;
    $('mailing-form').hidden=!!data.subscribed;$('mailing-remove').hidden=!data.subscribed;
    $('mailing-status').textContent=data.subscribed?'You are on the list.':'';
  };
  async function refreshUsage(){
    $('usage-value').textContent='Loading...';
    try{const response=await fetch('/api/assistant/usage',{cache:'no-store'}),data=await response.json();if(!response.ok)throw new Error(data.error);usage(data);$('assistant-connection').textContent=data.available?'Messages and geometry context are sent to the AI service when you send.':'The assistant is not connected yet.';}
    catch{$('usage-value').textContent='Unavailable';$('usage-reset').textContent='Connect to the internet to check your allowance.';}
  }
  $('assistant-toggle').onclick=()=>{setEnabled(true);$('assistant-prompt').focus({preventScroll:true});};
  $('assistant-close').onclick=()=>{setEnabled(false);$('assistant-toggle').focus();};
  $('assistant-enabled').onchange=e=>setEnabled(e.target.checked);
  $('preferences').onclick=()=>{$('preferences-dialog').showModal();refreshUsage();};
  $('assistant-usage').onclick=()=>{$('preferences-dialog').showModal();refreshUsage();};
  $('preferences-close').onclick=()=>$('preferences-dialog').close();
  $('assistant-form').onsubmit=async e=>{
    e.preventDefault();if(busy||!enabled)return;
    const prompt=$('assistant-prompt').value.trim();if(!prompt)return;
    const before=fingerprint(getModel()),history=recentHistory();let model;
    try{model=prepareModel();}catch{say('Select the cell again before editing this occurrence.');return;}proposal=null;lastApplied=null;
    append('user',prompt);$('assistant-prompt').value='';
    busy=true;$('chat-clear').disabled=true;$('assistant-submit').disabled=true;$('assistant-prompt').readOnly=true;$('assistant').setAttribute('aria-busy','true');
    $('assistant-download').hidden=true;$('assistant-undo').hidden=true;say('Thinking...');
    try{
      const response=await fetch('/api/assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,model,history})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not send your message. Try again.');
      if(data.usage)usage(data.usage);
      let reply=data.message||'Done.';
      if(data.model){
        proposal=data.model;$('assistant-download').hidden=false;
        if(enabled&&fingerprint(getModel())===before){
          applyModel(data.model);lastApplied=fingerprint(getModel());$('assistant-undo').hidden=false;
          reply=data.message||'Geometry updated.';
        }else reply=enabled?'Your geometry changed while I was working. The proposal was not applied. Download the JSON to keep it.':'The assistant was disabled. The proposal was not applied; it is available as JSON.';
      }
      append('assistant',reply);say(reply);
    }catch(error){const message=error.message==='Failed to fetch'?'You are offline. Reconnect to send your message.':error.message;append('assistant','Request failed. No geometry was changed. '+message);say(message);$('assistant-prompt').value=prompt;}
    finally{busy=false;renderHistory();$('assistant-submit').disabled=false;$('assistant-prompt').readOnly=false;$('assistant').removeAttribute('aria-busy');if(enabled&&!document.querySelector('dialog[open]')&&matchMedia('(pointer:fine)').matches)$('assistant-prompt').focus({preventScroll:true});}
  };
  $('assistant-prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('assistant-form').requestSubmit();}if(e.key==='Escape'){e.preventDefault();$('assistant-prompt').blur();$('assistant-toggle').focus({preventScroll:true});}};
  $('assistant-undo').onclick=()=>{if(lastApplied&&fingerprint(getModel())===lastApplied){undo();append('assistant','The last geometry change was undone.');say('Change undone.');}else notice('Use the undo button to step back through your changes.');$('assistant-undo').hidden=true;};
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
    try{const response=await fetch('/api/assistant/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('mailing-email').value,consent:$('mailing-consent').checked,website:$('mailing-website').value})}),data=await response.json();if(!response.ok)throw new Error(data.error);$('mailing-status').textContent='You are on the list.';$('mailing-form').reset();$('mailing-form').hidden=true;$('mailing-remove').hidden=false;}
    catch(error){$('mailing-status').textContent=error.message||'Could not subscribe. Try again.';}finally{button.disabled=false;}
  };
  $('mailing-remove').onclick=async()=>{
    try{const response=await fetch('/api/assistant/subscribe',{method:'DELETE'});if(!response.ok)throw new Error();$('mailing-status').textContent='Unsubscribed.';$('mailing-form').hidden=false;$('mailing-remove').hidden=true;}catch{$('mailing-status').textContent='Could not remove the subscription. Try again.';}
  };
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='a'&&!document.querySelector('dialog[open]')){e.preventDefault();$('assistant-toggle').click();}});
}

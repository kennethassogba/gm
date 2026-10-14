const $=id=>document.getElementById(id);
export function installPreferences(){
  const status=$('mailing-status');
  function showSubscription(subscribed){$('mailing-form').hidden=subscribed;$('mailing-remove').hidden=!subscribed;}
  async function request(path,options){const response=await fetch(path,options);const data=await response.json();if(!response.ok)throw new Error(data.error||'Please try again.');return data;}
  $('preferences').onclick=async()=>{
    $('preferences-dialog').showModal();
    try{const data=await request('/api/preferences');$('mailing-list').hidden=!data.mailingList;showSubscription(data.subscribed);status.textContent=data.subscribed?'You are on the list.':'';}catch{$('mailing-list').hidden=true;}
  };
  $('preferences-close').onclick=()=>$('preferences-dialog').close();
  $('mailing-form').onsubmit=async event=>{
    event.preventDefault();$('mailing-submit').disabled=true;status.textContent='';
    try{await request('/api/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('mailing-email').value,consent:$('mailing-consent').checked,website:$('mailing-website').value})});$('mailing-form').reset();showSubscription(true);status.textContent='You are on the list.';}catch(error){status.textContent=error.message;}finally{$('mailing-submit').disabled=false;}
  };
  $('mailing-remove').onclick=async()=>{
    $('mailing-remove').disabled=true;
    try{await request('/api/subscribe',{method:'DELETE'});showSubscription(false);status.textContent='Unsubscribed.';}catch(error){status.textContent=error.message;}finally{$('mailing-remove').disabled=false;}
  };
}

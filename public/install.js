const $=id=>document.getElementById(id);
export function installApp(){
  let deferred=null,edits=0;const openedAt=Date.now();
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const android=/Android/.test(navigator.userAgent);
  const safari=/Safari/.test(navigator.userAgent)&&!/Chrome|Chromium|Edg/.test(navigator.userAgent);
  const dismissed=()=>{try{return Number(localStorage.getItem('gm.install.dismissed')||0)>Date.now()-30*86400000;}catch{return false;}};
  function dismiss(){$('install-nudge').hidden=true;try{localStorage.setItem('gm.install.dismissed',String(Date.now()));}catch{}}
  function suggest(){if(edits>=4&&Date.now()-openedAt>=90000&&!installed()&&!dismissed()&&(deferred||ios||safari||android))$('install-nudge').hidden=false;}
  setTimeout(suggest,90000);
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;suggest();});
  addEventListener('appinstalled',()=>{deferred=null;$('install-nudge').hidden=true;$('install-app').textContent='Installed';$('install-app').disabled=true;});
  addEventListener('gm:modelchange',()=>{edits++;suggest();});
  $('install-dismiss').onclick=dismiss;
  const open=async()=>{
    if(deferred){await deferred.prompt();const choice=await deferred.userChoice;deferred=null;if(choice.outcome==='dismissed')dismiss();return;}
    $('install-instructions').textContent=ios?'In Safari, open Share, choose Add to Home Screen, turn on Open as Web App, then tap Add.':android?'In Chrome, open the browser menu and choose Add to Home screen or Install app.':safari?'In Safari, choose File > Add to Dock.':'In Chrome or Edge, use the install icon in the address bar, or the browser menu > Install GM.';
    $('install-dialog').showModal();
  };
  $('install-app').onclick=open;$('install-nudge-button').onclick=open;$('install-close').onclick=()=>$('install-dialog').close();
  if(installed()){$('install-app').textContent='Installed';$('install-app').disabled=true;}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  const resize=()=>document.documentElement.style.setProperty('--workspace-height',(window.visualViewport?.scale===1?window.visualViewport.height:window.innerHeight)+'px');
  window.visualViewport?.addEventListener('resize',resize);resize();
}

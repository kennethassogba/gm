// One menu for pointer, keyboard and visible overflow buttons.
export function createContextMenu(onError){
 const menu=document.createElement('div');menu.className='context-menu';menu.setAttribute('role','menu');menu.hidden=true;document.body.append(menu);let trigger;
 function close(restore=false){menu.hidden=true;menu.replaceChildren();if(restore&&trigger?.isConnected)trigger.focus();}
 function open(items,{x,y,anchor=document.activeElement,label='Actions'}={}){
  close();trigger=anchor;menu.setAttribute('aria-label',label);
  for(const item of items){if(!item){const hr=document.createElement('hr');hr.setAttribute('role','separator');menu.append(hr);continue;}
   const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=item.label;button.disabled=!!item.disabled;button.classList.toggle('danger',!!item.danger);button.tabIndex=-1;
   if(item.current)button.setAttribute('aria-current','page');
   if(item.shortcut){const hint=document.createElement('kbd');hint.textContent=item.shortcut;hint.setAttribute('aria-hidden','true');button.append(hint);}
   button.onclick=()=>{close(true);Promise.resolve().then(item.run).catch(error=>onError(error.message));};menu.append(button);
  }
  const rect=anchor?.getBoundingClientRect?.();menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
  menu.style.left=Math.max(8,Math.min(x??rect?.left??8,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y??rect?.bottom??8,innerHeight-menu.offsetHeight-8))+'px';
  menu.querySelector('button:not(:disabled)')?.focus();
 }
 menu.addEventListener('keydown',event=>{
  const buttons=[...menu.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}
  if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();close(true);}event.stopPropagation();
 });
 document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target))close();},true);
 document.addEventListener('scroll',()=>close(),true);window.addEventListener('resize',()=>close());
 return{open,close,get visible(){return !menu.hidden;}};
}

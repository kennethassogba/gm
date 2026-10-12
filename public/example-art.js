export function generalArt(id){
 const fill='#a6bac4',dark='#191b22';let shape;
 const block='<rect x="73" y="21" width="84" height="70" rx="2" fill="'+fill+'"/>';
 if(id==='box')shape=block;
 if(id==='cutter')shape=block+'<circle cx="115" cy="56" r="21" fill="#7379e8" fill-opacity=".8" stroke="#bbbfff" stroke-dasharray="4 3"/>';
 if(id==='drilled-block')shape=block+'<circle cx="115" cy="56" r="21" fill="'+dark+'"/>';
 if(id==='joined-pipes')shape='<path d="M55 76H175V40h-40V12h-36v28H55Z" fill="'+fill+'"/><path d="M55 66H175V50h-50V12h-16v38H55Z" fill="'+dark+'"/>';
 if(id==='spherical-shell')shape='<circle cx="115" cy="56" r="38" fill="'+fill+'"/><circle cx="115" cy="56" r="30" fill="'+dark+'"/>';
 if(id==='nested-spheres')shape='<circle cx="115" cy="56" r="40" fill="#888a91"/><circle cx="115" cy="56" r="23" fill="#d99b58"/>';
 if(id==='slab-shield')shape='<rect x="76" y="16" width="20" height="80" fill="#9e91ba"/><rect x="98" y="16" width="36" height="80" fill="#d9bd89"/><rect x="136" y="16" width="20" height="80" fill="#8896a1"/>';
 if(id==='shield-duct')shape='<path d="M48 25H127L98 87H48ZM145 25H182V87H116Z" fill="#afa89a"/>';
 if(id==='collimator')shape='<rect x="52" y="22" width="126" height="68" rx="2" fill="#8b96ae"/>'+[79,115,151].map(x=>'<circle cx="'+x+'" cy="56" r="9" fill="'+dark+'"/>').join('');
 if(id==='detector')shape='<rect x="78" y="12" width="74" height="88" rx="3" fill="'+fill+'"/><rect x="84" y="18" width="62" height="76" fill="'+dark+'"/><rect x="92" y="27" width="46" height="58" rx="2" fill="#65b9ba"/>';
 return shape?'<svg viewBox="0 0 230 112" aria-hidden="true" fill="none" stroke="none">'+shape+'</svg>':null;
}

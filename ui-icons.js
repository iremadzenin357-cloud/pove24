/* პოვე icon system: compact custom Lucide-style inline SVGs and presentation-only UI enhancement. */
const dayIconPaths={
home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/>',
user:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/>',
users:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
chevronDown:'<path d="m6 9 6 6 6-6"/>',
chevronRight:'<path d="m9 18 6-6-6-6"/>',
chevronLeft:'<path d="m15 18-6-6 6-6"/>',
settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.4.8l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.4-.8l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.6l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.4-.8l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.4.8l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.6Z"/>',
message:'<path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-4.7A8 8 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z"/>',
heart:'<path d="M20.8 8.7c0 4.1-8.8 10.3-8.8 10.3S3.2 12.8 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/>',
phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.8L7.1 10a16 16 0 0 0 6 6l1.7-1.9a2 2 0 0 1 1.8-.6l2.8.5a2 2 0 0 1 1.6 2Z"/>',
mapPin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3"/>',
star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
flag:'<path d="M5 21V5m0 0c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
alert:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5m0 3h.01"/>',
checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
userCheck:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
xCircle:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
sliders:'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/>',
arrowRight:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
logout:'<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6m-6 4h6m-6 4h4"/>',
package:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 8 9 5 9-5m-9 5v8m-9-13v10l9 5 9-5V8"/>',
wrench:'<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18a2.1 2.1 0 0 0 3 3l5.3-5.3a5 5 0 0 0 6.4-6.4L15 12l-3-3 2.7-2.7Z"/>',
leaf:'<path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 10-6 8-16Z"/><path d="M4 21c3-6 7-9 13-12"/>',
truck:'<path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z"/><circle cx="7.5" cy="19" r="2"/><circle cx="17.5" cy="19" r="2"/>',
laptop:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20l-2-4H4l-2 4Z"/>',
paw:'<ellipse cx="12" cy="15" rx="5" ry="4"/><ellipse cx="5" cy="9" rx="1.7" ry="2.3"/><ellipse cx="10" cy="6" rx="1.7" ry="2.3"/><ellipse cx="15" cy="6" rx="1.7" ry="2.3"/><ellipse cx="19" cy="9" rx="1.7" ry="2.3"/>',
shoppingCart:'<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h2l2.5 12.5a2 2 0 0 0 2 1.5h9.8a2 2 0 0 0 2-1.6L22 8H5"/>',
broom:'<path d="m14 4 6 6M4 20l10-10M3 21l3-1-2-2-1 3Zm11-11 5-5 2 2-5 5"/>',
baby:'<circle cx="12" cy="12" r="9"/><path d="M8 15s1.5 2 4 2 4-2 4-2M9 10h.01M15 10h.01M8 4l1-2m7 2-1-2"/>',
car:'<path d="m5 11 1.5-5h11l1.5 5m2 0H3v7h18v-7ZM6 18v2m12-2v2"/><circle cx="7" cy="14.5" r=".8"/><circle cx="17" cy="14.5" r=".8"/>',
party:'<path d="m5 20 8-16 6 16H5Z"/><path d="m9 13 4 2m4-14 1 2m4 3 2-1M3 6l2 1M2 14l2-1"/>',
building:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4M8 7h1m6 0h1M8 11h1m6 0h1"/>',
navigation:'<path d="m3 11 18-8-8 18-2-8-8-2Z"/>',
edit:'<path d="m16 4 4 4M4 20l4-.8L20 7a2.8 2.8 0 0 0-4-4L4.8 15.2 4 20Z"/>',
trash:'<path d="M3 6h18m-2 0-1 15H6L5 6m4 0V4h6v2m-5 4v7m4-7v7"/>',
filter:'<path d="M4 6h16M7 12h10m-7 6h4"/>',
more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h17m-4 6h.01"/>',
chart:'<path d="M4 19V5m0 14h17M8 15v-4m5 4V7m5 8v-6"/>',
eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
eyeOff:'<path d="m3 3 18 18M10.6 10.6A2 2 0 0 0 13.4 13.4M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a15.5 15.5 0 0 1-3.2 4.1M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.1 0 2.1-.2 3-.5"/>'
};
function dayIcon(name,size,extraClass){return '<svg class="day-icon '+(extraClass||'')+'" width="'+(size||18)+'" height="'+(size||18)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(dayIconPaths[name]||dayIconPaths.more)+'</svg>'}
function dayAvatar(profile,size){const root=document.createElement('span');root.className='day-avatar';root.style.setProperty('--avatar-size',(size||34)+'px');if(profile?.email)root.dataset.avatarEmail=profile.email;root.innerHTML=avatarContents(profile);return root}
function dayEmojiMap(){return {'👤':'user','👥':'users','📋':'clipboard','📊':'chart','♡':'heart','♥':'heart','💬':'message','⚙️':'settings','⚙':'settings','🚪':'logout','💼':'briefcase','🔍':'search','🔎':'search','📍':'mapPin','📞':'phone','🚩':'flag','📅':'calendar','⏰':'clock','⏱️':'timer','⏱':'timer','💰':'wallet','🗂️':'clipboard','🗂':'clipboard','⭐':'star','★':'star','☆':'star','🚨':'alert','✅':'checkCircle','✓':'checkCircle','⚠':'alert','🟢':'checkCircle','🟡':'userCheck','🔵':'clock','🔴':'checkCircle','⚪':'xCircle','🏠':'home','🐾':'paw','👵':'users','👶':'baby','📦':'package','🔨':'wrench','🌱':'leaf','🚗':'car','🎉':'party','💻':'laptop','🛒':'shoppingCart','🔧':'wrench','🧹':'broom','🐕':'paw','☰':'menu','＋':'plus','⌄':'chevronDown','⌖':'mapPin','◷':'clock','✕':'xCircle','✦':'star','❋':'broom','☘':'leaf','➜':'arrowRight','↗':'arrowRight','♬':'party','⌕':'search','→':'arrowRight','⋯':'more'} }
function convertDayIcons(root){if(!root||root.nodeType!==1)return;root.querySelectorAll('.cat-icon').forEach(el=>{if(el.dataset.iconized)return;const title=el.parentElement?.querySelector('strong')?.textContent||'',name=title.includes('სახლის')?'home':title.includes('ცხოველ')?'paw':title.includes('ადამიან')?'users':title.includes('ფიზიკურ')?'package':title.includes('რემონტ')?'wrench':title.includes('ეზო')?'leaf':title.includes('მიტან')?'truck':title.includes('ღონისძი')?'party':title.includes('ონლაინ')?'laptop':title.includes('ყოველდღ')?'clipboard':'more';el.innerHTML=dayIcon(name,22);el.dataset.iconized='true'});
const nav=document.querySelector('.header .nav');if(nav){nav.querySelectorAll(':scope > a[href]').forEach(a=>{if(a.querySelector('.day-icon'))return;const href=(a.getAttribute('href')||'').split('?')[0],name=href==='#/'?'home':href==='#/jobs'?'search':href==='#/workers'?'users':href==='#/start'?'plus':href==='#/how'?'clipboard':href==='#/login'?'user':null;if(!name)return;const label=a.textContent.trim();a.innerHTML=dayIcon(name,17)+'<span>'+esc(label)+'</span>'})}
const menu=document.querySelector('#menuToggle');if(menu&&!menu.querySelector('.day-icon'))menu.innerHTML=dayIcon('menu',18);
const cta=document.querySelector('.header-cta');if(cta&&!cta.querySelector('.day-icon')){const label=cta.childNodes[0]?.textContent?.trim()||'განცხადების დამატება';cta.innerHTML='<span class="cta-label">'+esc(label)+'</span>'+dayIcon('plus',19)}
 const account=document.querySelector('.account-nav-trigger');if(account&&!account.querySelector('.day-avatar')){const name=user?.name||account.textContent.replace('⌄','').trim();account.replaceChildren(dayAvatar(user,34));const nm=document.createElement('span');nm.className='account-name';nm.textContent=name;account.append(nm);account.insertAdjacentHTML('beforeend',dayIcon('chevronDown',16));account.setAttribute('aria-label',name+' — ანგარიშის მენიუ');account.setAttribute('aria-haspopup','true');account.setAttribute('aria-controls','account-menu');}
 const drop=document.querySelector('.account-dropdown');if(drop){drop.id='account-menu';drop.setAttribute('aria-label','ანგარიშის მენიუ');if(!drop.querySelector('.account-dropdown-head')){const head=document.createElement('div');head.className='account-dropdown-head';head.append(dayAvatar(user,42));const info=document.createElement('div');info.className='account-dropdown-user';info.innerHTML='<strong>'+esc(user?.name||'მომხმარებელი')+'</strong><small>'+esc(user?.email||'')+'</small>';head.append(info);drop.prepend(head);drop.querySelectorAll('a').forEach(a=>{if(a.querySelector('.day-icon'))return;const href=(a.getAttribute('href')||'').split('?')[0],kind=href==='#/profile'?'user':href==='#/messages'?'message':href==='#/saved'?'heart':href==='#/'?'logout':href==='#/admin'?'shield':href==='#/dashboard'?'clipboard':'clipboard';a.insertAdjacentHTML('afterbegin',dayIcon(kind,18))})}}
const tokenMap=dayEmojiMap(),tokens=Object.keys(tokenMap).sort((a,b)=>b.length-a.length),tokenRe=new RegExp(tokens.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu');
const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){const p=n.parentElement;if(!p||p.closest('svg,script,style,textarea,input,[contenteditable="true"],.job-description,.review-item p,.chat-message p,.review-stars,.star-picker'))return NodeFilter.FILTER_REJECT;if(!n.nodeValue||!tokens.some(t=>n.nodeValue.includes(t)))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});
const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){const control=node.parentElement?.closest('a,button');if(control?.querySelector('.day-icon')){const escapedTokens=tokens.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const leadingIcon=new RegExp('^\\s*(?:'+escapedTokens.join('|')+')\\s*','u'),clean=node.nodeValue.replace(leadingIcon,'');if(clean!==node.nodeValue){node.nodeValue=clean;continue}}const text=node.nodeValue,frag=document.createDocumentFragment();let last=0,match;tokenRe.lastIndex=0;while((match=tokenRe.exec(text))){if(match.index>last)frag.append(document.createTextNode(text.slice(last,match.index)));const holder=document.createElement('span');holder.className='day-icon-wrap';holder.innerHTML=dayIcon(tokenMap[match[0]],17);frag.append(holder);last=match.index+match[0].length}if(last<text.length)frag.append(document.createTextNode(text.slice(last)));node.replaceWith(frag)}
const starContainers=new Set(root.querySelectorAll('.review-stars,.star-picker')),starAncestor=root.closest?.('.review-stars,.star-picker');if(starAncestor)starContainers.add(starAncestor);starContainers.forEach(el=>{if(el.matches('.star-picker'))el.querySelectorAll('[data-star],[data-secure-star],[data-star-secure]').forEach(b=>{if(!/[★☆]/.test(b.textContent))return;const val=b.textContent.includes('★');b.innerHTML=dayIcon('star',24,val?'is-filled':'')});else if(/[★☆]/.test(el.textContent))el.innerHTML=Array.from(el.textContent).map(ch=>dayIcon('star',15,ch==='★'?'is-filled':'is-empty')).join('')});
}
function enhanceDayHeader(){const nav=document.querySelector('.account-dropdown'),trigger=document.querySelector('.account-nav-trigger');if(!trigger)return;const expanded=trigger.getAttribute('aria-expanded')==='true';trigger.classList.toggle('is-open',expanded);if(nav){nav.classList.toggle('is-open',expanded);nav.querySelectorAll('a').forEach(a=>{if(a.querySelector('.day-icon'))return;const href=(a.getAttribute('href')||'').split('?')[0],kind=href==='#/profile'?'user':href==='#/messages'?'message':href==='#/saved'?'heart':href==='#/admin'?'shield':href==='#/'?'logout':'clipboard';a.insertAdjacentHTML('afterbegin',dayIcon(kind,18))})}}
function runDayIconEnhancement(){convertDayIcons(document.body);enhanceDayHeader()}
document.addEventListener('click',e=>{const trigger=e.target.closest('.account-nav-trigger');if(trigger){queueMicrotask(enhanceDayHeader);return}if(document.querySelector('.account-nav-trigger[aria-expanded="true"]')&&!e.target.closest('.account-nav')){const b=document.querySelector('.account-nav-trigger'),d=b?.closest('.account-nav')?.querySelector('.account-dropdown');if(window.setAccountMenuState)setAccountMenuState(b,d,false);else if(b&&d){b.setAttribute('aria-expanded','false');b.classList.remove('is-open');d.hidden=true;d.classList.remove('is-open')}}const accountLink=e.target.closest('[data-account-dropdown] a');if(accountLink){const button=document.querySelector('.account-nav-trigger'),panel=button?.closest('.account-nav')?.querySelector('.account-dropdown');if(window.setAccountMenuState)setAccountMenuState(button,panel,false);else queueMicrotask(enhanceDayHeader)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const b=document.querySelector('.account-nav-trigger[aria-expanded="true"]'),d=b?.closest('.account-nav')?.querySelector('.account-dropdown');if(b){if(window.setAccountMenuState)setAccountMenuState(b,d,false);else if(d){b.setAttribute('aria-expanded','false');b.classList.remove('is-open');d.hidden=true;d.classList.remove('is-open')}b.focus()}document.querySelectorAll('[data-location-suggestions]:not([hidden])').forEach(box=>{box.hidden=true;box.parentElement.querySelector('[data-location-role]')?.setAttribute('aria-expanded','false')})}});
runDayIconEnhancement();new MutationObserver(ms=>{for(const m of ms){if(m.target.nodeType===1)convertDayIcons(m.target);m.addedNodes.forEach(n=>{if(n.nodeType===1)convertDayIcons(n)})}}).observe(document.body,{childList:true,subtree:true});


/* Employer-managed status lifecycle. Legacy urgency data remains model-compatible,
   but its UI and product behavior are disabled in feature-config.js. */
const jobStatuses=[['active','🟢 აქტიური'],['in_progress','🔵 შესრულების პროცესში'],['completed','🔴 დასრულებული'],['cancelled','⚪ გაუქმებული']];
const employerStatusOptions=[['active','აქტიური'],['completed','დასრულებული']];
const jobStatusLabels=Object.fromEntries(jobStatuses);
const validJobStatuses=new Set(jobStatuses.map(([value])=>value));
jobs=jobs.map(job=>({...job,isUrgent:typeof job.isUrgent==='boolean'?job.isUrgent:false}));
set('dge-jobs',jobs);
const statusText=key=>jobStatusLabels[key]||jobStatusLabels.active;
function publicJobStatusBadge(status){const labels={active:['აქტიური','listing-status-active'],completed:['დასრულებული','listing-status-completed']},entry=labels[status];return entry?'<span class="listing-status-badge '+entry[1]+'">'+entry[0]+'</span>':''}
function employerStatusIcon(status){const completed=status==='completed',shape=completed?'<circle cx="12" cy="12" r="8.25"/><path d="m9 9 6 6m0-6-6 6"/>':'<circle cx="12" cy="12" r="8.25"/><path d="m8 12.2 2.6 2.6 5.4-5.5"/>';return '<span class="employer-status-icon employer-status-icon-'+(completed?'completed':'active')+'" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+shape+'</svg></span>'}
function employerStatusControl(job){const id='employer-status-'+String(job.id).replace(/[^a-zA-Z0-9_-]/g,'-'),selected=employerStatusOptions.some(([value])=>value===job.status)?job.status:'active',selectedLabel=employerStatusOptions.find(([value])=>value===selected)[1],nativeOptions=employerStatusOptions.map(([value,label])=>'<option value="'+value+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>').join(''),menuOptions=employerStatusOptions.map(([value,label])=>'<button class="site-filter-option" type="button" role="option" data-site-filter-option="'+value+'" aria-selected="'+(value===selected)+'"><span class="site-filter-option-label">'+employerStatusIcon(value)+'<span>'+esc(label)+'</span></span></button>').join('');return '<div class="status-control"><span class="status-control-label">სტატუსის შეცვლა</span><div class="site-filter-select employer-status-select" data-site-filter-select><select class="site-filter-native" name="employerStatus" data-employer-status data-job-id="'+esc(job.id)+'" tabindex="-1" aria-hidden="true">'+nativeOptions+'</select><button class="site-filter-trigger" id="'+id+'-trigger" type="button" data-site-filter-trigger role="combobox" aria-label="სტატუსის შეცვლა" aria-haspopup="listbox" aria-expanded="false" aria-controls="'+id+'-options"><span class="employer-status-current">'+employerStatusIcon(selected)+'<span data-site-filter-current>'+esc(selectedLabel)+'</span></span><svg class="site-filter-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button><div class="site-filter-menu" id="'+id+'-options" role="listbox" aria-label="განცხადების სტატუსი" hidden>'+menuOptions+'</div></div></div>'}

const detailsBeforeTemporaryStatusFields=details;
// Keep announcement details focused on the listing and its direct contact details.
details=function(id){let html=detailsBeforeTemporaryStatusFields(id).replace(/<section class="job-progress">[\s\S]*?<\/section>/,'');const job=jobs.find(item=>String(item.id)===String(id)),badge=job?publicJobStatusBadge(job.status):'';if(badge)html=html.replace('<div class="meta">','<div class="meta">'+badge);return html};
jobStatusText=function(job){return statusText(job.status||'active')};

const oldJobFlowPanel=jobFlowPanel;
jobFlowPanel=function(job){let html=oldJobFlowPanel(job),owner=!!user&&user.email===job.owner;if(owner){html=html.replace(/<button class="btn btn-secondary btn-small" data-job-status="[\s\S]*?<\/button>/,'');const select=employerStatusControl(job);const at=html.lastIndexOf('</section>');if(at>=0)html=html.slice(0,at)+select+html.slice(at)}return html};

function replaceDivWithClass(html,className,replacement){const start=html.indexOf('<div class="'+className+'">');if(start<0)return html;const re=/<div\b[^>]*>|<\/div>/g;re.lastIndex=start;let depth=0,match,end=-1;while((match=re.exec(html))){if(match[0].startsWith('</'))depth--;else depth++;if(depth===0){end=re.lastIndex;break}}return end<0?html:html.slice(0,start)+replacement+html.slice(end)}
function managementCard(job){let html=jobCard(job);if(payKind(job)==='negotiable')html=html.replace('<div class="card-bottom">','<div class="card-bottom price-agreement">').replace('<div class="price">შეთანხმებით</div>','<div class="price price-negotiable">შეთანხმებით</div>');const status=job.status||'active',tools='<div class="managed-job-tools"><span class="job-status-chip status-'+status+'">'+statusText(status)+'</span><a class="btn btn-secondary btn-small" href="#/post?edit='+encodeURIComponent(job.id)+'">განცხადების რედაქტირება</a><a class="btn btn-secondary btn-small" href="#/job/'+encodeURIComponent(job.id)+'">განცხადების ნახვა</a><button type="button" class="btn btn-small delete-job-btn" data-delete-job="'+esc(job.id)+'">განცხადების წაშლა</button>'+employerStatusControl(job)+'</div>';return html.replace('</article>',tools+'</article>')}
function normalizeOwnPostsNav(html,totalCount){const opening=html.match(/<nav\b[^>]*class=["'][^"']*\bside-menu\b[^"']*["'][^>]*>/);if(!opening)return html;const navStart=opening.index,navEnd=html.indexOf('</nav>',navStart);if(navEnd<0)return html;let nav=html.slice(navStart,navEnd+6);const links=[...nav.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].filter(link=>link[0].includes('ჩემი განცხადებები'));if(!links.length)return html;const keep=links.find(link=>/class=["'][^"']*\bactive\b/.test(link[0]))||links[links.length-1];for(const link of [...links].reverse()){if(link===keep){const label=link[0].replace(/ჩემი განცხადებები\s*\(\s*\d+\s*\)/,'ჩემი განცხადებები ('+totalCount+')');nav=nav.slice(0,link.index)+label+nav.slice(link.index+link[0].length)}else nav=nav.slice(0,link.index)+nav.slice(link.index+link[0].length)}return html.slice(0,navStart)+nav+html.slice(navEnd+6)}
function normalizeOwnPostsNavDOM(root=document){root.querySelectorAll('.side-menu').forEach(menu=>{const rows=[...menu.querySelectorAll('a,button,[role="menuitem"],li,div')].filter(row=>/^ჩემი განცხადებები(?:\s*\(\s*\d+\s*\))?\s*$/.test(row.textContent.trim())&&!row.querySelector('a,button,[role="menuitem"],li,div'));if(rows.length<2)return;const keep=rows.find(row=>row.matches('.active')||row.querySelector('.active'))||rows[rows.length-1],total=(user?jobs.filter(job=>job.owner===user.email).length:0)+(user?get('dge-workers',[]).filter(profile=>profile.owner===user.email||profile.email===user.email).length:0);keep.innerHTML=keep.innerHTML.replace(/ჩემი განცხადებები(?:\s*\(\s*\d+\s*\))?/,'ჩემი განცხადებები ('+total+')');rows.forEach(row=>{if(row!==keep)row.remove()})})}
const ownPostsNavObserver=new MutationObserver(()=>{if((location.hash||'').startsWith('#/dashboard'))normalizeOwnPostsNavDOM(app)});
ownPostsNavObserver.observe(app,{childList:true,subtree:true});
const baseDashboardWithStatuses=dashboard;
dashboard=function(){
 const query=new URLSearchParams(location.hash.split('?')[1]||''),profiles=user?get('dge-workers',[]).filter(profile=>profile.owner===user.email||profile.email===user.email):[],jobTotal=user?jobs.filter(job=>job.owner===user.email).length:0,total=jobTotal+profiles.length;
 const html=normalizeOwnPostsNav(baseDashboardWithStatuses().replace('ჩემი განცხადებები ('+jobTotal+')','ჩემი განცხადებები ('+total+')').replace('<small>ჩემი განცხადებები</small><strong>'+jobTotal+'</strong>','<small>ჩემი განცხადებები</small><strong>'+total+'</strong>'),total);
 if(!user||query.get('tab')!=='posts')return html;
 const ownPostsHtml=html.replace('<nav class="side-menu">','<nav class="side-menu own-posts-side-menu">');
 const mine=jobs.filter(job=>job.owner===user.email),visible=mine;
 const profileSection=profiles.length?'<section class="own-announcement-section"><div class="own-announcement-heading"><div><h3>სამუშაოს ვეძებ</h3><p>შენი სამუშაოს მაძიებლის განცხადებები</p></div><span>'+profiles.length+' განცხადება</span></div><div class="worker-grid own-worker-grid">'+profiles.map(profile=>workerCard(profile).replace('პროფილის ნახვა','განცხადების ნახვა').replace('</article>','<div class="managed-job-tools worker-profile-tools"><a class="btn btn-secondary btn-small" href="#/worker-form?edit='+encodeURIComponent(profile.id)+'">განცხადების რედაქტირება</a><button type="button" class="btn btn-small delete-job-btn" data-delete-worker-profile="'+esc(profile.id)+'">განცხადების წაშლა</button></div></article>')).join('')+'</div></section>':'';
 const jobSection=visible.length?'<section class="own-announcement-section"><div class="own-announcement-heading"><div><h3>ადამიანს ვეძებ</h3><p>შენი სამუშაოს განცხადებები</p></div><span>'+visible.length+' განცხადება</span></div><div class="job-grid managed-job-grid">'+visible.map(managementCard).join('')+'</div></section>':'<section class="own-announcement-section"><div class="own-announcement-heading"><div><h3>ადამიანს ვეძებ</h3><p>შენი სამუშაოს განცხადებები</p></div></div><div class="empty"><strong>სამუშაოს განცხადებები ჯერ არ დაგიმატებია</strong>ახალი განცხადება დაამატე, რომ შესაფერისი ადამიანი იპოვო.</div></section>';
 const replacement='<div class="dash-main"><div class="section-heading"><h2>ჩემი განცხადებები</h2><a class="text-link" href="#/start">+ დამატება</a></div>'+profileSection+jobSection+'</div>';
 return replaceDivWithClass(ownPostsHtml,'dash-main',replacement)
};

document.addEventListener('change',event=>{const select=event.target.closest('[data-employer-status]');if(!select)return;const job=jobs.find(item=>item.id===select.dataset.jobId);if(!user||!job||job.owner!==user.email){notify('ამ განცხადების სტატუსის შეცვლის უფლება არ გაქვს.');return}job.status=select.value;set('dge-jobs',jobs);notify('სტატუსი განახლდა: '+statusText(job.status));routeView()});
render=routeView;routeView();

let deleteConfirmReturnFocus=null,deleteConfirmPreviousOverflow='';
function openDeleteConfirmation(kind,id,title=''){
 document.querySelector('[data-delete-confirm]')?.remove();
 deleteConfirmReturnFocus=document.activeElement;
 deleteConfirmPreviousOverflow=document.body.style.overflow;
 const message=kind==='job'?'გსურს განცხადება „'+esc(title)+'“ წაშალო?':'გსურს შენი სამუშაოს მაძიებლის განცხადების წაშლა?';
 document.body.insertAdjacentHTML('beforeend','<div class="delete-confirm-backdrop" data-delete-confirm data-delete-kind="'+kind+'" data-delete-id="'+esc(id)+'"><section class="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="deleteConfirmTitle" aria-describedby="deleteConfirmMessage" tabindex="-1"><span class="delete-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/></svg></span><h2 id="deleteConfirmTitle">განცხადების წაშლა</h2><p id="deleteConfirmMessage">'+message+'</p><div class="delete-confirm-actions"><button type="button" class="btn btn-secondary" data-delete-confirm-cancel>გაუქმება</button><button type="button" class="btn delete-confirm-action" data-confirm-delete>წაშლა</button></div></section></div>');
 document.body.style.overflow='hidden';
 document.querySelector('[data-delete-confirm-cancel]')?.focus({preventScroll:true});
}
function closeDeleteConfirmation(){
 const modal=document.querySelector('[data-delete-confirm]');
 if(!modal)return;
 modal.remove();
 document.body.style.overflow=deleteConfirmPreviousOverflow;
 const target=deleteConfirmReturnFocus;
 deleteConfirmReturnFocus=null;
 target?.focus?.({preventScroll:true});
}
function deleteOwnedJob(id){
 const job=jobs.find(item=>String(item.id)===String(id));
 if(!user||!job||job.owner!==user.email){notify('ამ განცხადების წაშლის უფლება არ გაქვს.');return}
 jobs=jobs.filter(item=>item.id!==job.id);
 set('dge-jobs',jobs);

 const savedByUser=get('dge-saved-users',{});
 if(savedByUser&&typeof savedByUser==='object'&&!Array.isArray(savedByUser)){
  Object.keys(savedByUser).forEach(email=>{savedByUser[email]=(savedByUser[email]||[]).filter(id=>id!==job.id)});
  savedJobsByUser=savedByUser;
  set('dge-saved-users',savedByUser);
 }
 saved=saved.filter(id=>id!==job.id);
 set('dge-saved',saved);
 notify('განცხადება წაიშალა.');
 routeView();
}
function deleteOwnedWorkerProfile(id){
 const profiles=get('dge-workers',[]),profile=profiles.find(item=>String(item.id)===String(id));
 if(!user||!profile||profile.owner!==user.email&&profile.email!==user.email){notify('ამ განცხადების წაშლის უფლება არ გაქვს.');return}
 set('dge-workers',profiles.filter(item=>item.id!==profile.id));
 notify('განცხადება წაიშალა.');
 routeView();
}

document.addEventListener('click',event=>{
 const modal=event.target.closest('[data-delete-confirm]');
 if(modal){
  if(event.target.closest('[data-delete-confirm-cancel]')||event.target===modal){event.preventDefault();closeDeleteConfirmation();return}
  const confirm=event.target.closest('[data-confirm-delete]');
  if(confirm){event.preventDefault();event.stopImmediatePropagation();const {deleteKind,deleteId}=modal.dataset;closeDeleteConfirmation();if(deleteKind==='job')deleteOwnedJob(deleteId);else if(deleteKind==='worker')deleteOwnedWorkerProfile(deleteId);return}
  return;
 }
 const jobButton=event.target.closest('[data-delete-job]');
 if(jobButton){
  event.preventDefault();event.stopImmediatePropagation();
  const job=jobs.find(item=>String(item.id)===String(jobButton.dataset.deleteJob));
  if(!user||!job||job.owner!==user.email){notify('ამ განცხადების წაშლის უფლება არ გაქვს.');return}
  openDeleteConfirmation('job',job.id,job.title);
  return;
 }
 const profileButton=event.target.closest('[data-delete-worker-profile]');
 if(profileButton){
  event.preventDefault();event.stopImmediatePropagation();
  const profile=get('dge-workers',[]).find(item=>String(item.id)===String(profileButton.dataset.deleteWorkerProfile));
  if(!user||!profile||profile.owner!==user.email&&profile.email!==user.email){notify('ამ განცხადების წაშლის უფლება არ გაქვს.');return}
  openDeleteConfirmation('worker',profile.id,profile.name);
 }
},true);

document.addEventListener('keydown',event=>{
 const dialog=document.querySelector('[data-delete-confirm] .delete-confirm-dialog');
 if(!dialog)return;
 if(event.key==='Escape'){event.preventDefault();closeDeleteConfirmation();return}
 if(event.key!=='Tab')return;
 const focusable=[...dialog.querySelectorAll('button:not(:disabled)')];
 if(!focusable.length)return;
 const first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
},true);

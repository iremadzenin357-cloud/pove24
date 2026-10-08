const listingViewStoreKey='dge-view-counts-v1';
const listingViewSessionKey='dge-viewed-this-session-v1';
let listingViewCounts=get(listingViewStoreKey,{jobs:{},profiles:{}});
if(!listingViewCounts||typeof listingViewCounts!=='object')listingViewCounts={jobs:{},profiles:{}};
listingViewCounts.jobs=listingViewCounts.jobs&&typeof listingViewCounts.jobs==='object'?listingViewCounts.jobs:{};
listingViewCounts.profiles=listingViewCounts.profiles&&typeof listingViewCounts.profiles==='object'?listingViewCounts.profiles:{};
let listingViewsSeen=new Set();
try{listingViewsSeen=new Set(JSON.parse(sessionStorage.getItem(listingViewSessionKey)||'[]'))}catch{}

function listingViewCount(kind,id){return Math.max(0,Number(listingViewCounts[kind]?.[String(id)]||0))}
function recordListingView(kind,id,owner){
 const key=String(id||'');
 if(!key||user?.email&&owner===user.email)return;
 const seenKey=kind+':'+key;
 if(listingViewsSeen.has(seenKey))return;
 listingViewsSeen.add(seenKey);
 try{sessionStorage.setItem(listingViewSessionKey,JSON.stringify([...listingViewsSeen]))}catch{}
 if(window.Pove24Store){window.Pove24Store.recordView(kind,key).then(count=>{if(count==null)return;listingViewCounts[kind][key]=count;document.querySelectorAll('.listing-view-count').forEach(node=>{const text=node.querySelector('span');if(text)text.textContent=count+' ნახვა';node.title=count+' ნახვა';node.setAttribute('aria-label',count+' ნახვა')})}).catch(error=>console.warn('[Pove24] View count update failed:',error))}
}
function listingViewBadge(kind,id,extraClass=''){
 const count=listingViewCount(kind,id);
 return '<span class="listing-view-count '+extraClass+'" title="'+count+' ნახვა" aria-label="'+count+' ნახვა"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.3-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.3 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>'+count+' ნახვა</span></span>'
}
function exactPublicationDate(record,kind){
 let raw=record?.createdAt||record?.publishedAt||record?.postedAt||record?.updatedAt;
 if(!raw){raw=Date.now();if(record)record.createdAt=raw;if(kind==='jobs')set('dge-jobs',jobs);else if(record&&!String(record.id||'').startsWith('sample-worker-')){const stored=get('dge-workers',[]),index=stored.findIndex(row=>String(row.id)===String(record.id));if(index>=0){stored[index]={...stored[index],createdAt:raw};set('dge-workers',stored)}}}
 const date=new Date(raw);if(Number.isNaN(date.getTime()))return null;
 const pad=value=>String(value).padStart(2,'0');
 return {text:`${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`,iso:date.toISOString()}
}
function detailPublicationMeta(kind,record){
 const timestamp=exactPublicationDate(record,kind),published=timestamp?'<span class="detail-published-at">'+dayIcon('clock',15)+'<time datetime="'+timestamp.iso+'">'+timestamp.text+'</time></span>':'';
 return '<div class="detail-publication-meta">'+listingViewBadge(kind,record.id)+published+'</div>'
}
function appendDetailPublicationMeta(html,meta){
 const report=html.match(/<button class="report-link"[^>]*>[\s\S]*?<\/button>/),reportMarkup=report?.[0]||'';
 if(reportMarkup)html=html.replace(reportMarkup,'');
 return html.replace('</article>','<div class="detail-main-footer">'+reportMarkup+meta+'</div></article>')
}

const jobCardWithViewCount=jobCard;
jobCard=function(job,options={}){
 let html=jobCardWithViewCount(job,options);
 const postedStart=html.indexOf('<div class="posted">');
 if(postedStart>=0){
  const postedEnd=html.indexOf('</div>',postedStart);
  if(postedEnd>=0){const badge=listingViewBadge('jobs',job.id);return html.slice(0,postedEnd)+badge+html.slice(postedEnd)}
 }
 return html.replace('</article>',listingViewBadge('jobs',job.id)+'</article>')
};

const workerCardWithViewCount=workerCard;
workerCard=function(profile){
 const html=workerCardWithViewCount(profile),badge=listingViewBadge('profiles',profile.id);
 return html.replace(/<a\b(?=[^>]*href="#\/worker\/)[^>]*>/,open=>badge+open)
};

const jobDetailsWithViewCount=details;
details=function(id){
 const job=jobs.find(row=>String(row.id)===String(id));
 if(job)recordListingView('jobs',job.id,job.owner);
 let html=jobDetailsWithViewCount(id);if(!job)return html;
 html=html.replace(/<span>გამოქვეყნდა [\s\S]*?<\/span>/,'');
 return appendDetailPublicationMeta(html,detailPublicationMeta('jobs',job))
};

const workerDetailsWithViewCount=workerDetail;
workerDetail=function(id){
 const profile=[...get('dge-workers',[]),...seedWorkers].find(row=>String(row.id)===String(id));
 if(profile)recordListingView('profiles',profile.id,profile.owner||profile.email);
 let html=workerDetailsWithViewCount(id);
 if(!profile)return html;
 return appendDetailPublicationMeta(html,detailPublicationMeta('profiles',profile))
};

if(typeof routeView==='function')routeView();

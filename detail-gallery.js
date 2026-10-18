(() => {
  'use strict';
  const mounted=new WeakSet();
  let closeViewer=null;
  const icon=(path)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="${path}"/></svg>`;
  const arrow=icon('m9 5 7 7-7 7'),cross=icon('m6 6 12 12M18 6 6 18');
  function button(label,content,className){const b=document.createElement('button');b.type='button';b.className=className;b.setAttribute('aria-label',label);b.innerHTML=content;return b;}
  async function loadPhotos(kind,id){
    const client=window.Pove24Store.client;
    // SELECT and signing both use the caller's session and existing RLS.
    // The owner-only editing manifest must not be used for public details.
    const {data,error}=await client.from('listing_photos').select('id,storage_path,position')
      .eq(kind==='jobs'?'job_post_id':'worker_profile_id',id).eq('state','attached').order('position',{ascending:true}).limit(5);
    if(error)throw error;
    const repository=window.PoveListingPhotoCore.repository(client,window.Pove24Store.accountRef());
    return (data||[]).map(photo=>({...photo,getUrl:()=>repository.preview(photo.storage_path)}));
  }
  function createGallery(host,photos,target=null){
    if(!photos.length)return null;
    photos=[...photos].sort((a,b)=>a.position-b.position).slice(0,5);
    let selected=0,initialized=false;
    const urls=new Map(),imageLoads=new WeakMap();
    const section=document.createElement('section');section.className='pv-detail-gallery';section.setAttribute('aria-label','განცხადების ფოტოები');
    const main=button('ფოტოს სრულ ეკრანზე ნახვა','','pv-gallery-main');
    const mainImage=document.createElement('img');mainImage.decoding='async';mainImage.alt='';
    const status=document.createElement('span');status.className='pv-gallery-status';status.setAttribute('role','status');
    const expand=document.createElement('span');expand.className='pv-gallery-expand';expand.innerHTML=icon('M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');
    main.append(mainImage,status,expand);section.append(main);
    const report=button('ფოტოს დარეპორტება','ფოტოს დარეპორტება','report-link');
    if(target){report.addEventListener('click',()=>openReport({dataset:{reportPhoto:photos[selected].id,
      reportJob:target.kind==='jobs'?target.id:'',reportWorker:target.kind==='workers'?target.id:''}}));section.append(report);}
    const thumbs=[];
    async function url(index){
      let entry=urls.get(index);
      if(!entry||Date.now()-entry.time>45*1000){entry={time:Date.now(),promise:Promise.resolve().then(()=>photos[index].getUrl())};urls.set(index,entry);}
      try {const value=await entry.promise;const parsed=new URL(value,location.href);if(!['http:','https:'].includes(parsed.protocol))throw Error('Invalid image URL');return parsed.href;}
      catch(error){urls.delete(index);throw error;}
    }
    async function showImage(img,label,index){
      const token={};imageLoads.set(img,token);img.onload=null;img.onerror=null;
      img.hidden=true;img.removeAttribute('src');label.hidden=false;label.textContent='ფოტო იტვირთება…';
      img.alt=`ფოტო ${index+1} / ${photos.length}`;
      try{
        const src=await url(index);if(imageLoads.get(img)!==token)return;
        img.onload=()=>{img.hidden=false;label.hidden=true;};
        img.onerror=()=>{img.hidden=true;label.hidden=false;label.textContent='ფოტო მიუწვდომელია';};
        img.src=src;
      }catch{if(imageLoads.get(img)===token)label.textContent='ფოტო მიუწვდომელია';}
    }
    function select(index){const next=(index+photos.length)%photos.length;if(initialized&&next===selected)return;selected=next;initialized=true;main.setAttribute('aria-label',`ფოტო ${selected+1} / ${photos.length} — სრულ ეკრანზე ნახვა`);thumbs.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===selected)));showImage(mainImage,status,selected);}
    if(photos.length>1){
      const row=document.createElement('div');row.className='pv-gallery-thumbnails';row.setAttribute('aria-label','ფოტოს არჩევა');
      photos.forEach((photo,i)=>{
        const b=button(`ფოტო ${i+1}`,'','pv-gallery-thumb');b.setAttribute('aria-pressed',String(i===0));
        const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';
        const fallback=document.createElement('span');fallback.textContent=String(i+1);b.append(img,fallback);
        img.onload=()=>{fallback.hidden=true;};img.onerror=()=>{img.hidden=true;fallback.hidden=false;};
        // Small optimized uploads are reused from the browser cache by the large view.
        url(i).then(src=>{img.src=src;}).catch(()=>{img.hidden=true;});
        b.addEventListener('click',()=>select(i));thumbs.push(b);row.append(b);
      });section.append(row);
    }
    main.addEventListener('click',()=>{
      closeViewer?.();
      const priorFocus=document.activeElement,scrollY=window.scrollY;
      const dialog=document.createElement('dialog');dialog.className='pv-photo-viewer';dialog.setAttribute('aria-label','ფოტოების ნახვა');
      const stage=document.createElement('div');stage.className='pv-viewer-stage';
      const img=document.createElement('img');img.decoding='async';const notice=document.createElement('span');notice.className='pv-gallery-status';notice.setAttribute('role','status');stage.append(img,notice);
      const close=button('დახურვა',cross,'pv-viewer-close');const count=document.createElement('span');count.className='pv-viewer-count';count.setAttribute('aria-live','polite');
      dialog.append(stage,close,count);
      function update(index){select(index);count.textContent=`${selected+1} / ${photos.length}`;showImage(img,notice,selected);}
      if(photos.length>1){const prev=button('წინა ფოტო',arrow,'pv-viewer-prev'),next=button('შემდეგი ფოტო',arrow,'pv-viewer-next');prev.addEventListener('click',()=>update(selected-1));next.addEventListener('click',()=>update(selected+1));dialog.append(prev,next);}
      const old={position:document.body.style.position,top:document.body.style.top,width:document.body.style.width,overflow:document.body.style.overflow};
      let closed=false;
      const finish=()=>{if(closed)return;closed=true;dialog.close();dialog.remove();Object.assign(document.body.style,old);window.scrollTo(0,scrollY);if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});if(closeViewer===finish)closeViewer=null;};
      closeViewer=finish;close.addEventListener('click',finish);dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});
      dialog.addEventListener('click',e=>{if(e.target===dialog)finish();});
      dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();finish();}else if(photos.length>1&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();update(selected+(e.key==='ArrowLeft'?-1:1));}});
      let touch=null;
      stage.addEventListener('touchstart',e=>{touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
      stage.addEventListener('touchend',e=>{if(!touch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(photos.length>1&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)update(selected+(dx<0?1:-1));},{passive:true});
      stage.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
      document.body.append(dialog);dialog.showModal();Object.assign(document.body.style,{position:'fixed',top:`-${scrollY}px`,width:'100%',overflow:'hidden'});close.focus();update(selected);
    });
    host.append(section);select(0);
    return {select,element:section,get selected(){return selected;}};
  }
  async function scan(){
    const match=/^#\/(job|worker)\/([^/?]+)/.exec(location.hash);if(!match)return;
    const article=document.querySelector('#app .detail-main');if(!article||mounted.has(article))return;mounted.add(article);
    const route=location.hash,kind=match[1]==='job'?'jobs':'workers';
    let id;try{id=window.Pove24Store.resolveId(kind,decodeURIComponent(match[2]));}catch{return;}
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id||''))return;
    try{
      const photos=await loadPhotos(kind,id);if(!photos.length||!article.isConnected||location.hash!==route)return;
      const host=document.createElement('div');host.className='pv-gallery-host';
      const before=article.querySelector('h3');article.insertBefore(host,before);createGallery(host,photos,{kind,id});
    }catch{/* Missing setup or denied access must preserve the existing detail layout. */}
  }
  window.addEventListener('hashchange',()=>{closeViewer?.();scan();});
  const app=document.getElementById('app');if(app)new MutationObserver(()=>{if(closeViewer&&!document.querySelector('#app .pv-detail-gallery'))closeViewer();scan();}).observe(app,{childList:true,subtree:true});
  window.PoveDetailGallery={create:createGallery,loadPhotos};scan();
})();

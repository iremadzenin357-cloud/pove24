/* Small admin-only workflow using existing admin styles. Authorization lives in SQL. */
(() => {
  const previousView=adminView, previousShell=adminShell;
  adminShell=function(tab,body){
    return previousShell(tab,body).replace('</nav>','<a href="#/admin/photos"'+(tab==='photos'?' class="active"':'')+'>ფოტოების განხილვა</a></nav>');
  };
  adminView=function(path){
    if(path!=='/admin/photos'||!window.Pove24Store?.isAdmin())return previousView(path);
    app.innerHTML=adminShell('photos','<h2>განცხადების ფოტოები</h2><div class="admin-tabs" data-photo-filters></div><p role="status" data-photo-admin-status></p><div class="admin-review-list" data-photo-queue></div><button class="btn btn-secondary" data-photo-more hidden>შემდეგი ფოტოები</button>');
    const container=app.querySelector('[data-photo-queue]'),notice=app.querySelector('[data-photo-admin-status]');
    const more=app.querySelector('[data-photo-more]');let after=null,filter='pending_review',loading=false,generation=0;
    const labels={pending_review:'მოლოდინში',approved:'დამტკიცებული',rejected:'უარყოფილი',removed:'მოხსნილი'};
    const client=Pove24Store.client;
    async function rpc(name,args){const r=await client.rpc(name,args);if(r.error)throw r.error;return r.data;}
    function card(photo){
      const section=document.createElement('article');section.className='admin-review-card';
      const img=document.createElement('img');img.alt='განსახილველი ფოტო';img.style.cssText='display:block;max-width:100%;max-height:240px;object-fit:contain';
      // Unvalidated bytes are never rendered in an admin's browser.
      if(photo.content_verified_at&&!photo.content_deleted_at&&!['rejected','removed'].includes(photo.moderation_status))PoveListingPhotoCore.repository(client,Pove24Store.accountRef()).preview(photo.storage_path).then(url=>{if(section.isConnected)img.src=url;}).catch(()=>{img.alt='ფოტო მიუწვდომელია';});
      else img.alt='ფაილის სერვერული შემოწმება ჯერ არ დასრულებულა';
      const caption=document.createElement('p');caption.textContent=photo.content_verified_at?'ფაილი ტექნიკურად შემოწმებულია. შეაფასე შინაარსი.':'ფაილის შემოწმების მოლოდინშია; დამტკიცება ჯერ შეუძლებელია.';
      if(['rejected','removed'].includes(photo.moderation_status))caption.textContent='ფოტო მოხსნილია და წასაშლელადაა გადაცემული. ხელახლა დასამატებლად საჭიროა ახალი ატვირთვა.';
      const link=document.createElement('a');link.className='text-link';link.textContent='განცხადების ნახვა';link.href=photo.job_post_id?'#/job/'+encodeURIComponent(photo.job_post_id):'#/worker/'+encodeURIComponent(photo.worker_profile_id);
      const reason=document.createElement('textarea');reason.maxLength=1000;reason.setAttribute('aria-label','მიზეზი — ავტორს გამოუჩნდება');reason.placeholder='უარყოფის ან მოხსნის მიზეზი — ავტორს გამოუჩნდება';reason.value=photo.review_reason||'';
      const actions=document.createElement('div');actions.className='admin-actions';
      for(const [decision,label] of [['approved','დამტკიცება'],['rejected','უარყოფა'],['removed','ჩვენებიდან მოხსნა']]){
        const b=document.createElement('button');b.type='button';b.className='btn btn-secondary btn-small';b.textContent=label;b.disabled=['rejected','removed'].includes(photo.moderation_status)||(decision==='approved'&&!photo.content_verified_at);
        b.addEventListener('click',async()=>{
          if(decision!=='approved'&&!reason.value.trim()){notice.textContent='მიუთითე მიზეზი.';return;}
          const buttons=[...actions.querySelectorAll('button')];buttons.forEach(x=>x.disabled=true);
          try{await rpc('listing_photo_moderate',{p_id:photo.id,p_decision:decision,p_reason:reason.value.trim()});section.remove();notice.textContent='გადაწყვეტილება შენახულია.';}
          catch{notice.textContent='ცვლილება ვერ შეინახა. გადაამოწმე უფლებები და განაახლე სია.';buttons.forEach(x=>x.disabled=x===actions.firstChild&&!photo.content_verified_at);}
        });actions.append(b);
      }
      section.append(img,caption,link,reason,actions);return section;
    }
    async function load(reset=false){
      if(loading&&!reset)return;
      const token=++generation;loading=true;more.disabled=true;notice.textContent='იტვირთება…';
      if(reset){after=null;container.replaceChildren();}
      try{const rows=await rpc('listing_photo_review_queue',{p_after:after,p_status:filter});if(token!==generation||!container.isConnected)return;
        rows.forEach(p=>container.append(card(p)));after=rows.at(-1)?.id||after;more.hidden=rows.length<50;notice.textContent=rows.length?'':'ფოტოები არ არის.';
      }catch{if(token===generation)notice.textContent='ფოტოების სია მიუწვდომელია. გადაამოწმე ინფრასტრუქტურა და ადმინისტრატორის უფლებები.';}
      finally{if(token===generation){loading=false;more.disabled=false;}}
    }
    for(const [value,label] of Object.entries(labels)){const b=document.createElement('button');b.className='btn btn-secondary btn-small';b.textContent=label;b.addEventListener('click',()=>{filter=value;load(true);});app.querySelector('[data-photo-filters]').append(b);}
    more.addEventListener('click',()=>load());load(true);accountNavigation();return true;
  };
})();

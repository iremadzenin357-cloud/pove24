(() => {
  'use strict';
  const core = window.PoveListingPhotoCore, states = new WeakMap();
  const activeDrafts=new Set(), draftCleanup=new Map();
  function releasePreviews(state) {
    for(const url of state.objectUrls||[])URL.revokeObjectURL(url);
    state.objectUrls?.clear();
  }
  function localPreview(state,blob) {
    const url=URL.createObjectURL(blob);state.objectUrls.add(url);return url;
  }
  function discardDepartedDrafts() {
    for(const state of activeDrafts) {
      if(state.route===location.hash&&state.owner===Pove24Store.accountRef())continue;
      activeDrafts.delete(state);
      state.completed=true;
      if(state.draftKey){
        const cleanup=Promise.resolve(state.draftWrite).then(()=>draftAction(state.draftKey,'delete')).catch(()=>{});
        draftCleanup.set(state.draftKey,cleanup);
      }
      releasePreviews(state);
    }
  }
  window.addEventListener('hashchange',discardDepartedDrafts);
  const repo = () => core.repository(Pove24Store.client, Pove24Store.accountRef(),()=>Pove24Store.accountRef());
  // Keep drafts only in this page's memory: tab switching preserves them,
  // while a reload starts fresh. Remove the previous persistent draft cache.
  const memoryDrafts=new Map();
  try { indexedDB.deleteDatabase('pove24-photo-drafts'); } catch {}
  async function draftAction(key,action,value) {
    if(action==='put'){memoryDrafts.set(key,structuredClone(value));return;}
    if(action==='delete'){memoryDrafts.delete(key);return;}
    const draft=memoryDrafts.get(key);
    return draft?structuredClone(draft):undefined;
  }
  function persistDraft(form) {
    const state=states.get(form);if(!state?.draftKey||state.completed||!state.loaded)return Promise.resolve();
    const value={updatedAt:Date.now(),expected:[...state.expected],dirty:state.dirty,savedRow:state.savedRow,
      items:state.items.map(({url,...item})=>({...item}))};
    state.draftWrite=(state.draftWrite||Promise.resolve()).then(()=>draftAction(state.draftKey,'put',value)).catch(()=>{
      message(form,'ფოტოების დროებით შენახვა ვერ მოხერხდა. გვერდიდან გასვლისას შესაძლოა მათი თავიდან არჩევა დაგჭირდეს.');
    });
    return state.draftWrite;
  }
  async function restoreDraft(form,state) {
    if(!state.draftKey)return;
    await draftCleanup.get(state.draftKey);
    const draft=await draftAction(state.draftKey,'get');
    if(!draft||state.completed)return;
    if(Date.now()-draft.updatedAt>7*24*60*60*1000){await draftAction(state.draftKey,'delete');return;}
    // Never overwrite photos changed elsewhere while this draft was idle.
    if(state.editing&&JSON.stringify(state.expected)!==JSON.stringify(draft.expected))return;
    state.items=draft.items;state.expected=draft.expected;state.dirty=draft.dirty;state.savedRow=draft.savedRow;
    await Promise.all(state.items.map(async item=>{item.url=item.blob?localPreview(state,item.blob):await repo().preview(item.storage_path).catch(()=>null);}));
    if(state.items.length)message(form,'არჩეული ფოტოები აღდგენილია.');
  }
  function field() {
    return `<section class="listing-photo-field field span-2" data-listing-photos aria-label="განცხადების ფოტოები">
      <div class="listing-photo-heading"><strong>ფოტოების ატვირთვა</strong><span>არასავალდებულო</span></div>
      <label class="listing-photo-pick">
        <input class="listing-photo-native" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" aria-label="ფოტოების არჩევა" data-listing-photo-input>
        <span class="listing-photo-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg></span>
        <span class="listing-photo-copy"><strong>დაამატე ფოტოები</strong><span>მაქსიმუმ 5 ფოტო • თითოეული 20 MB-მდე</span></span>
        <span class="listing-photo-select" aria-hidden="true">ფოტოების არჩევა</span>
      </label>
      <div class="listing-photo-meta"><span>ფოტოები ავტომატურად ოპტიმიზდება</span><span data-listing-photo-count>0 / 5 ფოტო</span></div>
      <div class="listing-photo-previews" data-listing-photo-previews></div><p class="listing-photo-status" data-listing-photo-message role="status" aria-live="polite" aria-atomic="true"></p>
      <button type="button" class="text-link" data-listing-photo-refresh hidden>ფოტოების განახლება</button>
    </section>`;
  }
  function message(form, value) { const node=form.querySelector('[data-listing-photo-message]'); if(node) node.textContent=value; }
  function render(form) {
    const state=states.get(form), target=form.querySelector('[data-listing-photo-previews]');
    if(!state||!target)return;
    target.replaceChildren();
    state.items.forEach((item,index)=>{
      const key=core.photoKey(item),card=document.createElement('div');card.className='listing-photo-preview'+(index===0?' is-first':'');card.dataset.photoKey=key;
      const media=document.createElement('div');media.className='listing-photo-media';
      if(item.url){const img=document.createElement('img');img.src=item.url;img.alt='ფოტო '+(index+1);media.append(img);}
      else {const label=document.createElement('span');label.textContent='ფოტო '+(index+1);media.append(label);}
      const remove=document.createElement('button');remove.className='listing-photo-remove';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','ფოტო '+(index+1)+' — ამოშლა');remove.disabled=state.busy||state.processing;
      remove.disabled ||= !state.photoManageEnabled;
      remove.addEventListener('click',()=>{if(state.busy||state.processing||!state.photoManageEnabled)return;const current=state.items.findIndex(photo=>core.photoKey(photo)===key);if(current<0)return;state.items.splice(current,1);if(item.blob&&item.url)URL.revokeObjectURL(item.url);state.dirty=true;render(form);persistDraft(form);message(form,'ფოტო წაშლილია. ცვლილება განცხადების შენახვისას შევა ძალაში.');});
      media.append(remove);card.append(media);
      if(index===0){const badge=document.createElement('span');badge.className='listing-photo-first';badge.innerHTML='<span aria-hidden="true">✓</span><span>პირველი ფოტო</span>';card.append(badge);}
      else {const first=document.createElement('button');first.type='button';first.className='listing-photo-set-first';first.textContent='პირველზე დაყენება';first.setAttribute('aria-label','ფოტო '+(index+1)+' — პირველზე დაყენება');first.disabled=state.busy||state.processing;first.addEventListener('click',()=>{if(state.busy||state.processing)return;if(core.moveFirst(state.items,key)){state.dirty=true;render(form);persistDraft(form);message(form,'პირველი ფოტო შეიცვალა. ცვლილება განცხადების შენახვისას შევა ძალაში.');target.querySelector('.listing-photo-remove')?.focus({preventScroll:true});}});card.append(first);}
      const firstButton=card.querySelector('.listing-photo-set-first');if(firstButton&&!state.photoManageEnabled)firstButton.disabled=true;
      const reorder=document.createElement('div');reorder.className='listing-photo-reorder';
      for(const [offset,label] of [[-1,'მარცხნივ'],[1,'მარჯვნივ']]){
        const move=document.createElement('button');move.type='button';move.textContent=offset<0?'←':'→';
        move.setAttribute('aria-label','ფოტო '+(index+1)+' — '+label+' გადატანა');
        move.disabled=state.busy||state.processing||!state.photoManageEnabled||index+offset<0||index+offset>=state.items.length;
        move.addEventListener('click',()=>{
          if(state.busy||state.processing||!state.photoManageEnabled||state.owner!==Pove24Store.accountRef())return;
          if(core.movePhoto(state.items,key,offset)){
            state.dirty=true;render(form);persistDraft(form);
            message(form,'ფოტოების რიგი შეიცვალა. ცვლილება შენახვისას შევა ძალაში.');
            target.querySelectorAll('.listing-photo-preview')[index+offset]?.querySelector('.listing-photo-remove')?.focus({preventScroll:true});
          }
        });reorder.append(move);
      }
      card.append(reorder);
      const status=document.createElement('small');status.className='listing-photo-first';
      const labels={pending_review:'ტექნიკური შემოწმების მოლოდინში',approved:'შემოწმებულია',rejected:'უარყოფილია',removed:'ჩვენებიდან მოხსნილია'};
      status.textContent=item.blob&&!item.remote?'შენახვის შემდეგ გაივლის განხილვას':(labels[item.moderation_status||item.remote?.moderation_status]||'განხილვის მოლოდინში');
      if(item.review_reason)status.textContent+=' — '+item.review_reason;
      card.append(status);target.append(card);
    });
    const disabled=state.busy||state.processing||!state.loaded||!state.photoActionsEnabled||state.items.length>=core.MAX;
    form.querySelector('[data-listing-photo-input]').disabled=disabled;
    const area=form.querySelector('.listing-photo-pick');if(area?.dataset)area.dataset.disabled=String(disabled);
    const section=form.querySelector('[data-listing-photos]');section?.setAttribute?.('aria-busy',String(state.processing||state.busy));
    const count=form.querySelector('[data-listing-photo-count]');if(count)count.textContent=state.items.length+' / 5 ფოტო';
    const refresh=form.querySelector('[data-listing-photo-refresh]');
    if(refresh){refresh.hidden=!state.items.some(item=>!item.blob&&item.storage_path);refresh.disabled=state.busy||state.processing||state.restoring;}
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-listing-photo-refresh]');if(!button)return;
    const form=button.closest('form'),state=states.get(form);
    if(!state||state.busy||state.processing||state.restoring||state.owner!==Pove24Store.accountRef())return;
    state.processing=true;render(form);
    try{
      const currentRepo=repo();
      await Promise.all(state.items.filter(item=>!item.blob&&item.storage_path).map(async item=>{
        item.url=await currentRepo.preview(item.storage_path).catch(()=>null);
      }));
      message(form,'ფოტოების წვდომა განახლებულია. მოხსნილი ფოტო შესაძლოა აღარ ჩანდეს.');
    }finally{state.processing=false;if(state.owner===Pove24Store.accountRef())render(form);}
  });
  async function mount(form) {
    discardDepartedDrafts();
    if(states.has(form)||!form.querySelector('[data-listing-photos]'))return;
    const kind=form.id==='postForm'?'jobs':'workers', id=form.dataset.editJob||form.dataset.editWorker||'';
    let tabKey;
    try {tabKey=sessionStorage.getItem('pove24-photo-draft-tab');if(!tabKey){tabKey=crypto.randomUUID();sessionStorage.setItem('pove24-photo-draft-tab',tabKey);}}catch{}
    const owner=Pove24Store.accountRef();
    const state={kind,owner,objectUrls:new Set(),items:[],expected:[],dirty:false,loaded:false,photoActionsEnabled:false,photoManageEnabled:false,restoring:true,busy:false,processing:false,savedRow:null,
      route:location.hash,editing:!!id,draftKey:tabKey&&owner?JSON.stringify([tabKey,owner,kind,id||'new']):null};states.set(form,state);
    for(const previous of activeDrafts)if(previous.route===state.route){releasePreviews(previous);activeDrafts.delete(previous);}
    activeDrafts.add(state);
    render(form);
    try{const ready=await repo().capabilities();state.photoActionsEnabled=ready?.version===1&&ready.uploads_enabled===true;state.photoManageEnabled=ready?.version===1&&ready.manage_enabled===true;}catch{}
    const unavailable='ფოტოების დამატება დროებით მიუწვდომელია. განცხადების შენახვა ფოტოების გარეშე შეგიძლია.';
    if(!id){try{if(state.photoActionsEnabled)await restoreDraft(form,state);}catch{message(form,'ფოტოების დროებითი შენახვა მიუწვდომელია.');}state.loaded=true;state.restoring=false;if(!state.photoActionsEnabled)message(form,unavailable);render(form);return;}
    message(form,'ფოტოები იტვირთება…');render(form);
    try {
      const manifest=await repo().list(kind,Pove24Store.resolveId(kind,id));
      state.items=manifest;state.expected=manifest.map(item=>item.id);state.loaded=true;
      await Promise.all(manifest.map(async item=>{item.url=await repo().preview(item.storage_path).catch(()=>null);}));
      message(form,state.photoActionsEnabled?'':unavailable);
      if(state.photoActionsEnabled)await restoreDraft(form,state).catch(()=>{});
    }catch{message(form,'არსებული ფოტოების ჩატვირთვა ვერ მოხერხდა. ფოტოები უცვლელი დარჩება; სხვა ველების შენახვა შეგიძლია.');}
    state.restoring=false;render(form);
  }
  document.addEventListener('change',async event=>{
    if(!event.target.matches('[data-listing-photo-input]'))return;
    const input=event.target,form=input.closest('form');await mount(form);const state=states.get(form);
    const files=[...input.files];input.value='';if(!files.length||state.busy||state.processing||!state.loaded||!state.photoActionsEnabled)return;
    try {
      core.assertCount(state.items.length+files.length);state.processing=true;render(form);message(form,'ფოტოს დამუშავება მიმდინარეობს...');
      const prepared=[];
      for(const [index,file] of files.entries()) {
        message(form,`ფოტოს დამუშავება მიმდინარეობს... ${index+1} / ${files.length}`);
        await new Promise(resolve=>setTimeout(resolve,0));
        prepared.push(await core.processFile(file));
      }
      if(state.completed||state.owner!==Pove24Store.accountRef())return;
      state.items.push(...prepared.map(blob=>({localId:crypto.randomUUID(),blob,url:localPreview(state,blob)})));state.dirty=true;
      message(form,state.items.length===core.MAX?'მაქსიმუმ 5 ფოტოს დამატება შეგიძლიათ. ფოტოები მზადაა შესანახად.':'ფოტოები მზადაა. აიტვირთება განცხადების შენახვისას.');
    }catch(error){message(form,error.message||'ფოტოს დამატება ვერ მოხერხდა.');}
    finally{state.processing=false;render(form);await persistDraft(form);}
  });
  function makeRow(form,state) {
    const kind=state.kind, data=new FormData(form), id=form.dataset.editJob||form.dataset.editWorker;
    const existing=state.savedRow||(id?Pove24Store.get(kind==='jobs'?'dge-jobs':'dge-workers',[]).find(item=>String(item.id)===id):null);
    if(id&&!existing)throw Error('განცხადება ვერ მოიძებნა.');
    if(existing&&!Pove24Store.sameUser(existing.owner))throw Error('ამ განცხადების შეცვლის უფლება არ გაქვს.');
    const text=key=>String(data.get(key)||'').trim(), now=Date.now();
    const selections=kind==='jobs'?categoryPickerSelections(form.querySelector('#cat-post-category')):workerSkillEntriesFromForm(form);
    Pove24Store.validateCategorySelections(selections);
    const paymentType=text('paymentType')||'daily', pay=paymentType==='negotiable'?null:Number(data.get('pay'));
    if(paymentType!=='negotiable'&&(!Number.isFinite(pay)||pay<1))throw Error('მიუთითე სწორი ანაზღაურება.');
    const row={...existing,id:existing?.id||(kind==='jobs'?'j':'w')+now,createdAt:existing?.createdAt||now,owner:existing?.owner||Pove24Store.authUser?.email,
      name:text('name'),city:text('city'),area:text('area'),district:text('area'),phone:text('phone'),paymentType,pay,
      category:selections[0].main,subcategory:selections[0].sub,categorySelections:selections};
    if(existing)row.updatedAt=now;
    if(!row.uuid&&!row.pendingUuid)row.pendingUuid=crypto.randomUUID();
    if(kind==='jobs') {
      const agreement=text('dateMode')==='agreement', duration=text('duration');
      if(!agreement&&duration==='multi-day'&&(!text('dateEnd')||text('dateEnd')<text('date')))throw Error('დასრულების თარიღი დაწყების თარიღს უნდა ემთხვეოდეს ან გვიან იყოს.');
      Object.assign(row,{title:text('title'),description:text('description'),dateMode:agreement?'agreement':'date',date:agreement?'':text('date'),dateEnd:agreement?'':duration==='multi-day'?text('dateEnd'):'',duration,
        start:existing?.start||text('start'),end:existing?.end||text('end'),startTime:existing?.startTime||text('start'),endTime:existing?.endTime||text('end'),paymentAmount:pay,paymentMin:pay,paymentMax:pay,status:existing?.status||'active',posted:existing?.posted||'ახლახან'});
    } else {
      const experienced=text('hasExperience')==='yes';
      Object.assign(row,{skills:selections.map(item=>item.sub||item.main),offer:text('offer'),about:text('about'),hasExperience:experienced,experienceDuration:experienced?text('experienceDuration'):'',exp:experienced?text('experienceDuration'):'',availability:text('availability'),initials:text('name').split(' ').map(part=>part[0]).slice(0,2).join(''),status:existing?.status||'published'});
    }
    // Keep identity before any request so a retry after a network failure is idempotent.
    state.savedRow=row;
    return row;
  }
  async function submit(form) {
    await mount(form);const state=states.get(form);if(!state||state.busy)return;
    if(state.owner!==Pove24Store.accountRef()){discardDepartedDrafts();message(form,'ანგარიში შეიცვალა. თავიდან გახსენი განცხადების ფორმა.');return;}
    if(state.processing||state.restoring){message(form,'დაელოდე ფოტოების ჩატვირთვას ან დამუშავებას.');return;}
    if(!form.reportValidity())return;
    state.busy=true;render(form);
    const button=form.querySelector('.form-submit'),label=button?.textContent;
    if(button){button.disabled=true;button.textContent='ინახება…';}
    try {
      await Pove24Store.ensureCategoryCatalog?.();
      const row=makeRow(form,state);
      await persistDraft(form);
      await core.saveWithPhotos({state,row,kind:state.kind,repo:repo(),saveListing:(kind,value)=>{
        if(state.owner!==Pove24Store.accountRef())throw Error('ანგარიში შეიცვალა. თავიდან გახსენი ფორმა.');
        return Pove24Store.saveFormListing(kind,value);
      }});
      state.completed=true;
      releasePreviews(state);
      await state.draftWrite;
      if(state.draftKey)await draftAction(state.draftKey,'delete').catch(()=>{});
      jobs=Pove24Store.get('dge-jobs',[]);
      const editing=!!(form.dataset.editJob||form.dataset.editWorker);
      notify(editing?'ცვლილებები შენახულია.':'განცხადება გამოქვეყნდა.');
      location.hash=editing?'#/dashboard?tab=posts':(state.kind==='jobs'?'#/job/':'#/worker/')+encodeURIComponent(row.id);
    } catch(error) {
      await persistDraft(form);
      console.warn('[Pove24] Listing save failed:',error.message);
      message(form,error.message?.includes('Supabase')||error.message?.match(/[ა-ჰ]/)?error.message:'შენახვა ვერ მოხერხდა. გადაამოწმე კავშირი და ფოტოების საცავის გამართვა. არჩეული ფოტოები შენარჩუნებულია.');
    } finally {state.busy=false;if(button){button.disabled=false;button.textContent=label;}render(form);}
  }
  function scan(root){if(root.matches?.('#postForm,#workerProfileForm'))mount(root);root.querySelectorAll?.('#postForm,#workerProfileForm').forEach(mount);}
  new MutationObserver(records=>{records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node);}));}).observe(document.getElementById('app'),{childList:true,subtree:true});
  window.addEventListener('beforeunload',event=>{const form=document.querySelector('#postForm,#workerProfileForm'),state=form&&states.get(form);if(state?.busy||state?.processing||state?.dirty){event.preventDefault();event.returnValue='';}});
  window.PoveListingPhotos={field,submit,makeRow};scan(document);
})();

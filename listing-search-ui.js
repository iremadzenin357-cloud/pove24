/* Legacy predicates stay authoritative for residual filtering of bounded server batches. */
(() => {
  function prepare(kind,state){
    const form=document.getElementById(kind==='jobs'?'filters':'worker-filters');
    if(!form)return null;
    const data=new FormData(form),worker=kind==='workers';
    const mains=data.getAll(worker?'workerCategory':'category'),subs=data.getAll(worker?'workerCategorySubcategory':'subcategory');
    const categories=mains.map((main,i)=>({main,sub:subs[i]||''})).filter(x=>x.main);
    const city=String(data.get(worker?'workerCity':'city')||''),area=String(data.get(worker?'workerArea':'area')||'');
    const query=String(data.get(worker?'workerQuery':'q')||'').trim().toLocaleLowerCase('ka');
    const paymentType=String(data.get(worker?'workerPaymentType':'paymentType')||'');
    const min=String(data.get(worker?'workerMinPay':'min')||'').trim(),max=worker?String(data.get('workerMaxPay')||'').trim():'';
    const date=worker?null:scheduleDateFilter(),duration=worker?'':String(data.get('duration')||'');
    const sortPayment=state.sort.startsWith('price')&&state.paymentType&&state.paymentType!=='all'?state.paymentType:'';
    const filters={categories,city:worker?city:city.trim(),area,query,paymentType,min,max,date,duration,sortPayment};
    const request={kind,page:state.page,size:12,sort:state.sort,city:filters.city,paymentType};
    const residual=!!(categories.length||area.trim()&&area.trim()!=='ყველა'||query||min!==''||max!==''||date||duration||sortPayment);
    function matches(row){
      if(sortPayment&&(row.paymentType||'daily')!==sortPayment)return false;
      if(!worker)return categoryFilterMatch(row,categories)&&districtSelectionMatches(area,row.area||row.district)&&
        dateMatches(row,date)&&paymentMatches(row,paymentType,min)&&(!duration||inferredDuration(row)===duration)&&
        (!query||(`${row.title} ${row.description} ${row.category} ${row.subcategory||''} ${(row.categorySelections||[]).map(e=>`${e.main} ${e.sub}`).join(' ')}`).toLocaleLowerCase('ka').includes(query));
      const pay=Number(row.pay),negotiable=(row.paymentType||'daily')==='negotiable'||row.pay===null||row.pay===undefined||row.pay==='';
      const rangeActive=min!==''||max!=='';
      const payMatches=!rangeActive||negotiable||Number.isFinite(pay)&&(min===''||pay>=Number(min))&&(max===''||pay<=Number(max));
      const skills=Array.isArray(row.skills)?row.skills.flatMap(s=>typeof s==='string'?[s]:[s?.main,s?.sub]).filter(Boolean):[];
      const text=[row.offer,row.offerTitle,row.category,row.subcategory,...skills,row.about].filter(Boolean).join(' ').toLocaleLowerCase('ka');
      return districtSelectionMatches(area,row.area||row.district)&&workerMatchesCategory(row,categories)&&(!query||text.includes(query))&&payMatches;
    }
    return {request,filters,matches,residual,key:JSON.stringify([request,filters]),form};
  }
  function syncCache(){
    jobs=get('dge-jobs',[]);saved=get('dge-saved',[]);
    if(typeof listingViewCounts!=='undefined')listingViewCounts=get('dge-view-counts-v1',{jobs:{},profiles:{}});
  }
  function paint(kind,result,prepared){
    const host=document.getElementById(kind==='jobs'?'jobResults':'workerResults');if(!host)return;
    syncCache();
    const rows=result.rows;
    if(kind==='workers'){
      host.innerHTML=rows.length?rows.map(workerCard).join(''):'<div class="empty" style="grid-column:1/-1"><strong>ადამიანები ვერ მოიძებნა</strong>შეცვალე ფილტრები ან სხვა ქალაქში სცადე ძებნა.</div>';
      return;
    }
    prepared.form.querySelectorAll('[data-site-filter-select]').forEach(syncSiteFilterSelect);
    const chips=document.getElementById('scheduleChips');if(chips)chips.innerHTML=activeFilterMarkup(prepared.form);
    const selected=prepared.filters.categories;
    const label=selected.length?'კატეგორია: '+(selected.length===1?esc(selected[0].sub||('ყველა — '+selected[0].main)):selected.length+' არჩეული'):'აირჩიე შენი საქმე';
    const cards=rows.length?'<div class="job-grid">'+rows.map(row=>jobCard(row,{showStatus:row.status!=='active'})).join('')+'</div>':'<div class="empty"><strong>განცხადებები ვერ მოიძებნა</strong>შეცვალე ფილტრები ან სხვა სიტყვით სცადე ძებნა.<div><button class="btn btn-secondary btn-small" type="button" data-clear-all-schedule>ყველა ფილტრის გასუფთავება</button></div></div>';
    host.innerHTML='<div class="results-head"><span>ნაპოვნია <strong>'+result.total+'</strong> განცხადება</span><span>'+label+'</span></div>'+cards;
  }
  window.PoveSearchUI={prepare,paint,syncCache};
})();

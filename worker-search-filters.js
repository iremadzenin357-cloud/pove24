workersPage=function(){
 return layout('ვეძებ ადამიანს','იპოვე ადამიანი საჭირო უნარებით შენს ქალაქში.',`<form class="filter-panel worker-filter worker-filter-extended" id="worker-filters"><div class="field worker-need-field"><label for="workerQuery">რა გჭირდება?</label><input id="workerQuery" name="workerQuery" type="search" placeholder="მაგ. ბინის დალაგება, ავეჯის აწყობა"></div><button type="button" class="mobile-filter-toggle worker-mobile-filter-toggle" data-mobile-filter-toggle aria-expanded="false" aria-controls="workerAdditionalFilters"><span data-mobile-filter-label>დამატებითი ფილტრები</span><svg class="mobile-filter-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div class="worker-mobile-additional" id="workerAdditionalFilters"><div class="worker-location-row">${locationField('workerCity','ქალაქი','','','workers-city')}${locationField('workerArea','უბანი','','','workers-area')}</div>${multiCategoryPicker('workerCategory','კატეგორიები','workers-category')}${siteFilterSelectMarkup('workerPaymentType','workerPaymentType','ანაზღაურების ტიპი','',[['','ყველა'],...formPaymentKinds])}<div class="field worker-min-pay-field"><label for="workerMinPay">მინიმალური ანაზღაურება (₾)</label><input id="workerMinPay" name="workerMinPay" type="number" min="0" step="1" placeholder="მაგ. 30"></div><div class="field"><label for="workerMaxPay">მაქსიმალური ანაზღაურება (₾)</label><input id="workerMaxPay" name="workerMaxPay" type="number" min="0" step="1" placeholder="მაგ. 150"></div></div><button class="btn btn-primary" id="workerSearch" type="submit">ძებნა ⌕</button></form><div id="workerResults" class="worker-grid"></div>`,'სანდო ადამიანები მთელი საქართველოს მასშტაბით')
};

updateWorkers=function(){
 const el=document.getElementById('workerResults'),form=document.getElementById('worker-filters');
 if(!el||!form)return;
 const data=new FormData(form),city=String(data.get('workerCity')||'').toLocaleLowerCase('ka'),area=String(data.get('workerArea')||'').toLocaleLowerCase('ka'),query=String(data.get('workerQuery')||'').trim().toLocaleLowerCase('ka'),paymentType=String(data.get('workerPaymentType')||''),minText=String(data.get('workerMinPay')||'').trim(),maxText=String(data.get('workerMaxPay')||'').trim(),min=minText===''?null:Number(minText),max=maxText===''?null:Number(maxText),mains=data.getAll('workerCategory'),subs=data.getAll('workerCategorySubcategory'),selections=mains.map((main,index)=>({main:String(main||''),sub:String(subs[index]||'')})).filter(entry=>entry.main),rangeActive=min!==null||max!==null,people=[...get('dge-workers',[]),...seedWorkers];
 const matches=people.filter(profile=>{
  const profilePaymentType=profile.paymentType||'daily',pay=Number(profile.pay),negotiable=profilePaymentType==='negotiable'||profile.pay===null||profile.pay===undefined||profile.pay==='';
  const payMatches=!rangeActive||negotiable||Number.isFinite(pay)&&(min===null||pay>=min)&&(max===null||pay<=max);
  const skillText=Array.isArray(profile.skills)?profile.skills.flatMap(skill=>typeof skill==='string'?[skill]:[skill?.main,skill?.sub]).filter(Boolean):[];
  const searchableText=[profile.offer,profile.offerTitle,profile.category,profile.subcategory,...skillText,profile.about].filter(Boolean).join(' ').toLocaleLowerCase('ka');
  return(!city||String(profile.city||'').toLocaleLowerCase('ka').includes(city))&&(!area||!String(profile.area||profile.district||'').trim()||districtSelectionMatches(area,profile.area||profile.district))&&workerMatchesCategory(profile,selections)&&(!query||searchableText.includes(query))&&(!paymentType||profilePaymentType===paymentType)&&payMatches
 });
 el.innerHTML=matches.length?matches.map(workerCard).join(''):`<div class="empty" style="grid-column:1/-1"><strong>ადამიანები ვერ მოიძებნა</strong>შეცვალე ფილტრები ან სხვა ქალაქში სცადე ძებნა.</div>`
};

document.addEventListener('input',event=>{if(event.target.matches('#worker-filters [name="workerQuery"]'))updateWorkers()});

const workerCardBeforeOffer=workerCard;
workerCard=function(profile){
 const html=workerCardBeforeOffer(profile),offer=String(profile.offer||profile.offerTitle||profile.subcategory||profile.skills?.[0]||profile.category||'').trim(),article=html.replace(/<article class="worker-card([^\"]*)">/,(tag,classes)=>`<article class="worker-card${classes} worker-offer-focused${offer?'':' worker-offer-missing'}">`);
 if(!offer)return article;
 const offerMarkup=`<div class="worker-offer"><strong>${esc(offer)}</strong></div>`;
 return article.replace(/(<article class="worker-card[^\"]*">)/,tag=>tag+offerMarkup)
};

const workerDetailBeforeOffer=workerDetail;
workerDetail=function(id){
 let html=workerDetailBeforeOffer(id);
 const profile=[...get('dge-workers',[]),...seedWorkers].find(row=>String(row.id)===String(id));
 if(!profile)return html;
 const offer=String(profile.offer||profile.offerTitle||'').trim();
 if(offer)html=html.replace('<h3>ჩემ შესახებ</h3>',`<h3>რას სთავაზობს</h3><p class="worker-offer-detail">${esc(offer)}</p><h3>ჩემ შესახებ</h3>`);
 const experience=String(profile.experienceDuration||profile.exp||'').trim(),hasExperience=profile.hasExperience===true||profile.hasExperience==='yes',noExperience=profile.hasExperience===false||profile.hasExperience==='no',experienceSection=/<h3>\s*გამოცდილება\s*<\/h3>\s*<p\b[^>]*>[\s\S]*?<\/p>/;
 if(noExperience||(!hasExperience&&!experience))html=html.replace(experienceSection,'');
 else html=html.replace(experienceSection,`<h3>გამოცდილება</h3><p>${esc(experience||'აქვს')} სამუშაო გამოცდილება.</p>`);
 return html
};

if(typeof routeView==='function')routeView();

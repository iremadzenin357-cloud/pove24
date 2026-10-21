const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../listing-photos-core.js');
const fixture=(bytes,type='image/png',size=bytes.length)=>({type,size,slice:()=>({arrayBuffer:async()=>Uint8Array.from(bytes).buffer})});
const png=[137,80,78,71,13,10,26,10,0,0,0,0];
test('accepts actual PNG/JPEG/WebP signatures',async()=>{
 assert.equal(await core.validateFile(fixture(png)),'image/png');
 assert.equal(await core.validateFile(fixture([255,216,255,224],'image/jpeg')),'image/jpeg');
 assert.equal(await core.validateFile(fixture([...Buffer.from('RIFF0000WEBP0000')],'image/webp')),'image/webp');
});
test('rejects fake content, mismatched MIME, oversized and empty files',async()=>{
 for(const f of [fixture([...Buffer.from('<svg>evil')]),fixture(png,'image/jpeg'),fixture(png,'image/png',core.MAX_BYTES+1),fixture([], 'image/png',0)])await assert.rejects(core.validateFile(f));
});
test('0 through 5 accepted; 6 rejected',()=>{for(let n=0;n<=5;n++)core.assertCount(n);assert.throws(()=>core.assertCount(6));});
for(const kind of ['jobs','workers']) {
 for(const count of [0,1,5])test(`${kind}: ${count} photo save`,async()=>{
  let stages=0,commits=0,saves=0;
  const state={items:Array.from({length:count},()=>({blob:{}})),dirty:count>0,loaded:true,expected:[]};
  const repo={stage:async()=>({id:'photo'+(++stages)}),commit:async(k,id,expected,selected)=>{commits++;assert.equal(k,kind);assert.equal(selected.length,count);return selected.map(id=>({id}));},cleanup:async()=>{}};
  await core.saveWithPhotos({state,kind,row:{id:'local'},repo,saveListing:async()=>{saves++;return {uuid:'listing'};}});
  assert.equal(saves,1);assert.equal(stages,count);assert.equal(commits,count?1:0);
 });
 test(`${kind}: ordinary edit preserves photos without touching backend manifest`,async()=>{
  const state={items:[],dirty:false,loaded:false,expected:[]};
  await core.saveWithPhotos({state,kind,row:{uuid:'existing'},repo:{},saveListing:async(k,row)=>row});
  assert.equal(state.savedRow.uuid,'existing');
 });
 test(`${kind}: removing all requires explicit dirty selection`,async()=>{
  const state={items:[],dirty:true,loaded:true,expected:['old']};let committed;
  await core.saveWithPhotos({state,kind,row:{uuid:'existing'},repo:{commit:async(k,id,expected,selected)=>{assert.deepEqual(expected,['old']);committed=selected;return [];},cleanup:async()=>{}},saveListing:async(k,row)=>row});
  assert.deepEqual(committed,[]);
 });
}
test('failed upload retains old manifest and pending selections, never saves listing',async()=>{
 const state={items:[{id:'old'},{blob:{}}],expected:['old'],dirty:true,loaded:true};let saves=0;
 await assert.rejects(core.saveWithPhotos({state,kind:'jobs',row:{},repo:{stage:async()=>{throw Error('network');}},saveListing:async()=>saves++}));
 assert.equal(saves,0);assert.equal(state.items.length,2);assert.deepEqual(state.expected,['old']);
});
test('partial upload retries only the failed upload',async()=>{
 let calls=0,fail=true;const state={items:[{blob:{}},{blob:{}}],expected:[],dirty:true,loaded:true};
 const repo={stage:async()=>{calls++;if(calls===2&&fail)throw Error('network');return {id:'p'+calls};},commit:async(k,id,e,ids)=>ids.map(id=>({id})),cleanup:async()=>{}};
 const options={state,kind:'workers',row:{},repo,saveListing:async()=>({uuid:'same'})};
 await assert.rejects(core.saveWithPhotos(options));fail=false;await core.saveWithPhotos(options);assert.equal(calls,3);
});
test('commit failure preserves references and same saved identity; no cleanup',async()=>{
 const state={items:[{id:'old'},{blob:{}}],expected:['old'],dirty:true,loaded:true};let cleanups=0;
 const repo={stage:async()=>({id:'new'}),commit:async()=>{throw Error('failed');},list:async()=>[{id:'old'}],cleanup:async()=>cleanups++};
 await assert.rejects(core.saveWithPhotos({state,kind:'jobs',row:{},repo,saveListing:async()=>({uuid:'stable'})}));
 assert.equal(state.savedRow.uuid,'stable');assert.equal(state.items[1].remote.id,'new');assert.equal(cleanups,0);assert.deepEqual(state.expected,['old']);
});
test('lost commit response recovers without duplicate upload or removal',async()=>{
 const state={items:[{id:'old'}],expected:['old'],dirty:true,loaded:true};
 await core.saveWithPhotos({state,kind:'jobs',row:{},saveListing:async()=>({uuid:'stable'}),repo:{commit:async()=>{throw Error('lost response');},list:async()=>[{id:'old'}],cleanup:async()=>{}}});assert.equal(state.dirty,false);
});
test('more than five cannot reach storage; unavailable manifest cannot be overwritten',async()=>{
 for(const state of [{items:Array(6).fill({}),dirty:true,loaded:true},{items:[{}],dirty:true,loaded:false}])await assert.rejects(core.saveWithPhotos({state}));
});
test('category architecture has exact six beauty children',()=>{
 const source=fs.readFileSync(require.resolve('../geo-ui.js'),'utf8');
 const block=source.slice(source.indexOf('Object.assign(categoryGroups,{'),source.indexOf('const legacyJobCategories'));
 const ctx={categoryGroups:{}};vm.runInNewContext(block,ctx);
 assert.deepEqual(Array.from(ctx.categoryGroups['სილამაზე და თავის მოვლა']),['მანიკიური და პედიკიური','მაკიაჟი და ვიზაჟი','თმის სტილისტი','წარბები და წამწამები','კოსმეტოლოგია','სხვა სილამაზის მომსახურება']);
 assert.equal(Object.keys(ctx.categoryGroups).length,11);
});
test('both real forms include the optional field; acknowledged handler follows validation',()=>{
 const source=fs.readFileSync(require.resolve('../schedule.js'),'utf8');
 assert.equal(source.match(/PoveListingPhotos.field\(\)/g).length,2);
 assert.ok(source.indexOf('PoveListingPhotos.submit(form)')>source.indexOf('const requiredChecks='));
 assert.ok(source.indexOf('PoveListingPhotos.submit(form)')<source.indexOf('const form=event.target.closest(\'#workerProfileForm\'),id='));
});
test('migration hardens ownership, quotas, moderation and optimistic concurrency (static only)',()=>{
 const sql=fs.readFileSync(require.resolve('../migrations/20261010_beauty_listing_photos.sql'),'utf8');
 for(const s of ['enable row level security','listing_owner is distinct from auth.uid()','cardinality(p_selected)>5','current_ids<>expected_ids','for update','approved boolean not null default false','public_display_enabled boolean not null default false',"p.state='pending'",'revoke all on function','retire_job_photos','retire_worker_photos'])assert.ok(sql.includes(s),s);
 assert.ok(!sql.includes('for update to authenticated'));
});

function rowHarness(existing) {
 const selections=[{main:'სილამაზე და თავის მოვლა',sub:'თმის სტილისტი'}];
 const doc={addEventListener(){},getElementById(){return {}},querySelectorAll(){return []}};
 const ctx={window:{PoveListingPhotoCore:core,addEventListener(){}},document:doc,MutationObserver:class{observe(){}},FormData:class{constructor(form){this.values=form.values}get(k){return this.values[k]??null}},crypto:{randomUUID:()=> 'new-uuid'},Pove24Store:{get:()=>existing?[existing]:[],sameUser:x=>x==='owner',authUser:{email:'owner'},validateCategorySelections:x=>{if(!x.length)throw Error('category')}},categoryPickerSelections:()=>selections,workerSkillEntriesFromForm:()=>selections};
 vm.runInNewContext(fs.readFileSync(require.resolve('../listing-photos.js'),'utf8'),ctx);
 return (kind,values={})=>{const state={kind,savedRow:null};const form={dataset:existing?(kind==='jobs'?{editJob:existing.id}:{editWorker:existing.id}):{},querySelector(){return {}},values:{name:'Test Person',city:'თბილისი',paymentType:'negotiable',dateMode:'agreement',...values}};return {row:ctx.window.PoveListingPhotos.makeRow(form,state),state};};
}
for(const kind of ['jobs','workers']) {
 test(kind+' edit preserves owner identity creation status and unrelated properties',()=>{
  const original={id:'old',uuid:'uuid',owner:'owner',createdAt:123,status:'archived',favoriteMarker:'preserve'};
  const {row}=rowHarness(original)(kind);for(const key of Object.keys(original))assert.equal(row[key],original[key]);assert.ok(row.updatedAt>123);assert.equal(row.category,'სილამაზე და თავის მოვლა');assert.equal(row.pay,null);
 });
 test(kind+' refuses another owner',()=>assert.throws(()=>rowHarness({id:'old',owner:'other'})(kind)));
 test(kind+' creation keeps stable retry identity',()=>{const {row,state}=rowHarness()(kind);assert.equal(row.pendingUuid,'new-uuid');assert.equal(state.savedRow,row);assert.equal(row.owner,'owner');});
}
test('invalid pay and reversed dates rejected before save',()=>{
 assert.throws(()=>rowHarness()('jobs',{paymentType:'daily',pay:'-1'}));
 assert.throws(()=>rowHarness()('jobs',{dateMode:'date',duration:'multi-day',date:'2026-10-10',dateEnd:'2026-10-09'}));
});

test('beauty and existing categories filter both types and subcategories',()=>{
 const source=fs.readFileSync(require.resolve('../geo-ui.js'),'utf8');const ctx={categoryGroups:{}};
 vm.runInNewContext(source.slice(source.indexOf('Object.assign(categoryGroups,{'),source.indexOf('const legacyJobCategories')),ctx);
 for(const name of ['categoryFilterMatch','workerMatchesCategory'])vm.runInNewContext(source.split('\n').find(line=>line.startsWith('function '+name+'(')),ctx);
 for(const [main,subs] of Object.entries(ctx.categoryGroups))for(const sub of subs){const row={category:main,subcategory:sub,skills:[sub]};assert.ok(ctx.categoryFilterMatch(row,main,sub));assert.ok(ctx.workerMatchesCategory(row,main,sub));assert.equal(Boolean(ctx.categoryFilterMatch(row,'nonexistent','nonexistent')),false);assert.equal(Boolean(ctx.workerMatchesCategory(row,'nonexistent','nonexistent')),false);}
});

test('rapid repeated submit only saves once while awaiting persistence',async()=>{
 let count=0,release;const pending=new Promise(r=>release=r),nodes={};
 const node=()=>({textContent:'save',replaceChildren(){},disabled:false});
 const form={id:'postForm',dataset:{},values:{name:'Test',city:'თბილისი',paymentType:'negotiable',dateMode:'agreement'},querySelector:s=>nodes[s]||(nodes[s]=node()),reportValidity:()=>true};
 const ctx={window:{PoveListingPhotoCore:{...core,saveWithPhotos:async()=>{count++;await pending}},addEventListener(){}},document:{addEventListener(){},getElementById(){return {}},querySelectorAll(){return []}},MutationObserver:class{observe(){}},FormData:class{get(k){return form.values[k]??null}},crypto:{randomUUID:()=> 'uuid'},Pove24Store:{client:{},accountRef:()=> 'owner',get:()=>[],authUser:{email:'owner'},validateCategorySelections(){},sameUser:()=>true},categoryPickerSelections:()=>[{main:'beauty',sub:'hair'}],jobs:[],notify(){},location:{},console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../listing-photos.js'),'utf8'),ctx);
 const first=ctx.window.PoveListingPhotos.submit(form),second=ctx.window.PoveListingPhotos.submit(form);await new Promise(r=>setImmediate(r));assert.equal(count,1);release();await Promise.all([first,second]);
});


// Optimization behavior with controlled codecs; actual browser checks are separate.
function optimizerHarness({width=4000,height=3000,sizes=[500000],decodeFail=false,encodeFail=false}={}) {
 const calls=[],canvas={width:0,height:0,getContext:()=>({drawImage(...args){calls.push({draw:args.slice(1)})}}),toBlob(cb,type,q){calls.push({type,q});cb(encodeFail?null:{type,size:sizes[Math.min(calls.filter(x=>x.q).length-1,sizes.length-1)]});}};
 const context={Uint8Array,DataView,Blob,console,createImageBitmap:async(file,options)=>{calls.push({options});if(decodeFail)throw Error('unsupported');return {width,height,close(){calls.push({closed:true})}};},document:{createElement:()=>canvas}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../listing-photos-core.js'),'utf8'),context);return {api:context.PoveListingPhotoCore,calls,canvas};
}
const heifBytes=[0,0,0,24,...Buffer.from('ftypheic'),0,0,0,0,...Buffer.from('mif1heic')];
test('20MB originals accepted, above 20MB rejected; output cap stays 5MB',async()=>{assert.equal(core.MAX_BYTES,20*1024*1024);assert.equal(core.OUTPUT_MAX_BYTES,5*1024*1024);await core.validateFile(fixture(png,'image/png',19*1024*1024));await assert.rejects(core.validateFile(fixture(png,'image/png',20*1024*1024+1)),/20 MB/);});
test('HEIC container recognized by content and aliases, AVIF not misclassified',async()=>{for(const type of ['image/heic','image/heif',''])assert.equal(await core.validateFile(fixture(heifBytes,type)),'image/heif');await assert.rejects(core.validateFile(fixture([0,0,0,24,...Buffer.from('ftypavif'),0,0,0,0,...Buffer.from('mif1avif')],'image/heif')));});
test('1920 long edge, aspect ratio, EXIF decoder option, resource release',async()=>{const h=optimizerHarness();await h.api.processFile(fixture(png));assert.deepEqual(h.calls.find(x=>x.draw).draw,[0,0,1920,1440]);assert.equal(h.calls[0].options.imageOrientation,'from-image');assert.ok(h.calls.some(x=>x.closed));assert.equal(h.canvas.width,1);});
test('small photos never upscale',async()=>{const h=optimizerHarness({width:120,height:80});await h.api.processFile(fixture(png));assert.deepEqual(h.calls.find(x=>x.draw).draw,[0,0,120,80]);});
test('bounded quality adapts toward 1MB without going below .74',async()=>{const h=optimizerHarness({sizes:[2000000,1500000,900000]});const blob=await h.api.processFile(fixture(png));assert.equal(blob.size,900000);assert.deepEqual(h.calls.filter(x=>x.q).map(x=>x.q),[.86,.8,.74]);});
test('HEIC converts only when decoder actually succeeds',async()=>{const h=optimizerHarness();assert.equal((await h.api.processFile(fixture(heifBytes,'image/heic'))).type,'image/webp');const fail=optimizerHarness({decodeFail:true});await assert.rejects(fail.api.processFile(fixture(heifBytes,'image/heic')),/HEIC\/HEIF/);});
test('encode/decode failures and excessive output rejected instead of original upload',async()=>{for(const config of [{encodeFail:true},{decodeFail:true},{sizes:[6000000]},{width:9000,height:9000}])await assert.rejects(optimizerHarness(config).api.processFile(fixture(png)));});

test('first selection moves by stable identity and preserves every other relative position',()=>{
 const items=['a','b','c','d','e'].map(id=>({id}));assert.equal(core.moveFirst(items,'b'),true);assert.deepEqual(items.map(x=>x.id),['b','a','c','d','e']);core.moveFirst(items,'e');assert.deepEqual(items.map(x=>x.id),['e','b','a','c','d']);assert.equal(core.moveFirst(items,'e'),false);assert.equal(core.moveFirst(items,'missing'),false);
});
test('deleting first/non-first and appending photos keeps predictable first selection',()=>{
 const items=['a','b','c'].map(localId=>({localId}));core.moveFirst(items,'c');items.splice(0,1);assert.equal(core.photoKey(items[0]),'a');items.push({localId:'d'});assert.deepEqual(items.map(core.photoKey),['a','b','d']);items.splice(1,1);assert.deepEqual(items.map(core.photoKey),['a','d']);items.splice(0);items.push({localId:'new'});assert.equal(core.photoKey(items[0]),'new');
});
for(const kind of ['jobs','workers'])test(kind+' mixed saved/new reordered photos save and reopen in exact order',async()=>{
 let stored=[];const items=[{id:'old-a'},{localId:'new',blob:{}},{id:'old-b'}];core.moveFirst(items,'old-b');core.moveFirst(items,'new');
 const state={items,expected:['old-a','old-b'],dirty:true,loaded:true};
 const repo={stage:async()=>({id:'new-persisted'}),commit:async(k,id,expected,selected)=>{assert.equal(k,kind);assert.deepEqual(expected,['old-a','old-b']);stored=selected.map((id,position)=>({id,position}));return stored;},cleanup:async()=>{},list:async()=>stored};
 await core.saveWithPhotos({state,kind,row:{},repo,saveListing:async()=>({uuid:'parent'})});
 const reopened=await repo.list();assert.deepEqual(reopened.map(x=>x.id),['new-persisted','old-b','old-a']);assert.equal(reopened[0].position,0);assert.equal(state.dirty,false);
});
test('lost response does not accept same photo IDs in a different order',async()=>{
 const state={items:[{id:'b'},{id:'a'}],expected:['a','b'],dirty:true,loaded:true};
 await assert.rejects(core.saveWithPhotos({state,kind:'jobs',row:{},saveListing:async()=>({uuid:'parent'}),repo:{commit:async()=>{throw Error('conflict')},list:async()=>[{id:'a'},{id:'b'}],cleanup:async()=>{throw Error('must not clean')}}}));assert.equal(state.dirty,true);assert.deepEqual(state.items.map(x=>x.id),['b','a']);
});
test('SQL concurrency checks ordered manifest rather than sorting away conflicts',()=>{
 const sql=fs.readFileSync(require.resolve('../migrations/20261010_beauty_listing_photos.sql'),'utf8');assert.ok(sql.includes('array_agg(id order by position)'));assert.ok(sql.includes("expected_ids:=coalesce(p_expected"));assert.ok(sql.includes('position=s.ordinality-1'));assert.ok(sql.includes('to_jsonb(p) order by position'));
});


test('digital category has eight exact unique children, selected edit values and menu options in both flows',()=>{
 const source=fs.readFileSync(require.resolve('../geo-ui.js'),'utf8'),schedule=fs.readFileSync(require.resolve('../schedule.js'),'utf8');
 const ctx={window:{},categoryGroups:{},esc:x=>String(x).replaceAll('"','&quot;')};
 vm.runInNewContext(source.slice(source.indexOf('Object.assign(categoryGroups,{'),source.indexOf('const legacyJobCategories')),ctx);
 const main='დიზაინი და ციფრული მომსახურება',expected=['ლოგო და ბრენდინგი','გრაფიკული დიზაინი','ვიდეომონტაჟი და ანიმაცია','ფოტოგრაფია და ფოტორედაქტირება','ვებსაიტებისა და აპლიკაციების შექმნა','მარკეტინგი და სოციალური ქსელები','AI და ციფრული კონტენტი','სხვა ციფრული მომსახურება'];
 assert.deepEqual(Array.from(ctx.categoryGroups[main]),expected);for(const sub of expected)assert.equal(Object.values(ctx.categoryGroups).flat().filter(x=>x===sub).length,1);
 vm.runInNewContext(source.slice(source.indexOf('function multiCategoryPicker('),source.indexOf('function renderCategoryMenu(')),ctx);
 vm.runInNewContext(schedule.slice(schedule.indexOf('function workerProfileSkillEntries('),schedule.indexOf('function showWorkerFieldError(')),ctx);
 vm.runInNewContext(schedule.split('\n').find(x=>x.startsWith('function workerSkillChips(')),ctx);
 for(const sub of expected){const html=ctx.multiCategoryPicker('category','კატეგორია','post-category',[{main,sub}]);assert.ok(html.includes('value="'+main+'"'));assert.ok(html.includes('value="'+sub+'"'));const entries=ctx.workerProfileSkillEntries({category:main,subcategory:sub,skills:[sub]});assert.equal(entries[0].main,main);assert.equal(entries[0].sub,sub);assert.ok(ctx.workerSkillChips(entries).includes(sub));}
 const widget={dataset:{},querySelector:s=>s==='[data-cat-options]'?options:back};let options={innerHTML:''},back={hidden:true};
 vm.runInNewContext(source.split('\n').find(x=>x.startsWith('function renderCategoryMenu(')),ctx);ctx.renderCategoryMenu(widget,'',main);for(const sub of expected)assert.ok(options.innerHTML.includes('data-cat-subchoice="'+sub+'"'));
 ctx.workerSkillEntriesFromForm=()=>[];ctx.baseCategoryMenuRenderer=ctx.renderCategoryMenu;
 vm.runInNewContext(schedule.slice(schedule.indexOf('renderCategoryMenu=function(widget'),schedule.indexOf("document.addEventListener('click',event=>",schedule.indexOf('renderCategoryMenu=function(widget'))),ctx);
 widget.closest=()=>({});options.innerHTML='';ctx.renderCategoryMenu(widget,'',main);for(const sub of expected)assert.ok(options.innerHTML.includes('data-cat-subchoice="'+sub+'"'));
});

// Offline browser integration: all network requests are blocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.POVE_TEST_BROWSER_CHANNEL?{channel:process.env.POVE_TEST_BROWSER_CHANNEL}:{})});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.route('**/*',r=>r.abort());
   await page.setContent('<main id="app">OLD PRIVATE CONTENT</main>');
   await page.evaluate(()=>{
    location.hash='#/worker/test';window.actor='owner';window.waits=[];
    window.routeView=()=>{document.getElementById('app').textContent='CURRENT '+location.hash;};
    window.render=window.routeView;
    const pending=()=>new Promise((resolve,reject)=>waits.push({resolve,reject}));
    window.Pove24Store={pagedListings:true,accountRef:()=>actor,ensureListingDetail:pending,ensureLegacyListings:pending};
    window.PoveSearchUI={syncCache(){}};
   });
   await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../listing-route-data.js'),'utf8')});
   await page.evaluate(()=>{window.request=routeView();});
   assert.equal(await page.locator('#app').getAttribute('aria-busy'),'true');
   assert.doesNotMatch(await page.locator('#app').innerText(),/PRIVATE/);
   await page.evaluate(async()=>{waits.shift().reject(Error('sensitive'));await request;});
   assert.match(await page.locator('#app').innerText(),/საიტთან დაკავშირება ვერ მოხერხდა/);
   for(const actor of [null,'other-user']){
    await page.evaluate(()=>{window.request=routeView();});
    await page.evaluate(async next=>{
     const ticket=PoveListingRouteGuard.begin();window.actor=next;
     waits.shift().resolve();await request;
     window.blockedText=document.getElementById('app').textContent;
     PoveListingRouteGuard.complete(ticket);
     location.hash='#/jobs';routeView();
    },actor);
    assert.doesNotMatch(await page.evaluate(()=>blockedText),/PRIVATE|CURRENT/);
    assert.equal(await page.locator('#app').innerText(),'CURRENT #/jobs');
    await page.evaluate(()=>{location.hash='#/worker/test';});
   }
   await page.evaluate(()=>{window.request=routeView();});
   await page.evaluate(async()=>{location.hash='#/jobs';routeView();waits.shift().reject(Error('offline'));await request;});
   assert.equal(await page.locator('#app').innerText(),'CURRENT #/jobs');
   await page.close();
  }
  console.log('Offline route integration passed at 390px and 1280px: failure, logout, account switch, stale navigation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

// Entirely offline browser fixture. Never opens the real app or Supabase.
// NODE_PATH can point to an existing Playwright installation. Requires Chromium.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDQAAAABJRU5ErkJggg==','base64');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.POVE_TEST_BROWSER_CHANNEL?{channel:process.env.POVE_TEST_BROWSER_CHANNEL}:{})});let checks=0;
 try{
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='pove-photo-test.invalid')return route.abort();
    if(url.pathname.startsWith('/photo'))return route.fulfill({contentType:'image/png',body:pixel});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ka"><meta name="viewport" content="width=device-width"><body><main id="app"><article class="detail-main"><h2>ფოტოების ტესტი</h2><div id="fixture"></div></article></main></body></html>'});
   });
   await page.goto('http://pove-photo-test.invalid/#/fixture');
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'detail-gallery.css'),'utf8')});
   await page.addScriptTag({content:fs.readFileSync(path.join(root,'detail-gallery.js'),'utf8')});
   for(const count of [0,1,5]){
    await page.evaluate(count=>{
     const host=document.getElementById('fixture');host.replaceChildren();
     window.fixtureGallery=PoveDetailGallery.create(host,Array.from({length:count},(_,i)=>({position:count-1-i,getUrl:async()=>location.origin+'/photo'+i+'.png'})));
    },count);
    assert.equal(await page.locator('.pv-detail-gallery').count(),count?1:0);checks++;
    if(!count)continue;
    assert.equal(await page.locator('.pv-gallery-thumb').count(),count>1?count:0);checks++;
    if(count>1){await page.locator('.pv-gallery-thumb').nth(2).click();assert.equal(await page.evaluate(()=>fixtureGallery.selected),2);checks++;}
    await page.locator('.pv-gallery-main').click();assert.equal(await page.locator('dialog[open]').count(),1);checks++;
    if(count>1){await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>fixtureGallery.selected),3);checks++;
     if(width===390){await page.locator('.pv-viewer-stage').evaluate(el=>{
      el.dispatchEvent(new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:el,clientX:220,clientY:100})]}));
      el.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:1,target:el,clientX:100,clientY:100})]}));
     });assert.equal(await page.evaluate(()=>fixtureGallery.selected),4);checks++;}
    }
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);checks++;
    assert.ok(await page.locator('.pv-gallery-main').evaluate(el=>document.activeElement===el));checks++;
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
   }
   await page.close();
  }
  console.log(JSON.stringify({offlineGalleryChecks:checks,status:'passed'}));
 }finally{await browser.close();}
})().catch(error=>{console.error('Offline browser fixture failed. No live backend was contacted.');console.error(error.message);process.exitCode=1;});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const boot=read('bootstrap.js');
function loader(failed){
 const scripts=[];
 const context={document:{createElement:()=>({}),body:{appendChild(script){scripts.push(script);queueMicrotask(()=>script.src===failed?script.onerror():script.onload());}}},console};
 vm.createContext(context);
 vm.runInContext(boot.slice(boot.indexOf('  function loadScriptsInOrder'),boot.indexOf('  function preloadScripts')),context);
 return {scripts,load:context.loadScriptsInOrder};
}
test('startup script downloads overlap while execution remains ordered',async()=>{
 const h=loader();const pending=h.load(['a.js','b.js']);
 assert.equal(h.scripts.length,2);assert.ok(h.scripts.every(s=>s.async===false));await pending;
});
test('missing app script rejects startup rather than exposing partially installed handlers',async()=>{
 const h=loader('b.js');await assert.rejects(h.load(['a.js','b.js']),/b.js/);
 assert.match(boot,/await loadScriptsInOrder\(legacyScriptUrls\);/);
});
test('auth preload and execution share the exact versioned URL',()=>{
 assert.match(boot,/preloadScripts\(\[\.\.\.legacyScriptUrls, authScriptUrl\]\)/);
 assert.match(boot,/loadScriptsInOrder\(\[authScriptUrl\]\)/);
});
test('inert is released only after secondary data and recovery handling',()=>{
 const ready=boot.indexOf('await window.Pove24Store.waitUntilReady()');
 const auth=boot.indexOf('await window.Pove24Auth?.ready()');
 const interactive=boot.indexOf("app?.removeAttribute('inert')");
 assert.ok(ready<auth&&auth<interactive);
 assert.match(read('index.html'),/<main[^>]+inert>/);
});
test('mutable entry points revalidate while the dated image retains long caching',()=>{
 const rules=JSON.parse(read('vercel.json')).headers;
 assert.equal(rules[0].source,'/');
 for(const rule of rules.slice(0,2))assert.equal(rule.headers[0].value,'public, max-age=0, must-revalidate');
 assert.match(rules[1].source,/html\|js\|css/);
 assert.match(rules[2].source,/20261008\.webp$/);assert.match(rules[2].headers[0].value,/immutable/);
});
test('saved and view projections retain exactly the fields used by cache mapping',async()=>{
 const src=read('supabase-data.js');const calls=[];
 const ctx={client:{from(table){return {select(columns){return {limit(limit){calls.push({table,columns,limit});return Promise.resolve({data:[],error:null});}}}}}},console};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('  const optionalRows ='),src.indexOf('  const accountRef ='))+'\nthis.readRows=optionalRows;',ctx);
 for(const [table,fields]of [['saved_jobs','job_post_id'],['saved_worker_profiles','worker_profile_id'],['listing_views','job_post_id,worker_profile_id,total_views']]){
  assert.ok(src.includes(`optionalRows('${table}', '${fields}')`));
  await ctx.readRows(table,fields);
 }
 assert.equal(calls.length,3);assert.ok(calls.every(c=>c.limit===1000));
 assert.ok(src.includes("optionalRows('job_posts', '*', true)"));
 assert.ok(src.includes("optionalRows('worker_profiles', '*', true)"));
});

/* Public pages use bounded reads; legacy management routes retain their existing store. */
(() => {
  const original=routeView;let sequence=0,authPending=false;
  function clearPage(failed=false){
    const app=document.getElementById('app');if(!app)return;
    app.innerHTML='<section class="container"><div class="empty" role="status">'+
      (failed?'საიტთან დაკავშირება ვერ მოხერხდა. განაახლე გვერდი და სცადე ხელახლა.':'იტვირთება…')+'</div></section>';
    if(failed)app.removeAttribute('aria-busy');else app.setAttribute('aria-busy','true');
  }
  window.PoveListingRouteGuard={
    begin(){authPending=true;sequence++;clearPage();return sequence;},
    complete(ticket){if(ticket!==sequence)return false;authPending=false;return true;},
    fail(ticket){if(ticket===sequence)clearPage(true);}
  };
  routeView=function(...args){
    if(authPending)return;
    const store=window.Pove24Store;
    const ticket=++sequence;
    if(!store?.pagedListings)return original.apply(this,args);
    const hash=location.hash||'#/',path=hash.split('?')[0],caller=store.accountRef();
    const current=()=>ticket===sequence&&!authPending&&location.hash===hash&&store.accountRef()===caller;
    document.getElementById('app')?.removeAttribute('aria-busy');
    if(/^#\/(?:jobs|workers|how)?$/.test(path)||path==='#/login')return original.apply(this,args);
    const detail=/^#\/(?:job|worker)\//.test(path);
    clearPage();
    const app=document.getElementById('app');
    return Promise.resolve().then(()=>{
      if(!current())return;
      return detail?store.ensureListingDetail(path):store.ensureLegacyListings();
    }).then(()=>{
      if(!current())return;
      window.PoveSearchUI.syncCache();return original.apply(this,args);
    }).catch(()=>{if(current())clearPage(true);})
      .finally(()=>{if(current())app?.removeAttribute('aria-busy');});
  };
  render=routeView;
})();

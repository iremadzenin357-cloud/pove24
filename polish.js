(()=>{
  function syncHeaderState(){
    const hash=location.hash||'#/';
    const path=hash.slice(1).split('?')[0]||'/';
    const navTargets=new Set([...document.querySelectorAll('.header .nav>a[href]')].map(link=>(link.getAttribute('href')||'').slice(1).split('?')[0]));
    document.querySelectorAll('.header .nav>a[href],.header>.header-cta[href]').forEach(link=>{
      const target=(link.getAttribute('href')||'').slice(1).split('?')[0];
      const current=target===path
        ||(target==='/jobs'&&(path.startsWith('/job/')||path.startsWith('/user/')))
        ||(target==='/workers'&&path.startsWith('/worker/'))
        ||(target==='/start'&&(path==='/post'||path==='/post-role'||path==='/worker-form'));
      const match=current&&!(link.classList.contains('header-cta')&&navTargets.has(target));
      link.classList.toggle('is-active',!!match);
      if(match)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange',syncHeaderState);
  document.addEventListener('DOMContentLoaded',syncHeaderState);
  const nav=document.getElementById('nav');
  if(nav)new MutationObserver(syncHeaderState).observe(nav,{childList:true,subtree:true});
  syncHeaderState();
})();


(function(){
  const breakpoint=window.matchMedia('(max-width: 1040px)');

  function syncAccountPlacement(){
    const nav=document.getElementById('nav');
    const slot=document.getElementById('mobileAccountSlot');
    if(!nav||!slot)return;
    const account=slot.querySelector('.account-nav')||nav.querySelector('.account-nav');
    if(!account){slot.classList.remove('has-account');return}
    if(breakpoint.matches){slot.append(account);slot.classList.add('has-account')}
    else{nav.append(account);slot.classList.remove('has-account')}
  }

  const baseAccountNavigation=window.accountNavigation;
  if(typeof baseAccountNavigation==='function'){
    window.accountNavigation=function(...args){
      const nav=document.getElementById('nav');
      const slot=document.getElementById('mobileAccountSlot');
      const existing=slot?.querySelector('.account-nav');
      if(existing&&nav)nav.append(existing);
      const result=baseAccountNavigation.apply(this,args);
      syncAccountPlacement();
      return result;
    };
  }

  if(breakpoint.addEventListener)breakpoint.addEventListener('change',syncAccountPlacement);
  else window.addEventListener('resize',syncAccountPlacement);
  syncAccountPlacement();
})();

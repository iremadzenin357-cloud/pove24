(()=>{
  if(window.PoveTheme)return;
  const root=document.documentElement;
  const key='pove-theme';
  const toggle=document.getElementById('themeToggle');
  const themeColor=document.querySelector('meta[name="theme-color"]');
  const preference=window.matchMedia?.('(prefers-color-scheme: dark)');
  let transitionFrame=0;

  function savedTheme(){
    try{
      const value=localStorage.getItem(key);
      return value==='light'||value==='dark'?value:null;
    }catch{return null}
  }

  function applyTheme(theme,persist=false){
    const selected=theme==='dark'?'dark':'light';
    if(persist){
      // Suppress existing hover transitions for the first painted theme frame.
      root.classList.add('theme-switching');
      window.cancelAnimationFrame(transitionFrame);
      transitionFrame=window.requestAnimationFrame(()=>{
        transitionFrame=window.requestAnimationFrame(()=>{
          root.classList.remove('theme-switching');
          transitionFrame=0;
        });
      });
    }
    root.dataset.theme=selected;
    root.style.colorScheme=selected;
    if(themeColor)themeColor.content=selected==='dark'?'#151b18':'#f7f9f6';
    if(persist){try{localStorage.setItem(key,selected)}catch{}}
    if(toggle){
      const isDark=selected==='dark';
      toggle.setAttribute('aria-pressed',String(isDark));
      toggle.setAttribute('aria-label',isDark?'თემა: მუქი':'თემა: ნათელი');
      toggle.title=isDark?'მუქი თემა':'ნათელი თემა';
    }
  }

  applyTheme(root.dataset.theme||(preference?.matches?'dark':'light'));
  toggle?.addEventListener('click',()=>applyTheme(root.dataset.theme==='dark'?'light':'dark',true));

  const onSystemChange=event=>{
    if(savedTheme()===null)applyTheme(event.matches?'dark':'light');
  };
  if(preference?.addEventListener)preference.addEventListener('change',onSystemChange);
  else preference?.addListener?.(onSystemChange);

  window.PoveTheme={get current(){return root.dataset.theme},set:applyTheme};
})();

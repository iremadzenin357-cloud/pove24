/* Native horizontal home feed. Existing data and card renderers remain authoritative. */
(() => {
  const homeHash = () => (location.hash || '#/').split('?')[0] === '#/';
  function jobMarkup(job) {
    const html = jobCard(job, { showStatus: false });
    const top = html.match(/<div class="card-top">([\s\S]*?)<\/div>/);
    if (!top) return html;
    const type = '<span class="pill home-listing-type home-listing-type--offer">სამუშაოს შეთავაზება</span>';
    const rest = top[1].replace(/<span class="pill(?: pill-sub)?">[\s\S]*?<\/span>/g, '');
    return html.replace(top[0], `<div class="card-top">${type}${rest}</div>`);
  }


  function workerMarkup(worker) {
    const aboutTitle = String(worker.about || '').split(/[.!?…]/, 1)[0].trim().slice(0, 35).trim();
    const cardProfile = { ...worker, offer: String(worker.offer || worker.offerTitle || worker.category || aboutTitle || '').trim() };
    let html = workerCard(cardProfile);
    const articleEnd = html.indexOf('>');
    if (articleEnd < 0) return html;

    const saveButton = html.indexOf('</button>', articleEnd);
    const insertAt = saveButton >= 0 ? saveButton + '</button>'.length : articleEnd + 1;
    const badges = '<div class="card-top home-listing-card-top"><span class="pill home-listing-type home-listing-type--seeker">სამუშაოს მაძიებელი</span></div>';
    html = html.slice(0, insertAt) + badges + html.slice(insertAt);
    return html;
  }

  function allListings() {
    const seen = new Set();
    const workers = get('dge-workers', []).filter(item => {
      const key = String(item.uuid || item.id || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const entries = [
      ...homeActiveJobs().map(item => ({ item, kind: 'job' })),
      ...workers.map(item => ({ item, kind: 'worker' }))
    ];
    const time = item => Number.isFinite(item.createdAt) ? item.createdAt : 0;
    const key = entry => entry.kind + ':' + String(entry.item.uuid || entry.item.id);
    return entries.sort((a,b) => time(b.item)-time(a.item) || (key(a)<key(b)?-1:key(a)>key(b)?1:0))
      .map(entry => entry.kind === 'job' ? jobMarkup(entry.item) : workerMarkup(entry.item));
  }


  let resizeObserver;
  function enableFeedGestures(grid) {
    let drag = null;
    let suppressClickUntil = 0;
    grid.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button,input,select,textarea')) return;
      event.preventDefault();
      drag = { id: event.pointerId, x: event.clientX, left: grid.scrollLeft, moved: false };
    });
    grid.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const distance = event.clientX - drag.x;
      if (!drag.moved && Math.abs(distance) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        grid.setPointerCapture(event.pointerId);
        grid.classList.add('is-dragging');
      }
      event.preventDefault();
      grid.scrollLeft = drag.left - distance;
    });
    const finish = () => {
      if (!drag) return;
      const { id, moved } = drag;
      drag = null;
      if (moved) suppressClickUntil = Date.now() + 350;
      grid.classList.remove('is-dragging');
      if (grid.hasPointerCapture(id)) grid.releasePointerCapture(id);
      syncControls(grid);
    };
    grid.addEventListener('pointerup', finish);
    grid.addEventListener('pointercancel', finish);
    grid.addEventListener('lostpointercapture', finish);
    grid.addEventListener('pointerleave', () => { if (drag && !drag.moved) finish(); });
    grid.addEventListener('dragstart', event => event.preventDefault());
    grid.addEventListener('click', event => {
      if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    grid.addEventListener('wheel', event => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      // Page scrolling must not silently advance the first group of cards.
      if (!event.shiftKey && document.activeElement !== grid) return;
      const max = grid.scrollWidth - grid.clientWidth;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? grid.clientWidth : 1);
      if (max <= 2 || (delta < 0 && grid.scrollLeft <= 2) || (delta > 0 && grid.scrollLeft >= max - 2)) return;
      event.preventDefault();
      grid.scrollBy({ left: delta, behavior: 'auto' });
    }, { passive: false });
  }
  function syncControls(grid) {
    if (!grid.isConnected) return;
    const section = grid.closest('#latest-jobs');
    const max = Math.max(0, grid.scrollWidth - grid.clientWidth);
    const previous = section.querySelector('.home-feed-previous');
    previous.disabled = grid.scrollLeft <= 2;
    previous.hidden = previous.disabled;
    section.querySelector('.home-feed-next').disabled = grid.scrollLeft >= max - 2;
  }
  function updateHomeListings() {
    if (!homeHash()) return;
    const grid = document.querySelector('#latest-jobs .job-grid');
    if (!grid || grid.dataset.homeFeedInitialized === 'true') return;
    grid.dataset.homeFeedInitialized = 'true';
    grid.id = 'home-job-carousel';
    grid.setAttribute('role','region');
    grid.setAttribute('aria-label','ბოლო განცხადებები');
    grid.tabIndex = 0;
    const listings = allListings();
    grid.innerHTML = listings.length ? listings.join('') : '<div class="empty"><strong>განცხადებები ჯერ არ არის</strong>გამოქვეყნებული განცხადებები აქ გამოჩნდება.</div>';
    grid.closest('#latest-jobs').querySelectorAll('.home-feed-controls button').forEach(button => button.setAttribute('aria-controls', grid.id));
    grid.addEventListener('scroll', () => syncControls(grid), {passive:true});
    enableFeedGestures(grid);
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => syncControls(grid));
    resizeObserver.observe(grid);
    requestAnimationFrame(() => {
      if (!grid.isConnected) return;
      grid.scrollTo({ left: 0, behavior: 'instant' });
      syncControls(grid);
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('#latest-jobs .home-feed-controls button');
    if (!button || button.disabled) return;
    const grid = document.getElementById('home-job-carousel');
    const card = grid.querySelector('article');
    if (!card) return;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const step = card.getBoundingClientRect().width + gap;
    const count = Math.max(1, Math.floor((grid.clientWidth + gap) / step));
    grid.scrollBy({left: step * count * (button.classList.contains('home-feed-previous') ? -1 : 1), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  });
  let frame;
  const schedule = () => {cancelAnimationFrame(frame); frame = requestAnimationFrame(updateHomeListings);};
  new MutationObserver(schedule).observe(document.getElementById('app'), {childList:true,subtree:true});
  window.addEventListener('hashchange', schedule);
  updateHomeListings();
})();

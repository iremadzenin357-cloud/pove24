(() => {
  const isJobSearch = () => (location.hash || '').split('?')[0] === '#/jobs';

  function addStyles() {
    if (document.getElementById('job-search-save-layout-styles')) return;
    const style = document.createElement('style');
    style.id = 'job-search-save-layout-styles';
    style.textContent = `
      #jobResults .job-search-results-grid>.job-card>.card-top{justify-content:space-between;align-items:flex-start;gap:10px}
      #jobResults .job-search-results-grid>.job-card>.card-top>.job-category-stack{display:flex;flex:1 1 auto;min-width:0;flex-direction:column;align-items:flex-start;gap:5px}
      #jobResults .job-search-results-grid>.job-card>.card-top>.job-category-stack>.pill{max-width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.45}
      #jobResults .job-search-results-grid>.job-card>.card-top>.job-category-stack>.pill-sub{display:none}
      #jobResults .job-search-results-grid>.job-card>.card-top>[data-save]{flex:0 0 auto;margin:0 0 0 auto}
    `;
    document.head.append(style);
  }

  function ensureAndPositionSaveButtons() {
    if (!isJobSearch()) return;
    const grid = document.querySelector('#jobResults .job-grid');
    if (!grid) return;
    grid.classList.add('job-search-results-grid');

    grid.querySelectorAll(':scope > .job-card').forEach(card => {
      const top = card.querySelector(':scope > .card-top');
      if (!top) return;

      let button = top.querySelector('[data-save]');
      const detailLink = card.querySelector('a[href^="#/job/"]');
      const encodedId = detailLink?.getAttribute('href').split('?')[0].slice('#/job/'.length);
      if (!encodedId) return;
      let id = encodedId;
      try { id = decodeURIComponent(encodedId); } catch {}
      const job = jobs.find(item => String(item.id) === String(id));
      const isOwnJob = !!user?.email && (job?.owner === user.email || job?.ownerEmail === user.email || job?.email === user.email);
      if (isOwnJob) button?.remove();

      let categoryStack = top.querySelector(':scope > .job-category-stack');
      if (!categoryStack) {
        categoryStack = document.createElement('div');
        categoryStack.className = 'job-category-stack';
        top.querySelectorAll(':scope > .pill').forEach(pill => categoryStack.append(pill));
        top.prepend(categoryStack);
      }

      if (isOwnJob) return;
      if (!button) {
        const isSaved = saved.includes(id);
        button = document.createElement('button');
        button.type = 'button';
        button.className = `save-btn saved-action${isSaved ? ' saved' : ''}`;
        button.dataset.save = id;
        button.setAttribute('aria-label', isSaved ? 'შენახულია' : 'შენახვა');
        button.title = isSaved ? 'შენახულებიდან წაშლა' : 'განცხადების შენახვა';
        button.textContent = isSaved ? '♥ შენახულია' : '♡ შენახვა';
      }

      top.append(button);
    });
  }

  addStyles();
  const renderResults = updateResults;
  updateResults = function (...args) {
    const result = renderResults.apply(this, args);
    ensureAndPositionSaveButtons();
    return result;
  };

  ensureAndPositionSaveButtons();
  window.addEventListener('hashchange', () => requestAnimationFrame(ensureAndPositionSaveButtons));
})();

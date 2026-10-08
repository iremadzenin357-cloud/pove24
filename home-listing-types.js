(() => {
  const homeHash = () => (location.hash || '#/').split('?')[0] === '#/';
  const pageSize = 3;
  let pageIndex = 0;
  let pageDirection = 'next';

  function addCarouselStyles() {
    if (document.getElementById('home-feed-carousel-styles')) return;
    const style = document.createElement('style');
    style.id = 'home-feed-carousel-styles';
    style.textContent = `
      .home-feed-next{display:grid;place-items:center;flex:0 0 56px;width:56px;height:56px;padding:0;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text-primary);box-shadow:var(--shadow-surface);cursor:pointer;transition:background-color .18s ease,color .18s ease,border-color .18s ease,transform .18s ease,box-shadow .18s ease}
      .home-feed-controls{display:flex;align-items:center;gap:10px}
      .home-feed-previous{display:grid;place-items:center;flex:0 0 56px;width:56px;height:56px;padding:0;border:1px solid var(--border);border-radius:18px;background:var(--surface);color:var(--text-primary);box-shadow:var(--shadow-surface);cursor:pointer;transition:background-color .18s ease,color .18s ease,border-color .18s ease,transform .18s ease,box-shadow .18s ease}
      .home-feed-previous svg{width:27px;height:27px;transition:transform .18s ease}
      .home-feed-next svg{width:27px;height:27px;transition:transform .18s ease}
      .home-feed-next:hover,.home-feed-next:focus-visible,.home-feed-previous:hover,.home-feed-previous:focus-visible{background:var(--accent);border-color:var(--accent);color:var(--background);box-shadow:0 7px 19px color-mix(in srgb,var(--accent) 24%,transparent);outline:none}
      .home-feed-next:hover,.home-feed-next:focus-visible{transform:translateX(2px)}
      .home-feed-previous:hover,.home-feed-previous:focus-visible{transform:translateX(-2px)}
      .home-feed-next:hover svg,.home-feed-next:focus-visible svg{transform:translateX(2px)}
      .home-feed-previous:hover svg,.home-feed-previous:focus-visible svg{transform:translateX(-2px)}
      .home-feed-next:active{background:var(--accent-hover);border-color:var(--accent-hover);transform:translateX(3px) scale(.97)}
      .home-feed-previous:active{background:var(--accent-hover);border-color:var(--accent-hover);transform:translateX(-3px) scale(.97)}
      .home-feed-next[hidden]{display:none}
      .home-feed-previous[hidden]{display:none}
      .pill.home-listing-type--offer{background:var(--accent);border:1px solid var(--accent);color:var(--background)}
      .pill.home-listing-type--seeker{background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 42%,var(--border));color:var(--accent)}
      html[data-theme="dark"] .pill.home-listing-type--offer{background:var(--accent);border-color:var(--accent);color:var(--background)}
      html[data-theme="dark"] .pill.home-listing-type--seeker{background:var(--surface);border-color:var(--accent);color:var(--accent)}
      .home-feed-enter{animation:home-feed-enter .28s ease}
      .job-grid[data-home-feed-direction="previous"] .home-feed-enter{animation-name:home-feed-enter-back}
      @keyframes home-feed-enter{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
      @keyframes home-feed-enter-back{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
      @media(max-width:760px){.home-feed-enter{animation:none}.home-feed-next:hover,.home-feed-next:focus-visible,.home-feed-previous:hover,.home-feed-previous:focus-visible,.home-feed-next:active,.home-feed-previous:active{transform:none}.home-feed-next:hover svg,.home-feed-next:focus-visible svg,.home-feed-previous:hover svg,.home-feed-previous:focus-visible svg{transform:none}}
      @media(prefers-reduced-motion:reduce){.home-feed-next,.home-feed-next svg,.home-feed-previous,.home-feed-previous svg{transition:none}.home-feed-enter{animation:none}}
    `;
    document.head.append(style);
  }

  function dateValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function postedTime(item) {
    for (const key of ['createdAt', 'postedAt', 'publishedAt', 'createdOn', 'created']) {
      const value = dateValue(item?.[key]);
      if (value) return value;
    }

    const id = String(item?.id || '');
    const sample = id.match(/^sample-(job|worker)-(\d+)$/);
    if (sample) {
      const sequence = Math.max(0, Number(sample[2]) - 1) * 2 + (sample[1] === 'worker' ? 1 : 0);
      return Date.UTC(2026, 0, 1) + sequence * 60_000;
    }

    const idTimestamp = id.match(/(\d{12,})$/);
    if (idTimestamp) return Number(idTimestamp[1]);

    const posted = String(item?.posted || '').toLowerCase();
    if (/ახლახან|ახლა/.test(posted)) return Date.now() - 30_000;
    if (/გუშინ/.test(posted)) return Date.now() - 86_400_000;
    const relative = posted.match(/(\d+)\s*(წუთ|საათ|დღ)/);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2];
      const scale = unit === 'წუთ' ? 60_000 : unit === 'საათ' ? 3_600_000 : 86_400_000;
      return Date.now() - amount * scale;
    }
    return 0;
  }

  function jobMarkup(job) {
    const html = withEntryAnimation(jobCard(job));
    const top = html.match(/<div class="card-top">([\s\S]*?)<\/div>/);
    if (!top) return html;
    const type = '<span class="pill home-listing-type home-listing-type--offer">სამუშაოს შეთავაზება</span>';
    const rest = top[1].replace(/<span class="pill(?: pill-sub)?">[\s\S]*?<\/span>/g, '');
    return html.replace(top[0], `<div class="card-top">${type}${rest}</div>`);
  }

  function workerMarkup(worker) {
    const aboutTitle = String(worker.about || '').split(/[.!?…]/, 1)[0].trim().slice(0, 35).trim();
    const cardProfile = { ...worker, offer: String(worker.offer || worker.offerTitle || worker.category || aboutTitle || '').trim() };
    let html = withEntryAnimation(workerCard(cardProfile));
    const articleEnd = html.indexOf('>');
    if (articleEnd < 0) return html;

    const saveButton = html.indexOf('</button>', articleEnd);
    const insertAt = saveButton >= 0 ? saveButton + '</button>'.length : articleEnd + 1;
    const badges = '<div class="card-top home-listing-card-top"><span class="pill home-listing-type home-listing-type--seeker">სამუშაოს მაძიებელი</span></div>';
    html = html.slice(0, insertAt) + badges + html.slice(insertAt);
    return html;
  }

  function withEntryAnimation(html) {
    return html.replace(/<article class="([^"]+)"/, '<article class="$1 home-feed-enter"');
  }

  function fitMobileJobDescriptions(grid) {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    grid.querySelectorAll('.job-card>.job-description').forEach(node => {
      const fullText = node.dataset.fullDescription || node.textContent.trim();
      node.dataset.fullDescription = fullText;
      if (!mobile) {
        node.textContent = fullText;
        return;
      }

      const width = node.clientWidth;
      if (!width || !fullText) return;

      const style = getComputedStyle(node);
      const canvas = fitMobileJobDescriptions.canvas || (fitMobileJobDescriptions.canvas = document.createElement('canvas'));
      const context = canvas.getContext('2d');
      if (!context) return;
      context.font = style.font;
      const fits = text => context.measureText(text).width <= width;
      const ellipsize = text => {
        let value = text.replace(/\.\.\.$/u, '').trimEnd();
        while (value && !fits(`${value}...`)) value = Array.from(value).slice(0, -1).join('').trimEnd();
        return `${value}...`;
      };
      const words = fullText.split(/\s+/u);
      const lines = ['', ''];
      let line = 0;
      let overflow = false;

      for (const word of words) {
        const candidate = lines[line] ? `${lines[line]} ${word}` : word;
        if (fits(candidate)) {
          lines[line] = candidate;
          continue;
        }

        if (line === 0) {
          line = 1;
          if (fits(word)) {
            lines[line] = word;
            continue;
          }
          lines[line] = ellipsize(word);
        }
        overflow = true;
        break;
      }

      if (overflow) {
        if (lines[1]) lines[1] = ellipsize(lines[1]);
        else lines[0] = ellipsize(lines[0]);
      }

      node.textContent = lines.filter(Boolean).join('\n');
    });
  }

  function allListings() {
    const offers = jobs.filter(item => item?.status === 'active').map((item, index) => ({ item, kind: 'offer', index, time: postedTime(item) }));
    const allWorkers = [...get('dge-workers', []), ...seedWorkers];
    const seen = new Set();
    const seekers = allWorkers
      .filter(worker => {
        const key = String(worker?.id || worker?.email || worker?.owner || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item, index) => ({ item, kind: 'seeker', index, time: postedTime(item) }));

    return [...offers, ...seekers]
      .sort((a, b) => b.time - a.time || a.index - b.index)
      .map(entry => entry.kind === 'offer' ? jobMarkup(entry.item) : workerMarkup(entry.item));
  }

  function updateHomeListings() {
    if (!homeHash()) return;
    const heading = [...document.querySelectorAll('#app h2')]
      .find(node => node.textContent.trim() === 'ბოლო განცხადებები');
    const grid = heading?.closest('.section')?.querySelector('.job-grid');
    if (!grid) return;

    const listings = allListings();
    const pageCount = Math.max(1, Math.ceil(listings.length / pageSize));
    pageIndex %= pageCount;
    const start = pageIndex * pageSize;
    const visible = listings.length
      ? Array.from({ length: Math.min(pageSize, listings.length) }, (_, index) => listings[(start + index) % listings.length])
      : [];
    grid.setAttribute('aria-live', 'polite');
    grid.dataset.homeFeedDirection = pageDirection;
    grid.innerHTML = visible.length
      ? visible.join('')
      : '<div class="empty" style="grid-column:1/-1"><strong>განცხადებები ჯერ არ არის</strong>გამოქვეყნებული განცხადებები აქ გამოჩნდება.</div>';
    grid.dataset.homeFeedInitialized = 'true';
    fitMobileJobDescriptions(grid);

    const sectionHeading = heading.closest('.section-heading');
    let arrowControls = sectionHeading?.querySelector('.home-feed-controls');
    if (!arrowControls && sectionHeading) {
      const oldLink = sectionHeading.querySelector('.text-link');
      arrowControls = document.createElement('div');
      arrowControls.className = 'home-feed-controls';
      arrowControls.innerHTML = '<button class="home-feed-previous" type="button" aria-label="წინა სამი განცხადება" title="წინა სამი განცხადება"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7 7-7-7 7-7"/></svg></button><button class="home-feed-next" type="button" aria-label="შემდეგი სამი განცხადება" title="შემდეგი სამი განცხადება"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button>';
      if (oldLink) oldLink.replaceWith(arrowControls);
      else sectionHeading.append(arrowControls);
    }
    if (arrowControls) {
      arrowControls.querySelector('.home-feed-previous').hidden = pageIndex === 0;
      arrowControls.querySelector('.home-feed-next').hidden = listings.length <= pageSize;
    }
  }

  addCarouselStyles();
  updateHomeListings();
  const appRoot = document.getElementById('app');
  if (appRoot) {
    const homeFeedObserver = new MutationObserver(() => {
      requestAnimationFrame(() => {
        if (!homeHash()) return;
        const grid = [...appRoot.querySelectorAll('.section .job-grid')]
          .find(node => node.closest('.section')?.querySelector('h2')?.textContent.trim() === 'ბოლო განცხადებები');
        if (grid && grid.dataset.homeFeedInitialized !== 'true') updateHomeListings();
      });
    });
    homeFeedObserver.observe(appRoot, { childList: true, subtree: true });
  }
  document.addEventListener('click', event => {
    if (event.target.closest('.home-feed-previous')) {
      pageDirection = 'previous';
      pageIndex = Math.max(0, pageIndex - 1);
    } else if (event.target.closest('.home-feed-next')) {
      pageDirection = 'next';
      pageIndex += 1;
    }
    else return;
    updateHomeListings();
  });
  window.addEventListener('hashchange', () => {
    if (!homeHash()) {
      pageIndex = 0;
      pageDirection = 'next';
    }
    requestAnimationFrame(updateHomeListings);
  });
  let descriptionResizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(descriptionResizeFrame);
    descriptionResizeFrame = requestAnimationFrame(() => {
      const grid = document.querySelector('#latest-jobs .job-grid[data-home-feed-initialized="true"]');
      if (grid) fitMobileJobDescriptions(grid);
    });
  });
})();

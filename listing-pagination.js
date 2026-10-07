(() => {
  const state = {
    jobs: { page: 1, sort: 'newest', view: 'grid', paymentType: null, choosingPaymentType: false, choosingSort: null, sortMenuOpen: false },
    workers: { page: 1, sort: 'newest', view: 'grid', paymentType: null, choosingPaymentType: false, choosingSort: null, sortMenuOpen: false }
  };
  const isMobile = () => window.matchMedia('(max-width: 620px)').matches;
  const pageSize = (kind, view) => 12;

  function hostFor(kind) {
    return document.getElementById(kind === 'jobs' ? 'jobResults' : 'workerResults');
  }

  function recordsFor(kind) {
    if (kind === 'jobs') return Array.isArray(jobs) ? jobs : [];
    const profiles = typeof get === 'function' ? get('dge-workers', []) : [];
    return [...profiles, ...(Array.isArray(seedWorkers) ? seedWorkers : [])];
  }

  function selectedPaymentFilter(kind) {
    const selector = kind === 'jobs'
      ? '#filters [name="paymentType"]'
      : '#worker-filters [name="workerPaymentType"]';
    const value = document.querySelector(selector)?.value || '';
    return value && value !== 'all' ? value : null;
  }

  function cardId(card, kind) {
    const prefix = kind === 'jobs' ? '#/job/' : '#/worker/';
    const link = [...card.querySelectorAll('a[href]')].find(anchor => (anchor.getAttribute('href') || '').startsWith(prefix));
    if (!link) return '';
    try {
      return decodeURIComponent(link.getAttribute('href').slice(prefix.length).split(/[?#]/u, 1)[0]);
    } catch {
      return link.getAttribute('href').slice(prefix.length).split(/[?#]/u, 1)[0];
    }
  }

  function asTimestamp(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function annotateCards(kind, cards) {
    const records = new Map();
    recordsFor(kind).forEach(record => {
      const id = String(record?.id || '');
      if (id && !records.has(id)) records.set(id, record);
    });

    cards.forEach((card, index) => {
      if (card.dataset.listingOrder === undefined) card.dataset.listingOrder = String(index);
      const record = records.get(cardId(card, kind));
      const timestamp = asTimestamp(record?.createdAt ?? record?.publishedAt ?? record?.postedAt);
      const amount = kind === 'jobs'
        ? record?.paymentMin ?? record?.paymentAmount ?? record?.pay
        : record?.pay;
      const price = amount === null || amount === undefined || amount === '' ? null : Number(amount);
      card.dataset.listingTimestamp = timestamp === null ? '' : String(timestamp);
      card.dataset.listingPrice = price !== null && Number.isFinite(price) ? String(price) : '';
      card.dataset.listingPaymentType = String(record?.paymentType || 'daily');
    });
  }

  function sortCards(kind, grid, cards) {
    annotateCards(kind, cards);
    const { sort, paymentType } = state[kind];
    const candidates = (sort === 'price-asc' || sort === 'price-desc') && paymentType && paymentType !== 'all'
      ? cards.filter(card => card.dataset.listingPaymentType === paymentType)
      : cards;
    cards.filter(card => !candidates.includes(card)).forEach(card => { card.hidden = true; });
    const sorted = [...candidates].sort((left, right) => {
      const leftOrder = Number(left.dataset.listingOrder) || 0;
      const rightOrder = Number(right.dataset.listingOrder) || 0;
      if (sort === 'price-asc' || sort === 'price-desc') {
        const a = left.dataset.listingPrice === '' ? null : Number(left.dataset.listingPrice);
        const b = right.dataset.listingPrice === '' ? null : Number(right.dataset.listingPrice);
        if (a === null && b !== null) return 1;
        if (b === null && a !== null) return -1;
        if (a !== null && b !== null && a !== b) return sort === 'price-asc' ? a - b : b - a;
        return leftOrder - rightOrder;
      }

      const a = left.dataset.listingTimestamp === '' ? null : Number(left.dataset.listingTimestamp);
      const b = right.dataset.listingTimestamp === '' ? null : Number(right.dataset.listingTimestamp);
      if (a === null && b !== null) return sort === 'newest' ? 1 : -1;
      if (b === null && a !== null) return sort === 'newest' ? -1 : 1;
      if (a !== null && b !== null && a !== b) return sort === 'newest' ? b - a : a - b;
      return leftOrder - rightOrder;
    });
    grid.append(...sorted);
    return sorted;
  }

  function controlsMarkup(kind) {
    const current = state[kind];
    const sortOptions = [
      ['newest', 'თარიღი — კლებით'],
      ['oldest', 'თარიღი — ზრდით'],
      ['price-asc', 'ანაზღაურება — ზრდით'],
      ['price-desc', 'ანაზღაურება — კლებით']
    ];
    const selectedSort = sortOptions.find(([value]) => value === current.sort) || sortOptions[0];
    const paymentTypes = [['all', 'ყველა'], ['daily', 'დღიური'], ['hourly', 'საათობრივი'], ['fixed', 'ფიქსირებული'], ['negotiable', 'შეთანხმებით']];
    const selectedTypeLabel = paymentTypes.find(([value]) => value === current.paymentType)?.[1];
    const menuContent = current.choosingPaymentType
      ? `<button type="button" role="menuitem" class="listing-sort-back" data-sort-back="${kind}">← უკან</button><span class="listing-sort-heading" role="presentation">აირჩიე ანაზღაურების ტიპი</span>${paymentTypes.map(([value, label]) => `<button type="button" role="menuitemradio" class="listing-sort-option${current.paymentType === value ? ' is-selected' : ''}" data-payment-type="${value}" data-listing-kind="${kind}" aria-checked="${current.paymentType === value}">${label}</button>`).join('')}`
      : sortOptions.map(([value, label]) => `<button type="button" role="menuitemradio" class="listing-sort-option${current.sort === value ? ' is-selected' : ''}" data-sort-option="${value}" data-listing-kind="${kind}" aria-checked="${current.sort === value}">${label}</button>`).join('');
    const gridIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';
    const listIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h12M9 12h12M9 19h12"/><rect x="3" y="4" width="2" height="2" rx=".4"/><rect x="3" y="11" width="2" height="2" rx=".4"/><rect x="3" y="18" width="2" height="2" rx=".4"/></svg>';
    return `<div class="listing-toolbar-controls"><div class="listing-sort-control${selectedTypeLabel ? ' has-payment-type' : ''}" data-listing-sort-menu="${kind}"><span class="visually-hidden" id="listing-sort-label-${kind}">განცხადებების დალაგება</span><button type="button" class="listing-sort-trigger" data-sort-trigger="${kind}" aria-labelledby="listing-sort-label-${kind}" aria-haspopup="menu" aria-expanded="${current.sortMenuOpen}"><span>${selectedSort[1]}${selectedTypeLabel ? `<small class="listing-sort-type">${selectedTypeLabel}</small>` : ''}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg></button>${selectedTypeLabel ? `<button type="button" class="listing-sort-clear" data-clear-sort-type="${kind}" aria-label="არჩეული ანაზღაურების ტიპის წაშლა" title="წაშლა">×</button>` : ''}<div class="listing-sort-options" role="menu" aria-label="${current.choosingPaymentType ? 'ანაზღაურების ტიპის არჩევა' : 'დალაგების ვარიანტები'}"${current.sortMenuOpen ? '' : ' hidden'}>${menuContent}</div></div><div class="listing-view-switch" role="group" aria-label="განცხადებების განლაგება"><button type="button" data-listing-view="grid" data-listing-kind="${kind}" aria-label="ბადის ხედი" title="ბადის ხედი" aria-pressed="${current.view === 'grid'}" class="${current.view === 'grid' ? 'is-active' : ''}">${gridIcon}</button><button type="button" data-listing-view="list" data-listing-kind="${kind}" aria-label="სიის ხედი" title="სიის ხედი" aria-pressed="${current.view === 'list'}" class="${current.view === 'list' ? 'is-active' : ''}">${listIcon}</button></div></div>`;
  }

  function ensureToolbar(kind, host, grid, count, preserveForPaymentFilter = false) {
    if (!count && !preserveForPaymentFilter) {
      document.querySelector(`.listing-toolbar[data-listing-kind="${kind}"]`)?.remove();
      return;
    }

    const controls = controlsMarkup(kind);
    if (kind === 'jobs') {
      const heading = host.querySelector('.results-head');
      if (!heading) return;
      const previousCountHtml = heading.querySelector('.listing-result-count')?.innerHTML
        || heading.querySelector(':scope > span:first-child')?.innerHTML
        || `ნაპოვნია <strong>${count}</strong> განცხადება`;
      const countHtml = previousCountHtml.replace(/(<strong[^>]*>).*?(<\/strong>)/u, (_, open, close) => `${open}${count}${close}`);
      const detailHtml = heading.querySelector('.listing-toolbar-detail')?.innerHTML
        || heading.querySelector(':scope > span:nth-child(2)')?.innerHTML
        || '';
      heading.classList.add('listing-toolbar', 'listing-toolbar--jobs');
      heading.dataset.listingKind = kind;
      heading.innerHTML = `<div class="listing-toolbar-copy"><span class="listing-result-count">${countHtml}</span>${detailHtml ? `<small class="listing-toolbar-detail">${detailHtml}</small>` : ''}</div>${controls}`;
      return;
    }

    let toolbar = document.querySelector('.listing-toolbar[data-listing-kind="workers"]');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'listing-toolbar listing-toolbar--workers';
      toolbar.dataset.listingKind = kind;
      grid.insertAdjacentElement('beforebegin', toolbar);
    }
    toolbar.innerHTML = `<span class="listing-result-count">ნაპოვნია <strong>${count}</strong> განცხადება</span>${controls}`;
  }

  function pagerFor(kind, host) {
    if (kind === 'jobs') return host.querySelector(':scope > .listing-pagination');
    return host.parentElement?.querySelector(`:scope > .listing-pagination[data-pagination-kind="${kind}"]`) || null;
  }

  function render(kind) {
    const host = hostFor(kind);
    if (!host) return;

    const grid = kind === 'jobs' ? host.querySelector('.job-grid') : host;
    const cards = grid ? [...grid.querySelectorAll(':scope > .job-card, :scope > .worker-card')] : [];
    if (!grid || !cards.length) {
      pagerFor(kind, host)?.remove();
      document.querySelector(`.listing-toolbar[data-listing-kind="${kind}"]`)?.remove();
      document.querySelector(`.listing-filter-empty[data-listing-kind="${kind}"]`)?.remove();
      return;
    }

    const sortedCards = sortCards(kind, grid, cards);
    grid.classList.toggle('is-list-view', state[kind].view === 'list');
    grid.classList.toggle('is-grid-view', state[kind].view === 'grid');
    const paymentFilterActive = (state[kind].sort === 'price-asc' || state[kind].sort === 'price-desc') && !!state[kind].paymentType && state[kind].paymentType !== 'all';
    ensureToolbar(kind, host, grid, sortedCards.length, paymentFilterActive);
    const emptyMessage = document.querySelector(`.listing-filter-empty[data-listing-kind="${kind}"]`);
    if (paymentFilterActive && !sortedCards.length) {
      if (!emptyMessage) {
        const message = document.createElement('div');
        message.className = 'listing-filter-empty';
        message.dataset.listingKind = kind;
        message.textContent = 'ამ ანაზღაურების ტიპის განცხადებები ვერ მოიძებნა.';
        (kind === 'jobs' ? grid : host).insertAdjacentElement('afterend', message);
      }
    } else {
      emptyMessage?.remove();
    }

    const size = pageSize(kind, state[kind].view);
    const pageCount = Math.ceil(sortedCards.length / size);
    state[kind].page = Math.max(1, Math.min(state[kind].page, pageCount));
    const start = (state[kind].page - 1) * size;
    sortedCards.forEach((card, index) => {
      card.hidden = index < start || index >= start + size;
    });

    let nav = pagerFor(kind, host);
    if (pageCount < 2) {
      nav?.remove();
      return;
    }

    const maxLinks = isMobile() ? 3 : 5;
    const firstPage = Math.max(1, Math.min(state[kind].page - Math.floor(maxLinks / 2), pageCount - maxLinks + 1));
    const lastPage = Math.min(pageCount, firstPage + maxLinks - 1);
    const pageButtons = Array.from({ length: lastPage - firstPage + 1 }, (_, index) => {
      const page = firstPage + index;
      return `<button class="listing-page-button${page === state[kind].page ? ' is-current' : ''}" type="button" data-pagination-page="${page}" aria-label="გვერდი ${page}"${page === state[kind].page ? ' aria-current="page"' : ''}>${page}</button>`;
    }).join('');

    const previousIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
    const nextIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    const markup = `<nav class="listing-pagination" data-pagination-kind="${kind}" aria-label="განცხადებების გვერდები"><div class="listing-pagination-actions">${state[kind].page > 1 ? `<button class="listing-page-button listing-page-step" type="button" data-pagination-page="${state[kind].page - 1}" aria-label="წინა გვერდი">${previousIcon}<span>წინა</span></button>` : ''}${pageButtons}<button class="listing-page-button listing-page-step" type="button" data-pagination-page="${state[kind].page + 1}" aria-label="შემდეგი გვერდი"${state[kind].page === pageCount ? ' disabled' : ''}><span>შემდეგი</span>${nextIcon}</button></div><span class="listing-pagination-summary" aria-live="polite">გვერდი ${state[kind].page} / ${pageCount}</span></nav>`;
    if (nav) nav.outerHTML = markup;
    else if (kind === 'jobs') host.insertAdjacentHTML('beforeend', markup);
    else host.insertAdjacentHTML('afterend', markup);
  }

  function wrapUpdater(name, kind) {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = function (...args) {
      state[kind].page = 1;
      const result = original.apply(this, args);
      render(kind);
      return result;
    };
  }

  wrapUpdater('updateResults', 'jobs');
  wrapUpdater('updateWorkers', 'workers');

  document.addEventListener('click', event => {
    const card = event.target.closest('.job-card, .worker-card');
    if (card && !event.target.closest('a, button, input, select, textarea, label, summary, [contenteditable="true"]')) {
      if (window.getSelection?.().toString()) return;
      const detailLink = card.querySelector('a[href^="#/job/"], a[href^="#/worker/"]');
      if (detailLink) {
        location.hash = detailLink.getAttribute('href');
        return;
      }
    }

    const sortTrigger = event.target.closest('[data-sort-trigger]');
    if (sortTrigger) {
      const menu = sortTrigger.closest('[data-listing-sort-menu]');
      const kind = sortTrigger.dataset.sortTrigger;
      const options = menu.querySelector('.listing-sort-options');
      const opening = options.hidden;
      document.querySelectorAll('.listing-sort-options:not([hidden])').forEach(openMenu => {
        const openKind = openMenu.closest('[data-listing-sort-menu]')?.dataset.listingSortMenu;
        if (openKind) state[openKind].sortMenuOpen = false;
        openMenu.hidden = true;
        openMenu.closest('[data-listing-sort-menu]')?.querySelector('[data-sort-trigger]')?.setAttribute('aria-expanded', 'false');
      });
      state[kind].sortMenuOpen = opening;
      options.hidden = !opening;
      sortTrigger.setAttribute('aria-expanded', String(opening));
      return;
    }

    const sortOption = event.target.closest('[data-sort-option]');
    if (sortOption) {
      const kind = sortOption.dataset.listingKind;
      if (sortOption.dataset.sortOption.startsWith('price-')) {
        const activePaymentFilter = selectedPaymentFilter(kind) || state[kind].paymentType;
        if (activePaymentFilter) {
          state[kind].sort = sortOption.dataset.sortOption;
          state[kind].paymentType = activePaymentFilter;
          state[kind].choosingPaymentType = false;
          state[kind].sortMenuOpen = false;
          state[kind].page = 1;
          render(kind);
          requestAnimationFrame(() => document.querySelector(`[data-sort-trigger="${kind}"]`)?.focus());
          return;
        }
        state[kind].choosingPaymentType = true;
        state[kind].choosingSort = sortOption.dataset.sortOption;
        state[kind].sortMenuOpen = true;
        render(kind);
        requestAnimationFrame(() => document.querySelector(`[data-payment-type][data-listing-kind="${kind}"]`)?.focus());
        return;
      }
      state[kind].sort = sortOption.dataset.sortOption;
      state[kind].paymentType = null;
      state[kind].choosingPaymentType = false;
      state[kind].sortMenuOpen = false;
      state[kind].page = 1;
      render(kind);
      requestAnimationFrame(() => document.querySelector(`[data-sort-trigger="${kind}"]`)?.focus());
      return;
    }

    const clearSortType = event.target.closest('[data-clear-sort-type]');
    if (clearSortType) {
      const kind = clearSortType.dataset.clearSortType;
      state[kind].paymentType = null;
      state[kind].choosingPaymentType = false;
      state[kind].choosingSort = null;
      state[kind].page = 1;
      render(kind);
      return;
    }

    const paymentTypeOption = event.target.closest('[data-payment-type]');
    if (paymentTypeOption) {
      const kind = paymentTypeOption.dataset.listingKind;
      state[kind].paymentType = paymentTypeOption.dataset.paymentType;
      state[kind].sort = state[kind].choosingSort || 'price-asc';
      state[kind].choosingPaymentType = false;
      state[kind].sortMenuOpen = false;
      state[kind].page = 1;
      render(kind);
      requestAnimationFrame(() => document.querySelector(`[data-sort-trigger="${kind}"]`)?.focus());
      return;
    }

    const sortBack = event.target.closest('[data-sort-back]');
    if (sortBack) {
      const kind = sortBack.dataset.sortBack;
      state[kind].choosingPaymentType = false;
      state[kind].sortMenuOpen = true;
      render(kind);
      requestAnimationFrame(() => document.querySelector(`[data-sort-option="${state[kind].choosingSort}"][data-listing-kind="${kind}"]`)?.focus());
      return;
    }

    document.querySelectorAll('.listing-sort-options:not([hidden])').forEach(openMenu => {
      if (openMenu.closest('[data-listing-sort-menu]')?.contains(event.target)) return;
      const openKind = openMenu.closest('[data-listing-sort-menu]')?.dataset.listingSortMenu;
      if (openKind) state[openKind].sortMenuOpen = false;
      openMenu.hidden = true;
      openMenu.closest('[data-listing-sort-menu]')?.querySelector('[data-sort-trigger]')?.setAttribute('aria-expanded', 'false');
    });

    const viewButton = event.target.closest('[data-listing-view]');
    if (viewButton) {
      const kind = viewButton.dataset.listingKind;
      state[kind].view = viewButton.dataset.listingView;
      render(kind);
      return;
    }

    const button = event.target.closest('.listing-pagination [data-pagination-page]');
    if (!button || button.disabled) return;
    event.preventDefault();
    const kind = button.closest('.listing-pagination').dataset.paginationKind;
    state[kind].page = Number(button.dataset.paginationPage);
    render(kind);

    const host = hostFor(kind);
    const grid = kind === 'jobs' ? host?.querySelector('.job-grid') : host;
    requestAnimationFrame(() => grid?.querySelector(':scope > .job-card:not([hidden]), :scope > .worker-card:not([hidden])')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      const openMenu = document.querySelector('.listing-sort-options:not([hidden])');
      if (!openMenu) return;
      const trigger = openMenu.closest('[data-listing-sort-menu]')?.querySelector('[data-sort-trigger]');
      openMenu.hidden = true;
      if (trigger?.dataset.sortTrigger) state[trigger.dataset.sortTrigger].sortMenuOpen = false;
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const option = event.target.closest('.listing-sort-option');
    if (option) {
      event.preventDefault();
      const options = [...option.closest('.listing-sort-options').querySelectorAll('.listing-sort-option')];
      const index = options.indexOf(option);
      options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus();
      return;
    }
    const paymentTypeOption = event.target.closest('[data-payment-type]');
    if (paymentTypeOption) {
      event.preventDefault();
      const options = [...paymentTypeOption.closest('.listing-sort-options').querySelectorAll('[data-payment-type]')];
      const index = options.indexOf(paymentTypeOption);
      options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus();
      return;
    }
    const trigger = event.target.closest('[data-sort-trigger]');
    if (!trigger) return;
    event.preventDefault();
    const menu = trigger.closest('[data-listing-sort-menu]');
    const options = menu.querySelector('.listing-sort-options');
    options.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    state[trigger.dataset.sortTrigger].sortMenuOpen = true;
    (event.key === 'ArrowDown' ? options.firstElementChild : options.lastElementChild)?.focus();
  });

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      render('jobs');
      render('workers');
    });
  });

  if (document.getElementById('jobResults')) window.updateResults?.();
  if (document.getElementById('workerResults')) window.updateWorkers?.();
})();





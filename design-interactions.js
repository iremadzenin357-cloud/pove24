/* Presentation and accessibility enhancements. No data or routing overrides. */
(() => {
  'use strict';
  if (window.__poveDesignInteractions) return;
  window.__poveDesignInteractions = true;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionPaused = reducedMotion.matches;
  let motionExplicitlyChosen = false;
  let nextId = 0;
  let enhancementFrame = 0;
  const pendingRoots = new Set();
  const observedIllustrations = new Set();
  const illustrationObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => entries.forEach(entry => {
      entry.target.classList.toggle('is-offscreen', !entry.isIntersecting || document.hidden);
    }), { threshold: 0 }) : null;
  document.addEventListener('visibilitychange', () => {
    observedIllustrations.forEach(scene => {
      if (!scene.isConnected) return;
      const bounds = scene.getBoundingClientRect();
      scene.classList.toggle('is-offscreen', document.hidden || bounds.bottom <= 0 || bounds.top >= innerHeight);
    });
  });
  const controlsSelector = 'input:not([type="hidden"]):not([aria-hidden="true"]),textarea,select:not([aria-hidden="true"]),[data-site-filter-trigger],[data-cat-toggle],[data-ka-date-trigger],[data-time-trigger]';
  const descriptionSelector = '.field-hint,.phone-hint,.error-msg,[data-worker-validation-error],[data-post-validation-error],small';

  function ensureId(element, prefix) {
    if (!element.id) {
      do { element.id = `pv-${prefix}-${++nextId}`; }
      while (document.getElementById(element.id) !== element);
    }
    return element.id;
  }

  function collect(root, selector) {
    const elements = root.matches?.(selector) ? [root] : [];
    return elements.concat([...root.querySelectorAll(selector)]);
  }

  function enhanceField(field) {
    field.classList.add('pv-field');
    const label = [...field.querySelectorAll('label')].find(item => item.closest('.field') === field);
    const controls = [...field.querySelectorAll(controlsSelector)].filter(control =>
      control.closest('.field') === field && !control.closest('[hidden]') &&
      !control.closest('.category-popover,.site-filter-menu,.ka-date-popover,.time-picker-popover')
    );
    if (!controls.length) return;
    if (label && !label.control && !label.hasAttribute('for') && !label.querySelector('input,select,textarea')) {
      if (controls.length === 1) {
        const control = controls[0];
        label.htmlFor = ensureId(control, 'field');
        if (control.matches('button') && !control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) {
          control.setAttribute('aria-labelledby', ensureId(label, 'label'));
        }
      } else if (!field.hasAttribute('role')) {
        field.setAttribute('role', 'group');
        field.setAttribute('aria-labelledby', ensureId(label, 'group-label'));
      }
    }

    const descriptions = [...field.querySelectorAll(descriptionSelector)].filter(item =>
      item.closest('.field') === field && !item.closest('[hidden],[aria-hidden="true"]') && item.textContent.trim()
    ).map(item => ensureId(item, 'description'));
    controls.forEach(control => {
      const previous = (control.dataset.pvDescriptions || '').split(' ').filter(Boolean);
      const existing = (control.getAttribute('aria-describedby') || '').split(' ').filter(id => id && !previous.includes(id));
      const combined = [...new Set([...existing, ...descriptions])];
      if (combined.length) control.setAttribute('aria-describedby', combined.join(' '));
      else control.removeAttribute('aria-describedby');
      control.dataset.pvDescriptions = descriptions.join(' ');
    });
  }

  function syncMotion(root = document) {
    observedIllustrations.forEach(scene => {
      if (!scene.isConnected) {
        illustrationObserver?.unobserve(scene);
        observedIllustrations.delete(scene);
      }
    });
    collect(root, '.pv-puzzle-scene, .pv-organic-scene').forEach(scene => {
      if (observedIllustrations.has(scene)) return;
      observedIllustrations.add(scene);
      illustrationObserver?.observe(scene);
    });
    collect(root, '.pv-scene').forEach(scene => scene.classList.toggle('is-paused', motionPaused));
    collect(root, '[data-pv-motion-toggle]').forEach(button => {
      if (button.tagName === 'BUTTON') button.type = 'button';
      button.setAttribute('aria-pressed', String(motionPaused));
      const text = motionPaused ? 'ანიმაციის გაგრძელება' : 'ანიმაციის შეჩერება';
      button.setAttribute('aria-label', text);
      const label = button.querySelector('[data-pv-motion-label]');
      if (label) { const shortText = motionPaused ? 'გაგრძელება' : 'პაუზა'; if (label.textContent !== shortText) label.textContent = shortText; }
      else if (!button.querySelector('svg') && button.textContent !== text) button.textContent = text;
      button.title = text;
    });
  }

  function enhance(root) {
    collect(root, '.field').forEach(enhanceField);
    collect(root, 'form').forEach(form => {
      form.classList.add('pv-form');
      if (!form.hasAttribute('aria-label') && !form.hasAttribute('aria-labelledby')) {
        const heading = form.closest('section,.auth-card,.dash-main')?.querySelector('h1,h2');
        if (heading) form.setAttribute('aria-labelledby', ensureId(heading, 'form-heading'));
      }
    });
    syncMotion(root);
  }

  function scheduleEnhancement(root) {
    if (!root || !root.querySelectorAll) return;
    pendingRoots.add(root.closest?.('.field') || root);
    if (enhancementFrame) return;
    enhancementFrame = requestAnimationFrame(() => {
      enhancementFrame = 0;
      const roots = [...pendingRoots];
      pendingRoots.clear();
      roots.filter(root => root.isConnected && !roots.some(other => other !== root && other.contains(root))).forEach(enhance);
    });
  }

  const main = document.getElementById('app');
  if (main) {
    if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
    if (!document.querySelector('.pv-skip-link')) {
      const skip = document.createElement('a');
      skip.className = 'pv-skip-link';
      skip.href = '#app';
      skip.textContent = 'მთავარ შინაარსზე გადასვლა';
      document.body.prepend(skip);
    }
  }

  document.addEventListener('click', event => {
    const skip = event.target.closest?.('.pv-skip-link');
    if (skip && main) {
      event.preventDefault();
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: 'start', behavior: 'auto' });
      return;
    }
    if (!event.target.closest?.('[data-pv-motion-toggle]')) return;
    motionExplicitlyChosen = true;
    motionPaused = !motionPaused;
    syncMotion();
  });

  reducedMotion.addEventListener('change', event => {
    if (!motionExplicitlyChosen || event.matches) motionPaused = event.matches;
    syncMotion();
  });

  // Run after the existing synchronous route listeners; initial rendering stays visible.
  window.addEventListener('hashchange', () => requestAnimationFrame(() => {
    if (!main) return;
    enhance(main);
    main.classList.remove('pv-route-enter');
    // A transformed ancestor changes the containing block of fixed dialogs.
    const hasOverlay = () => main.querySelector('.modal-backdrop,[role="dialog"],[aria-modal="true"]');
    if (reducedMotion.matches || hasOverlay()) return;
    requestAnimationFrame(() => {
      if (!hasOverlay()) main.classList.add('pv-route-enter');
    });
  }));
  main?.addEventListener('animationend', event => {
    if (event.target === main) main.classList.remove('pv-route-enter');
  });

  enhance(document);
  new MutationObserver(records => records.forEach(record => {
    if (record.type === 'attributes') scheduleEnhancement(record.target.closest('.field'));
    else {
      if (record.target.closest?.('.field')) scheduleEnhancement(record.target);
      record.addedNodes.forEach(node => { if (node.nodeType === 1) scheduleEnhancement(node); });
    }
  })).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
})();

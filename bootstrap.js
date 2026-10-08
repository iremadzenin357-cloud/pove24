(async function bootPove24() {
  function removeLegacyPasswords() {
    const credentialFields = new Set(['password', 'passwordHash', 'password_hash', 'passwordConfirm', 'passwordConfirmation', 'password_confirmation', 'salt', 'resetToken', 'reset_token']);
    function clean(value) {
      if (!value || typeof value !== 'object') return { value, changed: false };
      let changed = false;
      if (Array.isArray(value)) {
        const rows = value.map(item => {
          const result = clean(item);
          changed ||= result.changed;
          return result.value;
        });
        return { value: rows, changed };
      }
      const row = { ...value };
      for (const key of Object.keys(row)) {
        if (credentialFields.has(key)) {
          delete row[key];
          changed = true;
        } else {
          const result = clean(row[key]);
          row[key] = result.value;
          changed ||= result.changed;
        }
      }
      return { value: row, changed };
    }
    for (const key of ['dge-accounts', 'dge-user']) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const result = clean(parsed);
        if (result.changed) localStorage.setItem(key, JSON.stringify(result.value));
      } catch {}
    }
  }

  removeLegacyPasswords();
  const legacyScriptUrls = [
    'feature-config.js?v=20260930-ratings-off',
    'avatar.js',
    'profile-media.js?v=20261004-photo-hint-no-repeat',
    'app.js?v=20261008-seamless-startup-v1',
    'flow.js?v=20261008-seamless-startup-v1',
    'geo-ui.js?v=20261008-home-search-actions-v2',
    'ratings.js?v=20261008-features-off',
    'schedule.js?v=20261008-worker-experience-duration-inline-validation-v2',
    'social.js?v=20261008-features-off',
    'job-status.js?v=20261008-status-icons-check-cross',
    'admin.js?v=20261008-features-off',
    'mobile-account-nav.js?v=20260930-mobile-profile-slot',
    'polish.js?v=20260930-nav-premium',
    'ui-icons.js?v=20261008-features-off',
    'location-ux.js',
    'how-menu.js?v=20261008-features-off',
    'profile-social.js?v=20261008-features-off',
    'auth-ui.js?v=20261008-features-off',
    'georgian-validation.js',
    'owner-listing-actions.js?v=20261008-features-off',
    'ratings-feature.js?v=20261008-features-off',
    'theme.js?v=20260930-dark-mode',
    'job-search-save.js?v=20260930-hide-search-subcategory',
    'view-counts.js?v=20261008-job-status-placement',
    'worker-search-filters.js?v=20261007-worker-city-area',
    'listing-pagination.js?v=20261008-status-group-order',
    'home-listing-types.js?v=20261008-active-home-jobs',
    'navigation-performance.js?v=20261008-seamless-startup-v1'
  ];

  function loadScriptsInOrder(sources, continueOnError = false) {
    const loads = sources.map(src => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // Download scripts together while keeping their dependency order at execution time.
      script.async = false;
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load ' + src));
      document.body.appendChild(script);
    }));
    return Promise.all(continueOnError
      ? loads.map(load => load.catch(error => console.error('[Pove24] App script failed:', error)))
      : loads);
  }

  function preloadScripts(sources) {
    return sources.map(src => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'script';
      link.href = src;
      document.head.appendChild(link);
      return link;
    });
  }

  const preloadedScripts = preloadScripts([...legacyScriptUrls, 'supabase-auth.js']);
  try {
    await loadScriptsInOrder([
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
      'supabase-config.js',
      'supabase-client.js',
      'phone-validation.js?v=20261008-georgian-mobile-prefix-neutral-focus',
      'supabase-data.js?v=20261008-parallel-startup-v2'
    ]);

    // Fetch app scripts alongside Supabase's first data load; execute them only
    // after the signed-in state is ready, so protected routes keep their behavior.
    await window.Pove24Store.initialize();
    await loadScriptsInOrder(['supabase-auth.js']);
    await loadScriptsInOrder(legacyScriptUrls, true);
    preloadedScripts.forEach(link => link.remove());
    window.Pove24AppBridge?.hydrate();
    await window.Pove24Store.waitUntilReady();
    window.Pove24AppBridge?.hydrate();
    const app = document.getElementById('app');
    app?.removeAttribute('inert');
    app?.removeAttribute('aria-busy');
  } catch (error) {
    console.error('[Pove24] Supabase startup failed:', error);
    const app = document.getElementById('app');
    if (app) {
      app.removeAttribute('inert');
      app.removeAttribute('aria-busy');
      app.innerHTML = '<section class="container"><div class="empty"><strong>საიტთან დაკავშირება ვერ მოხერხდა</strong><p>განაახლე გვერდი და სცადე ხელახლა. თუ პრობლემა გაგრძელდა, გადაამოწმე Supabase-ის პარამეტრები.</p></div></section>';
      const detail = document.createElement('small');
      detail.textContent = error?.message || 'Supabase connection error';
      app.querySelector('.empty')?.append(detail);
    }
    return;
  }

})();

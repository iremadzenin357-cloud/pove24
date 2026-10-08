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
    'app.js?v=20261008-features-off',
    'flow.js?v=20261007-worker-city-area',
    'geo-ui.js?v=20261008-home-search-work-wording',
    'ratings.js?v=20261008-features-off',
    'schedule.js?v=20261008-post-fields-mobile-dock',
    'social.js?v=20261008-features-off',
    'job-status.js?v=20261008-features-off',
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
    'view-counts.js?v=20261002-detail-publication-meta',
    'worker-search-filters.js?v=20261007-worker-city-area',
    'listing-pagination.js?v=20261002-prev-hidden-first',
    'home-listing-types.js?v=20261004-mobile-carousel-steady',
    'navigation-performance.js?v=20261002-single-route-handler'
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load ' + src));
      document.body.appendChild(script);
    });
  }

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    await loadScript('supabase-config.js');
    await loadScript('supabase-client.js');
    await loadScript('supabase-data.js');
    await window.Pove24Store.initialize();
    await loadScript('supabase-auth.js');
  } catch (error) {
    console.error('[Pove24] Supabase startup failed:', error);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = '<section class="container"><div class="empty"><strong>საიტთან დაკავშირება ვერ მოხერხდა</strong><p>განაახლე გვერდი და სცადე ხელახლა. თუ პრობლემა გაგრძელდა, გადაამოწმე Supabase-ის პარამეტრები.</p></div></section>';
      const detail = document.createElement('small');
      detail.textContent = error?.message || 'Supabase connection error';
      app.querySelector('.empty')?.append(detail);
    }
    return;
  }

  for (const src of legacyScriptUrls) {
    try {
      await loadScript(src);
    } catch (error) {
      console.error('[Pove24] App script failed:', error);
    }
  }

})();

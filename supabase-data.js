(function () {
  const dbKeys = new Set([
    'dge-accounts', 'dge-admin-activity',
    'dge-jobs', 'dge-reports', 'dge-review-reports', 'dge-reviews',
    'dge-saved', 'dge-saved-profiles-users', 'dge-saved-users', 'dge-user',
    'dge-view-counts-v1', 'dge-workers'
  ]);
  const localPreferenceKeys = new Set(['dge-date-filter']);
  const cache = new Map();
  const baselines = new Map();
  const ids = { jobs: new Map(), workers: new Map() };
  const categoryIds = new Map();
  const subcategoryIds = new Map();
  let client = null;
  let authUser = null;
  let profile = null;
  let writeQueue = Promise.resolve();
  let initialized = false;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const keyOf = row => String(row?.id ?? '');
  const stamp = value => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : new Date().toISOString();
  };
  const timeOnly = value => {
    if (!value) return null;
    const match = String(value).match(/^(\d{1,2}:\d{2})/);
    return match ? match[1] : null;
  };
  const notifyFailure = error => {
    console.error('[Pove24] Supabase data operation failed:', error);
    window.dispatchEvent(new CustomEvent('pove24:data-error', { detail: error }));
  };
  const run = async (promise, context) => {
    const result = await promise;
    if (result?.error) throw Object.assign(new Error(result.error.message), { cause: result.error, context });
    return result?.data;
  };
  const optionalRows = async (table, columns = '*', required = false) => {
    const { data, error } = await client.from(table).select(columns).limit(1000);
    if (error) {
      if (required) throw Object.assign(new Error(table + ': ' + error.message), { cause: error });
      console.warn('[Pove24] Optional table unavailable:', table, error.message);
      return [];
    }
    return data || [];
  };
  const accountRef = () => authUser?.id || null;
  const sameUser = ref => !!ref && (String(ref) === String(authUser?.id) || String(ref).toLowerCase() === String(authUser?.email || '').toLowerCase());
  const uiRef = ref => sameUser(ref) ? authUser.email : ref;
  const resolveId = (kind, value) => {
    if (!value) return null;
    const raw = String(value);
    const map = ids[kind];
    return map?.get(raw) || raw;
  };
  const legacyId = (kind, uuid) => {
    const rows = cache.get(kind === 'jobs' ? 'dge-jobs' : 'dge-workers') || [];
    const found = rows.find(row => row.uuid === uuid || row.id === uuid || ids[kind].get(String(row.id)) === uuid);
    return found?.id || uuid;
  };

  function setCache(key, value) {
    cache.set(key, value);
    baselines.set(key, clone(value));
  }

  function get(key, fallback) {
    if (localPreferenceKeys.has(key)) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    }
    if (key === 'dge-listing-seed-version') return '20261001-many-fresh-listings-v1';
    if (cache.has(key)) return cache.get(key);
    return fallback;
  }

  function set(key, value) {
    if (localPreferenceKeys.has(key)) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
      return;
    }
    if (key === 'dge-listing-seed-version') return;
      if (dbKeys.has(key)) {
        const previous = baselines.get(key);
        cache.set(key, value);
        const next = clone(value);
        baselines.set(key, next);
        if (!initialized || key === 'dge-accounts' || key === 'dge-view-counts-v1') return;
        writeQueue = writeQueue.then(() => persist(key, next, previous)).catch(notifyFailure);
        return writeQueue;
      }
  }

  function cacheAccounts(publicRows = []) {
    const rows = publicRows.map(row => ({
      id: row.id,
      email: row.id,
      name: row.display_name,
      role: row.account_role || 'worker',
      profilePhoto: row.profile_photo_path || null,
      status: row.status || 'active'
    }));
    if (authUser && profile) {
      const currentProfile = {
        id: authUser.id,
        email: authUser.email,
        loginEmail: authUser.email,
        name: profile.display_name,
        role: isAdmin() ? 'admin' : profile.account_role,
        phone: profile.phone,
        gender: profile.gender,
        profilePhoto: profile.profile_photo_path,
        status: profile.status
      };
      const currentIndex = rows.findIndex(row => row.id === authUser.id);
      if (currentIndex >= 0) rows[currentIndex] = { ...rows[currentIndex], ...currentProfile };
      else rows.unshift(currentProfile);
    }
    setCache('dge-accounts', rows);
  }

  async function load() {
    const categoryRows = await optionalRows('categories', 'id,name,is_active', true);
    const subcategoryRows = await optionalRows('subcategories', 'id,category_id,name,is_active', true);
    categoryIds.clear();
    subcategoryIds.clear();
    categoryRows.filter(row => row.is_active).forEach(row => categoryIds.set(row.name, row.id));
    subcategoryRows.filter(row => row.is_active).forEach(row => {
      subcategoryIds.set(row.category_id + '|' + row.name, row.id);
    });

    const [rawJobs, rawWorkers, jobLinks, workerLinks] = await Promise.all([
      optionalRows('job_posts', '*', true), optionalRows('worker_profiles', '*', true),
      optionalRows('job_post_categories', 'job_post_id,category_id,subcategory_id', true),
      optionalRows('worker_profile_categories', 'worker_profile_id,category_id,subcategory_id', true)
    ]);
    const categoryById = new Map(categoryRows.map(row => [row.id, row]));
    const subcategoryById = new Map(subcategoryRows.map(row => [row.id, row]));
    const jobLinkMap = new Map();
    for (const link of jobLinks) {
      const main = categoryById.get(link.category_id)?.name;
      if (!main) continue;
      const sub = link.subcategory_id ? subcategoryById.get(link.subcategory_id)?.name || '' : '';
      const list = jobLinkMap.get(link.job_post_id) || [];
      list.push({ main, sub });
      jobLinkMap.set(link.job_post_id, list);
    }
    const workerLinkMap = new Map();
    for (const link of workerLinks) {
      const main = categoryById.get(link.category_id)?.name;
      if (!main) continue;
      const sub = link.subcategory_id ? subcategoryById.get(link.subcategory_id)?.name || '' : '';
      const list = workerLinkMap.get(link.worker_profile_id) || [];
      list.push({ main, sub });
      workerLinkMap.set(link.worker_profile_id, list);
    }
    ids.jobs.clear();
    ids.workers.clear();
    rawJobs.forEach(row => ids.jobs.set(String(row.legacy_id || row.id), row.id));
    rawWorkers.forEach(row => ids.workers.set(String(row.legacy_id || row.id), row.id));

    const jobs = rawJobs.map(row => {
      const selections = jobLinkMap.get(row.id) || [];
      const created = Date.parse(row.created_at || row.posted_at) || Date.now();
      return {
        id: row.legacy_id || row.id, uuid: row.id, legacyId: row.legacy_id,
        createdAt: created, updatedAt: Date.parse(row.updated_at) || created,
        title: row.title, description: row.description, category: selections[0]?.main || '',
        subcategory: selections[0]?.sub || '', categorySelections: selections,
        city: row.city, area: row.area || '', district: row.area || '',
        date: row.work_date || '', dateEnd: row.work_date_end || '', dateMode: row.date_mode,
        start: row.start_time || '', end: row.end_time || '', startTime: row.start_time || '',
        endTime: row.end_time || '', duration: row.duration || '',
        paymentType: row.payment_type, pay: row.payment_amount,
        paymentAmount: row.payment_amount, paymentMin: row.payment_min, paymentMax: row.payment_max,
        posted: 'ახლახან', postedAt: row.posted_at, name: row.display_name,
        phone: '', owner: uiRef(row.owner_id),
        status: row.status, isUrgent: row.is_urgent
      };
    });
    const workers = rawWorkers.map(row => {
      const selections = workerLinkMap.get(row.id) || [];
      const created = Date.parse(row.created_at) || Date.now();
      return {
        id: row.legacy_id || row.id, uuid: row.id, legacyId: row.legacy_id,
        createdAt: created, updatedAt: Date.parse(row.updated_at) || created,
        name: row.display_name, owner: uiRef(row.owner_id), city: row.city,
        area: row.area || '', district: row.area || '',
        skills: selections.map(item => item.sub || item.main),
        category: selections[0]?.main || '', subcategory: selections[0]?.sub || '',
        categorySelections: selections, hasExperience: row.has_experience,
        experienceDuration: row.experience_duration || '', exp: row.experience_duration || '',
        paymentType: row.payment_type, pay: row.pay, availability: row.availability,
        offer: row.offer, about: row.about, phone: '',
        avatarUrl: row.avatar_path || '', status: row.status,
        initials: String(row.display_name || '').split(/\s+/).map(part => part[0]).slice(0, 2).join('')
      };
    });
    setCache('dge-jobs', jobs);
    setCache('dge-workers', workers);

    const [savedJobs, savedWorkers, savedProfiles, rawReviews,
      rawReports, rawReviewReports, rawViews] = authUser ? await Promise.all([
      optionalRows('saved_jobs'), optionalRows('saved_worker_profiles'),
      optionalRows('saved_profiles'), optionalRows('reviews'), optionalRows('reports'),
      optionalRows('review_reports'), optionalRows('listing_views')
    ]) : [[], [], [], await optionalRows('reviews'), [], [], await optionalRows('listing_views')];

    const saved = savedJobs.map(row => legacyId('jobs', row.job_post_id));
    setCache('dge-saved', saved);
    const savedJobsByUser = authUser ? { [authUser.email]: saved } : {};
    setCache('dge-saved-users', savedJobsByUser);
    const savedProfileIds = savedProfiles.map(row => row.profile_id || row.worker_profile_id).filter(Boolean)
      .map(id => {
        const worker = workers.find(row => row.uuid === id);
        return worker?.id || id;
      });
    for (const row of savedWorkers) {
      const worker = workers.find(item => item.uuid === row.worker_profile_id);
      if (worker && !savedProfileIds.includes(worker.id)) savedProfileIds.push(worker.id);
    }
    setCache('dge-saved-profiles-users', authUser ? { [authUser.email]: savedProfileIds } : {});

    const reviews = rawReviews.map(row => ({
      id: row.legacy_id || row.id, uuid: row.id,
      jobId: legacyId('jobs', row.job_post_id), reviewerId: uiRef(row.reviewer_id),
      reviewedUserId: uiRef(row.reviewed_user_id), target: uiRef(row.reviewed_user_id),
      authorEmail: uiRef(row.reviewer_id), rating: row.rating, comment: row.comment,
      text: row.comment, status: row.status, adminNote: row.admin_note || '',
      createdAt: Date.parse(row.created_at) || Date.now(), updatedAt: Date.parse(row.updated_at) || Date.now()
    }));
    setCache('dge-reviews', reviews);
    setCache('dge-reports', rawReports.map(row => ({
      id: row.legacy_id || row.id, uuid: row.id, reporterId: uiRef(row.reporter_id),
      reportingUser: uiRef(row.reporter_id), reportedUser: uiRef(row.target_user_id),
      relatedJob: row.job_post_id ? legacyId('jobs', row.job_post_id) : null,
      reason: row.reason, description: row.description || '', status: row.status,
      createdAt: Date.parse(row.created_at) || Date.now()
    })));
    setCache('dge-review-reports', rawReviewReports.map(row => ({
      id: row.legacy_id || row.id, uuid: row.id, reviewId: row.review_id,
      reporterId: uiRef(row.reporter_id), reason: row.reason, description: row.description || '',
      status: row.status, createdAt: Date.parse(row.created_at) || Date.now()
    })));

    const countRows = rawViews.reduce((result, row) => {
      if (row.job_post_id) result.jobs[legacyId('jobs', row.job_post_id)] = row.total_views;
      if (row.worker_profile_id) result.profiles[legacyId('workers', row.worker_profile_id)] = row.total_views;
      return result;
    }, { jobs: {}, profiles: {} });
    setCache('dge-view-counts-v1', countRows);

    const activity = authUser && isAdmin() ? await optionalRows('admin_activity') : [];
    setCache('dge-admin-activity', activity.map(row => ({
      id: row.id, adminId: row.admin_id, action: row.action,
      targetType: row.target_type, targetId: row.target_id,
      note: row.note || '', createdAt: Date.parse(row.created_at) || Date.now()
    })));

    const publicProfiles = await optionalRows('public_profiles', 'id,display_name,profile_photo_path');
    cacheAccounts(publicProfiles);
    if (authUser) await migrateLegacyOwnedData(jobs, workers, saved, savedProfileIds);
  }

  function readLegacyArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function normalizeLegacySelections(row) {
    const aliases = {
      'დასუფთავება': ['სახლის საქმეები', 'გენერალური დასუფთავება'],
      'გადაზიდვა / გადატანა': ['მიტანა და გადაადგილება', 'ავეჯის/ნივთების გადატანა'],
      'გადაზიდვა': ['მიტანა და გადაადგილება', 'ავეჯის/ნივთების გადატანა'],
      'მშენებლობა': ['სხვა', 'სხვა დღიური სამუშაო'],
      'რემონტი': ['რემონტი და ხელოსნობა', 'სხვა ხელოსნური სამუშაო'],
      'ბაღის სამუშაოები': ['ეზო და ბაღი', 'ბაღის მოვლა'],
      'ძიძა / ბავშვზე ზრუნვა': ['ადამიანების დახმარება', 'ბავშვზე ზრუნვა / ძიძა'],
      'მოხუცის მოვლა': ['ადამიანების დახმარება', 'ხანდაზმულის დახმარება/მოვლა'],
      'კურიერი / მიტანა': ['მიტანა და გადაადგილება', 'კურიერი'],
      'ღონისძიების დახმარება': ['ღონისძიებები', 'ღონისძიების დამხმარე']
    };
    const raw = row.categorySelections?.length ? row.categorySelections : [{ main: row.category, sub: row.subcategory || '' }];
    const normalized = [];
    for (const item of raw) {
      if (!item?.main) continue;
      let main = item.main, sub = item.sub || '';
      if (!categoryIds.has(main) && aliases[main]) [main, sub] = aliases[main];
      if (!categoryIds.has(main)) continue;
      const categoryId = categoryIds.get(main);
      if (sub && !subcategoryIds.has(categoryId + '|' + sub)) sub = '';
      normalized.push({ main, sub });
    }
    return normalized;
  }

  async function migrateLegacyOwnedData(jobs, workers, saved, savedProfileIds) {
    const ownerEmail = String(authUser.email || '').toLowerCase();
    const migratedJobs = [];
    const migratedWorkers = [];
    for (const old of readLegacyArray('dge-jobs')) {
      if (!old?.id || String(old.id).startsWith('sample-') || String(old.owner || '').toLowerCase() !== ownerEmail) continue;
      if (ids.jobs.has(String(old.id)) || jobs.some(row => String(row.id) === String(old.id))) continue;
      const categorySelections = normalizeLegacySelections(old);
      if (!categorySelections.length) continue;
      const row = { ...old, id: String(old.id), owner: authUser.email, categorySelections,
        category: categorySelections[0].main, subcategory: categorySelections[0].sub };
      try {
        await upsertJob(row);
        migratedJobs.push(row);
      } catch (error) { notifyFailure(error); }
    }
    for (const old of readLegacyArray('dge-workers')) {
      if (!old?.id || String(old.id).startsWith('sample-') || String(old.owner || old.email || '').toLowerCase() !== ownerEmail) continue;
      if (ids.workers.has(String(old.id)) || workers.some(row => String(row.id) === String(old.id))) continue;
      const categorySelections = normalizeLegacySelections(old);
      if (!categorySelections.length) continue;
      const row = { ...old, id: String(old.id), owner: authUser.email, categorySelections,
        category: categorySelections[0].main, subcategory: categorySelections[0].sub };
      try {
        await upsertWorker(row);
        migratedWorkers.push(row);
      } catch (error) { notifyFailure(error); }
    }
    if (migratedJobs.length) {
      jobs.unshift(...migratedJobs);
      setCache('dge-jobs', jobs);
    }
    if (migratedWorkers.length) {
      workers.unshift(...migratedWorkers);
      setCache('dge-workers', workers);
    }

    const knownSaved = readLegacyArray('dge-saved').filter(id => !!ids.jobs.get(String(id)));
    const combinedSaved = [...new Set([...(saved || []), ...knownSaved])];
    if (combinedSaved.length !== (saved || []).length) {
      try {
        await persistSavedJobs(combinedSaved);
        setCache('dge-saved', combinedSaved);
        setCache('dge-saved-users', { [authUser.email]: combinedSaved });
      } catch (error) { notifyFailure(error); }
    }

    const legacySavedProfiles = (() => {
      try { return JSON.parse(localStorage.getItem('dge-saved-profiles-users') || '{}'); } catch { return {}; }
    })();
    const profileKeys = [authUser.email, authUser.id];
    const knownProfileSaves = profileKeys.flatMap(key => Array.isArray(legacySavedProfiles[key]) ? legacySavedProfiles[key] : [])
      .map(String).filter(id => workers.some(row => String(row.id) === id || String(row.uuid) === id)
        || (cache.get('dge-accounts') || []).some(row => String(row.id) === id));
    const combinedProfiles = [...new Set([...(savedProfileIds || []), ...knownProfileSaves])];
    if (combinedProfiles.length !== (savedProfileIds || []).length) {
      const byUser = { [authUser.email]: combinedProfiles };
      try {
        await persistSavedProfiles(byUser);
        setCache('dge-saved-profiles-users', byUser);
      } catch (error) { notifyFailure(error); }
    }
  }

  function isAdmin() {
    return authUser?.app_metadata?.role === 'admin';
  }

  function mapProfile(user, row) {
    if (!user) return null;
    const role = row?.account_role || user.user_metadata?.account_role || 'worker';
    return {
      id: user.id, ownerId: user.id, email: user.email || '', loginEmail: user.email || '',
      name: row?.display_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'მომხმარებელი',
      role: user.app_metadata?.role === 'admin' ? 'admin' : role === 'employer' ? 'hire' : role === 'both' ? 'both' : 'work',
      phone: row?.phone || '', gender: row?.gender || 'unspecified',
      profilePhoto: row?.profile_photo_path || null, status: row?.status || 'active'
    };
  }

  async function loadCurrentProfile(user) {
    const { data, error } = await client.from('profiles')
      .select('id,display_name,gender,account_role,phone,profile_photo_path,status')
      .eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (data) {
      const metadataPhone = String(user.user_metadata?.phone || '').trim();
      if (!data.phone && metadataPhone) {
        return await run(client.from('profiles').update({ phone: metadataPhone }).eq('id', user.id)
          .select('id,display_name,gender,account_role,phone,profile_photo_path,status').single());
      }
      return data;
    }
    const role = user.user_metadata?.account_role || 'worker';
    const created = await run(client.from('profiles').insert({
      id: user.id,
      display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'მომხმარებელი',
      gender: user.user_metadata?.gender || 'unspecified',
      account_role: ['worker', 'employer', 'both'].includes(role) ? role : 'worker'
    }).select('id,display_name,gender,account_role,phone,profile_photo_path,status').single());
    return created;
  }

  async function initialize() {
    if (initialized) return;
    client = window.pove24Supabase;
    if (!client) throw new Error('Supabase client was not initialized.');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    authUser = data.session?.user || null;
    if (authUser) {
      profile = await loadCurrentProfile(authUser);
      setCache('dge-user', mapProfile(authUser, profile));
    } else {
      profile = null;
      setCache('dge-user', null);
    }
    await load();
    initialized = true;
  }

  async function refreshSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    authUser = data.session?.user || null;
    profile = null;
    if (authUser) {
      profile = await loadCurrentProfile(authUser);
      setCache('dge-user', mapProfile(authUser, profile));
      await load();
    } else {
      setCache('dge-user', null);
      for (const key of ['dge-saved', 'dge-saved-users', 'dge-saved-profiles-users',
        'dge-reports', 'dge-review-reports', 'dge-admin-activity']) setCache(key, []);
      setCache('dge-saved-users', {});
      setCache('dge-saved-profiles-users', {});
      await load();
    }
    window.Pove24AppBridge?.hydrate();
    return cache.get('dge-user');
  }

  function enqueue(task) {
    writeQueue = writeQueue.then(task).catch(notifyFailure);
    return writeQueue;
  }

  function changedRows(next, previous) {
    const before = new Map((Array.isArray(previous) ? previous : []).map(row => [keyOf(row), JSON.stringify(row)]));
    return (Array.isArray(next) ? next : []).filter(row => before.get(keyOf(row)) !== JSON.stringify(row));
  }

  async function saveListing(table, row, existingId) {
    const query = existingId
      ? client.from(table).update(row).eq('id', existingId)
      : client.from(table).insert(row);
    return run(query.select('id,legacy_id').single());
  }

  function validateCategorySelections(selections) {
    const requested = (selections || []).filter(item => item?.main);
    if (!requested.length) throw new Error('აირჩიე მინიმუმ ერთი კატეგორია.');
    const invalidMain = requested.find(item => !categoryIds.has(item.main));
    if (invalidMain) throw new Error('კატეგორიების სია Supabase-ში ჯერ არ არის შევსებული.');
    const invalidSub = requested.find(item => item.sub && !subcategoryIds.has(categoryIds.get(item.main) + '|' + item.sub));
    if (invalidSub) throw new Error('ამ კატეგორიის ქვეკატეგორია Supabase-ში ვერ მოიძებნა.');
    return requested;
  }

  async function upsertJob(job) {
    if (!authUser || !job || String(job.id).startsWith('sample-')) return;
    if (job.owner && !sameUser(job.owner) && !isAdmin()) return;
    const selections = job.categorySelections?.length ? job.categorySelections : [{ main: job.category, sub: job.subcategory }];
    validateCategorySelections(selections);
    const oldUuid = job.uuid || ids.jobs.get(String(job.id)) || null;
    const amount = job.paymentType === 'negotiable' ? null : Number(job.paymentAmount ?? job.pay ?? 0);
    const row = {
      legacy_id: job.legacyId || (String(job.id).startsWith('j') ? String(job.id) : null),
      owner_id: job.owner && !String(job.owner).includes('@') ? job.owner : authUser.id,
      title: String(job.title || '').trim(), description: String(job.description || '').trim(),
      city: String(job.city || '').trim(), area: job.area || job.district || null,
      date_mode: job.dateMode === 'agreement' || !job.date ? 'agreement' : 'date',
      work_date: job.dateMode === 'agreement' || !job.date ? null : job.date,
      work_date_end: job.dateMode === 'agreement' ? null : (job.dateEnd || null),
      start_time: timeOnly(job.startTime || job.start), end_time: timeOnly(job.endTime || job.end),
      duration: job.duration || null, payment_type: job.paymentType || 'daily',
      payment_amount: amount, payment_min: job.paymentMin == null ? amount : Number(job.paymentMin),
      payment_max: job.paymentMax == null ? amount : Number(job.paymentMax),
      status: job.status || 'active', is_urgent: !!job.isUrgent,
      display_name: String(job.name || cache.get('dge-user')?.name || 'მომხმარებელი').trim(),
      posted_at: stamp(job.createdAt || job.postedAt)
    };
    const saved = await saveListing('job_posts', row, oldUuid);
    ids.jobs.set(String(job.id), saved.id);
    job.uuid = saved.id;
    const contact = String(job.phone || '').trim();
    if (contact) await run(client.from('job_contacts').upsert({ job_post_id: saved.id, phone: contact }, { onConflict: 'job_post_id' }));
    else await run(client.from('job_contacts').delete().eq('job_post_id', saved.id));
    await replaceCategories('job_post_categories', 'job_post_id', saved.id, selections);
    if (oldUuid && oldUuid !== saved.id) ids.jobs.set(String(oldUuid), saved.id);
  }

  async function upsertWorker(worker) {
    if (!authUser || !worker || String(worker.id).startsWith('sample-')) return;
    if (worker.owner && !sameUser(worker.owner) && !isAdmin()) return;
    const selections = worker.categorySelections?.length ? worker.categorySelections : [{ main: worker.category, sub: worker.subcategory }];
    validateCategorySelections(selections);
    const row = {
      legacy_id: worker.legacyId || (String(worker.id).startsWith('w') ? String(worker.id) : null),
      owner_id: worker.owner && !String(worker.owner).includes('@') ? worker.owner : authUser.id,
      display_name: String(worker.name || cache.get('dge-user')?.name || 'მომხმარებელი').trim(),
      city: String(worker.city || '').trim(), area: worker.area || worker.district || null,
      offer: String(worker.offer || worker.skills?.join(', ') || worker.category || '').trim(),
      has_experience: !!worker.hasExperience,
      experience_duration: worker.hasExperience ? (worker.experienceDuration || worker.exp || null) : null,
      payment_type: worker.paymentType || 'daily', pay: worker.paymentType === 'negotiable' ? null : Number(worker.pay || 0),
      availability: String(worker.availability || 'შეთანხმებით').trim(),
      about: String(worker.about || worker.offer || ' ').trim(),
      avatar_path: worker.avatarUrl || worker.profilePhoto || (sameUser(worker.owner) ? cache.get('dge-user')?.profilePhoto : null) || null,
      status: worker.status || 'published'
    };
    const saved = await saveListing('worker_profiles', row, worker.uuid || ids.workers.get(String(worker.id)) || null);
    ids.workers.set(String(worker.id), saved.id);
    worker.uuid = saved.id;
    const contact = String(worker.phone || '').trim();
    if (contact) await run(client.from('worker_profile_contacts').upsert({ worker_profile_id: saved.id, phone: contact }, { onConflict: 'worker_profile_id' }));
    else await run(client.from('worker_profile_contacts').delete().eq('worker_profile_id', saved.id));
    await replaceCategories('worker_profile_categories', 'worker_profile_id', saved.id, selections);
  }

  async function replaceCategories(table, fk, uuid, selections) {
    const requested = validateCategorySelections(selections);
    const links = requested.map(item => {
      const category_id = categoryIds.get(item.main);
      return {
        [fk]: uuid,
        category_id,
        subcategory_id: item.sub ? subcategoryIds.get(category_id + '|' + item.sub) : null
      };
    });
    await run(client.from(table).delete().eq(fk, uuid));
    if (links.length) await run(client.from(table).insert(links));
  }

  async function lookupProfileId(reference) {
    if (!reference) return null;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(reference))) return String(reference);
    const email = String(reference).toLowerCase();
    if (email === String(authUser?.email || '').toLowerCase()) return authUser.id;
    const rows = cache.get('dge-accounts') || [];
    return rows.find(row => row.email === reference || row.loginEmail?.toLowerCase() === email)?.id || null;
  }

  async function persistSavedJobs(next) {
    if (!authUser) return;
    const target = new Set((Array.isArray(next) ? next : []).map(id => resolveId('jobs', id)).filter(Boolean));
    const existing = await run(client.from('saved_jobs').select('job_post_id')) || [];
    for (const row of existing) if (!target.has(row.job_post_id)) {
      await run(client.from('saved_jobs').delete().eq('job_post_id', row.job_post_id).eq('user_id', authUser.id));
    }
    const present = new Set(existing.map(row => row.job_post_id));
    for (const id of target) if (!present.has(id)) {
      await run(client.from('saved_jobs').insert({ user_id: authUser.id, job_post_id: id }));
    }
  }

  async function persistSavedProfiles(byUser) {
    if (!authUser) return;
    const idsWanted = new Set((byUser?.[authUser.email] || byUser?.[authUser.id] || []).map(value => String(value)));
    const workerRows = cache.get('dge-workers') || [];
    const workerTarget = new Set(workerRows.filter(row => idsWanted.has(String(row.id)) || idsWanted.has(String(row.uuid))).map(row => row.uuid));
    const existingWorkers = await run(client.from('saved_worker_profiles').select('worker_profile_id')) || [];
    for (const row of existingWorkers) if (!workerTarget.has(row.worker_profile_id)) {
      await run(client.from('saved_worker_profiles').delete().eq('worker_profile_id', row.worker_profile_id).eq('user_id', authUser.id));
    }
    const present = new Set(existingWorkers.map(row => row.worker_profile_id));
    for (const id of workerTarget) if (!present.has(id)) {
      await run(client.from('saved_worker_profiles').insert({ user_id: authUser.id, worker_profile_id: id }));
    }
    const accountTarget = [...idsWanted].filter(id => !workerRows.some(row => row.id === id || row.uuid === id) && id !== authUser.id);
    const existingProfiles = await run(client.from('saved_profiles').select('profile_id')) || [];
    const existingProfileIds = new Set(existingProfiles.map(row => row.profile_id));
    for (const row of existingProfiles) if (!accountTarget.includes(row.profile_id)) {
      await run(client.from('saved_profiles').delete().eq('profile_id', row.profile_id).eq('user_id', authUser.id));
    }
    for (const id of accountTarget) if (!existingProfileIds.has(id)) {
      await run(client.from('saved_profiles').insert({ user_id: authUser.id, profile_id: id }));
    }
  }

  async function persistReviews(next, previous) {
    if (!authUser) return;
    for (const review of changedRows(next, previous)) {
      const jobPostId = resolveId('jobs', review.jobId);
      const reviewerId = await lookupProfileId(review.reviewerId || review.authorEmail || authUser.id);
      const reviewedUserId = await lookupProfileId(review.reviewedUserId || review.target);
      if (!jobPostId || !reviewerId || !reviewedUserId) continue;
      const row = {
        legacy_id: review.legacyId || (String(review.id || '').startsWith('review-') || String(review.id || '').startsWith('r') ? String(review.id) : null),
        job_post_id: jobPostId, reviewer_id: reviewerId, reviewed_user_id: reviewedUserId,
        rating: Number(review.rating), comment: String(review.comment ?? review.text ?? '').trim() || ' ',
        status: review.status || 'pending', admin_note: review.adminNote || null
      };
      if (reviewerId === authUser.id) {
        await run(client.from('reviews').upsert(row, { onConflict: 'legacy_id' }));
      } else if (isAdmin()) {
        await run(client.from('reviews').update({ status: row.status, admin_note: row.admin_note }).eq('id', review.uuid || review.id));
      }
    }
  }

  async function persistReports(next, previous, reviewReports = false) {
    if (!authUser) return;
    for (const report of changedRows(next, previous)) {
      if (reviewReports) {
        const review = (cache.get('dge-reviews') || []).find(row => row.id === report.reviewId || row.uuid === report.reviewId);
        if (sameUser(report.reporterId)) {
          await run(client.from('review_reports').insert({
            review_id: review?.uuid || report.reviewId, reporter_id: authUser.id,
            reason: report.reason, description: report.description || null,
            status: report.status || 'new', legacy_id: report.id || null
          }));
        } else if (isAdmin()) {
          await run(client.from('review_reports').update({ status: report.status }).eq('id', report.uuid || report.id));
        }
      } else if (sameUser(report.reporterId) || sameUser(report.reportingUser)) {
        await run(client.from('reports').insert({
          reporter_id: authUser.id,
          target_user_id: report.reportedUser ? await lookupProfileId(report.reportedUser) : null,
          job_post_id: report.relatedJob ? resolveId('jobs', report.relatedJob) : null,
          reason: report.reason, description: report.description || null,
          status: report.status || 'new', legacy_id: report.id || null
        }));
      } else if (isAdmin()) {
        await run(client.from('reports').update({ status: report.status }).eq('id', report.uuid || report.id));
      }
    }
  }

  async function persistActivity(next, previous) {
    if (!authUser || !isAdmin()) return;
    for (const row of changedRows(next, previous)) {
      if (row.uuid) continue;
      const inserted = await run(client.from('admin_activity').insert({
        admin_id: authUser.id, action: row.action,
        target_type: row.targetType || null, target_id: row.targetId || null,
        note: row.note || null
      }).select('id').single());
      row.uuid = inserted.id;
    }
  }

  async function persist(key, next, previous) {
    if (!client) return;
    if (key === 'dge-jobs') {
      for (const row of changedRows(next, previous)) await upsertJob(row);
      const after = new Set((next || []).map(row => String(row.id)));
      for (const row of (previous || [])) if (!after.has(String(row.id)) && row.owner && sameUser(row.owner)) {
        const id = resolveId('jobs', row.id);
        if (id) await run(client.from('job_posts').delete().eq('id', id));
      }
    } else if (key === 'dge-workers') {
      for (const row of changedRows(next, previous)) await upsertWorker(row);
      const after = new Set((next || []).map(row => String(row.id)));
      for (const row of (previous || [])) if (!after.has(String(row.id)) && row.owner && sameUser(row.owner)) {
        const id = resolveId('workers', row.id);
        if (id) await run(client.from('worker_profiles').delete().eq('id', id));
      }
    } else if (key === 'dge-user') {
      if (!authUser || !next) return;
      const update = {
        display_name: next.name, gender: next.gender || 'unspecified',
        phone: next.phone || null, profile_photo_path: next.profilePhoto || null,
        account_role: next.role === 'hire' ? 'employer' : next.role === 'both' ? 'both' : 'worker'
      };
      await run(client.from('profiles').update(update).eq('id', authUser.id));
      profile = { ...profile, ...update };
    } else if (key === 'dge-saved') {
      await persistSavedJobs(next);
    } else if (key === 'dge-saved-profiles-users') {
      await persistSavedProfiles(next);
    } else if (key === 'dge-reviews') {
      await persistReviews(next, previous);
    } else if (key === 'dge-reports') {
      await persistReports(next, previous, false);
    } else if (key === 'dge-review-reports') {
      await persistReports(next, previous, true);
    } else if (key === 'dge-admin-activity') {
      await persistActivity(next, previous);
    }
  }

  async function flush() {
    await writeQueue;
  }

  function exportLegacySnapshot() {
    const keys = [...dbKeys].filter(key => key !== 'dge-user' && key !== 'dge-accounts');
    const snapshot = {};
    for (const key of keys) {
      try { snapshot[key] = JSON.parse(localStorage.getItem(key) || 'null'); } catch { snapshot[key] = null; }
    }
    return snapshot;
  }

  window.Pove24Store = {
    initialize, refreshSession, flush, get, set, accountRef, sameUser,
    resolveId, lookupProfileId, isAdmin, get client() { return client; },
    get authUser() { return authUser; }, get profile() { return profile; },
    get initialized() { return initialized; }, exportLegacySnapshot,
    async uploadProfilePhoto(dataUrl) {
      if (!authUser) throw new Error('ფოტოს ასატვირთად ანგარიშზე შესვლა საჭიროა.');
      if (!/^data:image\/(?:webp|jpeg|png);base64,/i.test(String(dataUrl || ''))) throw new Error('ფოტოს ფორმატი არასწორია.');
      const blob = await fetch(dataUrl).then(response => response.blob());
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
      const path = authUser.id + '/' + crypto.randomUUID() + '.' + extension;
      const { error } = await client.storage.from('profile-photos').upload(path, blob, {
        contentType: blob.type, cacheControl: '31536000', upsert: false
      });
      if (error) throw error;
      return client.storage.from('profile-photos').getPublicUrl(path).data.publicUrl;
    },
    async recordView(kind, id) {
      const jobId = kind === 'jobs' ? resolveId('jobs', id) : null;
      const workerId = kind === 'profiles' ? resolveId('workers', id) : null;
      if (!authUser || (!jobId && !workerId) || String(id).startsWith('sample-')) return null;
      const { data, error } = await client.rpc('increment_listing_view', {
        p_job_post_id: jobId, p_worker_profile_id: workerId
      });
      if (error) throw error;
      const count = Number(data || 0);
      const counts = cache.get('dge-view-counts-v1') || { jobs: {}, profiles: {} };
      counts[kind][String(id)] = count;
      setCache('dge-view-counts-v1', counts);
      return count;
    },
    async revealContact(kind, id) {
      const { data, error } = await client.rpc('reveal_listing_contact', {
        p_job_post_id: kind === 'jobs' ? resolveId('jobs', id) : null,
        p_worker_profile_id: kind === 'profiles' ? resolveId('workers', id) : null
      });
      if (error) throw error;
      return typeof data === 'string' ? data : data?.phone || null;
    },
    async revealProfileContact(id) {
      const userId = await lookupProfileId(id);
      if (!userId) throw new Error('მომხმარებლის პროფილი ვერ მოიძებნა.');
      const { data, error } = await client.rpc('reveal_profile_contact', { p_user_id: userId });
      if (error) throw error;
      return typeof data === 'string' ? data : data?.phone || null;
    }
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-reveal-job-phone],[data-reveal-worker-phone],[data-profile-reveal-worker],[data-profile-reveal-user]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!authUser) {
      sessionStorage.setItem('dge-return', location.hash || '#/');
      location.hash = '#/login';
      return;
    }
    try {
      let phone = null;
      if (button.hasAttribute('data-reveal-job-phone')) phone = await window.Pove24Store.revealContact('jobs', button.dataset.revealJobPhone);
      else if (button.hasAttribute('data-profile-reveal-user')) phone = await window.Pove24Store.revealProfileContact(button.dataset.profileRevealUser);
      else phone = await window.Pove24Store.revealContact('profiles', button.dataset.revealWorkerPhone || button.dataset.profileRevealWorker);
      if (typeof window.revealPhone === 'function') window.revealPhone(button, phone);
      else if (phone) button.insertAdjacentText('afterend', phone);
    } catch (error) {
      notifyFailure(error);
      if (typeof window.notify === 'function') window.notify('ნომრის ჩვენება ვერ მოხერხდა. სცადე მოგვიანებით.');
    }
  }, true);
  window.addEventListener('pove24:data-error', event => {
    if (typeof window.notify === 'function') window.notify('მონაცემის შენახვა ვერ მოხერხდა. სცადე ხელახლა.');
  });
})();

(function () {
  const config = window.POVE24_SUPABASE_CONFIG;
  const sdk = window.supabase;
  if (!config?.url || !config?.publishableKey || !sdk?.createClient) {
    throw new Error('Supabase browser configuration or SDK is missing.');
  }

  window.pove24Supabase = sdk.createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });
  // Subscribe before Store.initialize() consumes the initial recovery session.
  // Keep only the event marker, never tokens or passwords.
  window.pove24Supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') window.pove24RecoveryPending = true;
    if (event === 'SIGNED_OUT') window.pove24RecoveryPending = false;
  });
})();

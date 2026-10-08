(function installPove24Auth() {
  const supabase = window.pove24Supabase;
  if (!supabase) return;
  let recoveryMode = false;
  let refreshInProgress = null;

  const showMessage = (message, isError = false) => {
    const node = document.getElementById('authMessage');
    if (!node) return;
    const box = document.createElement('div');
    box.className = isError ? 'error-msg' : 'auth-info';
    box.textContent = String(message || '');
    node.replaceChildren(box);
  };
  const clearIntent = () => {
    const returnTo = sessionStorage.getItem('dge-return');
    const next = sessionStorage.getItem('dge-next');
    sessionStorage.removeItem('dge-return');
    sessionStorage.removeItem('dge-next');
    return next ? '#/post-role' : returnTo || '#/dashboard';
  };
  const setCurrentUser = async () => {
    if (refreshInProgress) return refreshInProgress;
    refreshInProgress = window.Pove24Store.refreshSession()
      .then(() => window.Pove24AppBridge?.hydrate())
      .finally(() => { refreshInProgress = null; });
    return refreshInProgress;
  };
  const errorText = error => {
    const message = String(error?.message || 'მოთხოვნა ვერ შესრულდა.');
    if (/invalid login credentials|invalid email or password/i.test(message)) return 'ელფოსტა ან პაროლი არასწორია.';
    if (/email not confirmed/i.test(message)) return 'შესვლამდე ელფოსტა დაადასტურე.';
    if (/user already registered/i.test(message)) return 'ამ ელფოსტით ანგარიში უკვე არსებობს. სცადე შესვლა.';
    if (/password should be at least/i.test(message)) return 'პაროლი მინიმუმ 8 სიმბოლოს უნდა შეიცავდეს.';
    return message;
  };

  async function handleAuthSubmit(event) {
    const form = event.target.closest?.('#authForm');
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    const formData = new FormData(form);
    const rawEmail = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');
    const registering = form.dataset.authMode === 'register';

    try {
      if (!rawEmail.includes('@')) {
        throw new Error('ამ ეტაპზე შესვლა ელფოსტით არის შესაძლებელი.');
      }
      if (registering) {
        const name = [formData.get('firstName'), formData.get('lastName')]
          .map(value => String(value || '').trim()).filter(Boolean).join(' ')
          || String(formData.get('name') || '').trim();
        if (!name) throw new Error('შეავსე სახელი და გვარი.');
        if (password.length < 8) throw new Error('პაროლი მინიმუმ 8 სიმბოლოს უნდა შეიცავდეს.');
        if (password !== String(formData.get('passwordConfirm') || '')) throw new Error('პაროლები ერთმანეთს არ ემთხვევა.');
        const selectedRole = String(formData.get('role') || 'work');
        const accountRole = formData.get('both') ? 'both' : selectedRole === 'hire' ? 'employer' : 'worker';
        const { data, error } = await supabase.auth.signUp({
          email: rawEmail,
          password,
          options: {
            data: {
              display_name: name,
              account_role: accountRole,
              gender: String(formData.get('gender') || 'unspecified'),
              phone: String(formData.get('phone') || '').trim()
            },
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        });
        if (error) throw error;
        if (!data.session) {
          showMessage('ანგარიშის გასააქტიურებლად ელფოსტაზე გამოგზავნილ ბმულს დააჭირე. პროფილის ფოტოს შესვლის შემდეგ დაამატებ.');
          return;
        }
        await setCurrentUser();
        const registeredPhone = String(formData.get('phone') || '').trim();
        const registeredAccount = window.Pove24Store.get('dge-user', null);
        if (registeredPhone && registeredAccount) {
          window.Pove24Store.set('dge-user', { ...registeredAccount, phone: registeredPhone });
        }
        const registrationPhoto = String(formData.get('profilePhoto') || '');
        if (registrationPhoto.startsWith('data:image/')) {
          const photoUrl = await window.Pove24Store.uploadProfilePhoto(registrationPhoto);
          const account = window.Pove24Store.get('dge-user', null);
          if (account) {
            window.Pove24Store.set('dge-user', { ...account, profilePhoto: photoUrl });
            await window.Pove24Store.flush();
            await setCurrentUser();
          }
        }
        if (registeredPhone) await window.Pove24Store.flush();
        if (typeof notify === 'function') notify('ანგარიში შეიქმნა.');
        location.hash = clearIntent();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: rawEmail, password });
        if (error) throw error;
        await setCurrentUser();
        if (typeof notify === 'function') notify('კეთილი იყოს შენი დაბრუნება.');
        const next = clearIntent();
        location.hash = window.Pove24Store.isAdmin() ? '#/admin' : next;
      }
    } catch (error) {
      showMessage(errorText(error), true);
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function handleRecovery(event) {
    const button = event.target.closest?.('[data-auth-recovery]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const email = String(document.querySelector('#authForm [name="email"]')?.value || '').trim().toLowerCase();
    if (!email.includes('@')) {
      showMessage('პაროლის აღსადგენად მიუთითე ელფოსტა.', true);
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) showMessage(errorText(error), true);
    else showMessage('პაროლის აღდგენის ბმული ელფოსტაზე გამოგიგზავნეთ.');
  }

  function showPasswordRecovery() {
    if (recoveryMode) return;
    recoveryMode = true;
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = '<section class="auth-screen"><div class="auth-card auth-card-login">'
      + '<a class="auth-brand" href="#/"><span>Pove24.com</span></a>'
      + '<h1>ახალი პაროლი</h1><p class="auth-intro">შეიყვანე ახალი პაროლი.</p>'
      + '<form data-password-reset><div class="field auth-field"><label for="new-password">ახალი პაროლი</label>'
      + '<input id="new-password" name="password" type="password" minlength="8" required autocomplete="new-password"></div>'
      + '<button class="btn btn-primary auth-submit" type="submit">პაროლის შეცვლა</button>'
      + '<div class="auth-message" id="authMessage" role="status" aria-live="polite"></div></form>'
      + '</div></section>';
  }

  document.addEventListener('submit', async event => {
    const reset = event.target.closest?.('[data-password-reset]');
    if (!reset) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const password = String(new FormData(reset).get('password') || '');
    if (password.length < 8) return showMessage('პაროლი მინიმუმ 8 სიმბოლოს უნდა შეიცავდეს.', true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return showMessage(errorText(error), true);
    recoveryMode = false;
    await setCurrentUser();
    if (typeof notify === 'function') notify('პაროლი შეიცვალა.');
    location.hash = '#/dashboard';
  }, true);

  document.addEventListener('submit', handleAuthSubmit, true);
  document.addEventListener('click', handleRecovery, true);
  document.addEventListener('click', async event => {
    const logout = event.target.closest?.('[data-logout]');
    if (!logout) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { error } = await supabase.auth.signOut();
    if (error) showMessage(errorText(error), true);
    else {
      await setCurrentUser();
      if (typeof notify === 'function') notify('ანგარიშიდან გამოხვედი.');
      location.hash = '#/';
    }
  }, true);

  supabase.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      setTimeout(showPasswordRecovery, 0);
      return;
    }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      setTimeout(() => setCurrentUser().catch(error => console.error('[Pove24] Auth refresh failed:', error)), 0);
    }
  });
})();

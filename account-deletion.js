(function installAccountDeletion() {
  'use strict';
  if (typeof profilePage !== 'function') return;
  const previous = profilePage;
  profilePage = function () {
    const html = previous();
    if (!window.Pove24Store?.authUser) return html;
    return html.replace('</form>', '</form><section class="form-shell account-deletion-card" aria-labelledby="account-delete-title">'
      + '<h2 id="account-delete-title">ანგარიშის წაშლა</h2>'
      + '<p>შეგიძლია მოითხოვო ანგარიშის, პროფილისა და გამოქვეყნებული განცხადებების წაშლა.</p>'
      + '<button type="button" class="btn btn-secondary" data-account-delete-open>ანგარიშის წაშლა</button></section>');
  };
  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-account-delete-open]')) return;
    const opener = event.target.closest('[data-account-delete-open]');
    const client = window.pove24Supabase;
    const initialOwner = window.Pove24Store?.authUser?.id;
    if (!client || !initialOwner || document.getElementById('account-delete-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'account-delete-dialog';
    dialog.className = 'account-deletion-dialog';
    dialog.setAttribute('aria-labelledby', 'account-delete-heading');
    dialog.innerHTML = '<h2 id="account-delete-heading">გსურს ანგარიშის წაშლა?</h2>'
      + '<p>წაიშლება შენი პროფილი და გამოქვეყნებული განცხადებები. დასრულებული წაშლის გაუქმება შესაძლოა შეუძლებელი იყოს.</p>'
      + '<p>მიმოწერის, საჩივრებისა და უსაფრთხოებასთან დაკავშირებული ჩანაწერების დამუშავებას შეიძლება ცალკე განხილვა დასჭირდეს. თუ ავტომატური წაშლა ვერ დასრულდება, მოთხოვნა დარჩება განხილვისთვის.</p>'
      + '<button type="button" class="btn btn-secondary" data-delete-request>წაშლის მოთხოვნის გაგზავნა</button>'
      + '<form data-delete-confirm hidden><p>წაშლის დასადასტურებლად ხელახლა შეიყვანე პაროლი.</p>'
      + '<div class="field"><label for="account-delete-password">მიმდინარე პაროლი</label>'
      + '<input id="account-delete-password" name="password" type="password" autocomplete="current-password" required maxlength="1024"></div>'
      + '<div class="field"><label for="account-delete-word">დასადასტურებლად ჩაწერე „წაშლა“</label>'
      + '<input id="account-delete-word" name="confirmation" required autocomplete="off"></div>'
      + '<button class="btn btn-primary" type="submit">ვადასტურებ ანგარიშის წაშლას</button></form>'
      + '<p role="status" aria-live="polite" data-delete-status></p>'
      + '<button type="button" class="btn btn-secondary" data-delete-close>დახურვა</button>';
    document.body.append(dialog);
    let busy = false;
    const status = dialog.querySelector('[data-delete-status]');
    const confirm = dialog.querySelector('form');
    function lock(value) {
      busy = value;
      dialog.querySelectorAll('button, input').forEach(node => { node.disabled = value; });
      dialog.setAttribute('aria-busy', String(value));
    }
    function sameAccount() { return window.Pove24Store?.authUser?.id === initialOwner; }
    dialog.querySelector('[data-delete-close]').onclick = () => { if (!busy) dialog.close(); };
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { confirm.reset(); dialog.remove(); opener.focus(); });
    dialog.querySelector('[data-delete-request]').onclick = async () => {
      if (busy || !sameAccount()) return;
      lock(true);
      try {
        await window.Pove24Store.flush();
        const { data, error } = await client.rpc('pove_account_deletion_request');
        if (error || !data?.request_id) throw Error('unavailable');
        if (!sameAccount()) throw Error('account_changed');
        status.textContent = 'მოთხოვნა მიღებულია. ნომერი: ' + data.request_id
          + '. ' + (data.automatic_ready ? 'შეგიძლია გააგრძელო დადასტურება.' : 'მოთხოვნა საჭიროებს განხილვას. ანგარიში ჯერ არ წაშლილა.');
        confirm.hidden = !data.automatic_ready;
      } catch {
        status.textContent = 'მოთხოვნა ვერ გაიგზავნა. ანგარიში არ წაშლილა. სცადე მოგვიანებით; წარმატების შეტყობინების გარეშე მოთხოვნა მიღებულად არ ითვლება.';
      } finally { lock(false); }
    };
    confirm.addEventListener('submit', async e => {
      e.preventDefault(); e.stopPropagation();
      if (busy || !sameAccount()) return;
      const fields = new FormData(confirm);
      if (fields.get('confirmation') !== 'წაშლა') {
        status.textContent = 'დასადასტურებლად ზუსტად ჩაწერე „წაშლა“.'; return;
      }
      lock(true);
      status.textContent = 'მიმდინარეობს დადასტურება და წაშლა…';
      try {
        const { data, error } = await client.functions.invoke('account-deletion', {
          body: { action: 'delete', password: String(fields.get('password') || ''), confirmation: 'წაშლა' }
        });
        if (error) throw Error('unavailable');
        if (data?.status !== 'completed') {
          status.textContent = 'წაშლა ჯერ არ დასრულებულა. მოთხოვნა შენახულია და საჭიროებს შემოწმებას.';
          return;
        }
        await client.auth.signOut({ scope: 'local' });
        const configuredUrl = window.POVE24_SUPABASE_CONFIG?.url;
        if (configuredUrl) {
          const sessionKey = 'sb-' + new URL(configuredUrl).hostname.split('.')[0] + '-auth-token';
          localStorage.removeItem(sessionKey);
          localStorage.removeItem(sessionKey + '-code-verifier');
        }
        // Remove only Pove account caches, not unrelated site preferences.
        for (const storage of [localStorage, sessionStorage]) {
          for (const key of Object.keys(storage)) if (key.startsWith('dge-')) storage.removeItem(key);
        }
        dialog.close();
        // Reload clears in-memory listings and private data even if session refresh fails.
        location.replace(location.pathname + '#/');
        location.reload();
      } catch {
        status.textContent = 'დადასტურება ან წაშლა ვერ დასრულდა. გადაამოწმე პაროლი. თუ პრობლემა გაგრძელდა, გაგზავნილი მოთხოვნა განხილვისთვის რჩება.';
      } finally {
        fields.delete('password'); confirm.reset(); lock(false);
      }
    });
    dialog.showModal();
  });
})();

(function () {
  const nationalFormat = digits => [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(' ');
  const digitsOnly = value => String(value || '').replace(/\D/g, '');

  function inspect(value, required = true) {
    const raw = String(value ?? '').trim();
    if (!raw) return required
      ? { valid: false, canonical: '', national: '', error: 'შეიყვანეთ მობილურის ნომერი.' }
      : { valid: true, canonical: '', national: '', error: '' };

    let compact = raw.replace(/\s/g, '');
    if (compact.startsWith('+')) {
      if (!compact.startsWith('+995')) return { valid: false, canonical: '', national: '', error: 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.' };
      compact = compact.slice(4);
    } else if (compact.startsWith('00')) {
      return { valid: false, canonical: '', national: '', error: 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.' };
    }

    if (!/^\d+$/.test(compact)) return { valid: false, canonical: '', national: '', error: 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.' };
    if (compact.length && compact[0] !== '5') return { valid: false, canonical: '', national: compact, error: 'ქართული მობილურის ნომერი უნდა იწყებოდეს 5-ით.' };
    if (compact.length !== 9) return { valid: false, canonical: '', national: compact, error: 'მობილურის ნომერი უნდა შეიცავდეს 9 ციფრს.' };
    return { valid: true, canonical: '+995' + compact, national: compact, error: '' };
  }

  function normalize(value, required = true) {
    const result = inspect(value, required);
    if (!result.valid) throw new Error(result.error);
    return result.canonical;
  }

  // Existing saved values may contain older visual separators. This only formats the
  // edit field; the database value changes only after the user explicitly saves.
  function parseStored(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { national: '', error: '' };
    let compact = raw.replace(/[\s()\-]/g, '');
    if (compact.startsWith('+995')) compact = compact.slice(4);
    else if (compact.startsWith('+')) return { national: digitsOnly(compact).slice(0, 9), error: 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.' };
    else if (/^995\d{9}$/.test(compact)) compact = compact.slice(3);
    if (!/^\d+$/.test(compact)) return { national: digitsOnly(compact).slice(0, 9), error: 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.' };
    if (compact.length && compact[0] !== '5') return { national: compact, error: 'ქართული მობილურის ნომერი უნდა იწყებოდეს 5-ით.' };
    if (compact.length > 9) return { national: compact.slice(0, 9), error: 'მობილურის ნომერი უნდა შეიცავდეს 9 ციფრს.' };
    return { national: compact, error: '' };
  }

  window.GeorgianPhone = { inspect, normalize, format: nationalFormat, parseStored, parsePaste: pastedNational };

  let nextErrorId = 0;

  function digitCountBefore(value, index) {
    return digitsOnly(String(value).slice(0, index)).length;
  }

  function cursorAfterDigits(value, count) {
    if (count <= 0) return 0;
    let seen = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (/\d/.test(value[index])) seen += 1;
      if (seen >= count) return index + 1;
    }
    return value.length;
  }

  function setFieldError(input, error) {
    const field = input.closest('.field') || input.parentElement;
    const message = field?.querySelector(`[data-phone-error-for="${input.dataset.phoneErrorId}"]`);
    if (!message) return;
    message.textContent = error || '';
    message.hidden = !error;
    input.setAttribute('aria-invalid', error ? 'true' : 'false');
    input.classList.toggle('georgian-phone-invalid', !!error);
    input.closest('.georgian-phone-control')?.classList.toggle('has-error', !!error);
  }

  function updateDisplay(input, digits, cursorDigits = null) {
    const formatted = nationalFormat(digits.slice(0, 9));
    input.value = formatted;
    if (cursorDigits !== null && document.activeElement === input) {
      const position = cursorAfterDigits(formatted, cursorDigits);
      input.setSelectionRange(position, position);
    }
  }

  function updateTouchedError(input) {
    if (!input.dataset.phoneTouched) return;
    setFieldError(input, currentError(input));
  }

  function currentError(input) {
    const required = input.dataset.phoneRequired === 'true';
    if (!required && !String(input.value || '').trim()) return '';
    return input.dataset.phoneInputError || input.dataset.phoneStoredError || inspect(input.value, required).error;
  }

  function isOptionalAndEmpty(input) {
    return input.dataset.phoneRequired !== 'true' && !String(input.value || '').trim();
  }

  function clearOptionalEmptyState(input) {
    if (!isOptionalAndEmpty(input)) return false;
    input.dataset.phoneInputError = '';
    input.dataset.phoneStoredError = '';
    const field = input.closest('.field') || input.parentElement;
    const note = field?.querySelector('[data-phone-hydration-note]');
    if (note) note.hidden = true;
    setFieldError(input, '');
    return true;
  }

  function rejectPaste(input, error) {
    if (clearOptionalEmptyState(input)) return;
    input.dataset.phoneInputError = error || 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.';
    if (input.dataset.phoneTouched || error) setFieldError(input, input.dataset.phoneInputError);
  }

  function pastedNational(text) {
    const raw = String(text || '').trim();
    const compact = raw.replace(/\s/g, '');
    if (compact.startsWith('+')) {
      if (!compact.startsWith('+995') || !/^\+995\d*$/.test(compact)) return { ok: false, error: 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.' };
      const digits = compact.slice(4);
      return digits.length <= 9 ? { ok: true, digits } : { ok: false, error: 'მობილურის ნომერი უნდა შეიცავდეს 9 ციფრს.' };
    }
    if (!/^[\d\s]*$/.test(raw)) return { ok: false, error: 'შეიყვანეთ სწორი ქართული მობილურის ნომერი.' };
    const digits = digitsOnly(raw);
    return digits.length <= 9 ? { ok: true, digits } : { ok: false, error: 'მობილურის ნომერი უნდა შეიცავდეს 9 ციფრს.' };
  }

  function loadPrivateListingPhone(input) {
    const form = input.form;
    if (!form || input.dataset.phoneHydrationStarted) return;
    const isJob = !!form.dataset.editJob;
    const isWorker = !!form.dataset.editWorker;
    if (!isJob && !isWorker) return;
    input.dataset.phoneHydrationStarted = 'true';
    const id = isJob ? form.dataset.editJob : form.dataset.editWorker;
    const kind = isJob ? 'jobs' : 'profiles';
    const initiallyDirty = input.dataset.phoneDirty === 'true';
    Promise.resolve(window.Pove24Store?.revealContact(kind, id)).then(value => {
      if (!input.isConnected || initiallyDirty || input.dataset.phoneDirty === 'true' || !value) return;
      const parsed = parseStored(value);
      input.dataset.phoneStoredError = parsed.error;
      updateDisplay(input, parsed.national);
      input.dataset.phoneInitialized = 'true';
      const note = input.closest('.field')?.querySelector('[data-phone-hydration-note]');
      if (note) note.hidden = true;
      updateTouchedError(input);
    }).catch(error => {
      if (isOptionalAndEmpty(input)) {
        clearOptionalEmptyState(input);
      } else if (!input.value) {
        const note = input.closest('.field')?.querySelector('[data-phone-hydration-note]');
        if (note) note.hidden = false;
      }
      console.info('[Pove24] Existing private contact could not be prefilled; it can be entered again.', error);
    });
  }

  function enhance(input) {
    if (input.dataset.georgianPhoneReady === 'true') return;
    const field = input.closest('.field') || input.parentElement;
    const form = input.form;
    const required = !!input.required || ['postForm', 'workerProfileForm'].includes(form?.id);
    const originalValue = input.value;
    const parsedExisting = parseStored(originalValue);
    const errorId = `georgian-phone-error-${++nextErrorId}`;
    if (!input.id) input.id = `georgian-phone-input-${nextErrorId}`;
    const label = field.querySelector('label');
    if (label && !label.htmlFor) label.htmlFor = input.id;
    const wrapper = document.createElement('div');
    wrapper.className = 'georgian-phone-control';
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute('aria-label', 'ქართული მობილურის ნომერი');

    const prefix = document.createElement('span');
    prefix.className = 'georgian-phone-prefix';
    prefix.innerHTML = '<span class="georgian-phone-flag" aria-hidden="true">🇬🇪</span><span>+995</span>';

    input.type = 'tel';
    input.inputMode = 'numeric';
    input.autocomplete = 'tel-national';
    input.maxLength = 12;
    input.placeholder = '5XX XX XX XX';
    input.removeAttribute('pattern');
    input.required = false;
    input.classList.add('georgian-phone-input');
    input.dataset.georgianPhoneReady = 'true';
    input.dataset.phoneRequired = required ? 'true' : 'false';
    input.dataset.phoneErrorId = errorId;
    input.dataset.phoneStoredError = parsedExisting.error;

    const error = document.createElement('small');
    error.className = 'georgian-phone-error';
    error.id = errorId;
    error.hidden = true;
    error.setAttribute('data-phone-error-for', errorId);
    const hydrationNote = document.createElement('small');
    hydrationNote.className = 'georgian-phone-note';
    hydrationNote.dataset.phoneHydrationNote = 'true';
    hydrationNote.textContent = 'არსებული ნომერი ვერ ჩაიტვირთა. შეიყვანე ნომერი ხელახლა.';
    hydrationNote.hidden = true;
    const describedBy = input.getAttribute('aria-describedby');
    input.setAttribute('aria-describedby', [describedBy, errorId].filter(Boolean).join(' '));

    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(prefix, input);
    field.append(hydrationNote, error);
    updateDisplay(input, parsedExisting.national);

    input.addEventListener('beforeinput', event => {
      if (!event.data || !event.inputType?.startsWith('insert')) return;
      if (event.inputType === 'insertFromPaste') return;
      if (/[^\d\s]/.test(event.data)) {
        event.preventDefault();
        return;
      }
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const retained = digitsOnly(input.value).length - (digitCountBefore(input.value, end) - digitCountBefore(input.value, start));
      if (retained + digitsOnly(event.data).length > 9) event.preventDefault();
    });

    input.addEventListener('paste', event => {
      event.preventDefault();
      const pasted = pastedNational(event.clipboardData?.getData('text') || '');
      if (!pasted.ok) {
        rejectPaste(input, pasted.error);
        return;
      }
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const before = digitsOnly(input.value.slice(0, start));
      const after = digitsOnly(input.value.slice(end));
      const inserted = pasted.digits.slice(0, Math.max(0, 9 - before.length - after.length));
      const next = (before + inserted + after).slice(0, 9);
      input.dataset.phoneDirty = 'true';
      input.dataset.phoneStoredError = '';
      input.dataset.phoneInputError = '';
      updateDisplay(input, next, before.length + inserted.length);
      updateTouchedError(input);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && input.selectionStart === input.selectionEnd && input.selectionStart > 0 && input.value[input.selectionStart - 1] === ' ') {
        event.preventDefault();
        const digits = digitsOnly(input.value);
        const removeAt = Math.max(0, digitCountBefore(input.value, input.selectionStart) - 1);
        const next = digits.slice(0, removeAt) + digits.slice(removeAt + 1);
        input.dataset.phoneDirty = 'true';
        input.dataset.phoneInputError = '';
        input.dataset.phoneStoredError = '';
        updateDisplay(input, next, removeAt);
        updateTouchedError(input);
      } else if (event.key === 'Delete' && input.selectionStart === input.selectionEnd && input.value[input.selectionStart] === ' ') {
        event.preventDefault();
        const digits = digitsOnly(input.value);
        const removeAt = digitCountBefore(input.value, input.selectionStart);
        const next = digits.slice(0, removeAt) + digits.slice(removeAt + 1);
        input.dataset.phoneDirty = 'true';
        input.dataset.phoneInputError = '';
        input.dataset.phoneStoredError = '';
        updateDisplay(input, next, removeAt);
        updateTouchedError(input);
      }
    });

    input.addEventListener('input', () => {
      const raw = input.value;
      const national = pastedNational(raw);
      if (!national.ok) {
        input.dataset.phoneInputError = national.error;
        const digits = digitsOnly(raw).slice(0, 9);
        updateDisplay(input, digits);
      } else {
        const cursorDigits = digitCountBefore(raw, input.selectionStart ?? raw.length);
        input.dataset.phoneInputError = '';
        input.dataset.phoneDirty = 'true';
        input.dataset.phoneStoredError = '';
        const note = field.querySelector('[data-phone-hydration-note]');
        if (note) note.hidden = true;
        updateDisplay(input, national.digits, cursorDigits);
      }
      clearOptionalEmptyState(input);
      updateTouchedError(input);
    });

    input.addEventListener('blur', () => {
      input.dataset.phoneTouched = 'true';
      if (!clearOptionalEmptyState(input)) setFieldError(input, currentError(input));
    });
    input.addEventListener('focus', () => {
      if (input.dataset.phoneTouched !== 'true') setFieldError(input, '');
    });

    if (form) {
      form.addEventListener('formdata', event => {
        const result = inspect(input.value, required);
        event.formData.set(input.name || 'phone', result.valid ? result.canonical : '');
      });
    }

    loadPrivateListingPhone(input);
  }

  function enhanceTree(root) {
    if (root instanceof Element && root.matches('input[name="phone"]')) enhance(root);
    root.querySelectorAll?.('input[name="phone"]').forEach(enhance);
  }

  document.addEventListener('submit', event => {
    const inputs = [...event.target.querySelectorAll('input[data-georgian-phone-ready="true"]')];
    const invalid = inputs.find(input => {
      const issue = currentError(input);
      input.dataset.phoneTouched = 'true';
      setFieldError(input, issue);
      return !!issue;
    });
    if (!invalid) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    invalid.focus();
    invalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, true);

  enhanceTree(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) enhanceTree(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();

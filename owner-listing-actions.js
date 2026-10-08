/* Hide actions that do not make sense on a user's own job listing. */
function isOwnJob(jobId) {
  return !!user && jobs.some(job => job.id === jobId && job.owner === user.email);
}

const jobCardWithOwnerActions = jobCard;
jobCard = function (job) {
  let html = jobCardWithOwnerActions(job);
  if (!user || job.owner !== user.email) return html;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  wrapper.querySelectorAll('[data-save]').forEach(button => button.remove());
  return wrapper.innerHTML;
};

const detailsWithOwnerActions = details;
details = function (jobId) {
  let html = detailsWithOwnerActions(jobId);
  if (!isOwnJob(jobId)) return html;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  wrapper.querySelectorAll(
    '[data-save], [data-contact], [data-reveal-job-phone], [data-open-report][data-report-job]'
  ).forEach(button => button.remove());

  const profileBox = wrapper.querySelector('.profile-box');
  const notice = profileBox?.querySelector('.notice');
  if (notice) notice.textContent = 'ეს შენი გამოქვეყნებული განცხადებაა.';
  profileBox?.querySelector('.contact-prompt')?.remove();

  return wrapper.innerHTML;
};

/* Also block these actions if a stale or manually restored button remains in the page. */
document.addEventListener('click', event => {
  const button = event.target.closest(
    '[data-save], [data-contact], [data-reveal-job-phone], [data-open-report][data-report-job]'
  );
  if (!button) return;

  const jobId = button.dataset.save
    || button.dataset.contact
    || button.dataset.revealJobPhone
    || button.dataset.reportJob;
  if (!isOwnJob(jobId)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

/* Re-render once every detail-page extension has been installed. */
if (typeof render === 'function') render();

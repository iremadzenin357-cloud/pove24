/* Reviews are paused for the initial launch. Stored review data remains untouched. */
if (window.DGE_FEATURES?.reviews === false) {
  const reviewUiSelector = [
    '.rating-inline', '.rating-average', '.public-rating', '.reviews-section', '.review-list',
    '.review-item', '.review-stars', '.profile-reviews', '.public-profile-card',
    '.job-review-actions', '.review-done', '.admin-review-list', '.rating-modal',
    '[data-secure-review]', '[data-rating-backdrop]', '[data-report-review]'
  ].join(',');

  function removePausedReviewUi(root) {
    if (!root?.querySelectorAll) return;

    root.querySelectorAll('[data-open-review]').forEach(button => {
      const panel = button.closest('.admin-panel');
      (panel || button).remove();
    });
    root.querySelectorAll(reviewUiSelector).forEach(element => element.remove());
    root.querySelectorAll('a[href*="/admin/reviews"], .admin-stat[href*="/admin/reviews"]').forEach(element => element.remove());

    root.querySelectorAll('.how-menu-step, .how-menu-safety-grid > div').forEach(element => {
      if (/შეფასებ|რეიტინგ|ვარსკვლავ/.test(element.textContent)) element.remove();
    });
    root.querySelectorAll('.admin-panel p').forEach(paragraph => {
      if (/შეფასებ/.test(paragraph.textContent)) paragraph.textContent = 'აირჩიე კანდიდატი, რომელიც ამ სამუშაოს შეასრულებს.';
    });
    root.querySelectorAll('.admin-activity-row').forEach(row => {
      if (/შეფასებ/.test(row.textContent)) row.remove();
    });
    root.querySelectorAll('.admin-review-card').forEach(card => {
      if (/რეპორტი შეფასებაზე/.test(card.textContent)) card.remove();
    });
    root.querySelectorAll('h1,h2,h3,h4').forEach(heading => {
      if (/დასრულებული სამუშაოები|წინა სამუშაოები და შეფასებები/.test(heading.textContent)) heading.remove();
    });
    root.querySelectorAll('.admin-table').forEach(table => {
      const index = [...table.querySelectorAll('thead th')].findIndex(cell => /რეიტინგი|შეფასება/.test(cell.textContent));
      if (index >= 0) table.querySelectorAll('tr').forEach(row => row.children[index]?.remove());
    });
  }

  reviewSummary = () => ({ rows: [], count: 0, average: 0 });
  publicReviews = () => [];
  compactRating = () => '';
  reviewSection = () => '';
  openRatingModal = () => {};
  createReview = () => { throw new Error('შეფასებები დროებით გათიშულია.'); };
  canUserReviewJob = () => false;

  if (typeof howMenuPaths !== 'undefined') {
    Object.values(howMenuPaths).forEach(path => {
      path.steps = path.steps.filter(step => !/შეაფას|შეფასებ/.test(step[1] + ' ' + step[2]));
      path.steps.forEach(step => { step[2] = step[2].replace(' და შეფასებები', ''); });
    });
  }

  const previousJobFlowPanel = jobFlowPanel;
  jobFlowPanel = job => removeReviewHtml(previousJobFlowPanel(job));

  function removeReviewHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    removePausedReviewUi(template.content);
    return template.innerHTML;
  }

  const previousWorkerCard = workerCard;
  workerCard = worker => removeReviewHtml(previousWorkerCard(worker));
  const previousWorkerDetail = workerDetail;
  workerDetail = id => removeReviewHtml(previousWorkerDetail(id));
  const previousProfilePage = profilePage;
  profilePage = () => removeReviewHtml(previousProfilePage());
  const previousDetails = details;
  details = id => removeReviewHtml(previousDetails(id));
  const previousPublicUserProfile = publicUserProfile;
  publicUserProfile = email => removeReviewHtml(previousPublicUserProfile(email));
  const previousDashboard = dashboard;
  dashboard = () => removeReviewHtml(previousDashboard());
  const previousAdminShell = adminShell;
  adminShell = (tab, body) => removeReviewHtml(previousAdminShell(tab, body));
  const previousAdminOverview = adminOverview;
  adminOverview = () => removeReviewHtml(previousAdminOverview());
  const previousAdminUsers = adminUsers;
  adminUsers = () => removeReviewHtml(previousAdminUsers());
  const previousAdminReports = adminReports;
  adminReports = () => removeReviewHtml(previousAdminReports());

  const previousReviewRoute = routeView;
  routeView = function () {
    const path = (location.hash || '#/').split('?')[0].slice(1);
    if (path === '/admin/reviews') {
      app.innerHTML = '<section class="container"><div class="empty"><strong>შეფასებები დროებით გათიშულია.</strong></div></section>';
      accountNavigation();
      return;
    }
    previousReviewRoute();
    removePausedReviewUi(app);
  };
  render = routeView;
  

  document.addEventListener('click', event => {
    const control = event.target.closest('[data-open-review], [data-report-review], [data-review-status], [data-review-view], a[href*="/admin/reviews"]');
    if (!control) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('submit', event => {
    if (!event.target.matches('[data-review-form], [data-secure-review-form]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const reviewUiObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) removePausedReviewUi(node);
    }));
  });
  reviewUiObserver.observe(document.body, { childList: true, subtree: true });
  removePausedReviewUi(document.body);
  routeView();
}

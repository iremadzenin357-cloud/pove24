(() => {
  if (window.__poveRouteListenerInstalled) return;
  window.__poveRouteListenerInstalled = true;

  window.addEventListener('hashchange', () => {
    if (typeof window.routeView === 'function') window.routeView();
  });
})();

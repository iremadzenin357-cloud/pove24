(() => {
  if (window.__poveRouteListenerInstalled) return;
  window.__poveRouteListenerInstalled = true;

  window.addEventListener('hashchange', () => {
    if (typeof window.routeView !== 'function') return;
    window.__poveRouteNavigation = true;
    try { window.routeView(); }
    finally { window.__poveRouteNavigation = false; }
  });
})();

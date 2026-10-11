/* Preserve the static premium shell; the shared feed hydrates real active jobs. */
(() => {
  const shell = window.Pove24HomeShell;
  if (shell) home = function redesignedHome() { return shell; };
})();

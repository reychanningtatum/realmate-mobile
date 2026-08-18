// Dark Mode has been removed — the light theme is the only appearance.
// This forces light everywhere and clears any previously-saved dark preference,
// so accounts that had toggled dark mode before now render light as well.
(function () {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.removeItem('rm_theme'); } catch (e) {}
})();

// Kept as harmless no-ops so any lingering references don't throw.
function setTheme() {
    document.documentElement.setAttribute('data-theme', 'light');
}

function getTheme() {
    return 'light';
}

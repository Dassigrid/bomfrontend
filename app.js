// ================================================================
// PartPilot app.js — Loaded on index.html (search/home page)
// ================================================================

// ─── Theme ───────────────────────────────────────────────────────────────────
(function () {
  var saved = localStorage.getItem('pp_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('pp_theme', next);
    });
  });
})();

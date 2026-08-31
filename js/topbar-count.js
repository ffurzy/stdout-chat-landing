/* topbar-count.js — live "N joined" counter in the sticky topbar (all pages).
   Endpoint returns aggregates only. The markup carries a static fallback
   number; on fetch success it is replaced with the live value, on ANY
   failure the counter is removed entirely — a zero or stale render must
   never appear next to the brand. */
(function () {
  var els = document.querySelectorAll('.brand-count');
  if (!els.length) return;
  fetch('https://api.stdout.chat/api/public/stats')
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      var n = d && d.users_total;
      if (typeof n !== 'number' || !isFinite(n) || n < 1) throw 0;
      els.forEach(function (el) {
        var b = el.querySelector('b');
        if (b) b.textContent = n.toLocaleString('en-US');
      });
    })
    .catch(function () {
      els.forEach(function (el) { el.remove(); });
    });
})();

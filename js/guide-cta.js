/* guide-cta.js — mobile sticky "get the app" bar on guide pages.
   Injected at runtime so each guide only carries one <script> tag.
   Rules: mobile viewport only; iOS only (the app is iOS-only — see IOS_ONLY);
   appears once ~40% of the article has scrolled past (by then the Safari
   Smart App Banner has scrolled away); × dismisses for the tab (sessionStorage);
   hides while the end-of-article .callout is on screen so two CTAs never stack.
   Store link is an App Store campaign link (App Analytics → Campaigns → guide_sticky). */
(function () {
  'use strict';

  var STORE_URL = 'https://apps.apple.com/app/apple-store/id6760369542?pt=128643915&ct=guide_sticky&mt=8';
  var KEY = 'stdout-guide-sticky';   // sessionStorage: '1' = dismissed
  var SHOW_AT = 0.4;                 // fraction of the article scrolled past
  var IOS_ONLY = true;

  if (!window.matchMedia || !window.matchMedia('(max-width: 900px)').matches) return;
  if (IOS_ONLY) {
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/.test(ua) ||
              (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPadOS / "desktop site" iPhone
    if (!ios) return;
  }
  try { if (sessionStorage.getItem(KEY) === '1') return; } catch (e) {}

  var article = document.querySelector('article.doc');
  if (!article) return;

  // ---- build ----
  var bar = document.createElement('div');
  bar.className = 'guide-sticky';
  bar.setAttribute('role', 'complementary');
  bar.setAttribute('aria-label', 'Get the stdout.chat app');

  var text = document.createElement('div');
  text.className = 'gs-text';
  var name = document.createElement('b');
  name.textContent = 'stdout.chat';
  text.appendChild(name);
  text.appendChild(document.createTextNode('free text-only chat'));

  var btn = document.createElement('a');
  btn.className = 'gs-btn';
  btn.href = STORE_URL;
  btn.textContent = 'Get the app';

  var close = document.createElement('button');
  close.className = 'gs-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';

  bar.appendChild(text);
  bar.appendChild(btn);
  bar.appendChild(close);
  document.body.appendChild(bar);

  // ---- state ----
  var shown = false, dismissed = false, ticking = false;

  function scrollTop() { return window.pageYOffset || document.documentElement.scrollTop || 0; }
  function progress() {
    var top = article.getBoundingClientRect().top + scrollTop();
    var h = article.offsetHeight || 1;
    return (scrollTop() + window.innerHeight - top) / h;
  }
  function show() {
    if (shown || dismissed) return;
    shown = true;
    document.body.classList.add('has-guide-sticky');
    window.removeEventListener('scroll', onScroll);
    // one frame so the transform transition actually runs
    window.requestAnimationFrame(function () { bar.classList.add('is-in'); });
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      if (progress() >= SHOW_AT) show();
    });
  }

  close.addEventListener('click', function () {
    dismissed = true;
    bar.classList.remove('is-in');
    document.body.classList.remove('has-guide-sticky');
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    window.setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 350);
  });

  // don't stack two CTAs: retract while the end-of-article callout is visible
  var callout = document.querySelector('.doc .callout');
  if (callout && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (!shown || dismissed) return;
      if (entries[0].isIntersecting) bar.classList.remove('is-in');
      else bar.classList.add('is-in');
    }).observe(callout);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();   // deep links / short articles
})();

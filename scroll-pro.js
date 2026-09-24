/* Cocoon ScrollPro — progress indicator + cross-directional scroll for any
   element marked [data-scrollpro] ("horizontal" | "vertical" | "" = auto).
   Overlay-based: never wraps or mutates the tracked element's children.
   Native scrollbars are hidden ONLY on elements that got an indicator. */
(function () {
  var CLAY = '#9C6240', GOLD = '#D4A34E';
  var THICK = 4, INSET = 18, MIN_OVERFLOW = 56, MAX_THUMB_RATIO = 0.82;

  var api = window.__cocoonScrollPro;
  if (api && api.boot) { api.boot(); return; }

  if (!document.getElementById('cocoon-sp-css')) {
    var css = document.createElement('style');
    css.id = 'cocoon-sp-css';
    css.textContent =
      '[data-sp-on]{scrollbar-width:none;-ms-overflow-style:none}' +
      '[data-sp-on]::-webkit-scrollbar{width:0;height:0;display:none}' +
      '.cocoon-sp{position:fixed;z-index:2147483000;pointer-events:none;border-radius:999px;' +
      'background:rgba(58,50,43,.10)}' +
      '.cocoon-sp > i{display:block;border-radius:999px;background:linear-gradient(90deg,' + CLAY + ',' + GOLD + ')}' +
      '.cocoon-sp[data-axis="y"] > i{background:linear-gradient(180deg,' + CLAY + ',' + GOLD + ')}';
    (document.head || document.documentElement).appendChild(css);
  }

  var tracked = new Map();
  var pageBar = null;
  var queued = false;
  var observer = null;
  var listening = false;

  function axisOf(el) {
    var a = (el.getAttribute('data-scrollpro') || '').toLowerCase();
    if (a === 'horizontal' || a === 'x') return 'x';
    if (a === 'vertical' || a === 'y') return 'y';
    return el.scrollWidth - el.clientWidth > 2 ? 'x' : 'y';
  }

  function bar() {
    var b = document.createElement('div');
    b.className = 'cocoon-sp';
    b.appendChild(document.createElement('i'));
    document.body.appendChild(b);
    return b;
  }

  function onTop(el, r) {
    var hit = document.elementFromPoint(
      Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2)),
      Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2))
    );
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  }

  function hide(el, b) { b.style.display = 'none'; if (el) el.removeAttribute('data-sp-on'); }

  function paint(el, rec) {
    var b = rec.bar, fill = b.firstChild, r = el.getBoundingClientRect();
    var axis = axisOf(el);
    b.setAttribute('data-axis', axis);
    if (!r.width || !r.height || r.bottom < 0 || r.top > window.innerHeight) return hide(el, b);

    var max, track, thumb;
    if (axis === 'x') {
      max = el.scrollWidth - el.clientWidth;
      track = r.width - INSET * 2;
    } else {
      max = el.scrollHeight - el.clientHeight;
      track = r.height - INSET * 2;
    }
    if (max < MIN_OVERFLOW || track < 80) return hide(el, b);
    thumb = track * ((axis === 'x' ? el.clientWidth / el.scrollWidth : el.clientHeight / el.scrollHeight));
    if (thumb / track > MAX_THUMB_RATIO) return hide(el, b);
    if (!onTop(el, r)) return hide(el, b);

    thumb = Math.max(30, thumb);
    var span = (track - thumb) * ((axis === 'x' ? el.scrollLeft : el.scrollTop) / max);
    el.setAttribute('data-sp-on', '');
    b.style.display = 'block';
    if (axis === 'x') {
      b.style.left = (r.left + INSET) + 'px';
      b.style.top = (r.bottom - THICK - 8) + 'px';
      b.style.width = track + 'px';
      b.style.height = THICK + 'px';
      fill.style.height = THICK + 'px';
      fill.style.width = thumb + 'px';
      fill.style.transform = 'translateX(' + span + 'px)';
    } else {
      b.style.left = (r.right - THICK - 10) + 'px';
      b.style.top = (r.top + INSET) + 'px';
      b.style.width = THICK + 'px';
      b.style.height = track + 'px';
      fill.style.width = THICK + 'px';
      fill.style.height = thumb + 'px';
      fill.style.transform = 'translateY(' + span + 'px)';
    }
  }

  function attach(el) {
    if (tracked.has(el)) return;
    var rec = { bar: bar() };
    rec.onScroll = function () { paint(el, rec); };
    el.addEventListener('scroll', rec.onScroll, { passive: true });
    rec.onWheel = function (e) {
      if (axisOf(el) !== 'x') return;
      var max = el.scrollWidth - el.clientWidth;
      if (max <= 2) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      if ((d < 0 && el.scrollLeft <= 0) || (d > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollLeft = el.scrollLeft + d;
      paint(el, rec);
    };
    el.addEventListener('wheel', rec.onWheel, { passive: false });
    tracked.set(el, rec);
    paint(el, rec);
  }

  function paintPage() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    if (max < MIN_OVERFLOW) { if (pageBar) pageBar.style.display = 'none'; return; }
    if (!pageBar) {
      pageBar = bar();
      pageBar.setAttribute('data-axis', 'y');
      pageBar.style.width = THICK + 'px';
      pageBar.firstChild.style.width = THICK + 'px';
    }
    var track = window.innerHeight - INSET * 2;
    var thumb = Math.max(40, track * (window.innerHeight / doc.scrollHeight));
    pageBar.style.display = 'block';
    pageBar.style.left = 'auto';
    pageBar.style.right = '8px';
    pageBar.style.top = INSET + 'px';
    pageBar.style.height = track + 'px';
    pageBar.firstChild.style.height = thumb + 'px';
    pageBar.firstChild.style.transform =
      'translateY(' + ((track - thumb) * ((window.scrollY || doc.scrollTop) / max)) + 'px)';
  }

  function sweep() {
    queued = false;
    if (!document.body) return;
    paintPage();
    document.querySelectorAll('[data-scrollpro]').forEach(attach);
    tracked.forEach(function (rec, el) {
      if (!el.isConnected) {
        el.removeEventListener('scroll', rec.onScroll);
        el.removeEventListener('wheel', rec.onWheel);
        rec.bar.remove();
        tracked.delete(el);
      } else paint(el, rec);
    });
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(sweep); } }

  function boot() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', boot, { once: true }); return; }
    if (!observer) {
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-scrollpro'] });
    }
    if (!listening) {
      listening = true;
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
      setInterval(schedule, 1200);
    }
    schedule();
  }

  window.__cocoonScrollPro = { boot: boot, sweep: sweep, tracked: tracked };
  boot();
})();

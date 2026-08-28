/* ============================================================
   CCIT FLIGHT DECK — panel behaviour
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- housing chrome ----------
     Injected from here so twenty pages don't each carry a copy of the
     rails. The grid rows are pinned in CSS, so nothing shifts while
     this runs. */
  /* label, file, Font Awesome glyph */
  var NAV = [
    ['/home',    'index.html',   'fa-house'],
    ['/team',    'team.html',    'fa-users'],
    ['/events',  'events.html',  'fa-calendar-days'],
    ['/blogs',   'blogs.html',   'fa-feather'],
    ['/merch',   'merch.html',   'fa-tag'],
    ['/archive', 'archive.html', 'fa-box-archive']
  ];

  var deck = document.querySelector('[data-deck]');

  if (deck) {
    /* Each page states its own depth. Sniffing location.pathname broke the
       moment pages moved into a new folder, and it also guessed wrong when
       the site was served from a subdirectory. */
    var up = deck.dataset.up || '';
    var here = deck.dataset.page || '';

    var top = document.createElement('header');
    top.className = 'rail rail--top';
    top.innerHTML =
      '<a class="rail__brand" href="' + up + 'index.html">' +
        '<img src="' + up + 'assets/img/brand/connection_network_infinity_partial_logo.png" alt="">Coding Club</a>' +
      '<span class="lbl rail__desig">IISER Thiruvananthapuram</span>' +
      '<span class="rail__spacer"></span>' +
      '<span class="lamp">Systems nominal</span>' +
      '<span class="mono rail__clock" data-clock>--:--</span>';

    var nav = document.createElement('nav');
    nav.className = 'nav';
    nav.setAttribute('aria-label', 'Sections');
    nav.innerHTML = NAV.map(function (n) {
      var on = n[1] === here ? ' aria-current="page"' : '';
      return '<a class="nav__item" href="' + up + n[1] + '"' + on + '>' +
               '<i class="fas ' + n[2] + ' nav__icon" aria-hidden="true"></i>' +
               '<span>' + n[0] + '</span>' +
             '</a>';
    }).join('');

    var bot = document.createElement('footer');
    bot.className = 'rail rail--bot';
    bot.innerHTML =
      '<span class="lbl">Position</span>' +
      '<span class="mono" data-position>' + (deck.dataset.title || 'Top') + '</span>' +
      '<span class="gauge" data-gauge aria-hidden="true"></span>' +
      '<span class="rail__pct mono" data-pct>00%</span>' +
      '<span class="rail__spacer"></span>' +
      '<span class="lamp lamp--alt rail__rev">Applications open</span>' +
      '<span class="lbl rail__credit">Rebuilt by Antrin Maji</span>' +
      '<a class="lbl" href="' + up + 'index.html#comms">Contact &rarr;</a>';

    deck.insertBefore(nav, deck.firstChild);
    deck.insertBefore(top, deck.firstChild);
    deck.appendChild(bot);
  }

  /* ---------- clock ---------- */
  var clock = document.querySelector('[data-clock]');
  if (clock) {
    var tick = function () {
      clock.textContent = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
      });
    };
    tick();
    setInterval(tick, 10000);
  }

  /* ---------- terminal readout ----------
     Lines are typed as plain text into per-line spans, so the markup
     is never half-written the way typing raw HTML would leave it. */
  var term = document.querySelector('[data-term]');

  if (term) {
    var LINES = [
      { t: 'codingclub@iisertvm:~$ status --club', c: 'cmd' },
      { t: '' },
      { t: '  members .............. 40+ active', c: 'out' },
      { t: '  projects ............. 3+ running', c: 'out' },
      { t: '  courses .............. web development, 16 sessions', c: 'out' },
      { t: '  writing .............. 9 posts, 6 authors', c: 'out' },
      { t: '  talk series .......... Beyond Syntax, ongoing', c: 'out' },
      { t: '  next meeting ......... CDH2 meeting room, 20:30', c: 'out' },
      { t: '' },
      { t: '  applications ......... OPEN', c: 'hi' },
      { t: '' },
      { t: 'codingclub@iisertvm:~$ whoami', c: 'cmd' },
      { t: '  a student club at IISER Thiruvananthapuram building', c: 'out' },
      { t: '  things in machine learning, AI and the web.', c: 'out' },
      { t: '' },
      { t: 'codingclub@iisertvm:~$ ', c: 'cmd', caret: true }
    ];

    var caret = document.createElement('span');
    caret.className = 'caret';

    var li = 0, ci = 0, line = null;

    function writeAll() {
      term.textContent = '';
      LINES.forEach(function (l) {
        var el = document.createElement('div');
        if (l.c) el.className = 't-' + l.c;
        el.textContent = l.t || ' ';
        term.appendChild(el);
        if (l.caret) el.appendChild(caret);
      });
    }

    function type() {
      if (li >= LINES.length) return;
      var spec = LINES[li];

      if (!line) {
        line = document.createElement('div');
        if (spec.c) line.className = 't-' + spec.c;
        term.appendChild(line);
      }

      if (ci < spec.t.length) {
        line.textContent = spec.t.slice(0, ++ci);
        setTimeout(type, spec.t.charAt(ci - 1) === '.' ? 4 : 13);
        return;
      }

      if (!spec.t) line.innerHTML = '&nbsp;';
      if (spec.caret) line.appendChild(caret);
      li++; ci = 0; line = null;
      setTimeout(type, 120);
    }

    if (reduced) writeAll();
    else {
      /* let someone skip straight to the finished readout */
      var skip = function () {
        li = LINES.length;
        writeAll();
        term.removeEventListener('click', skip);
      };
      term.addEventListener('click', skip);
      setTimeout(type, 500);
    }
  }

  /* ---------- typed readouts ----------
     Any [data-type] element types its own text out, dock-display style.
     The text lives in the markup, so with JS off or broken the full
     sentence is simply there. */
  document.querySelectorAll('[data-type]').forEach(function (el) {
    var full = el.textContent.trim().replace(/\s+/g, ' ');
    if (!full) return;

    if (reduced) { el.textContent = full; return; }

    /* reserve the rendered height first, or the panel below jumps up as
       the sentence grows from nothing to two lines */
    el.style.minHeight = el.getBoundingClientRect().height + 'px';

    var caret = document.createElement('span');
    caret.className = 'caret caret--sm';

    var i = 0, done = false;
    var settle = function () {
      if (done) return;
      done = true;
      el.textContent = full;
      el.appendChild(caret);
    };
    /* timers stall in a background tab; the sentence must still arrive */
    setTimeout(settle, full.length * 14 + 2000);

    el.textContent = '';
    el.appendChild(caret);

    (function step() {
      if (done) return;
      if (i >= full.length) return settle();
      caret.insertAdjacentText('beforebegin', full.charAt(i++));
      setTimeout(step, full.charAt(i - 1) === ' ' ? 26 : 12);
    })();
  });

  /* ---------- roster tabs ----------
     Real buttons in a tablist, so Enter/Space and screen readers work
     without help; this only moves selection and syncs the hash. */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs__btn'));

  if (tabs.length) {
    var show = function (key, focus) {
      tabs.forEach(function (t) {
        var on = t.dataset.panel === key;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById('p-' + t.dataset.panel);
        if (panel) panel.hidden = !on;
        if (on && focus) t.focus();
      });
      if (location.hash.slice(1) !== key) history.replaceState(null, '', '#' + key);
    };

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(t.dataset.panel); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        show(tabs[(i + d + tabs.length) % tabs.length].dataset.panel, true);
      });
    });

    /* team.html#alumni opens that panel directly, so links can deep-link */
    var start = location.hash.slice(1);
    if (tabs.some(function (t) { return t.dataset.panel === start; })) show(start);
  }

  /* ---------- post reader ----------
     Posts open in place instead of navigating to the legacy pages, which
     share none of this design. The article is fetched from its own file and
     lifted out, so the posts stay the single source of truth. The links keep
     their real href: without JS, or on a middle/modifier click, they simply
     navigate. */
  var modal = document.querySelector('[data-modal]');

  if (modal) {
    var mProse  = modal.querySelector('[data-modal-content]');
    var mScroll = modal.querySelector('[data-modal-body]');
    var mId     = modal.querySelector('[data-modal-id]');
    var mHead   = modal.querySelector('[data-modal-head]');
    var mFace   = modal.querySelector('[data-modal-face]');
    var mAuthor = modal.querySelector('[data-modal-author]');
    var mBatch  = modal.querySelector('[data-modal-batch]');
    var mTitle  = modal.querySelector('[data-modal-title]');
    var lastFocus = null;

    var closeModal = function () {
      modal.hidden = true;
      mProse.innerHTML = '';
      mHead.hidden = true;
      if (lastFocus) { lastFocus.focus(); lastFocus = null; }
    };

    var openModal = function (url, title, author, face, batch) {
      lastFocus = document.activeElement;
      mId.textContent = title;
      mTitle.textContent = title;

      if (author) {
        mAuthor.textContent = author;
        mFace.src = face || '';
        mFace.alt = author;
        /* no batch is recorded for most authors yet; an em dash reads the
           same way the blank fields on the member profiles do */
        mBatch.textContent = 'Batch ' + (batch || '\u2014');
        mHead.hidden = false;
      } else {
        mHead.hidden = true;
      }
      mProse.innerHTML = '<p class="modal__note">Loading\u2026</p>';
      modal.hidden = false;
      mScroll.scrollTop = 0;
      modal.querySelector('[data-modal-close]').focus();

      fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var art = doc.querySelector('.leftcolumn') || doc.querySelector('main') || doc.body;

        /* the post lives in Blogs/Posts/, so its relative images and links
           have to be resolved against that file, not against this page */
        var base = new URL(url, location.href);
        /* Joshy's post lazy-loads with data-src and its own script, which we
           strip; the rest use plain src. Handle both or that post shows
           nothing but empty frames. */
        art.querySelectorAll('img').forEach(function (n) {
          var raw = n.getAttribute('src') || n.getAttribute('data-src');
          if (!raw) { n.remove(); return; }
          n.setAttribute('src', new URL(raw, base).href);
          n.removeAttribute('data-src');
          n.setAttribute('loading', 'lazy');
        });
        art.querySelectorAll('a[href]').forEach(function (n) {
          n.setAttribute('href', new URL(n.getAttribute('href'), base).href);
          n.setAttribute('target', '_blank');
          n.setAttribute('rel', 'noopener');
        });
        art.querySelectorAll('script, style, iframe').forEach(function (n) { n.remove(); });

        mProse.innerHTML = art.innerHTML;
        mScroll.scrollTop = 0;
      }).catch(function () {
        /* never strand the reader: hand them the real page */
        mProse.innerHTML = '<p class="modal__note">Could not load this post here. ' +
          '<a href="' + url + '">Open it directly</a>.</p>';
      });
    };

    document.querySelectorAll('.post').forEach(function (a) {
      a.addEventListener('click', function (e) {
        /* leave new-tab, download and middle-click alone */
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        var t = a.querySelector('.post__title');
        var by = a.querySelector('.post__by');
        openModal(a.getAttribute('href'),
                  t ? t.textContent.trim() : 'Post',
                  by ? by.textContent.trim() : '',
                  a.getAttribute('data-face'),
                  a.getAttribute('data-batch'));
      });
    });

    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('[data-modal-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  /* ---------- checklist ---------- */
  document.querySelectorAll('.check__q').forEach(function (q) {
    q.addEventListener('click', function () {
      var open = q.getAttribute('aria-expanded') === 'true';
      var panel = document.getElementById(q.getAttribute('aria-controls'));
      q.setAttribute('aria-expanded', String(!open));
      if (open) panel.removeAttribute('data-open');
      else panel.setAttribute('data-open', '');
    });
  });

  /* ---------- bottom rail tracks the section in view ----------
     A plain scroll calculation rather than IntersectionObserver: a jump
     straight down the page skips the intermediate sections, and the
     observer's change-only callbacks left the readout showing whichever
     section it had last seen enter the band. */
  var screenEl = document.querySelector('[data-screen]');
  var readout  = document.querySelector('[data-position]');

  var gauge = document.querySelector('[data-gauge]');
  var pct   = document.querySelector('[data-pct]');
  var SEGS  = 16;

  if (gauge) {
    for (var g = 0; g < SEGS; g++) gauge.appendChild(document.createElement('i'));
  }

  if (screenEl && readout) {
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-name]'));
    var segs = gauge ? gauge.querySelectorAll('i') : [];

    var place = function () {
      var mid = screenEl.scrollTop + screenEl.clientHeight / 2;
      var name = sections[0].dataset.name;
      sections.forEach(function (s) { if (s.offsetTop <= mid) name = s.dataset.name; });
      if (readout.textContent !== name) readout.textContent = name;

      /* travel, not position: a page shorter than the screen is fully read */
      var span = screenEl.scrollHeight - screenEl.clientHeight;
      var p = span > 4 ? Math.min(1, screenEl.scrollTop / span) : 1;
      var lit = Math.round(p * SEGS);

      for (var i = 0; i < segs.length; i++) {
        segs[i].className = i < lit ? (i === lit - 1 ? 'on tip' : 'on') : '';
      }
      if (pct) pct.textContent = (p * 100 < 10 ? '0' : '') + Math.round(p * 100) + '%';
    };

    screenEl.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    place();
  }

})();

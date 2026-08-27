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
  var NAV = [
    ['/home',        'index.html'],
    ['/projects',    'projects.html'],
    ['/team',        'team.html'],
    ['/blogs',       'blogs.html'],
    ['/course',      'webdev-course.html'],
    ['/visualizers', 'dbscan.html'],
    ['/library',     'store.html'],
    ['/hackathon',   'hackathon.html'],
    ['/alumni',      'alumni.html']
  ];

  var deck = document.querySelector('[data-deck]');

  if (deck) {
    var path = location.pathname;
    var up = (path.indexOf('/members/') > -1 || path.indexOf('/Blogs/') > -1) ? '../' : '';
    if (path.indexOf('/Blogs/Posts/') > -1) up = '../../';
    var here = deck.dataset.page || '';

    var top = document.createElement('header');
    top.className = 'rail rail--top';
    top.innerHTML =
      '<a class="rail__brand" href="' + up + 'index.html">' +
        '<img src="' + up + 'connection_network_infinity_partial_logo.png" alt="">Coding Club</a>' +
      '<span class="lbl rail__desig">IISER Thiruvananthapuram</span>' +
      '<span class="rail__spacer"></span>' +
      '<span class="lamp">Systems nominal</span>' +
      '<span class="mono rail__clock" data-clock>--:--</span>';

    var nav = document.createElement('nav');
    nav.className = 'nav';
    nav.setAttribute('aria-label', 'Sections');
    nav.innerHTML = NAV.map(function (n) {
      var on = n[1] === here ? ' aria-current="page"' : '';
      return '<a class="nav__item" href="' + up + n[1] + '"' + on + '>' + n[0] + '</a>';
    }).join('');

    var bot = document.createElement('footer');
    bot.className = 'rail rail--bot';
    bot.innerHTML =
      '<span class="lbl">Position</span>' +
      '<span class="mono" data-position>' + (deck.dataset.title || 'Top') + '</span>' +
      '<span class="rail__spacer"></span>' +
      '<span class="lamp lamp--alt rail__rev">Applications open</span>' +
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

  if (screenEl && readout) {
    var sections = Array.prototype.slice.call(document.querySelectorAll('[data-name]'));

    var place = function () {
      var mid = screenEl.scrollTop + screenEl.clientHeight / 2;
      var name = sections[0].dataset.name;
      sections.forEach(function (s) { if (s.offsetTop <= mid) name = s.dataset.name; });
      if (readout.textContent !== name) readout.textContent = name;
    };

    screenEl.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    place();
  }

})();

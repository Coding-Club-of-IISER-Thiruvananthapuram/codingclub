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
    ['/journal', 'newsletter.html', 'fa-newspaper'],
    ['/archive', 'archive.html', 'fa-box-archive']
  ];
  /* Adding an entry here? The phone menu is a fixed column count in the PHONE
     block of console.css — seven switches, seven columns. It also sets the
     label width: '/newsletter' ellipsised at seven columns; '/journal' is the
     same eight characters as '/archive' and fits. */

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
      /* the lamp is the pulse itself; the words were saying nothing the colour
         did not already say */
      '<span class="lamp lamp--bare" role="status" aria-label="Systems nominal"></span>' +
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
      /* dots in the middle of the rail, credit at the far end */
      '<span class="rail__spacer"></span>' +
      '<span class="rail__dots" aria-hidden="true">' + new Array(9).join('<i></i>') + '</span>' +
      '<span class="lbl rail__credit">Rebuilt by Antrin Maji</span>';

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
      { t: '  applications ......... CLOSED for now', c: 'out' },
      { t: '  passion projects ..... OPEN', c: 'hi' },
      { t: '' },
      { t: 'codingclub@iisertvm:~$ whoami', c: 'cmd' },
      { t: '  a student club at IISER Thiruvananthapuram building', c: 'out' },
      { t: '  things in machine learning, AI and the web.', c: 'out' },
      { t: '' },
      { t: '  any student can propose a project or run an event', c: 'out' },
      { t: '  under the club. passion projects are open to all.', c: 'out' },
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
    /* the blogs shell carries an author block, the personnel shell does not:
       every one of these is optional from here on */
    var mHead   = modal.querySelector('[data-modal-head]');
    var mFace   = modal.querySelector('[data-modal-face]');
    var mAuthor = modal.querySelector('[data-modal-author]');
    var mBatch  = modal.querySelector('[data-modal-batch]');
    var mTitle  = modal.querySelector('[data-modal-title]');
    var lastFocus = null;

    var closeModal = function () {
      modal.hidden = true;
      mProse.innerHTML = '';
      if (mHead) mHead.hidden = true;
      /* focus returns to the tile or row that opened it, which is what keeps
         the roster on the tab you were reading when the popup closes */
      if (lastFocus) { lastFocus.focus(); lastFocus = null; }
    };

    /* NOT `show`: the roster tabs above already own that name in this scope,
       and a second `var show` here replaces theirs — clicking a tab then opens
       the popup instead of switching panels. */
    var openShell = function (label) {
      lastFocus = document.activeElement;
      mId.textContent = label;
      if (mTitle) mTitle.textContent = label;
      if (mHead) mHead.hidden = true;
      modal.hidden = false;
      mScroll.scrollTop = 0;
      modal.querySelector('[data-modal-close]').focus();
    };

    /* a fetched page's relative URLs resolve against that page, not this one */
    var rebase = function (art, url) {
      var base = new URL(url, location.href);
      art.querySelectorAll('img').forEach(function (n) {
        var raw = n.getAttribute('src') || n.getAttribute('data-src');
        if (!raw) { n.remove(); return; }
        n.setAttribute('src', new URL(raw, base).href);
        n.removeAttribute('data-src');
        n.setAttribute('loading', 'lazy');
      });
      art.querySelectorAll('a[href]').forEach(function (n) {
        var href = n.getAttribute('href');
        if (/^(mailto:|tel:|#)/.test(href)) return;
        n.setAttribute('href', new URL(href, base).href);
        n.setAttribute('target', '_blank');
        n.setAttribute('rel', 'noopener');
      });
      art.querySelectorAll('script, style, iframe').forEach(function (n) { n.remove(); });
      return art;
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
           resolve against that file, not against this page. rebase() also
           handles Joshy's post, which lazy-loads through data-src. */
        mProse.innerHTML = rebase(art, url).innerHTML;
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

    /* ---------- personnel record ----------
       A tile opens the record in place. Nothing navigates, so the roster is
       still on whichever tab you opened it from when the popup closes.
       Tiles that have a profile page keep a working href for a middle click,
       a new tab, and no-JS; the placeholders and alumni have no page, so
       their record is assembled from the tile itself. */
    var fromTile = function (tile) {
      var img  = tile.querySelector('.person__img img');
      var name = tile.querySelector('.person__name');
      var role = tile.querySelector('.person__role');
      var links = tile.querySelector('.person__links');

      openShell(name ? name.textContent.trim() : 'Record');
      mProse.innerHTML =
        '<div class="rec">' +
          '<div class="rec__photo"><img src="' + (img ? img.getAttribute('src') : '') +
            '" alt="' + (name ? name.textContent.trim() : '') + '"></div>' +
          '<div class="rec__body">' +
            '<span class="lbl">Record</span>' +
            '<h2 class="rec__name">' + (name ? name.textContent.trim() : '') + '</h2>' +
            '<p class="rec__role">' + (role ? role.textContent.trim() : '') + '</p>' +
            '<div class="profile__band"><span class="lbl">Contact</span></div>' +
            (links && links.children.length
              ? '<div class="rec__links"></div>'
              : '<p class="rec__none">No contact details on record.</p>') +
          '</div>' +
        '</div>';

      /* the tile's own links are moved in as nodes, so their hrefs and icons
         come across exactly as written rather than being rebuilt from strings */
      var slot = mProse.querySelector('.rec__links');
      if (slot && links) {
        links.querySelectorAll('a').forEach(function (a) {
          var row = document.createElement('a');
          row.className = 'link-row';
          row.href = a.getAttribute('href');
          if (row.href.indexOf('mailto:') !== 0) { row.target = '_blank'; row.rel = 'noopener'; }
          var label = a.getAttribute('aria-label') || 'Link';
          var href  = a.getAttribute('href') || '';
          /* the address itself for mail, the site for everything else — the
             tile only carried an icon and a label */
          var detail = href.indexOf('mailto:') === 0
            ? href.slice(7)
            : (href.split('/')[2] || '').replace(/^www\./, '');
          row.innerHTML = (a.querySelector('i') ? a.querySelector('i').outerHTML : '') +
                          '<span>' + label + '</span>' +
                          (detail ? '<small>' + detail + '</small>' : '');
          slot.appendChild(row);
        });
      }
    };

    var openPerson = function (url, name) {
      openShell(name);
      mProse.innerHTML = '<p class="modal__note">Loading\u2026</p>';
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var art = doc.querySelector('.profile');
        if (!art) throw new Error('no profile');
        var sub = doc.querySelector('.sec__sub');
        mProse.innerHTML = (sub ? '<p class="rec__role">' + sub.textContent.trim() + '</p>' : '') +
                           rebase(art, url).outerHTML;
      }).catch(function () {
        mProse.innerHTML = '<p class="modal__note">Could not load this record here. ' +
          '<a href="' + url + '">Open the page</a>.</p>';
      });
    };

    document.querySelectorAll('.person').forEach(function (tile) {
      tile.addEventListener('click', function (e) {
        var href = tile.getAttribute('href');
        if (href) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          openPerson(href, tile.querySelector('.person__name').textContent.trim());
        } else {
          fromTile(tile);
        }
      });
    });

    /* ---------- newsletter reader ----------
       The issue is a set of pre-rendered page images, one printed page each:
       the A3 spreads are already cut at the fold, so nothing here has to show
       two pages side by side and the phone gets the same tiles the desktop
       does. window.NEWSLETTER is declared by newsletter.html and by nothing
       else, so this block costs every other page one property lookup. */
    var NL = window.NEWSLETTER;
    var sheet = document.querySelector('[data-sheet]');

    if (NL) {
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var pageSrc = function (n, size) { return NL.dir + size + '/p' + pad2(n) + '.webp'; };
      var pageName = function (n) { return NL.names[n] || 'Page ' + n; };

      var at = 1;
      /* The reader always works inside a range. Opened from the cover or the
         contact sheet that range is the whole issue; opened from a contents
         row it is just that piece, so paging cannot wander into the next
         article. `title` is null for the whole issue and the piece's own name
         when it is scoped — taken from the row rather than the per-page names,
         because two pieces can share a page and only the row knows which one
         you picked. */
      var lo = 1, hi = NL.count, title = null;
      /* Always open fitted, phone included. Opening zoomed was a mistake: the
         image is pinned to its rendered 1240px, which on a 412px phone is 3x
         and drops you on the top-left corner of the page — every page looks
         broken because you never see one. Show the whole page, then let Zoom
         be the deliberate step, the way any reader on a phone works. */
      var zoomed = false;
      var zBtn = document.querySelector('[data-page-zoom]');
      var zLabel = document.querySelector('[data-page-zoom-label]');
      var prevBtn = document.querySelector('[data-page-prev]');
      var nextBtn = document.querySelector('[data-page-next]');

      /* The tiles are built rather than written out. Without JS they would be
         dead buttons, so the markup offers the PDF in a <noscript> instead of
         thirty controls that cannot open anything. */
      if (sheet) {
        var html = '';
        for (var n = 1; n <= NL.count; n++) {
          html += '<button type="button" class="page" data-open-page="' + n + '">' +
                    '<img src="' + pageSrc(n, 'thumb') + '" alt="Page ' + n + ': ' +
                      pageName(n).replace(/"/g, '&quot;') + '" loading="lazy" ' +
                      'width="560" height="792">' +
                    '<span class="page__n">' + pad2(n) + '</span>' +
                  '</button>';
        }
        sheet.innerHTML = html;
      }

      var draw = function () {
        /* Scoped, the piece is the thing being read: it leads, and the counter
           is a position inside it. '08 / 30' there would name a page the arrows
           cannot reach. */
        mId.textContent = title
          ? title + '  \u00b7  ' + pad2(at - lo + 1) + ' / ' + pad2(hi - lo + 1)
          : pad2(at) + ' / ' + NL.count + '  \u00b7  ' + pageName(at);
        mProse.className = 'pageview ' + (zoomed ? 'pageview--zoom' : 'pageview--fit');
        mProse.innerHTML = '<img src="' + pageSrc(at, 'full') + '" alt="Page ' + at +
                           ' of the newsletter">';
        /* a failed page must not leave an empty panel: hand over the PDF */
        mProse.firstChild.onerror = function () {
          mProse.innerHTML = '<p class="pageview__note">Could not load page ' + at +
            '. <a href="' + NL.pdf + '">Open the PDF</a>.</p>';
        };
        mScroll.scrollTop = 0;
        mScroll.scrollLeft = 0;
        prevBtn.disabled = at <= lo;
        nextBtn.disabled = at >= hi;
        /* the next page is usually the next thing wanted; 230 KB fetched now
           is a page turn that does not blink */
        if (at < hi) new Image().src = pageSrc(at + 1, 'full');
      };

      var setZoom = function (on) {
        zoomed = on;
        zBtn.setAttribute('aria-pressed', String(on));
        zLabel.textContent = on ? 'Fit' : 'Zoom';
        zBtn.querySelector('i').className =
          'fas fa-magnifying-glass-' + (on ? 'minus' : 'plus');
        mProse.className = 'pageview ' + (on ? 'pageview--zoom' : 'pageview--fit');
      };

      var turnTo = function (n) {
        at = Math.min(hi, Math.max(lo, n));
        draw();
        /* whole issue: the page is what you would link to. one piece: the piece
           is, so the hash names the range and stays put as you read it. */
        history.replaceState(null, '', title ? '#p' + lo + '-' + hi : '#p' + at);
      };

      /* `spec` is either '8' (the whole issue, opened at page 8) or '8-9' (only
         those pages). Anything unparseable falls back to the whole issue rather
         than to an empty reader. */
      var openPage = function (spec, name) {
        var m = /^(\d+)(?:-(\d+))?$/.exec(String(spec));
        var a = m ? +m[1] : 1;
        var b = m && m[2] ? +m[2] : 0;

        if (b) {
          lo = Math.max(1, Math.min(a, b));
          hi = Math.min(NL.count, Math.max(a, b));
          title = name || pageName(lo);
        } else {
          lo = 1; hi = NL.count; title = null;
        }
        openShell(title || 'Newsletter');
        setZoom(zoomed);
        turnTo(b ? lo : a);
      };

      /* newsletter.html#p8 opens the reader on that page, so a contents row can
         be linked to directly. Same idiom as the roster tabs above: the hash
         follows the page you are on, and replaceState keeps the back button
         pointing at wherever you came from rather than at every page turn. */
      var fromHash = /^#p(\d+(?:-\d+)?)$/.exec(location.hash);
      if (fromHash) openPage(fromHash[1]);

      /* delegated: the contact sheet was built a moment ago, and the cover and
         the contents rows carry the same attribute */
      document.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-open-page]') : null;
        if (!b) return;
        var name = b.querySelector('.manifest__name');
        openPage(b.getAttribute('data-open-page'), name && name.textContent.trim());
      });

      prevBtn.addEventListener('click', function () { turnTo(at - 1); });
      nextBtn.addEventListener('click', function () { turnTo(at + 1); });
      zBtn.addEventListener('click', function () { setZoom(!zoomed); });

      document.addEventListener('keydown', function (e) {
        if (modal.hidden) return;
        if (e.key === 'ArrowLeft')  { e.preventDefault(); turnTo(at - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); turnTo(at + 1); }
      });

      /* swipe, the way a phone expects to turn a page. Only a mostly-sideways
         drag counts, or scrolling down a zoomed page turns it by accident. */
      var x0 = null, y0 = null;
      mScroll.addEventListener('touchstart', function (e) {
        x0 = e.changedTouches[0].clientX;
        y0 = e.changedTouches[0].clientY;
      }, { passive: true });
      mScroll.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        var dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) turnTo(at + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }

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

  /* ---------- leaving a page ----------
     An internal link fades the deck before it navigates, so the next page's
     entrance continues the movement instead of cutting to it. Anything that
     is not a plain left click on a same-origin page link is left alone:
     new tabs, downloads, in-page anchors and the post reader all still work
     exactly as they did. */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return;
    if (a.target && a.target !== '_self') return;

    var url = new URL(a.getAttribute('href'), location.href);
    if (url.origin !== location.origin) return;
    if (!/(\.html|\/)$/.test(url.pathname)) return;          /* PDFs, images */
    if (url.pathname === location.pathname) return;            /* same page */

    e.preventDefault();
    document.body.classList.add('is-leaving');
    setTimeout(function () { location.href = url.href; }, 110);
  });

  /* back/forward can restore this page from the cache mid-fade */
  window.addEventListener('pageshow', function () {
    document.body.classList.remove('is-leaving');
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

    /* Only what is below the fold is hidden to be revealed — anything
       already on screen is left alone, so a failure here can never blank
       the part of the page you are looking at. */
    var pending = [];
    if (!reduced) {
      sections.forEach(function (s) {
        if (s.getBoundingClientRect().top > window.innerHeight - 60) {
          s.classList.add('reveal');
          pending.push(s);
        }
      });
    }

    var place = function () {
      /* The readout stays on the page's own title. It used to name the
         section you were scrolling through, but every change to a word of a
         different length shoved the gauge and the percentage sideways. */

      /* sections that have come far enough up the screen are released.
         Riding place() rather than an IntersectionObserver keeps this on
         the one throttled handler the page already runs. */
      for (var r = pending.length - 1; r >= 0; r--) {
        if (pending[r].getBoundingClientRect().top < window.innerHeight - 60) {
          pending[r].classList.add('reveal--in');
          pending.splice(r, 1);
        }
      }

      /* travel, not position: a page shorter than the screen is fully read */
      var span = screenEl.scrollHeight - screenEl.clientHeight;
      var p = span > 4 ? Math.min(1, screenEl.scrollTop / span) : 1;
      var lit = Math.round(p * SEGS);

      for (var i = 0; i < segs.length; i++) {
        segs[i].className = i < lit ? (i === lit - 1 ? 'on tip' : 'on') : '';
      }
      if (pct) pct.textContent = (p * 100 < 10 ? '0' : '') + Math.round(p * 100) + '%';
    };

    /* one measurement per frame; scroll fires far more often than that */
    var queued = false;
    var onScroll = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; place(); });
    };

    screenEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    place();
  }

})();

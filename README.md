# Coding Club — IISER Thiruvananthapuram

The club website. Plain HTML, CSS and JavaScript with **no build step** — what is in
the repo is what gets served. Open `index.html` in a browser and it works.

Live at <https://sites.iisertvm.ac.in/codingclub/> — the institute reverse-proxies
that path to GitHub Pages. `codingclub.iisertvm.ac.in` has no DNS record; it is not
a working address. See "How it is served" below.

---

## Running it locally

```bash
npm install     # only needed for the dev server
npm run dev     # browser-sync on :3000, reloads on save
```

If you move a file, **check the `--files` globs in `package.json`**. They are literal
paths, so `*.css` matches only the repository root — a stylesheet under `assets/css/`
will not trigger a reload unless the glob names it. A stale watch list looks exactly
like a broken feature: the browser keeps running the previous script.

`npm start` serves the same files without live reload. Neither is required to work on
the site — any static file server, or opening the HTML directly, will do.

---

## How it is served

The site is **not** hosted on the institute's server. It is on GitHub Pages, and
Apache on `sites.iisertvm.ac.in` reverse-proxies one path to it:

```
https://sites.iisertvm.ac.in/codingclub/
        └─ Apache 2.4.52 (Ubuntu) ──► https://coding-club-of-iiser-thiruvananthapuram.github.io/codingclub/
```

Measured with curl and a headless browser, that proxy does three things to the
response, and each one costs us something:

1. **Only the index is mapped.** `/codingclub/` returns the page; `/codingclub/team.html`,
   `/codingclub/index.html`, every stylesheet, script and image returns GitHub's 404
   page. The live site today loads its HTML and *nothing else* — no CSS, no navbar
   script, broken logos, and every link in the menu dead. The mapping behaves like a
   single-URL `ProxyPass` to `…/codingclub/index.html` rather than a subtree mount.
2. **It injects `<base href="https://sites.iisertvm.ac.in/codingclub/">`** as the first
   thing inside `<head>`, on every response including 404s. The URL is constant, so it
   is *wrong for any page not at the site root*: on `members/foo.html`, `../assets/css/console.css`
   resolves to `/assets/css/console.css` — above the site — and 404s. A `<base>` of our
   own cannot fix this: the first `<base>` in the document wins and theirs is inserted
   ahead of ours.
3. **It rewrites every `src="…"`** to an absolute URL under `/codingclub/`, including
   inside inline `<script>` strings. `href` is left alone. For a root page this is a
   no-op; for a subdirectory page it turns `../assets/x.png` into `/assets/x.png`.

Verified against a local simulation of all three rules: **root pages come through
perfectly (0 failed requests); `members/*` and `others/*` lose their stylesheet, their
script and their images.**

Two smaller things: `https://sites.iisertvm.ac.in/codingclub` without the trailing
slash 301-redirects to **`http://`**, dropping TLS, and `codingclub.iisertvm.ac.in`
(which this README used to advertise) has no DNS record at all.

### What to ask IT for

```apache
SSLProxyEngine on
ProxyPass        /codingclub/ https://coding-club-of-iiser-thiruvananthapuram.github.io/codingclub/
ProxyPassReverse /codingclub/ https://coding-club-of-iiser-thiruvananthapuram.github.io/codingclub/
# and turn OFF the HTML rewriting for this path:
ProxyHTMLEnable  Off        # or remove the mod_substitute rule injecting <base>
```

Once the proxied path and the upstream path match one-for-one, no rewriting is needed —
every link in this repo is relative and works under any prefix. The cleanest fix is to
skip the proxy: point a `CNAME` for `codingclub.iisertvm.ac.in` at the GitHub Pages host
and set it as the custom domain.

### What we do instead (no server change needed)

The proxy blocks paths *under* `/codingclub/`. It does not stop the browser from talking
to GitHub Pages directly, and GitHub Pages sends neither `X-Frame-Options` nor a CSP
`frame-ancestors`. So `index.html` — the one document the proxy does serve — hides itself
and hands the whole viewport to the real site in a full-bleed iframe, but *only* when
`location.hostname` is exactly `sites.iisertvm.ac.in`. It names the one host that needs
this rather than listing the hosts that do not: the dev server is reached by LAN IP from
a phone as often as by `localhost`, and an allow-list got that wrong — the phone framed
the deployed site instead of the local one.

The result: `sites.iisertvm.ac.in/codingclub/` stays the address in the bar, and every
page, stylesheet, script and image inside it is fetched from GitHub Pages, where the
relative paths this repo is built on work normally. Subdirectory pages are fine again —
they are never requested through the proxy.

`?p=` deep-links into it: `…/codingclub/?p=team.html`, `…/codingclub/?p=members/aneeth.html`.
The value is validated as a relative path — an absolute URL, a `javascript:` URL or any
`..` falls back to the home page, so the parameter cannot be used to frame another site.

The block is the commented `<script>` in the `<head>` of `index.html`, about fifteen
lines. It does nothing on GitHub Pages or on the dev server. Delete it the day the
proxy config is fixed.

**This only works once the site is actually deployed.** GitHub Pages is currently serving
the version from 5 October 2025; the redesign is unpushed local work.

## File structure

```
.
│   The five pages in the menu bar:
├── index.html              Home: masthead, live terminal readout, focus areas, FAQ, contact
├── team.html               On station / ground control / alumni, links to each profile
├── events.html             Scheduled talks, workshops, seminars, the hackathon
├── blogs.html              Index of member-written posts
├── merch.html              Merch catalogue (placeholder products — see below)
├── archive.html            The record: what the club has run, plus material to download
│
├── members/                One profile page per member
│
├── others/                 Everything not in the menu bar — see others/README.md
│   ├── projects.html  hackathon.html  webdev-course.html
│   ├── course-layout.html  dbscan.html  linear_regression.html
│   └── unused-assets/      13 images no page references
│
├── assets/
│   ├── css/console.css     The entire design system. One file, no preprocessor.
│   ├── js/console.js       Shared page behaviour (see below)
│   ├── img/
│   │   ├── brand/          Logos and favicons
│   │   ├── people/         Member and alumni photographs
│   │   └── misc/           Everything else
│   ├── docs/               PDFs offered from archive.html
│   └── course/             The 16 course slides as SVG
│
├── Blogs/                  Legacy blog area — see "Known gaps"
│   ├── Blog main.html      Post index
│   ├── Posts/              Nine posts
│   ├── Media*/             Images belonging to individual posts
│   └── legacy/             Old stylesheet and navbar, used only by Blog main.html
│
├── favicon.ico             Kept at the root; browsers request it there
├── site.webmanifest        PWA manifest
└── package.json            Dev server only. The site has no runtime dependencies.
```

---

## How a page is put together

Every page is the same three things:

```html
<link href="assets/css/console.css" rel="stylesheet">
...
<div class="deck" data-deck data-page="team.html" data-title="Roster">
  <div class="screen" data-screen>
    <div class="glass" aria-hidden="true"></div>
    <!-- page content -->
  </div>
</div>
<script src="assets/js/console.js"></script>
```

- **`.deck`** is the instrument housing: a fixed bezel holding four grid rows —
  title rail, menu bar, screen, status rail.
- **`.screen`** is the only thing that scrolls. `html` and `body` have
  `overflow: hidden`.
- **`data-page`** tells the menu bar which item to mark as current. It is the
  filename of the nav entry, so member pages pass `team.html`.
- **`data-title`** is the label the status rail starts with.
- **`data-up`** is how far the page sits below the site root — `"../"` for anything
  in `members/` or `others/`, omitted at the root. `console.js` prefixes every link
  it injects with it.

`console.js` injects the title rail, menu bar and status rail into every page that
has `[data-deck]`, so the chrome lives in one place. The grid rows are pinned in CSS
(`grid-row: 1..4`), so nothing shifts while that runs.

**To add or rename a nav item, edit the `NAV` array at the top of
`assets/js/console.js`.** Each entry is `[label, file, icon]`; the icon is a Font
Awesome name. Nothing else needs touching — `data-up` handles subdirectory paths.

### Components in `console.css`

| Class | Use |
|---|---|
| `.wrap` | Centred content column, max 1180px |
| `.sec` / `.sec__title` | A titled section, one per panel |
| `.divider` + `.lbl` | The engraved "Panel A · Navigation" label |
| `.manifest` / `.manifest__row` | List rows: date, name, description, status |
| `.spec` / `.spec__row` | Two-column specification list |
| `.areas` / `.area` | Icon panel for focus areas |
| `.creed` | The club motto set as a section divider |
| `.roster` / `.person` | People grid |
| `.tabs` / `.tabs__btn` | Roster selector on team.html |
| `.empty` | Panel with no data wired to it yet |
| `.check` / `.check__q` | Accordion (FAQ) |
| `.comms` / `.card` / `.field` | Contact and detail panels |
| `.term` | Terminal readout |
| `.shop` / `.vf` | Merch catalogue and viewfinder stage |
| `.btn`, `.chip`, `.tag`, `.state` | Buttons and small labels |
| `.gauge` + `.rail__pct` | Segmented scroll gauge in the status rail |
| `.manifest__n` | Row index on the mission-log spine |

### Instrumentation

Three things carry the flight-deck idea into the content rather than leaving it on the
frame. All are in the `INSTRUMENTATION` block at the end of `console.css`.

- **Scroll gauge.** Sixteen segments plus a percentage in the status rail, on every
  page. It measures *travel* — a page shorter than the screen reads 100%.
- **Mission log.** `.manifest` rows hang off a vertical spine with a tick and an index
  per row, so lists read as a plotted log instead of a table.
The screen grid is drafting film: a minor rule every 56px and a major one every 224px.

The home page carries no stat boxes — the terminal already reports members, projects,
courses and posts, so repeating them was duplication. The club motto sits there
instead, set in italic between double hairlines as a section divider.

### The post reader

Clicking a post on `blogs.html` opens it in a modal styled like the rest of the site,
instead of navigating to `Blogs/Posts/*.html`, which share none of this design. The
article is **fetched from its own file** and its `.leftcolumn` lifted out, so the posts
remain the single source of truth and nothing is duplicated.

Four things it has to keep doing:

- **The links keep a real `href`.** The handler only calls `preventDefault` on a plain
  left click, so middle-click, ⌘/Ctrl-click and no-JS all navigate to the post as
  before.
- **Relative URLs are rebased.** A post lives in `Blogs/Posts/`, so `../Media/x.png`
  has to resolve against *that* file, not against the page hosting the modal.
- **Both `src` and `data-src` are handled.** Joshy's post lazy-loads through `data-src`
  and its own script, which the reader strips — matching only `img[src]` left that
  post showing twenty empty frames.
- **A failed fetch offers the real page** rather than an empty panel.

`.prose` restyles the fetched markup into this site's type, and neutralises the source
pages' own `.card`, `.rightcolumn` and `.more-blogs` wrappers.

### Typed readouts

Any element with `data-type` types its own text out on load, dock-display style,
with a caret parked at the end. Three rules it follows, and any new use must too:

- **The text lives in the markup.** The script reads it, clears it, then types it
  back. With JS off or broken the full sentence is simply there — verified by
  rendering with the script tag removed.
- **The rendered height is reserved before clearing**, or the panel below jumps up
  as the sentence grows from nothing to two lines. Measured: 0px shift.
- **A `setTimeout` forces the final text** in case the timers stall in a background
  tab, the same guarantee the readout figures used to need.

### Motion

The deck powers up rather than appearing: the top rail drops in, the switches in the
menu light up left to right, the screen rises behind them, and the bottom rail comes up
last — about 500ms end to end. Clicking an internal link fades the deck out over 150ms
first, so the next page's entrance continues the movement instead of cutting to it.
Sections below the fold rise as they reach the screen.

Three rules the `MOTION` block at the end of `console.css` follows, and any addition
must too:

- **Nothing may hide content.** Entrance animations run `both` from a *visible* end
  state, so a page whose animation never runs is simply all there. The scroll reveal is
  applied by `console.js`, never written into the markup, and only to sections that are
  below the fold at load — what you are looking at is never hidden, not for a frame.
  Measured after scrolling every page: 0 sections left invisible while in view.
- **Opacity and transform only.** No layout property is animated. Measured cumulative
  layout shift during load: 0.00003.
- **`prefers-reduced-motion` turns all of it off**, including the reveal's starting
  state — verified with the media feature emulated: nothing hidden, terminal written out
  in full immediately.

The scroll reveal rides the throttled `place()` handler the status rail already runs, so
it costs no extra listener and no IntersectionObserver.

### The phone layout

Everything below 46rem lives in one `PHONE` block at the end of `console.css`, not in a
media query per component — there were eleven of those and they disagreed with each
other. Four decisions in it are worth keeping:

- **The menu becomes six equal switches with the glyph over the label.** Six items with
  the label *beside* the glyph cannot fit 390px: `/merch` and `/archive` were simply off
  the screen. Below 22rem the labels go and the glyphs stay, so every destination keeps a
  tap target.
- **`--inset` drops to 0 and the rails shrink** (`--rail: 40px`, `--nav: 52px`). The
  bezel is a desktop conceit; on a phone it costs 36px of width for nothing. Below
  20.5rem the status rail drops the gauge and the percentage rather than pushing them
  off the edge.
- **Every multi-column grid collapses to `minmax(0, 1fr)`, not `1fr`.** An `fr` track's
  automatic minimum is min-content, so a portrait pushed the profile column wider than
  a 320px screen even at one column.
- **Portraits stay two-up.** One per row turns a fourteen-person roster into a scroll.

The shop reorders on a phone: `order: -1` puts the stage first, so the thing you are
looking at leads and the catalogue follows, and the bag covers the screen instead of
sliding a panel over half of it.

Checked with a script that walks every element on all 26 pages at 390, 360 and 320px and
reports anything whose right edge passes the viewport, ignoring content inside a box
that scrolls on its own (a code sample in a `pre` is contained, not overflowing).
All three widths: clean.

### The page must never flash white

Every page declares `<meta name="color-scheme" content="dark">` **before** the
stylesheet link, and `console.css` sets `color-scheme: dark` plus a literal
`background: #000` on `html, body` — literal, not `var(--hull)`, because during any
moment the stylesheet has not applied there are no custom properties to resolve.

Without these the browser paints its default canvas, which is pure white. Measured
with the stylesheet absent: `#ffffff` before, `#121212` after. That was the white flash
on the rails when clicking between pages — the dev server sends
`Cache-Control: max-age=0`, so the browser revalidates `console.css` on every
navigation, and any slow round-trip exposes the unstyled canvas.

Every page also carries `style="background:#000"` **on the `<html>` element itself**.
The meta tag only tells the browser which default canvas to pick; it still picks one of
*its* colours — Firefox `#1c1b22`, Chromium `#121212` — and paints it for the moments
between documents, before `console.css` has been parsed. Against this site's pure black
that reads as a grey flash on every navigation. An inline style attribute is the only
declaration that applies from the first parsed byte.

Verified with the stylesheet blocked and the browser's default canvas forced to white:
`html` still computes to `rgb(0, 0, 0)` on every page.

Keep both the meta tag and the inline background on any new page.

### Design tokens

All colour and type lives in `:root` at the top of `console.css`. The palette is
derived from the club logo, which is a fully-saturated ramp from `#1400f0` (hue 244)
through `#7800dc` to `#a000c8` (hue 288); the tokens are lightened versions of those
hues so they stay legible on black.

Grids draw their hairlines with `outline` on the cells, **not** with a background
colour on the container. A container background shows through any unfilled cell in
the last row as a large pale block.

---

## worker/ — the merch backend, dormant

`worker/` is a verbatim copy of the Anvesha '26 merch API: a Cloudflare Worker with D1,
R2, Razorpay settlement, a Resend confirmation mail and an in-worker QR generator, plus
its schema, seeds, smoke script and tests. **Nothing on this site talks to it.** The
merch page is entirely client-side; the copy is here so the shop can be wired up later
without starting from scratch.

Three things to know before anyone switches it on:

- `wrangler.jsonc` still names Anvesha's D1 database id, R2 bucket and allowed origins.
  Those are that festival's resources; the club needs its own.
- `DIRECT_PAY: "1"` is set, which makes `POST /api/pay` mark any order paid with no
  gateway involved. That is deliberate there and dangerous here — remove it before the
  Worker is ever deployed on a domain that takes money.
- Secrets are not in the repo. `.dev.vars.example` is a template; the real file is
  git-ignored, and the local D1/R2 state and order backups that came with the copy were
  deleted rather than committed — they held real names, emails and phone numbers.


## Known gaps

- **Ground control is empty.** `team.html` has three roster panels — On station,
  Ground control, Alumni — but nothing in the repo says who the coordinators are or
  who came before them; every member is recorded with the role "Member". Populate it
  by adding `.person` cards to `#p-ground` in `team.html`.
- **`Blogs/` has not been converted** to the current design. It still uses its own
  `blogstyle.css` and Prism syntax highlighting, and pulls two files from
  `Blogs/legacy/`. The nine posts work and are linked from `archive.html`.
- **Merch products are placeholders.** There are no product photos in the repo, so
  every view falls back to the club mark. The catalogue is a single `CATALOGUE`
  array at the top of the script in `merch.html`; replace the image paths and prices
  and nothing else needs editing. The Reserve button opens a mail draft — there is no
  payment backend.
- **Library dates are missing.** History rows are labelled by kind ("Talk series",
  "Workshop") because the repo has no reliable dates for past sessions.
- **One source image is still wrong.** `team.html` points Ayush's card at the institute
  logo, which left his real portrait unused (now in `others/unused-assets/ayush.png`).
  Worth fixing in `team.html` rather than leaving it there.

## Weight

Nothing here is minified and nothing needs to be, but four things were large enough to
matter and were dealt with directly:

- **Course slides: 44 MB → 10 MB.** Each `assets/course/*.svg` is vector art wrapped
  around a handful of base64 rasters, and the same 1.2 MB background JPEG was embedded
  in all sixteen. The rasters are now capped at 1400px and re-encoded — JPEG where
  there is no alpha channel, PNG where there is, so the slides that use a grayscale
  mask still composite correctly. The vector text is untouched and still sharp.
- **Portraits: 4.3 MB → 568 KB.** Four photographs were 2400–3100px on the long edge
  and were being drawn into 220px tiles.
- **Plotly: 3.4 MB → 1.0/1.6 MB.** `plotly-latest.min.js` is a frozen 1.58.5 alias.
  `dbscan.html` draws scatter only, so it loads the *basic* bundle;
  `linear_regression.html` needs `surface` and `scatter3d`, so it loads *gl3d*. Both
  pinned to 3.0.1.
- **`node_modules/` is no longer tracked** (`git rm -r --cached`); `.gitignore` covers
  it. The files stay on disk for the dev server.

If you replace a photograph, check its pixel size before committing it. Nothing in the
site displays an image wider than about 800px.

---

## Checking a change

`console.css` and `console.js` are single files whose blocks sit directly next to each
other, so deleting a range by its start and end markers can take a neighbouring block
with it. This has bitten twice: removing the dead `.modules` CSS also deleted the
roster and slide-viewer rules, and removing the dead count-up script also deleted the
roster tabs. Balanced braces, a clean parse and a 200 response all still pass — none
of them can see a behaviour that is simply gone.

Run the checker before calling a change done:

```bash
python3 tools-check.py
```

It verifies that every class the markup uses is still defined in the stylesheet, that
every interactive hook (`tabs__btn`, `check__q`, `data-term`, `data-gauge`, …) is still
referenced by the script, that tab buttons and tab panels pair up, and that every
manifest row has its index cell.

Two gotchas it exists because of:

- `grep -c 'manifest__n'` also matches `manifest__name`. Include the closing quote.
- A Python `str.replace` whose pattern does not match is a silent no-op. Assert on the
  match count when patching, and read the file back.

## Conventions

- Two-space indent in CSS and JS, four in HTML.
- No frameworks. No build step. If something needs a dependency, question it first.
- Asset paths are written relative to the page. Pages in `members/` and `others/`
  prefix `../` and declare `data-up="../"`.
- Content is edited directly in the HTML. There is no CMS and no templating.

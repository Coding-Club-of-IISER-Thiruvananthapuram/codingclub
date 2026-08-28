# Coding Club — IISER Thiruvananthapuram

The club website. Plain HTML, CSS and JavaScript with **no build step** — what is in
the repo is what gets served. Open `index.html` in a browser and it works.

Live at <https://codingclub.iisertvm.ac.in>.

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
│   ├── projects.html  alumni.html  hackathon.html  webdev-course.html
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

Keep the meta tag on any new page. It is the only thing that applies before CSS loads.

### Design tokens

All colour and type lives in `:root` at the top of `console.css`. The palette is
derived from the club logo, which is a fully-saturated ramp from `#1400f0` (hue 244)
through `#7800dc` to `#a000c8` (hue 288); the tokens are lightened versions of those
hues so they stay legible on black.

Grids draw their hairlines with `outline` on the cells, **not** with a background
colour on the container. A container background shows through any unfilled cell in
the last row as a large pale block.

---

## Known gaps

- **Ground control is empty.** `team.html` has three roster panels — On station,
  Ground control, Alumni — but nothing in the repo says who the coordinators are or
  who came before them; every member is recorded with the role "Member". Populate it
  by adding `.person` cards to `#p-ground` in `team.html`.
- **`others/alumni.html` is now a duplicate.** `team.html#alumni` holds the same two
  profiles and `archive.html` points there. Delete the old page or leave it.
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
- **`node_modules/` is committed to git.** It is now in `.gitignore`, but the tracked
  copy has to be removed separately:
  `git rm -r --cached node_modules`
- **Some source images are wrong.** `team.html` points Ayush's card at the institute
  logo, which left his real portrait unused (now in `others/unused-assets/ayush.png`).
  `assets/img/people/user.jpg` is an 8000×8000 placeholder at 1.4 MB. Both are worth
  fixing at the source.

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

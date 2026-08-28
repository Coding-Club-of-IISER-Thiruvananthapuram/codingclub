# others/

Pages that are **not part of the six-page site**. Nothing here appears in the menu bar
(`/home /team /events /blogs /merch /archive`).

These pages still work and still carry the site chrome; most are linked from
`archive.html` or `events.html`. Moving one back to the root means moving the file and
deleting its `data-up="../"` attribute.

## Pages

| File | Linked from | Notes |
|---|---|---|
| `projects.html` | `archive.html` | Courses and the interactive demos |
| `hackathon.html` | `events.html`, `archive.html` | Codyssey detail page |
| `webdev-course.html` | `events.html` | Course overview |
| `course-layout.html` | `archive.html`, `webdev-course.html` | 16-slide viewer, reads `../assets/course/` |
| `dbscan.html` | `archive.html`, `projects.html` | Plotly visualiser (basic bundle) |
| `linear_regression.html` | `archive.html`, `projects.html` | Plotly gl3d + Chart.js visualiser |

Neither visualiser page has `[data-name]` sections, so the bottom rail keeps the title
the page declares instead of tracking scroll position. `console.js` allows for that.

`alumni.html` used to live here; `team.html#alumni` holds the same two profiles, so it
was deleted. `git log` has it if anyone wants it back.

## unused-assets/

Thirteen images that **no page references**. Kept rather than deleted because they are
club material, not code.

```
QSI_logo.png                          codex_title_logo.png
clublogocroppeddark.png               iiser_logo black.png
black-instagram-logo-3497.png         dragonfly1301.png
linkedin_logo.png                     movie_screening.jpg
step_mentor.png                       step_mentor_transparent_enhanced.png
whatsapp_logo.png                     nishanthpic.jpg
ayush.png
```

`ayush.png` is a real portrait that went unused because `team.html` points that card at
the institute logo instead — worth fixing in `team.html` rather than leaving here.

## What is NOT unused

`assets/course/2.svg` … `16.svg` look unreferenced to a text search because
`course-layout.html` builds those paths at runtime (`DIR + '/' + n + '.svg'`).
They are in use. Do not move them here.

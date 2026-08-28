# others/

Pages and files that are **not part of the five-page site**. Nothing here appears in
the menu bar (`/home /team /events /merch /library`).

These pages still work, still carry the site chrome, and most are still linked from
`library.html` or `events.html` — they just aren't primary navigation. Moving one back
to the root means moving the file and deleting its `data-up="../"` attribute.

## Pages

| File | Still linked from | Notes |
|---|---|---|
| `projects.html` | `library.html` | Courses and the interactive demos |
| `alumni.html` | `library.html` | Past members |
| `hackathon.html` | `events.html`, `library.html` | Codyssey detail page |
| `webdev-course.html` | `events.html` | Course overview |
| `course-layout.html` | `library.html`, `webdev-course.html` | 16-slide viewer, reads `../assets/course/` |
| `dbscan.html` | `library.html`, `projects.html` | Plotly visualiser |
| `linear_regression.html` | `library.html`, `projects.html` | Plotly + Chart.js visualiser |
| `blogs.html` | **nothing** | Orphaned — `library.html` links the posts directly instead |

`blogs.html` duplicates the writing panel in `library.html`. Delete it or link it;
right now it is unreachable.

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

`step_mentor.png` (592 KB) and `step_mentor_transparent_enhanced.png` (370 KB) are the
two largest files in the repo.

## What is NOT unused

`assets/course/2.svg` … `16.svg` look unreferenced to a text search because
`course-layout.html` builds those paths at runtime (`DIR + '/' + n + '.svg'`).
They are in use. Do not move them here.

#!/usr/bin/env python3
"""Guards against silently deleting a behaviour.

console.css and console.js are single files whose blocks sit next to each
other, so removing a range by its start/end markers can take the neighbouring
block with it. Balanced braces and a 200 response both still pass. This checks
that every hook the markup relies on is still wired up.
"""
import glob, io, re, sys

CSS = io.open('assets/css/console.css', encoding='utf-8').read()
JS  = io.open('assets/js/console.js',  encoding='utf-8').read()

PAGES = glob.glob('*.html') + glob.glob('members/*.html') + glob.glob('others/*.html')
MARKUP = ''.join(io.open(f, encoding='utf-8', errors='ignore').read() for f in PAGES)

# classes the two visualiser pages style themselves
DEMO = {'main-content','page-header','page-description','header-badge','controls',
        'control-group','content-card','action-btn','action-buttons','container',
        'plots','stats-display','row','muted','small','language-python'}

fail = []

# 1. every class used in markup is defined in the stylesheet
defined = set()
for sel in re.findall(r'^([^@{}/][^{}]*)\{', CSS, re.M):
    defined |= set(re.findall(r'\.([a-zA-Z][\w-]*)', sel))
used = set()
for cl in re.findall(r'class="([^"]+)"', MARKUP):
    used |= set(cl.split())
missing = sorted(c for c in used - defined
                 if not c.startswith(('fa-','fas','fab','far')) and c not in DEMO)
if missing:
    fail.append('CSS rules missing for: ' + ', '.join(missing))

# 2. every interactive hook in the markup is referenced by the script
HOOKS = ['tabs__btn', 'check__q', 'data-term', 'data-clock', 'data-gauge',
         'data-position', 'data-screen', 'data-deck', 'data-name', 'data-type', 'data-modal', 'data-modal-content']
for h in HOOKS:
    if h in MARKUP and h not in JS:
        fail.append('markup uses %s but console.js never references it' % h)

# 3. tab panels and tab buttons must pair up
for f in PAGES:
    t = io.open(f, encoding='utf-8', errors='ignore').read()
    b, p = t.count('class="tabs__btn"'), t.count('role="tabpanel"')
    if b != p:
        fail.append('%s has %d tabs but %d panels' % (f, b, p))

# 4. manifest rows must each carry an index cell
for f in PAGES:
    t = io.open(f, encoding='utf-8', errors='ignore').read()
    r, n = t.count('class="manifest__row"'), t.count('class="manifest__n"')
    if r != n:
        fail.append('%s has %d manifest rows but %d index cells' % (f, r, n))

if fail:
    print('FAIL'); [print('  -', x) for x in fail]; sys.exit(1)
print('OK  %d pages, %d classes, %d hooks' % (len(PAGES), len(used), len(HOOKS)))

# Plumbline PWA review

Result: FAIL (build incomplete). Assets and manifest are valid, but the build is not runnable yet and sw.js points at a missing index.html.

- Manifest: valid JSON. start_url, scope and icons are declared. Icons: icon-192.png and icon-512.png are "any", icon-maskable-512.png is "maskable".
- Icons: all three are real PNGs. Sizes from IHDR: 192x192, 512x512, 512x512 (match the manifest sizes).
- sw.js: FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png']. The four manifest/icon entries exist. './index.html' does NOT exist in gravity-plumbline/ (it is built by inline.py). './' is the directory, not a file.
- src/inline.py: NOT run. It needs src/shell.html (missing) and src/parts/{core,rooms,camera,draw,ui}.js (core.js and draw.js exist; draw.js was not in the first listing, so it appeared during the review). It would fail on the first open(shell.html). Nothing was written.
- pages/index.html: the Plumbline link `gravity-plumbline/` is present (line 4). Target directory exists but has no index.html yet, so the link 404s until the build runs.

Missing before this passes: src/shell.html, src/parts/rooms.js, camera.js, ui.js, and a built gravity-plumbline/index.html.

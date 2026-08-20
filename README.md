# Pururin Initiative — Main Menu

A full-page, game-style main menu in the spirit of the *Command & Conquer 3* shell.
Every graphic on screen is SVG generated at runtime — there are no images in the UI.
The only binary asset is the background video.

## Running it

The page loads the video over HTTP, so serve the folder rather than opening the file
directly:

```bash
python -m http.server 8123
```

Then open <http://localhost:8123>. (`.claude/launch.json` wires the same command up to
the editor's preview button.)

## Folder structure

```
.
├── index.html              markup + the shared <defs>: gradients, filters, patterns, masks
├── data/
│   └── menu.json           EDIT THIS — site title, subtitle, status, menu items
├── css/
│   └── main.css            layout, the boot/reveal choreography, hover states
├── js/
│   ├── worlddata.js        coastline outlines as [lon, lat] pairs + city-light clusters
│   └── main.js             projections and all five SVG layer builders
├── assets/
│   ├── audio/
│   │   ├── buttonclickrelease.wav   played on click
│   │   └── buttonrollover.wav       played on hover / keyboard focus
│   └── video/
│       └── the-expanse.mp4 background plate
├── docs/
│   └── mockups/            the reference layouts this was built against
└── .claude/launch.json     dev preview server config
```

## Editing the menu and titles

Everything text-facing lives in `data/menu.json` — no code changes needed:

```json
{
  "documentTitle": "Pururin Initiative — Main Menu",
  "title": "Pururin Initiative",
  "subtitle": "GLOBAL DEFENSE NETWORK  //  ORBITAL COMMAND",
  "status": "UPLINK ACTIVE",
  "items": [
    { "label": "CAMPAIGN", "link": "campaign.html" },
    { "label": "MANUAL",   "link": "https://example.com", "external": true },
    { "label": "QUIT",     "link": "" }
  ]
}
```

* `title` / `subtitle` / `status` fill the top-right block; `status` is the
  blinking green line, and omitting it hides that line.
* `documentTitle` sets the browser tab.
* Each item takes a `label` and a `link`. An empty `link` fires the event below
  and goes nowhere — useful while screens are still being built. Add
  `"external": true` to open in a new tab.
* Add or remove items freely: the arc, the button widths and the reveal timings
  are all derived from the list length.

The file is fetched at startup, so the page has to be served over HTTP (as
above). Opened straight off disk the fetch is blocked, and it falls back to the
defaults baked into the top of `js/main.js` with a console warning.

## How it is put together

Five absolutely-positioned `<svg>` layers stack over the video, each rebuilt in CSS
pixels whenever the window resizes, so nothing is stretched or letterboxed:

| Layer | Contents |
| --- | --- |
| `#lyr-hex` | faint full-bleed hex lattice + corner clusters, each hex pulsing on its own clock, with a shine sweeping across |
| `#lyr-atlas` | the world atlas across the bottom half — graticule, coastlines, ~1300 city-light dots |
| `#lyr-globe` | the backlit rotating Earth, atmosphere, orbital arcs, sun flare |
| `#lyr-hud` | top framing rails, the top-right title block, the bottom ruler |
| `#lyr-menu` | the curved buttons, built from `data/menu.json` |

**One dataset, two projections.** `WORLD` in `worlddata.js` holds coarse coastlines as
longitude/latitude pairs. `orthoPath()` projects them onto the sphere every frame
(dropping anything behind the limb) to drive the rotating globe; `equiPath()` projects
the same points equirectangularly for the flat atlas. Both run through a Catmull-Rom
smoother so the low-poly source does not look faceted at full-screen size.

**Lighting.** The sun sits directly behind the planet, so the disc is almost entirely
dark: a terminator gradient holds the face near black while the atmosphere burns
through at the limb. The halo is drawn as a complete ring first and the sunward
boost is layered additively on top, so the glow never terminates in a hard edge.
The flare over the limb is built from radial and linear gradients rather than a
blur — a large `feGaussianBlur` clips to its filter region and comes out square.

**The reveal.** On load the layers fade in on staggered delays, the globe eases down
from a slight overscale, the coastlines draw themselves in via `stroke-dashoffset`, and
the menu unfolds: each button starts stacked at the vertical centre with a
`transition-delay` of `|index − 3| × 85ms`, so MULTIPLAYER lands first and the rest
spread outward to TUTORIAL and QUIT.

**The ruler** drifts left and right on a spline-eased loop, with its own scanning
highlight and drifting pointer heads over the dark-green range blocks.

## Sound

`assets/audio/buttonclickrelease.wav` plays on click and
`assets/audio/buttonrollover.wav` on hover or keyboard focus. Each cue holds a small
pool of `Audio` elements so rapid clicks overlap instead of cutting each other off,
and navigation is deferred ~140ms so the click is heard before the page changes.

Browsers block audio until the first user gesture, so a rollover before the first
click may be silent — that is the autoplay policy, not a wiring fault. Change the
paths in the `SFX` object at the top of `js/main.js`, or the volumes in `initAudio()`.

## Hooking buttons up in code

As well as following `link`, every click dispatches a document-level event:

```js
document.addEventListener('menu:select', function (e) {
  console.log(e.detail.item, e.detail.link);   // 'CAMPAIGN', 'campaign.html'
});
```

Buttons are keyboard reachable: Tab to focus, Up/Down to move between them, Enter or
Space to activate.

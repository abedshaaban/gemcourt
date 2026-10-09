# Showcase video

Records and cuts a ~25-second promo video of Splendor: a title card, opening a table and filling the waiting room,
a mid-game turn on the 3D table (buy a card, rivals move, take gems), and an end card, with captions.
Everything is scripted, so you can record it again after the UI changes, or recut it without re-recording.

Outputs, in `out/`:

- `splendor-showcase.mp4`: 1920×1080, 30 fps, H.264 with a silent AAC track
- `splendor-showcase-1080x1350.mp4`: a 4:5 feed version (the same video centred over a blurred copy of itself)

## Prerequisites

- The repo's own dependencies (`pnpm install` at the repo root). The script starts its own `pnpm dev` server.
- **Node 20+** and this folder's dependencies (Playwright and `ws`), installed separately so the root
  `package.json` stays untouched:

  ```bash
  cd scripts/showcase-video
  npm install            # or: pnpm install --ignore-workspace
  ```

- **Google Chrome** installed. Recording uses the `chrome` channel because it renders the WebGL table on the real GPU
  (Metal on macOS). To use Playwright's bundled Chromium instead, run `npx playwright install chromium` and set
  `SHOWCASE_BROWSER=chromium`. It works, but the 3D table may render in software and drop frames.
- **ffmpeg** with libx264 and the `xfade` filter (ffmpeg 4.3+; tested with 8.0). `brew install ffmpeg`.
- **Python 3.8+** (standard library only) for the edit step.

## Commands

Run these from `scripts/showcase-video/`:

```bash
npm run video      # full pipeline: dev server on :3417 -> record -> edit -> stop server (~1.5 min)
npm run reedit     # re-render title/end cards + captions, then recut; no server, no gameplay re-recording (~30 s)
npm run edit       # recut only, from the existing clips and captions
npm run cards      # re-render only the title/end cards and caption overlays
npm run record     # dev server + record, without the edit step
```

`run.sh` takes extra flags, passed with `npm run video -- <flags>` or by calling `./run.sh` directly:

| Flag | Env var | Default | |
| --- | --- | --- | --- |
| `--port N` | `SHOWCASE_PORT` | `3417` | Dev-server port. **3000 is refused**, because that's the live game / `pnpm play`. |
| `--only lobby,game` | `ONLY` | `cards,lobby,game` | Re-record only some clips. The rest are kept. |
| `--mask-lan` | `SHOWCASE_MASK_LAN=1` | off | Blurs the waiting room's QR code and invite URLs. |
| `--keep-frames` | `SHOWCASE_KEEP_FRAMES=1` | off | Keeps the raw screencast JPEGs (hundreds of MB) in `.work/frames/`. |
| `--headed` | `SHOWCASE_HEADED=1` | off | Shows the browser while recording. |
| `--no-edit` | | | Records only. |
| | `SHOWCASE_WORK_DIR` | `.work` | Intermediate clips, captions and the dev-server log. |
| | `SHOWCASE_OUT_DIR` | `out` | Final videos. |
| | `SHOWCASE_FFMPEG` | `ffmpeg` | Path to the ffmpeg binary. |
| | `SHOWCASE_BROWSER` | `chrome` | Playwright channel, or `chromium` for the bundled browser. |

Relative paths are resolved from this folder, not from your shell's working directory. `edit.py` also takes
`--work-dir`, `--out-dir`, `--name`, `--ffmpeg` and `--no-feed` (see `python3 edit.py --help`).

The script refuses to start if the port is already busy. It runs `pnpm dev` (never `vite build`), so it can't
touch `dist/` or a running `pnpm play`. The server runs in its own process group and is stopped on exit,
including Ctrl-C and failures.

To record against a server you started yourself: `node record.mjs --port 4000`, or `--base-url http://host:port`.

## What to edit

| To change | Edit | Then run |
| --- | --- | --- |
| Caption text | `story.json` → `captions[].html` (`<i>…</i>` is the gold italic lead) | `npm run reedit` |
| When a caption shows | `story.json` → `captions[].segment`, `padIn`, `padOut` (seconds into or before the end of that segment) | `npm run edit` |
| Which part of each clip is used, playback speed, transitions | `story.json` → `segments[]`: `start`/`end` (seconds in the source clip), `speed` (1.2 = 20% faster), `transition` (any ffmpeg `xfade` name), `xfade` (overlap in seconds) | `npm run edit` |
| Title / end card wording and look | `card.html` (`mode === 'title'` / `'end'`). Caption pill styling is `.cap` | `npm run reedit` |
| Length of the title/end card recordings | `story.json` → `cardDurations` (ms) | `npm run reedit` |
| What happens on screen (clicks, camera moves, pauses, player names) | `record.mjs`: the `lobby` and `game` sections | `npm run video -- --only lobby,game` |
| Cursor and click-ripple look, camera easing | `lib.mjs` (`cursorScript`, `makeMouse`, `cam`) | re-record |
| Feed (4:5) framing | the `vf` filter at the end of `edit.py` | `npm run edit` |

To find good cut points, open `.work/clips/<clip>.events.json`. It lists the timestamp of each scripted moment
(`click-create`, `waiting`, `buy`, `take`, …) in that clip's timeline, which is the timeline `segments[].start/end` use.
The edit step prints each segment's position in the final video.

## How the recording works

- **Capture.** `lib.mjs` records each clip with Chrome's DevTools screencast (`Page.startScreencast`). Frames are
  stored with their real arrival time and encoded to a constant-30-fps, near-lossless (CRF 10) clip in `.work/clips/`.
  Because timing comes from wall-clock time, a slow frame looks like a pause instead of making the clip drift.
- **Camera and cursor.** The "camera" is a CSS transform on `<body>` (`cam()`). The cursor is a fake SVG pointer
  injected into the page, moved with eased, slightly arcing glides and a gold ripple on click. Playwright's real
  mouse drives it, so hovers and clicks are genuine.
- **Warm-up.** Before the takes, the script walks through create → join → waiting room once, off camera, so Vite has
  compiled the routes and lazy dependencies (such as the QR code). Otherwise a dependency-optimisation reload can land mid-take.
- **Scripted rivals (`bot.mjs`).** Karim and Lina are not browsers. They're small Node clients that speak the
  game's WebSocket protocol (`/ws?code=…`), `join` like a real player, and send `action` ops. `decide()` is a simple
  greedy player: buy the best affordable card, otherwise take the 3 gems that get closest to the most efficient
  market card, reserve occasionally, and handle discards and noble choice.
- **The game clip.** It starts a real 3-player game, then fast-forwards about 51 turns (Maya is driven through her
  own session token pulled from `sessionStorage`) until it's Maya's turn, a point-scoring card is affordable and the
  bank has 3+ colours. It reloads the page so no stale highlights remain. Only then does recording start. Because
  decks are shuffled and the bots use a little randomness, **each run shows a different board**.

## Known caveats

- **The waiting room shows this machine's LAN URL and its QR code.** Use `--mask-lan` to blur both (the room code
  stays readable). To re-record just the lobby with the mask and recut: `npm run video -- --only lobby --mask-lan`.
- Runs differ (see above), so after re-recording `lobby` or `game`, check the cut points in `story.json` against
  the new `events.json`. The scripted timing is steady to within ~0.2 s between runs, so the defaults usually still fit.
- `record.mjs` relies on the UI's accessible names and selectors (`Create game`, `Your name`, `Join waiting room`,
  `Start game`, `Buy card`, `Take gems`, `section[aria-label="Bank"]`, `button[data-card-id]`, `.sp-table`,
  `.share-qr`/`.share-hint`). Renaming any of these breaks the recording.
- Title, end and caption cards load Cinzel / Cormorant Garamond / Inter from Google Fonts, so `npm run cards`
  needs internet access.
- The game clip zooms to fit the page height measured at recording time. A big layout change may need new
  camera origins in `record.mjs`.
- Recording is GPU- and CPU-heavy. Close other heavy apps for smooth frames.

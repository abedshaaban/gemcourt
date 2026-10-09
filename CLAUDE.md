
Use an opus agent to do the work and then you will evaluate what they did.
Please note that other agents are currently working on other features at the same time.

Never run `pnpm build` / `vite build` while a preview server (`pnpm play`, port 3000) is running: it serves
`dist/` from disk and a rebuild breaks the live game. `pnpm build` now refuses when port 3000 is busy; to check
a change, use `pnpm dev --port <other>` or build to another folder (`vite build --outDir /tmp/splendor-dist`).

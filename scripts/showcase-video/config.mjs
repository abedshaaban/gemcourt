// Shared settings for the showcase-video scripts. Every path is resolved from this file, never from cwd.
// Precedence: CLI flag > environment variable > default.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(`--${name}`)
  if (i !== -1) return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true'
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : undefined
}
const truthy = (v) => v !== undefined && v !== '' && v !== '0' && v !== 'false'
const resolveDir = (p) => path.resolve(HERE, p)

export const PORT = Number(flag('port') ?? process.env.SHOWCASE_PORT ?? 3417)
// Port 3000 belongs to `pnpm play` / the real game; never record against (or start anything on) it.
if (PORT === 3000) {
  console.error('[showcase] Refusing port 3000: that is the live game / preview server. Pick another port (default 3417).')
  process.exit(1)
}
export const BASE = (flag('base-url') ?? process.env.SHOWCASE_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')

export const WORK_DIR = resolveDir(flag('work-dir') ?? process.env.SHOWCASE_WORK_DIR ?? '.work')
export const OUT_DIR = resolveDir(flag('out-dir') ?? process.env.SHOWCASE_OUT_DIR ?? 'out')
export const FRAMES_DIR = path.join(WORK_DIR, 'frames')
export const CLIPS_DIR = path.join(WORK_DIR, 'clips')
export const CAPS_DIR = path.join(WORK_DIR, 'caps')

export const FFMPEG = process.env.SHOWCASE_FFMPEG ?? 'ffmpeg'
// 'chrome' = installed Google Chrome (best GPU/WebGL path); 'chromium' = Playwright's bundled browser.
export const BROWSER = process.env.SHOWCASE_BROWSER ?? 'chrome'
export const HEADED = truthy(flag('headed') ?? process.env.SHOWCASE_HEADED)
export const MASK_LAN = truthy(flag('mask-lan') ?? process.env.SHOWCASE_MASK_LAN)
export const KEEP_FRAMES = truthy(flag('keep-frames') ?? process.env.SHOWCASE_KEEP_FRAMES)
export const ONLY = (flag('only') ?? process.env.ONLY ?? 'cards,lobby,game').split(',').map((s) => s.trim())

export const STORY = JSON.parse(fs.readFileSync(path.join(HERE, 'story.json'), 'utf8'))

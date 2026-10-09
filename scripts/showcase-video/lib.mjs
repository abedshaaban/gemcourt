import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { FFMPEG, FRAMES_DIR, CLIPS_DIR, KEEP_FRAMES } from './config.mjs'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// ffconcat paths are single-quoted; escape any quote in the work-dir path.
const quote = (p) => `'${p.replace(/'/g, "'\\''")}'`

/**
 * Screencast recorder: stores frames with wall-clock arrival time, encodes a CFR clip.
 * Output: <work>/clips/<name>.mp4 + <name>.events.json (timestamps of rec.mark() calls, for tuning story.json).
 * The raw JPEG frames (hundreds of MB) are deleted after encoding unless --keep-frames is set.
 */
export class Recorder {
  constructor(page, cdp, name) {
    this.page = page
    this.cdp = cdp
    this.name = name
    this.frames = []
    this.events = []
    this.handler = async (f) => {
      this.frames.push({ t: Date.now(), data: f.data })
      try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch {}
    }
  }
  async start() {
    this.cdp.on('Page.screencastFrame', this.handler)
    this.t0 = Date.now()
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, everyNthFrame: 1 })
    // nudge a repaint so the first frame arrives immediately
    await this.page.evaluate(() => { document.documentElement.style.outline = '0px solid transparent'; requestAnimationFrame(() => (document.documentElement.style.outline = '')) })
  }
  mark(label) {
    const t = (Date.now() - this.t0) / 1000
    this.events.push({ t, label })
    console.log(`[${this.name}] ${t.toFixed(2)}s ${label}`)
  }
  async stop() {
    const tEnd = Date.now()
    await this.cdp.send('Page.stopScreencast')
    this.cdp.off('Page.screencastFrame', this.handler)
    const dir = path.join(FRAMES_DIR, this.name)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const lines = ['ffconcat version 1.0']
    // first frame is shown from t0
    this.frames.forEach((f, i) => {
      const file = path.join(dir, `${String(i).padStart(5, '0')}.jpg`)
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'))
      const start = i === 0 ? this.t0 : f.t
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : tEnd
      lines.push(`file ${quote(file)}`, `duration ${Math.max(0.001, (next - start) / 1000).toFixed(4)}`)
    })
    lines.push(`file ${quote(path.join(dir, `${String(this.frames.length - 1).padStart(5, '0')}.jpg`))}`)
    fs.writeFileSync(`${dir}/list.txt`, lines.join('\n'))
    fs.mkdirSync(CLIPS_DIR, { recursive: true })
    const out = path.join(CLIPS_DIR, `${this.name}.mp4`)
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`,
      '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', out])
    if (!KEEP_FRAMES) fs.rmSync(dir, { recursive: true, force: true })
    fs.writeFileSync(path.join(CLIPS_DIR, `${this.name}.events.json`), JSON.stringify({ duration: (tEnd - this.t0) / 1000, frames: this.frames.length, events: this.events }, null, 1))
    console.log(`[${this.name}] ${this.frames.length} frames, ${((tEnd - this.t0) / 1000).toFixed(2)}s -> ${out}`)
    return out
  }
}

/** Fake cursor + click ripple, installed on every document; lives on <html> so body transforms don't move it. */
export const cursorScript = () => {
  const install = () => {
    if (document.getElementById('promo-cursor')) return
    const style = document.createElement('style')
    style.textContent = `
      #promo-cursor{position:fixed;left:0;top:0;width:30px;height:30px;pointer-events:none;z-index:2147483647;
        transform:translate(-200px,-200px);will-change:transform;filter:drop-shadow(0 3px 6px rgba(0,0,0,.55))}
      .promo-ripple{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;pointer-events:none;
        z-index:2147483646;border:2.5px solid rgba(240,200,110,.95);box-shadow:0 0 18px rgba(240,200,110,.6);
        animation:promo-rip .55s cubic-bezier(.2,.7,.3,1) forwards}
      @keyframes promo-rip{from{transform:scale(.3);opacity:1}to{transform:scale(1.25);opacity:0}}
      html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}
      html{scrollbar-width:none}`
    document.documentElement.appendChild(style)
    const c = document.createElement('div')
    c.id = 'promo-cursor'
    c.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4.5 2.5 L4.5 19.5 L9 15.3 L12 21.8 L15 20.4 L12.1 14.1 L18.3 14.1 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`
    document.documentElement.appendChild(c)
    window.addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 5}px,${e.clientY - 3}px)` }, true)
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      r.className = 'promo-ripple'
      r.style.left = e.clientX + 'px'
      r.style.top = e.clientY + 'px'
      document.documentElement.appendChild(r)
      setTimeout(() => r.remove(), 700)
    }, true)
  }
  if (document.documentElement) install()
  document.addEventListener('DOMContentLoaded', install)
}

export function makeMouse(page) {
  let pos = { x: 1700, y: 1000 }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
  return {
    async place(x, y) { pos = { x, y }; await page.mouse.move(x, y) },
    async glide(x, y, ms = 650) {
      const from = { ...pos }
      const steps = Math.max(8, Math.round(ms / 16))
      // slight arc for a natural hand movement
      const dx = x - from.x, dy = y - from.y
      const nx = -dy * 0.08, ny = dx * 0.08
      for (let i = 1; i <= steps; i++) {
        const t = ease(i / steps)
        const arc = Math.sin(Math.PI * t)
        await page.mouse.move(from.x + dx * t + nx * arc, from.y + dy * t + ny * arc)
        await sleep(16)
      }
      pos = { x, y }
    },
    async click() { await page.mouse.down(); await sleep(70); await page.mouse.up() },
    async to(locator, ms, dx = 0.5, dy = 0.5) {
      const b = await locator.boundingBox()
      if (!b) throw new Error('no box')
      await this.glide(b.x + b.width * dx, b.y + b.height * dy, ms)
    },
    async clickOn(locator, ms = 650) { await this.to(locator, ms); await sleep(120); await this.click() },
  }
}

/** Animate the whole page like a camera (CSS transform on <body>, sub-pixel smooth). */
export async function cam(page, { scale = 1, x = 0, y = 0, origin = '50% 0%', ms = 0 }) {
  await page.evaluate(({ scale, x, y, origin, ms }) => {
    const b = document.body
    b.style.transformOrigin = origin
    b.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,.05,.3,1)` : 'none'
    b.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    document.documentElement.style.overflow = 'hidden'
  }, { scale, x, y, origin, ms })
}

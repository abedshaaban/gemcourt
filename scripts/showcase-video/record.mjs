// Records the raw clips for the showcase video:
//   cards  title + end cards and caption overlays (card.html, no game server needed)
//   lobby  home -> Create game -> name -> waiting room fills with Karim & Lina -> Start
//   game   a fast-forwarded mid-game: Maya buys a card, rivals move, Maya takes gems
// Usage: node record.mjs [--only cards,lobby,game] [--port 3417] [--mask-lan] [--keep-frames] [--headed]
// lobby/game need the dev server running on --port (run.sh starts one for you).
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Bot, decide, cheapestNeed } from './bot.mjs'
import { Recorder, cursorScript, makeMouse, cam, sleep } from './lib.mjs'
import { BASE, BROWSER, HEADED, HERE, MASK_LAN, ONLY, CAPS_DIR, STORY } from './config.mjs'

const GEM_NAME = { white: 'Diamond', blue: 'Sapphire', green: 'Emerald', red: 'Ruby', black: 'Onyx', gold: 'Gold' }
const CARD_URL = pathToFileURL(path.join(HERE, 'card.html')).href
const needsServer = ONLY.includes('lobby') || ONLY.includes('game')

if (needsServer) {
  try {
    const r = await fetch(BASE)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
  } catch (e) {
    console.error(`[showcase] No Gemcourt server at ${BASE} (${e.message}). Start one with run.sh, or pass --port.`)
    process.exit(1)
  }
}

// Metal ANGLE gives the 3D table a real GPU path on macOS; elsewhere let Chrome pick.
const gpuArgs = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-gpu', '--ignore-gpu-blocklist']
const browser = await chromium.launch({
  ...(BROWSER === 'chromium' ? {} : { channel: BROWSER }),
  headless: !HEADED,
  args: [...gpuArgs, '--hide-scrollbars'],
})

// Blurs the waiting room's QR code and invite URLs (they contain this machine's LAN IP).
const maskLanScript = () => {
  const add = () => {
    if (document.getElementById('promo-mask')) return
    const s = document.createElement('style')
    s.id = 'promo-mask'
    s.textContent = '.share-qr{filter:blur(7px) !important}.share-hint code{filter:blur(6px) !important}'
    document.documentElement.appendChild(s)
  }
  if (document.documentElement) add()
  document.addEventListener('DOMContentLoaded', add)
}

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => { try { localStorage.setItem('gemcourt-tutorial-done', '1'); localStorage.removeItem('gemcourt:name') } catch {} })
  await ctx.addInitScript(cursorScript)
  if (MASK_LAN) await ctx.addInitScript(maskLanScript)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, cdp }
}

// ---------------- title / end cards + captions ----------------
if (ONLY.includes('cards')) {
  const { page, cdp } = await newPage()
  for (const mode of ['title', 'end']) {
    await page.goto(`${CARD_URL}?mode=${mode}`)
    await page.waitForFunction(() => window.__ready)
    await page.evaluate(() => document.getElementById('promo-cursor')?.remove())
    await sleep(300)
    const rec = new Recorder(page, cdp, mode)
    await rec.start()
    await page.evaluate(() => window.go())
    await sleep(STORY.cardDurations[mode])
    await rec.stop()
  }
  fs.rmSync(CAPS_DIR, { recursive: true, force: true })
  fs.mkdirSync(CAPS_DIR, { recursive: true })
  for (const { id, html } of STORY.captions) {
    await page.goto(`${CARD_URL}?mode=cap&text=${encodeURIComponent(html)}`)
    await page.waitForFunction(() => window.__ready)
    await page.evaluate(() => document.getElementById('promo-cursor')?.remove())
    await page.screenshot({ path: path.join(CAPS_DIR, `${id}.png`), omitBackground: true })
  }
  console.log(`[cards] ${STORY.captions.length} captions -> ${CAPS_DIR}`)
  await page.context().close()
}

// Vite dev compiles routes and optimizes lazy deps (e.g. the waiting room's QR code) on first visit, and may
// force a full reload while doing so. Walk the flow once off-camera so the recorded takes hit a warm server.
if (needsServer) {
  const { page } = await newPage()
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Create game' }).click()
  await page.waitForURL(/\/room\//)
  await page.getByLabel('Your name').fill('Warmup')
  await page.getByRole('button', { name: 'Join waiting room' }).click()
  await page.getByText('Waiting room', { exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  await sleep(1500)
  await page.context().close()
  console.log('[warmup] dev server warmed')
}

// ---------------- lobby: home -> create -> name -> waiting room fills ----------------
if (ONLY.includes('lobby')) {
  const { page, cdp } = await newPage()
  const m = makeMouse(page)
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  await sleep(1200)
  const HOME = '960px 560px'
  await cam(page, { scale: 1.36, origin: HOME })
  await m.place(1500, 950)
  const rec = new Recorder(page, cdp, 'lobby')
  await rec.start()
  await cam(page, { scale: 1.42, origin: HOME, ms: 3000 })
  await sleep(400)
  const create = page.getByRole('button', { name: 'Create game' })
  await m.to(create, 900)
  await sleep(250)
  rec.mark('click-create')
  await m.click()
  await page.waitForURL(/\/room\//)
  await cam(page, { scale: 1.4, origin: HOME })
  const code = page.url().split('/room/')[1]
  await page.getByLabel('Your name').waitFor()
  rec.mark('joinform')
  await sleep(350)
  await page.keyboard.type('Maya', { delay: 110 })
  await sleep(250)
  await m.clickOn(page.getByRole('button', { name: 'Join waiting room' }), 700)
  rec.mark('click-join')
  await page.getByText('Waiting room', { exact: true }).waitFor()
  rec.mark('waiting')
  await cam(page, { scale: 1.2, x: 0, y: -30, origin: '960px 0px' })
  await m.glide(1500, 700, 600)
  await sleep(500)
  const bots = []
  for (const name of ['Karim', 'Lina']) {
    const b = new Bot(BASE, code, name)
    await b.connect(); await b.join(); bots.push(b)
    rec.mark(`joined-${name}`)
    await sleep(850)
  }
  await cam(page, { scale: 1.2, x: 0, y: -175, origin: '960px 0px', ms: 1100 })
  await sleep(1150)
  const start = page.getByRole('button', { name: /Start game/ })
  await m.to(start, 650)
  await sleep(200)
  rec.mark('click-start')
  await m.click()
  await sleep(500)
  await rec.stop()
  bots.forEach((b) => b.close())
  await page.context().close()
}

// ---------------- game: prepared mid-game, Maya buys a card and takes gems ----------------
if (ONLY.includes('game')) {
  const { page, cdp } = await newPage()
  const m = makeMouse(page)
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Create game' }).click()
  await page.waitForURL(/\/room\//)
  const code = page.url().split('/room/')[1]
  await page.getByLabel('Your name').fill('Maya')
  await page.getByRole('button', { name: 'Join waiting room' }).click()
  await page.getByText('Waiting room', { exact: true }).waitFor()
  const bots = [new Bot(BASE, code, 'Karim'), new Bot(BASE, code, 'Lina')]
  for (const b of bots) { await b.connect(); await b.join() }
  await sleep(500)
  await page.getByRole('button', { name: /Start game/ }).click()
  await sleep(1500)
  const ss = JSON.parse(await page.evaluate(() => JSON.stringify(sessionStorage)))
  const hs = JSON.parse(ss[`gemcourt:session:${code}`])
  const host = new Bot(BASE, code, 'Maya')
  await host.connect(hs.token)
  host.token = hs.token; host.id = hs.playerId
  const all = [host, ...bots]
  const g = () => host.view.game
  const cur = () => g().players[g().currentPlayerIndex]
  const meP = () => g().players.find((p) => p.id === host.id)
  const goodBuy = () => {
    const p = meP()
    for (const tier of [3, 2, 1]) for (const [index, card] of g().market[tier].entries()) {
      if (card && card.points >= 1 && cheapestNeed(card, p).short <= p.tokens.gold) return { card, tier, index }
    }
    return null
  }
  async function botTurn(b) {
    const gg = b.view.game
    const p = gg.players.find((x) => x.id === b.id)
    const before = JSON.stringify([host.view.game.turn, host.view.game.phase, host.view.game.currentPlayerIndex])
    const r = await b.act(decide(gg, p))
    if (!r.ok) console.log('bot fail', b.name, r.error)
    for (let i = 0; i < 100; i++) {
      const v = [host.view.game.turn, host.view.game.phase, host.view.game.currentPlayerIndex]
      const bv = b.view.game
      if (JSON.stringify(v) !== before && bv.turn === v[0] && all.every((x) => x.view.game.turn === v[0])) break
      await sleep(20)
    }
    await sleep(60)
  }
  // fast-forward
  let turns = 0
  while (turns < 120) {
    const c = cur()
    if (c.id === host.id && turns >= 51 && g().phase === 'action' && goodBuy() && GEM_COLORS().filter((x) => g().bank[x] > 0).length >= 3) break
    await botTurn(all.find((b) => b.id === c.id))
    turns++
  }
  function GEM_COLORS() { return ['white', 'blue', 'green', 'red', 'black'] }
  console.log('ff turns', turns, g().players.map((p) => `${p.name} ${p.points}pts ${p.cards.length}c ${p.tokenCount}t`).join(' | '))
  // reload so no stale "fresh" highlights/toasts remain, then let it settle
  await page.reload()
  await page.waitForSelector('.sp-table')
  await sleep(3500)
  const docH = await page.evaluate(() => document.documentElement.scrollHeight)
  const fit = Math.min(1, 1080 / docH)
  console.log('docH', docH, 'fit', fit)
  await cam(page, { scale: fit, origin: '50% 0%' })
  await m.place(1650, 980)
  await sleep(600)

  const rec = new Recorder(page, cdp, 'game')
  await rec.start()
  rec.mark('overview')
  await sleep(900)
  // push in on the table
  await cam(page, { scale: 1.17, origin: '770px 515px', ms: 2200 })
  await sleep(2300)
  rec.mark('zoomed')
  // Maya buys a card
  const buy = goodBuy()
  const cardBtn = page.locator(`button[data-card-id="${buy.card.id}"]`)
  await m.clickOn(cardBtn, 800)
  rec.mark('card-click')
  const buyBtn = page.getByRole('button', { name: 'Buy card' })
  await buyBtn.waitFor()
  await sleep(650)
  await m.clickOn(buyBtn, 600)
  rec.mark('buy')
  await sleep(1900)
  // rivals play
  for (let i = 0; i < 2; i++) {
    const b = all.find((x) => x.id === cur().id)
    if (b === host) break
    await botTurn(b)
    rec.mark(`rival-${b.name}`)
    await sleep(1050)
  }
  // Maya takes gems through the bank
  while (cur().id === host.id && g().phase !== 'action') { await botTurn(host) }
  if (cur().id === host.id) {
    const act = decide(g(), meP(), { noBuy: true })
    console.log('host second action', JSON.stringify(act))
    if (act.type === 'takeDifferent') {
      for (const c of act.colors) {
        await m.clickOn(page.locator(`section[aria-label="Bank"] button[aria-label^="${GEM_NAME[c]}:"]`), 480)
        rec.mark('pick-' + c)
        await sleep(220)
      }
      rec.mark('gems-picked')
      await sleep(350)
      await m.clickOn(page.getByRole('button', { name: 'Take gems' }), 650)
      rec.mark('take')
      await sleep(1700)
    }
  }
  while (cur().id === host.id && g().phase !== 'action') { await botTurn(host); await sleep(400) }
  // pull back to show rivals & chronicle
  await m.glide(1880, 1060, 500)
  await cam(page, { scale: fit, origin: '50% 0%', ms: 2000 })
  const b = all.find((x) => x.id === cur().id)
  if (b !== host) { await sleep(900); await botTurn(b); rec.mark(`rival-${b.name}`) }
  await sleep(2000)
  rec.mark('end')
  await rec.stop()
  all.forEach((x) => x.close())
}

await browser.close()

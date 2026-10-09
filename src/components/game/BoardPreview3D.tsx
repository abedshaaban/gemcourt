import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GEM_COLORS, TOKEN_COLORS } from '../../game/types'
import type { Card, GemColor, Noble, PublicGameState, Tier, TokenColor } from '../../game/types'
import { CardArt } from './CardArt'
import { GEM_NAME, ROMAN } from './ui'
import { TOKEN_COLOR as COLORS, TOKEN_SYMBOL_COLOR } from './tokenColors'
import gemShapes from './gemShapes.json'

const TIERS: Tier[] = [3, 2, 1]
const SURFACE = .36

type Props = {
  state: PublicGameState
  selection: GemColor[]
  returnSelectionRevision: number
  affordableCardIds: string[]
  canPick: boolean
  canInspect: boolean
  onPick: (color: TokenColor) => void
  onCard: (tier: Tier, index: number, card: Card) => void
  onDeck: (tier: Tier) => void
  onUnpick: (index: number) => void
  onUnavailable: () => void
}
type Piece = { id: string; label: string; action: () => void; object: THREE.Object3D }

function roundedCardFace() {
  const x = -.59, y = -.834, w = 1.18, h = 1.668, r = .055
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r)
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r)
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y)
  const geometry = new THREE.ShapeGeometry(shape, 3)
  const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv')
  for (let i = 0; i < positions.count; i++) uv.setXY(i, (positions.getX(i) - x) / w, (positions.getY(i) - y) / h)
  return geometry
}

function disposeObjects(root: THREE.Object3D, disposeGeometry = true) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (disposeGeometry) geometries.add(object.geometry)
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(mat)
      const map = (mat as THREE.MeshStandardMaterial).map
      if (map) textures.add(map)
    }
  })
  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => m.dispose())
  textures.forEach((t) => t.dispose())
}

function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function gemPath(ctx: CanvasRenderingContext2D, color: TokenColor, x: number, y: number, radius: number) {
  ctx.beginPath()
  gemShapes[color].forEach(([px, py], index) => {
    if (index === 0) ctx.moveTo(x + px * radius, y + py * radius)
    else ctx.lineTo(x + px * radius, y + py * radius)
  })
  ctx.closePath()
}

function cardFace(card: Card | Noble | null, tier: Tier, count: number, invalidate: () => void, alive: () => boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 358
  const ctx = canvas.getContext('2d')!
  const texture = canvasTexture(canvas)
  const noble = card && 'requirement' in card
  const color = card && 'bonus' in card ? card.bonus : 'gold'
  const overlay = () => {
    if (!card) return
    // Same hierarchy as DevCard: points / gem bonus above the artwork, costs down the left.
    const header = ctx.createLinearGradient(0, 0, 0, 98)
    header.addColorStop(0, '#101827b0'); header.addColorStop(1, '#10182730')
    ctx.fillStyle = header; ctx.fillRect(0, 0, 256, 98)
    ctx.fillStyle = '#fffaf0'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.font = 'bold 62px Georgia'
    if (card.points > 0) ctx.fillText(String(card.points), 23, 49)
    if (!noble) {
      gemPath(ctx, color, 214, 49, 26)
      ctx.fillStyle = COLORS[color]; ctx.fill()
      ctx.strokeStyle = '#ffffffb0'; ctx.lineWidth = 3; ctx.stroke()
      ctx.beginPath()
      gemShapes[color].forEach(([px, py]) => {
        ctx.moveTo(214 + px * 26, 49 + py * 26)
        ctx.lineTo(214 + px * 26 * .46, 49 + py * 26 * .46)
      })
      ctx.lineWidth = 1.4; ctx.stroke()
      gemPath(ctx, color, 214, 49, 26 * .46); ctx.stroke()
    }
    const costs = noble ? card.requirement : (card as Card).cost
    const colors = GEM_COLORS.filter((c) => costs[c] > 0)
    colors.forEach((c, index) => {
      const x = noble ? 36 + index * 48 : 38
      const y = noble ? 321 : 320 - (colors.length - 1 - index) * 44
      ctx.beginPath()
      if (noble) ctx.roundRect(x - 17, y - 21, 34, 42, 4)
      else ctx.arc(x, y, 18, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[c]; ctx.fill()
      ctx.strokeStyle = '#ffffffb0'; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = c === 'white' ? '#17251e' : '#ffffff'
      ctx.font = 'bold 23px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(costs[c]), x, y + 1)
    })
    if (!noble) {
      ctx.fillStyle = '#f3deae'; ctx.textAlign = 'right'; ctx.font = 'bold 19px Georgia'
      ctx.fillText(ROMAN[tier], 235, 329)
    }
    // Slight paper grain is drawn into the existing face; it adds no downloaded texture.
    let seed = 41 + tier * 17
    for (let i = 0; i < 1400; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const x = seed % 256
      seed = (seed * 1664525 + 1013904223) >>> 0
      ctx.fillStyle = i % 2 ? '#fff8e909' : '#2133290a'
      ctx.fillRect(x, seed % 358, 1, 1)
    }
    ctx.strokeStyle = '#eee4ca80'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(4, 4, 248, 350, 12); ctx.stroke()
  }
  ctx.fillStyle = '#182539'; ctx.fillRect(0, 0, 256, 358)
  if (!card) {
    const background = ctx.createLinearGradient(0, 0, 256, 358)
    background.addColorStop(0, ['#34634c', '#80632f', '#364e7a'][tier - 1])
    background.addColorStop(1, '#121b28')
    ctx.fillStyle = background; ctx.fillRect(0, 0, 256, 358)
    ctx.strokeStyle = '#c8a66a90'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(16, 16, 224, 326, 13); ctx.stroke()
    // Engraver's diamond and botanical sprigs, printed on the card back.
    ctx.strokeStyle = '#e9d6a645'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(128, 57); ctx.lineTo(207, 171); ctx.lineTo(128, 284)
    ctx.lineTo(49, 171); ctx.closePath(); ctx.stroke()
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(128 + side * 73, 247)
      ctx.quadraticCurveTo(128 + side * 103, 181, 128 + side * 71, 98); ctx.stroke()
      for (let i = 0; i < 7; i++) {
        const y = 116 + i * 17, x = 128 + side * (78 + Math.sin(i / 6 * Math.PI) * 11)
        ctx.beginPath(); ctx.ellipse(x, y, 10, 3, side * -.7, 0, Math.PI * 2)
        ctx.fillStyle = '#e9d6a638'; ctx.fill()
      }
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#e9d6a6'
    ctx.font = 'bold 82px Georgia'; ctx.fillText(ROMAN[tier], 128, 204)
    ctx.font = '22px Georgia'; ctx.fillText('SPLENDOR', 128, 252)
    ctx.fillStyle = '#111a29e0'; ctx.fillRect(88, 294, 80, 41)
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(String(count), 128, 324)
  } else if (noble) {
    ctx.fillStyle = '#2e5649'
    ctx.beginPath(); ctx.roundRect(44, 91, 168, 200, [84, 84, 12, 12]); ctx.fill()
    ctx.strokeStyle = '#d5bf8a'; ctx.lineWidth = 3; ctx.stroke()
    ctx.fillStyle = '#c6aa80'; ctx.beginPath(); ctx.ellipse(130, 165, 30, 40, -.13, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#27372f'; ctx.beginPath(); ctx.ellipse(127, 132, 37, 18, -.13, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#6b473e'; ctx.beginPath(); ctx.moveTo(69, 280)
    ctx.quadraticCurveTo(73, 217, 118, 210); ctx.lineTo(140, 210)
    ctx.quadraticCurveTo(184, 214, 192, 280); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#e8d6b5'; ctx.beginPath(); ctx.moveTo(106, 210); ctx.lineTo(129, 243)
    ctx.lineTo(152, 210); ctx.lineTo(139, 207); ctx.lineTo(129, 225); ctx.lineTo(116, 207); ctx.fill()
    ctx.strokeStyle = '#d0b77d'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(128, 245); ctx.lineTo(128, 280); ctx.stroke()
    overlay()
  } else {
    overlay()
    const img = new Image()
    img.onload = () => {
      if (!alive()) return
      ctx.drawImage(img, 0, 0, 256, 358)
      overlay(); texture.needsUpdate = true; invalidate()
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderToStaticMarkup(
      <CardArt color={(card as Card).bonus} tier={tier} cardId={card.id} />,
    ).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="358" '))}`
  }
  texture.needsUpdate = true
  return texture
}

/** One shared, movable table: Blender meshes, live game state, and native keyboard actions. */
export function BoardPreview3D(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const updateRef = useRef(() => {})
  const cameraRef = useRef<(top: boolean) => void>(() => {})
  const focusRef = useRef<(id: string | null) => void>(() => {})
  const [ready, setReady] = useState(false)
  const [hoverLabel, setHoverLabel] = useState('')

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current
    if (!host || !canvas) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }) }
    catch { propsRef.current.onUnavailable(); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const scene = new THREE.Scene()
    const studio = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(studio, .04)
    scene.environment = environment.texture
    scene.environmentIntensity = .65
    studio.dispose(); pmrem.dispose()
    const content = new THREE.Group(); scene.add(content)
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100)
    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.minDistance = 12; controls.maxDistance = 28
    controls.minPolarAngle = .06; controls.maxPolarAngle = Math.PI / 2.6
    controls.minAzimuthAngle = -.65; controls.maxAzimuthAngle = .65
    controls.target.set(0, .3, 0)
    scene.add(new THREE.HemisphereLight(0xffefd5, 0x263656, 1.4))
    const key = new THREE.DirectionalLight(0xffe5bb, 2)
    key.position.set(-4, 12, 5); key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, near: 1, far: 30 })
    key.shadow.bias = -.0005; key.shadow.normalBias = .035
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xaecaff, 1.3)
    fill.position.set(7, 6, -5); scene.add(fill)

    let disposed = false, frame = 0
    let templates: { board: THREE.Object3D; token: THREE.Object3D; card: THREE.Object3D } | null = null
    let pieces: Piece[] = [], hovered: Piece | null = null
    const retained = new Map<string, { signature: string; object: THREE.Object3D }>()
    let lastSelection: GemColor[] = []
    let lastReturnSelectionRevision = propsRef.current.returnSelectionRevision
    let lastBank = propsRef.current.state.bank
    let removedIndex: number | null = null
    const transit = new THREE.Group(); scene.add(transit)
    type ReturningCoin = { color: GemColor; object: THREE.Object3D; from: THREE.Vector3; destination: THREE.Vector3; startedAt: number; landing: THREE.Object3D | null }
    const returning: ReturningCoin[] = []
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const render = (now: number) => {
      frame = 0
      if (disposed) return
      let moving = false
      for (const piece of pieces) {
        const destination = piece.object.userData.destination as THREE.Vector3 | undefined
        const flight = piece.object.userData.flight as { from: THREE.Vector3; startedAt: number } | undefined
        let lift = 0
        if (destination && flight) {
          const progress = reduceMotion.matches ? 1 : Math.min(1, (now - flight.startedAt) / 420)
          const eased = 1 - (1 - progress) ** 3
          piece.object.position.x = THREE.MathUtils.lerp(flight.from.x, destination.x, eased)
          piece.object.position.z = THREE.MathUtils.lerp(flight.from.z, destination.z, eased)
          lift = Math.sin(progress * Math.PI) * .45
          if (progress === 1) delete piece.object.userData.flight
          else moving = true
        }
        const target = piece.object.userData.baseY + (piece === hovered ? .12 : 0) + lift
        const delta = target - piece.object.position.y
        if (Math.abs(delta) > .001) {
          piece.object.position.y = reduceMotion.matches ? target : piece.object.position.y + delta * .3
          moving ||= !reduceMotion.matches
        }
      }
      for (let i = returning.length - 1; i >= 0; i--) {
        const flight = returning[i]
        const progress = reduceMotion.matches ? 1 : Math.min(1, (now - flight.startedAt) / 420)
        const eased = 1 - (1 - progress) ** 3
        flight.object.position.lerpVectors(flight.from, flight.destination, eased)
        flight.object.position.y += Math.sin(progress * Math.PI) * .45
        if (progress === 1) {
          if (flight.landing) flight.landing.visible = true
          transit.remove(flight.object); disposeObjects(flight.object, false)
          returning.splice(i, 1)
        } else moving = true
      }
      renderer.render(scene, camera)
      if (moving) invalidate()
    }
    const invalidate = () => { if (!disposed && !frame) frame = requestAnimationFrame(render) }
    controls.addEventListener('change', invalidate)
    const fitDistance = () => Math.max(15.5, 17.2 / (2 * Math.tan(THREE.MathUtils.degToRad(19)) * (host.clientWidth / Math.max(1, host.clientHeight))))
    let lastFit = fitDistance()
    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height; camera.updateProjectionMatrix(); invalidate()
      const nextFit = fitDistance()
      camera.position.sub(controls.target).multiplyScalar(nextFit / lastFit).add(controls.target)
      lastFit = nextFit
      controls.update()
    }
    cameraRef.current = (top) => {
      controls.target.set(0, .3, 0)
      const distance = fitDistance()
      camera.position.set(0, top ? distance : distance * .78, top ? .8 : distance * .62)
      controls.update(); invalidate()
    }
    cameraRef.current(false)
    const observer = new ResizeObserver(resize); observer.observe(host); resize()

    const setHover = (piece: Piece | null) => {
      if (piece === hovered) return
      hovered = piece; canvas.style.cursor = piece ? 'pointer' : 'grab'
      setHoverLabel(piece?.label ?? ''); invalidate()
    }
    focusRef.current = (id) => setHover(pieces.find((p) => p.id === id) ?? null)
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2()
    const hit = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(pieces.map((p) => p.object), true)
      return hits.length ? pieces.find((p) => {
        let node: THREE.Object3D | null = hits[0].object
        while (node) { if (node === p.object) return true; node = node.parent }
        return false
      }) ?? null : null
    }
    let down: { x: number; y: number; id: number } | null = null, dragging = false
    const pointerDown = (event: PointerEvent) => {
      if (down) dragging = true
      else { down = { x: event.clientX, y: event.clientY, id: event.pointerId }; dragging = false }
    }
    const pointerMove = (event: PointerEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) dragging = true
      if (!down) setHover(hit(event))
    }
    const pointerUp = (event: PointerEvent) => {
      if (down?.id === event.pointerId && !dragging && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6) hit(event)?.action()
      down = null
    }
    const pointerLeave = () => setHover(null)
    const pointerCancel = () => { down = null; dragging = false }
    const contextLost = (event: Event) => { event.preventDefault(); propsRef.current.onUnavailable() }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointerleave', pointerLeave)
    canvas.addEventListener('pointercancel', pointerCancel)
    canvas.addEventListener('webglcontextlost', contextLost)

    const rebuild = () => {
      if (!templates || disposed) return
      const { state, selection } = propsRef.current
      // Keep deselected coins alive across the scene rebuild so they can fly home.
      // Only an explicit return animates. Bank and selection snapshots can arrive
      // in either order after a confirmed take, so bank equality alone is insufficient.
      const bankUnchanged = TOKEN_COLORS.every((color) => state.bank[color] === lastBank[color])
      if (propsRef.current.returnSelectionRevision !== lastReturnSelectionRevision && selection.length < lastSelection.length && bankUnchanged && !reduceMotion.matches) {
        let next = 0
        lastSelection.forEach((color, index) => {
          const explicitlyRemoved = removedIndex === index
          if (!explicitlyRemoved && color === selection[next]) { next++; return }
          const object = pieces.find((piece) => piece.id === `selected-${index}`)?.object
          if (!object) return
          transit.add(object)
          returning.push({ color, object, from: object.position.clone(), destination: object.position.clone(), startedAt: performance.now(), landing: null })
        })
      }
      if (!bankUnchanged) {
        returning.forEach(({ object }) => { transit.remove(object); disposeObjects(object, false) })
        returning.length = 0
      }
      removedIndex = null
      lastBank = state.bank
      const previousHoveredObject = hovered?.object
      // Only tray coins are transient. Card artwork and unchanged piles stay resident.
      pieces.filter((piece) => piece.id.startsWith('selected-')).forEach(({ object }) => {
        if (object.parent === content) { content.remove(object); disposeObjects(object, false) }
      })
      pieces = []
      const seen = new Set<string>()
      const keep = (key: string, signature: string, create: () => THREE.Object3D) => {
        seen.add(key)
        let entry = retained.get(key)
        if (entry?.signature !== signature) {
          if (entry) { content.remove(entry.object); disposeObjects(entry.object, false) }
          entry = { signature, object: create() }
          retained.set(key, entry); content.add(entry.object)
        }
        return entry.object
      }
      const addPiece = (id: string, label: string, object: THREE.Object3D, action: () => void) => {
        object.userData.baseY ??= object.position.y
        pieces.push({ id, label, object, action }); content.add(object)
      }
      const cardModel = (card: Card | Noble | null, tier: Tier, count: number) => {
        const group = new THREE.Group()
        const stock = templates!.card.clone(true)
        stock.traverse((obj) => {
          if (obj instanceof THREE.Mesh) { obj.material = (obj.material as THREE.Material).clone(); obj.castShadow = true }
        })
        group.add(stock)
        const face = new THREE.Mesh(faceGeometry, new THREE.MeshBasicMaterial({
          map: cardFace(card, tier, count, invalidate, () => !disposed && group.parent !== null), toneMapped: false,
        }))
        face.rotation.x = -Math.PI / 2; face.position.y = .0148
        group.add(face)
        return group
      }
      TIERS.forEach((tier, row) => {
        const z = -1.65 + row * 1.86
        const deck = keep(`deck-${tier}`, String(state.deckCounts[tier]), () => {
          const model = cardModel(null, tier, state.deckCounts[tier])
          model.position.set(-4.9, SURFACE + .11, z)
          model.rotation.y = -.018 + row * .013
          // Real card stock underneath the face-up deck gives it a tactile edge.
          for (let layer = 0; layer < Math.min(3, Math.ceil(state.deckCounts[tier] / 12)); layer++) {
            const stock = templates!.card.clone(true)
            stock.position.y = -.028 * (layer + 1)
            stock.traverse((obj) => { if (obj instanceof THREE.Mesh) obj.material = (obj.material as THREE.Material).clone() })
            model.add(stock)
          }
          return model
        })
        addPiece(`deck-${tier}`, `Tier ${ROMAN[tier]} deck · ${state.deckCounts[tier]} cards`, deck, () => {
          if (propsRef.current.canPick && propsRef.current.state.deckCounts[tier] > 0) propsRef.current.onDeck(tier)
        })
        state.market[tier].forEach((card, index) => {
          if (!card) return
          const model = keep(`market-${tier}-${index}`, JSON.stringify(card), () => {
            const model = cardModel(card, tier, 0)
            model.position.set(-3.4 + index * 1.5, SURFACE + .017, z)
            model.rotation.y = Math.sin((row * 4 + index) * 2.3) * .024
            const marker = new THREE.Group()
            marker.name = 'can-buy-marker'
            marker.position.set(.54, .024, -.75)
            const rim = new THREE.Mesh(affordableGeometry, new THREE.MeshBasicMaterial({ color: '#fffaf0', toneMapped: false }))
            rim.rotation.x = -Math.PI / 2
            const dot = new THREE.Mesh(affordableGeometry, new THREE.MeshBasicMaterial({ color: '#34d67b', toneMapped: false }))
            dot.rotation.x = -Math.PI / 2; dot.scale.setScalar(.7); dot.position.y = .001
            marker.add(rim, dot); model.add(marker)
            return model
          })
          const affordable = propsRef.current.affordableCardIds.includes(card.id)
          model.getObjectByName('can-buy-marker')!.visible = affordable
          addPiece(card.id, `Tier ${ROMAN[tier]} · ${GEM_NAME[card.bonus]} · ${card.points} prestige${affordable ? ' · affordable' : ''}`, model, () => {
            const current = propsRef.current
            const latest = current.state.market[tier][index]
            if (current.canInspect && latest) current.onCard(tier, index, latest)
          })
        })
      })
      state.nobles.forEach((noble, index) => {
        keep(`noble-${noble.id}`, JSON.stringify([noble, index, state.nobles.length]), () => {
          const model = cardModel(noble, 3, 0)
          model.scale.setScalar(.68)
          model.position.set((index - (state.nobles.length - 1) / 2) * 1.12 - .7, SURFACE + .017, -3.35)
          return model
        })
      })
      const coin = (color: TokenColor) => {
        const model = templates!.token.getObjectByName(`GEO-token_${color}`)!.clone(true)
        model.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          const clones = mats.map((source) => {
            const mat = source.clone() as THREE.MeshStandardMaterial
            if (mat.name === 'MAT-token') mat.color.set(COLORS[color])
            if (mat.name === 'MAT-gem') mat.color.set(TOKEN_SYMBOL_COLOR(color))
            return mat
          })
          obj.material = Array.isArray(obj.material) ? clones : clones[0]
        })
        return model
      }
      TOKEN_COLORS.forEach((color, index) => {
        const picked = selection.filter((c) => c === color).length
        const count = Math.max(0, state.bank[color] - picked)
        const x = 3.7 + index % 2 * 1.36, z = -1.95 + Math.floor(index / 2) * 1.85
        const layers = Math.min(5, count)
        const stack = keep(`bank-${color}`, JSON.stringify([count, picked]), () => {
          const stack = new THREE.Group()
          stack.position.set(x, SURFACE, z)
          for (let layer = 0; layer < layers; layer++) {
            const model = coin(color)
            model.position.set(Math.sin(layer * 2.1 + index) * .015, .072 + layer * .145, Math.cos(layer * 1.7 + index) * .012)
            model.rotation.y = index * .21 + layer * .15
            stack.add(model)
          }
          // A thin hit disc also makes an empty pile inspectable.
          const base = new THREE.Mesh(discGeometry, new THREE.MeshStandardMaterial({ color: COLORS[color], roughness: .9 }))
          base.rotation.x = -Math.PI / 2; base.position.y = .008; base.visible = count === 0; stack.add(base)
          const labelCanvas = document.createElement('canvas'); labelCanvas.width = 256; labelCanvas.height = 64
          const ctx = labelCanvas.getContext('2d')!
          ctx.fillStyle = '#ead8b2'; ctx.textAlign = 'center'; ctx.font = '23px sans-serif'
          ctx.fillText(`${GEM_NAME[color]}  ·  ${count}`, 128, 36)
          const label = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ map: canvasTexture(labelCanvas), transparent: true, depthWrite: false }))
          label.rotation.x = -Math.PI / 2; label.position.set(0, .015, .68); stack.add(label)
          return stack
        })
        // Reserve the restored top layers until the returning coins have landed.
        for (let layer = 0; layer < layers; layer++) stack.children[layer].visible = true
        returning.filter((flight) => flight.color === color).forEach((flight, index) => {
          const landing = layers ? stack.children[Math.max(0, layers - 1 - index)] : null
          flight.landing = landing
          if (landing) {
            landing.visible = false
            flight.destination.copy(landing.position).add(stack.position)
          } else flight.destination.set(x, SURFACE + .072, z)
        })
        keep(`shadow-${color}`, String(count > 0), () => {
          const shadow = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial({
            map: contactShadow.clone(), transparent: true, opacity: count ? .38 : .1, depthWrite: false,
          }))
          shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(1.35)
          shadow.position.set(x, SURFACE + .003, z)
          return shadow
        })
        addPiece(`coin-${color}`, `${GEM_NAME[color]} · ${count} in bank${picked ? ` · ${picked} selected` : ''}`, stack, () => {
          if (propsRef.current.canPick) propsRef.current.onPick(color)
        })
      })
      selection.forEach((color, index) => {
        const model = coin(color)
        model.position.set(-.8 + index * 1.15, SURFACE + .075, 3.55)
        model.userData.destination = model.position.clone()
        if (selection.length > lastSelection.length && index === selection.length - 1 && !reduceMotion.matches) {
          const pile = TOKEN_COLORS.indexOf(color)
          model.position.x = 3.7 + pile % 2 * 1.36
          model.position.z = -1.95 + Math.floor(pile / 2) * 1.85
          model.userData.flight = { from: model.position.clone(), startedAt: performance.now() }
        }
        addPiece(`selected-${index}`, `Put back ${GEM_NAME[color]}`, model, () => {
          if (propsRef.current.canPick) {
            removedIndex = index
            propsRef.current.onUnpick(index)
          }
        })
      })
      for (const [key, { object }] of retained) {
        if (seen.has(key)) continue
        content.remove(object); disposeObjects(object, false); retained.delete(key)
      }
      setHover(pieces.find((piece) => piece.object === previousHoveredObject) ?? null)
      lastSelection = [...selection]
      lastReturnSelectionRevision = propsRef.current.returnSelectionRevision
      invalidate()
    }
    const affordableGeometry = new THREE.CircleGeometry(.085, 20)
    const faceGeometry = roundedCardFace()
    const discGeometry = new THREE.CircleGeometry(.5, 32)
    const labelGeometry = new THREE.PlaneGeometry(1.27, .32)
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64
    const shadowContext = shadowCanvas.getContext('2d')!
    const gradient = shadowContext.createRadialGradient(32, 32, 8, 32, 32, 32)
    gradient.addColorStop(0, '#000000d0'); gradient.addColorStop(.55, '#00000070'); gradient.addColorStop(1, '#00000000')
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 64, 64)
    const contactShadow = canvasTexture(shadowCanvas)
    updateRef.current = rebuild
    const loader = new GLTFLoader()
    const loadedAssets: THREE.Object3D[] = []
    const load = async (url: string) => {
      const result = await loader.loadAsync(url)
      if (disposed) disposeObjects(result.scene)
      else loadedAssets.push(result.scene)
      return result.scene
    }
    void Promise.all([load('/models/splendor-board.glb'), load('/models/splendor-token.glb'), load('/models/splendor-card.glb')])
      .then(([board, token, card]) => {
        if (disposed) return
        templates = { board, token, card }
        board.traverse((obj) => { if (obj instanceof THREE.Mesh) obj.receiveShadow = true })
        scene.add(board); rebuild(); setReady(true); host.dataset.ready = 'true'
      }).catch(() => { if (!disposed) propsRef.current.onUnavailable() })

    return () => {
      disposed = true
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose()
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointerleave', pointerLeave)
      canvas.removeEventListener('pointercancel', pointerCancel)
      canvas.removeEventListener('webglcontextlost', contextLost)
      updateRef.current = () => {}; cameraRef.current = () => {}; focusRef.current = () => {}
      disposeObjects(content, false); disposeObjects(transit, false)
      loadedAssets.forEach((asset) => disposeObjects(asset))
      faceGeometry.dispose(); discGeometry.dispose(); labelGeometry.dispose(); affordableGeometry.dispose()
      contactShadow.dispose()
      key.shadow.dispose(); environment.dispose(); renderer.dispose()
    }
  }, [])

  // Server snapshots replace object references on turn/status updates. Reconcile only
  // when the visible pieces actually change; actions still read the latest propsRef.
  const visualState = JSON.stringify([props.state.market, props.state.bank, props.state.nobles, props.state.deckCounts, props.selection, props.affordableCardIds])
  useEffect(() => { updateRef.current() }, [visualState])

  return (
    <div className="sp-preview">
      <div className="sp-preview__tools">
        <span>Drag to look around · scroll or pinch to zoom</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => cameraRef.current(true)}>Top view</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => cameraRef.current(false)}>Reset view</button>
      </div>
      <div className="sp-preview__stage" ref={hostRef}>
        <canvas ref={canvasRef} aria-label="Interactive 3D game table. Use the piece buttons or switch to flat view for keyboard play." />
        {!ready && <p className="sp-preview__loading" role="status">Setting the table…</p>}
        <div className="sp-preview__keyboard" aria-label="3D table pieces">
          {props.state.nobles.map((noble) => (
            <span key={noble.id} className="sp-preview__sr-text">Noble: {noble.points} prestige. Requires {GEM_COLORS.filter((c) => noble.requirement[c]).map((c) => `${noble.requirement[c]} ${GEM_NAME[c]} cards`).join(', ')}.</span>
          ))}
          {props.selection.map((color, index) => (
            <button key={`selected-${index}`} type="button" disabled={!props.canPick} onClick={() => props.onUnpick(index)}
              onFocus={() => focusRef.current(`selected-${index}`)} onBlur={() => focusRef.current(null)}>Put back {GEM_NAME[color]}</button>
          ))}
          {TOKEN_COLORS.map((color) => (
            <button key={color} type="button" disabled={!props.canPick} onClick={() => props.onPick(color)}
              onFocus={() => focusRef.current(`coin-${color}`)} onBlur={() => focusRef.current(null)}>
              {GEM_NAME[color]}: {props.state.bank[color]} in bank
            </button>
          ))}
          {TIERS.flatMap((tier) => [
            <button key={`deck-${tier}`} type="button" disabled={!props.canPick || !props.state.deckCounts[tier]}
              onFocus={() => focusRef.current(`deck-${tier}`)} onBlur={() => focusRef.current(null)} onClick={() => props.onDeck(tier)}>
              Tier {ROMAN[tier]} deck: {props.state.deckCounts[tier]} cards
            </button>,
            ...props.state.market[tier].map((card, index) => card && (
              <button key={card.id} type="button" disabled={!props.canInspect} onClick={() => props.onCard(tier, index, card)}
                onFocus={() => focusRef.current(card.id)} onBlur={() => focusRef.current(null)}>
                Tier {ROMAN[tier]}, {GEM_NAME[card.bonus]}, {card.points} prestige. Cost: {GEM_COLORS.filter((c) => card.cost[c]).map((c) => `${card.cost[c]} ${GEM_NAME[c]}`).join(', ')}{props.affordableCardIds.includes(card.id) ? ' — affordable' : ''}
              </button>
            )),
          ])}
        </div>
        <p className="sp-preview__caption" aria-live="polite">{hoverLabel || 'Choose a card or a gem stack'}</p>
      </div>
    </div>
  )
}

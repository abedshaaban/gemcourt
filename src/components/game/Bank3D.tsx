import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { TokenColor, TokenCounts } from '../../game/types'
import { TOKEN_COLOR as COLORS, TOKEN_SYMBOL_COLOR } from './tokenColors'

const DIM_TOKEN = new THREE.Color('#777b82')
const DIM_GEM = new THREE.Color('#91949b')
const LAYERS = 5
const VIEW_ANGLE = (55 * Math.PI) / 180
const STACK_PITCH = 0.17

type Props = {
  bank: TokenCounts
  colors: readonly TokenColor[]
  selection: readonly TokenColor[]
  onReady: () => void
}

/** A single shared WebGL canvas paints all six clickable bank piles. */
export function Bank3D({ bank, colors, selection, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef<() => void>(() => {})
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const dataRef = useRef({ bank, colors, selection })
  dataRef.current = { bank, colors, selection }

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    let disposed = false
    let ready = false
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50)
    camera.up.set(0, 0, 1)
    camera.position.set(0, 8, 8 * Math.tan(VIEW_ANGLE))
    camera.lookAt(0, 0, 0)

    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }) }
    catch { return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    renderer.setClearColor(0x000000, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x182039, 2.2))
    const key = new THREE.DirectionalLight(0xfff0d0, 3.4)
    key.position.set(-3, 8, 4)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x91b7ff, 1.2)
    fill.position.set(4, 5, -3)
    scene.add(fill)

    const tokenGroups = Array.from({ length: 6 }, () => {
      const group = new THREE.Group()
      scene.add(group)
      return group
    })
    const shadows: THREE.Mesh[] = []
    const models: THREE.Object3D[][] = Array.from({ length: 6 }, () => [])
    const tokenMaterials: THREE.Material[][][] = Array.from({ length: 6 }, () => [])
    const gemMaterials: THREE.Material[][][] = Array.from({ length: 6 }, () => [])
    const tokenColors = Object.fromEntries(
      Object.entries(COLORS).map(([key, hex]) => [key, new THREE.Color(hex)]),
    ) as Record<TokenColor, THREE.Color>
    const symbolColors = Object.fromEntries(
      Object.keys(COLORS).map((color) => [color, new THREE.Color(TOKEN_SYMBOL_COLOR(color as TokenColor))]),
    ) as Record<TokenColor, THREE.Color>
    let template: THREE.Object3D | null = null

    const resizeAndDraw = () => {
      if (!ready || disposed) return
      const layout = host.parentElement
      if (!layout) return
      const width = host.clientWidth
      const height = host.clientHeight
      if (width < 1 || height < 1) return
      renderer.setSize(width, height, false)
      const unit = Math.max(38, layout.querySelector<HTMLElement>('.sp-chip')?.offsetWidth ?? 58)
      const viewWidth = width / unit
      const viewHeight = height / unit
      camera.left = -viewWidth / 2
      camera.right = viewWidth / 2
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.updateProjectionMatrix()

      const buttons = [...layout.querySelectorAll<HTMLButtonElement>('.sp-pile')]
      const { bank: currentBank, colors: currentColors, selection: currentSelection } = dataRef.current
      currentColors.forEach((color, index) => {
        const button = buttons[index]
        const chip = button?.querySelector<HTMLElement>('.sp-chip')
        if (!button || !chip) return
        const chipX = button.offsetLeft + chip.offsetLeft + chip.offsetWidth / 2
        const chipY = button.offsetTop + chip.offsetTop + chip.offsetHeight / 2
        // The camera sits on +Y looking back toward the origin with +Z up, so screen-right is world -X.
        // Negate here so each 3D pile lands under its own (invisible, clickable) DOM chip.
        const x = (width / 2 - chipX) / unit
        const z = (height / 2 - chipY) / unit / Math.cos(VIEW_ANGLE)
      const selected = color === 'gold' ? 0 : currentSelection.filter((item) => item === color).length
      const visibleCount = Math.max(0, currentBank[color] - selected)
      const count = visibleCount === 0 ? 1 : Math.min(LAYERS, visibleCount)
      const dim = visibleCount === 0
      // Colors computed once per pile per draw (not once per material per layer).
      const tokenColor = dim ? DIM_TOKEN : tokenColors[color]
      const gemBase = dim ? DIM_GEM : symbolColors[color]
      const group = tokenGroups[index]
      const baseHeight = 0.105
      const averageStackHeight = baseHeight + ((count - 1) * STACK_PITCH) / 2
      group.position.set(x, 0, z + Math.tan(VIEW_ANGLE) * averageStackHeight)

      models[index].forEach((model, layer) => {
        model.visible = layer < count
        model.position.y = baseHeight + layer * STACK_PITCH
        for (const material of tokenMaterials[index][layer] ?? []) {
          const colored = material as THREE.MeshStandardMaterial
          colored.color.copy(tokenColor)
          colored.transparent = false
        }
        for (const material of gemMaterials[index][layer] ?? []) {
          const colored = material as THREE.MeshStandardMaterial
          colored.color.copy(gemBase)
          colored.transparent = false
        }
        })
        const shadow = shadows[index]
        if (shadow) {
          shadow.position.set(x, -0.002, z + Math.tan(VIEW_ANGLE) * baseHeight)
          shadow.visible = true
          ;(shadow.material as THREE.MeshBasicMaterial).opacity = dim ? 0.12 : 0.3
        }
      })
      renderer.render(scene, camera)
    }
    drawRef.current = resizeAndDraw

    const observer = new ResizeObserver(resizeAndDraw)
    observer.observe(host)
    window.addEventListener('resize', resizeAndDraw)

    new GLTFLoader().load(
      '/models/splendor-token.glb',
      ({ scene: loaded }) => {
        if (disposed) {
          loaded.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            object.geometry.dispose()
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            materials.forEach((material) => material.dispose())
          })
          return
        }
        template = loaded
        for (let index = 0; index < 6; index++) {
          const shadowCanvas = document.createElement('canvas')
          shadowCanvas.width = 128
          shadowCanvas.height = 128
          const context = shadowCanvas.getContext('2d')
          if (context) {
            const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64)
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.48)')
            gradient.addColorStop(0.58, 'rgba(0, 0, 0, 0.2)')
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
            context.fillStyle = gradient
            context.fillRect(0, 0, 128, 128)
          }
          const shadowTexture = new THREE.CanvasTexture(shadowCanvas)
          const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.8, depthWrite: false })
          const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.72, 48), shadowMaterial)
          shadow.rotation.x = -Math.PI / 2
          scene.add(shadow)
          shadows.push(shadow)

          for (let layer = 0; layer < LAYERS; layer++) {
            const model = template.getObjectByName(`GEO-token_${colors[index]}`)!.clone(true)
            const bodyMats: THREE.Material[] = []
            const jewelMats: THREE.Material[] = []
            model.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return
              const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material]
              const clonedMaterials = sourceMaterials.map((source) => {
                const material = source.clone()
                if (source.name === 'MAT-token') bodyMats.push(material)
                if (source.name.startsWith('MAT-gem')) jewelMats.push(material)
                return material
              })
              object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0]
            })
            models[index].push(model)
            tokenMaterials[index].push(bodyMats)
            gemMaterials[index].push(jewelMats)
            tokenGroups[index].add(model)
          }
        }
        ready = true
        onReadyRef.current()
        resizeAndDraw()
      },
      undefined,
      (error) => console.error('Could not load the Blender bank token model.', error),
    )

    return () => {
      disposed = true
      ready = false
      observer.disconnect()
      window.removeEventListener('resize', resizeAndDraw)
      drawRef.current = () => {}
      renderer.dispose()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => {
            if ('map' in material && material.map) material.map.dispose()
            material.dispose()
          })
        }
      })
      template?.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
    }
  }, [])

  useEffect(() => {
    drawRef.current()
  }, [bank, selection])

  return (
    <div ref={hostRef} className="sp-bank__3d-host" aria-hidden="true">
      <canvas ref={canvasRef} className="sp-bank__3d-canvas" />
    </div>
  )
}

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Renders the actual Blender-made walnut/felt tray beneath the interactive board UI. */
export function TableBoard3D() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    let disposed = false
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-7, 7, 4.5, -4.5, 0.1, 80)
    camera.up.set(0, 0, -1)
    camera.position.set(0, 24, 0)
    camera.lookAt(0, 0, 0)

    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }) }
    catch { host.dataset.failed = 'true'; return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    renderer.setClearColor(0x000000, 0)

    scene.add(new THREE.HemisphereLight(0xffedc5, 0x15213a, 2.0))
    const key = new THREE.DirectionalLight(0xffedcf, 3.1)
    key.position.set(-6, 12, 9)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x819bd0, 1.0)
    fill.position.set(8, 8, -9)
    scene.add(fill)

    const release = (root: THREE.Object3D) => {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          const map = (material as THREE.MeshStandardMaterial).map
          map?.dispose()
          material.dispose()
        })
      })
    }
    let board: THREE.Object3D | null = null
    let boardSize = new THREE.Vector3()
    const draw = () => {
      if (disposed) return
      const width = host.clientWidth
      const height = host.clientHeight
      if (width < 1 || height < 1) return
      renderer.setSize(width, height, false)
      const aspect = width / height
      const viewWidth = 13.0
      const viewHeight = viewWidth / aspect
      camera.left = -viewWidth / 2
      camera.right = viewWidth / 2
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.updateProjectionMatrix()
      // Fit both axes to the responsive table, keeping the felt beneath all UI rows.
      if (board) board.scale.set(viewWidth / boardSize.x, 1, viewHeight / boardSize.z)
      renderer.render(scene, camera)
    }

    // The scene depends only on the host's size, which the observer already tracks (a window
    // 'resize' listener on top of it rendered every resize twice).
    const observer = new ResizeObserver(draw)
    observer.observe(host)

    new GLTFLoader().load('/models/splendor-board.glb', ({ scene: loaded }) => {
      if (disposed) { release(loaded); return }
      const box = new THREE.Box3().setFromObject(loaded)
      const center = box.getCenter(new THREE.Vector3())
      boardSize = box.getSize(new THREE.Vector3())
      loaded.position.sub(center)
      board = new THREE.Group()
      board.add(loaded)
      scene.add(board)
      draw()
      host.dataset.ready = 'true'
    }, undefined, () => { if (!disposed) host.dataset.failed = 'true' })

    draw()
    return () => {
      disposed = true
      observer.disconnect()
      renderer.dispose()
      release(scene)
    }
  }, [])

  return (
    <div ref={hostRef} className="sp-table__3d-host" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}

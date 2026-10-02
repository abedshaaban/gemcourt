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
    let board: THREE.Object3D | null = null
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-7, 7, 4.5, -4.5, 0.1, 80)
    camera.up.set(0, 1, 0)
    camera.position.set(0, 23, 13)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
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

    const draw = () => {
      if (disposed) return
      const width = host.clientWidth
      const height = host.clientHeight
      if (width < 1 || height < 1) return
      renderer.setSize(width, height, false)
      const aspect = width / height
      const viewWidth = 13.7
      const viewHeight = viewWidth / aspect
      camera.left = -viewWidth / 2
      camera.right = viewWidth / 2
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }

    const observer = new ResizeObserver(draw)
    observer.observe(host)
    window.addEventListener('resize', draw)

    new GLTFLoader().load('/models/splendor-board.glb', ({ scene: loaded }) => {
      if (disposed) return
      const box = new THREE.Box3().setFromObject(loaded)
      const center = box.getCenter(new THREE.Vector3())
      loaded.position.sub(center)
      board = loaded
      scene.add(loaded)
      draw()
      host.dataset.ready = 'true'
    }, undefined, (error) => console.error('Could not load the Blender game board.', error))

    draw()
    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('resize', draw)
      renderer.dispose()
      if (board) scene.remove(board)
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      })
    }
  }, [])

  return (
    <div ref={hostRef} className="sp-table__3d-host" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}

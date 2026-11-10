import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Layout coordinates matching the IS Seminar Hall geometry
const ROW_Z = { A: 4.0, B: 5.2, C: 6.4, D: 7.6, E: 8.8, F: 10.0, G: 11.2 }
const ROW_Y = { A: 0.2, B: 0.55, C: 0.9, D: 1.25, E: 1.6, F: 1.95, G: 2.3 } // Raked elevation

const ROW_COUNTS = { A: 7, B: 9, C: 11, D: 13, E: 15, F: 17, G: 17 }

export function SeatPov3D({ seat}) {
  const mountRef = useRef(null)

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0f1d) // Dark auditorium ambience
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.04)

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 50)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const stageSpotlight = new THREE.SpotLight(0xffecd1, 2.5)
    stageSpotlight.position.set(0, 7, 2)
    stageSpotlight.angle = Math.PI / 4
    stageSpotlight.penumbra = 0.5
    scene.add(stageSpotlight)

    // 3. Stage & Teak Wood Wall
    const woodWallMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.7 })
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 0.4), woodWallMat)
    backWall.position.set(0, 3, -1.2)
    scene.add(backWall)

    const stageFloorMat = new THREE.MeshStandardMaterial({ color: 0x8a532d, roughness: 0.5 })
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9, 0.6, 32, 1, false, 0, Math.PI), stageFloorMat)
    stage.rotation.y = Math.PI
    stage.position.set(0, 0, 0)
    scene.add(stage)

    // Speaker Podium
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0x1f1107, roughness: 0.8 })
    const podium = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.6), podiumMat)
    podium.position.set(0, 0.6, 0.8)
    scene.add(podium)

    // 4. Dual Projection Screens (S1 & S2 Angled Inward)
    const screenMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    const screenGeo = new THREE.PlaneGeometry(3.6, 2.2)

    // Screen 1 (Left - Angled 12 deg)
    const screenLeft = new THREE.Mesh(screenGeo, screenMat)
    screenLeft.position.set(-3.6, 3.2, -0.6)
    screenLeft.rotation.y = 0.22
    scene.add(screenLeft)

    // Screen 2 (Right - Angled -12 deg)
    const screenRight = new THREE.Mesh(screenGeo, screenMat)
    screenRight.position.set(3.6, 3.2, -0.6)
    screenRight.rotation.y = -0.22
    scene.add(screenRight)

    // 5. Build 3D Red Auditorium Chairs
    const chairBackMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 }) // Crimson Red Velvet
    const chairSeatMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 })
    const chairFrameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 })

    const chairBackGeo = new THREE.BoxGeometry(0.44, 0.45, 0.08)
    const chairSeatGeo = new THREE.BoxGeometry(0.44, 0.08, 0.42)
    const chairArmGeo = new THREE.BoxGeometry(0.06, 0.28, 0.38)

    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    const centerAisleGap = 0.9 // Central steps width

    rows.forEach((rLabel) => {
      const zPos = ROW_Z[rLabel]
      const yPos = ROW_Y[rLabel]
      const count = ROW_COUNTS[rLabel]

      // Left and Right wings
      ;[-1, 1].forEach((side) => {
        for (let i = 1; i <= count; i++) {
          const xPos = side * (centerAisleGap / 2 + (i - 0.5) * 0.52)

          // Subtle curve angled towards center
          const angle = -side * (0.015 * i)

          const chairGroup = new THREE.Group()
          chairGroup.position.set(xPos, yPos, zPos)
          chairGroup.rotation.y = angle

          // Backrest
          const back = new THREE.Mesh(chairBackGeo, chairBackMat)
          back.position.set(0, 0.48, -0.16)
          back.rotation.x = -0.1
          chairGroup.add(back)

          // Seat cushion
          const cushion = new THREE.Mesh(chairSeatGeo, chairSeatMat)
          cushion.position.set(0, 0.28, 0)
          chairGroup.add(cushion)

          // Armrests
          const leftArm = new THREE.Mesh(chairArmGeo, chairFrameMat)
          leftArm.position.set(-0.24, 0.35, 0)
          chairGroup.add(leftArm)

          const rightArm = new THREE.Mesh(chairArmGeo, chairFrameMat)
          rightArm.position.set(0.24, 0.35, 0)
          chairGroup.add(rightArm)

          scene.add(chairGroup)
        }
      })
    })

    // 6. Calculate Selected Seat's 3D Coordinates
    const targetRow = seat?.row || 'D'
    const isLeft = (seat?.label || '').includes('L')
    const seatNum = parseInt((seat?.label || '1').replace(/\D/g, ''), 10) || 1

    const camZ = ROW_Z[targetRow] || 7.0
    const camY = (ROW_Y[targetRow] || 1.2) + 0.95 // Eye level above cushion
    const camSide = isLeft ? -1 : 1
    const camX = camSide * (centerAisleGap / 2 + (seatNum - 0.5) * 0.52)

    // Position camera inside the chosen seat
    camera.position.set(camX, camY, camZ)

    // Look towards the stage / primary screen
    const targetX = isLeft ? -1.8 : 1.8
    camera.lookAt(targetX, 2.2, 0)

    // 7. Render Loop with gentle subtle breathing animation
    let animationFrameId
    let clock = new THREE.Clock()

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      // Micro camera drift (simulating human eye focus)
      camera.position.y = camY + Math.sin(t * 0.8) * 0.015
      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const handleResize = () => {
      if (!container) return
      const newW = container.clientWidth
      const newH = container.clientHeight
      camera.aspect = newW / newH
      camera.updateProjectionMatrix()
      renderer.setSize(newW, newH)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [seat])

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    />
  )
}
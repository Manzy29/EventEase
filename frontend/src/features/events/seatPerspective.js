// Physical dimensions & camera transforms based on IS Seminar Hall geometry
const ROW_PARAMS = {
  A: { distance: 3.2, zoom: 1.85, translateY: 12, label: 'UP CLOSE' },
  B: { distance: 4.1, zoom: 1.68, translateY: 9, label: 'UP CLOSE' },
  C: { distance: 5.0, zoom: 1.50, translateY: 6, label: 'SWEET SPOT' },
  D: { distance: 5.9, zoom: 1.35, translateY: 3, label: 'SWEET SPOT' },
  E: { distance: 6.8, zoom: 1.22, translateY: 0, label: 'BALCONY TIER' },
  F: { distance: 7.7, zoom: 1.10, translateY: -3, label: 'PANORAMIC' },
  G: { distance: 8.6, zoom: 1.00, translateY: -5, label: 'PANORAMIC' },
}

export function getSeatPerspective(seat) {
  if (!seat) return null

  const row = seat.row || 'A'
  const isLeft = seat.label.includes('L')
  const seatNum = parseInt(seat.label.replace(/\D/g, ''), 10) || 1
  const config = ROW_PARAMS[row] || ROW_PARAMS['D']

  // 1. Telemetry Calculations
  const distance = config.distance.toFixed(1)
  const lateralOffset = (seatNum * 0.55).toFixed(1)
  const fovAngle = Math.round(Math.atan(7.0 / config.distance) * (180 / Math.PI))

  // 2. Virtual Camera Coordinates:
  // Left wing pans toward Screen 1 (-X); Right wing pans toward Screen 2 (+X)
  const panFactor = Math.min(1.0, seatNum / 17) // Normalized 0 to 1
  const translateX = isLeft ? 12 * panFactor : -12 * panFactor

  // Subtle 3D perspective rotation facing inward
  const rotateY = isLeft ? 4 * panFactor : -4 * panFactor

  return {
    row,
    label: seat.label,
    distance: `${distance} m`,
    lateralOffset: `${lateralOffset} m ${isLeft ? 'left' : 'right'} of center`,
    fov: `${fovAngle}°`,
    perspectiveType: config.label,
    primaryScreen: isLeft ? 'Screen 1 (Left)' : 'Screen 2 (Right)',
    // Transform parameters applied to the master image
    transformStyle: {
      transform: `scale(${config.zoom}) translate(${translateX}%, ${config.translateY}%) perspective(800px) rotateY(${rotateY}deg)`,
      transformOrigin: isLeft ? '40% 45%' : '60% 45%',
      transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    hasObstruction: !['A', 'B'].includes(row), // Rows C-G have visible chairs in front
  }
}
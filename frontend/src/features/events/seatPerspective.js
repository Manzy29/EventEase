// Physical dimensions & smooth camera parameters for IS Seminar Hall
const ROW_PARAMS = {
  A: { distance: 3.2, zoom: 1.25, translateY: 3, label: 'UP CLOSE' },
  B: { distance: 4.1, zoom: 1.20, translateY: 2, label: 'UP CLOSE' },
  C: { distance: 5.0, zoom: 1.15, translateY: 1, label: 'SWEET SPOT' },
  D: { distance: 5.9, zoom: 1.10, translateY: 0, label: 'SWEET SPOT' },
  E: { distance: 6.8, zoom: 1.06, translateY: -1, label: 'BALCONY TIER' },
  F: { distance: 7.7, zoom: 1.03, translateY: -2, label: 'PANORAMIC' },
  G: { distance: 8.6, zoom: 1.00, translateY: -3, label: 'PANORAMIC' },
}

export function getSeatPerspective(seat) {
  if (!seat) return null

  const row = seat.row || 'C'
  const isLeft = (seat.label || '').includes('L')
  const seatNum = parseInt((seat.label || '1').replace(/\D/g, ''), 10) || 1
  const config = ROW_PARAMS[row] || ROW_PARAMS['C']

  // Telemetry Calculations
  const distance = config.distance.toFixed(1)
  const lateralOffset = (seatNum * 0.55).toFixed(1)
  const fovAngle = Math.round(Math.atan(7.0 / config.distance) * (180 / Math.PI))

  // Safe horizontal pan: shifts gently towards Screen 1 (Left) or Screen 2 (Right)
  const panFactor = Math.min(1.0, seatNum / 17)
  const translateX = isLeft ? 3 * panFactor : -3 * panFactor

  return {
    row,
    label: seat.label,
    distance: `${distance} m`,
    lateralOffset: `${lateralOffset} m ${isLeft ? 'left' : 'right'} of center`,
    fov: `${fovAngle}°`,
    perspectiveType: config.label,
    primaryScreen: isLeft ? 'Screen 1 (Left)' : 'Screen 2 (Right)',
    // Centered zoom that NEVER pushes the photo off-screen
    transformStyle: {
      transform: `scale(${config.zoom}) translate(${translateX}%, ${config.translateY}%)`,
      transformOrigin: 'center 40%',
      transition: 'transform 0.4s ease-out',
    },
    hasObstruction: !['A', 'B'].includes(row),
  }
}
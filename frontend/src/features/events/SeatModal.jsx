import { useEffect, useMemo, useState } from 'react'
import { X, Clock } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { eventApi } from '../../services/api'

const noSeats = []

function errorMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback
}

export function SeatModal({ event, user, onClose, onSignIn, onViewBookings }) {
  const [selected, setSelected] = useState([])
  const [message, setMessage] = useState('')
  const [confirmedBooking, setConfirmedBooking] = useState(null)
  const [activeHold, setActiveHold] = useState(null)
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  // OTP Verification state
  const [pendingBooking, setPendingBooking] = useState(null)
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)

  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['seats', event.id],
    queryFn: () => eventApi.seats(event.id),
    refetchInterval: 15000,
    retry: false,
  })

  const seats = query.data ?? noSeats
  // Check for any active pending reservation for this user and event
  useEffect(() => {
    if (!user || confirmedBooking) return
    let isMounted = true

    eventApi
      .getPending(event.id)
      .then((res) => {
        if (!isMounted || !res || !res.has_pending) return

        // Auto-select the seats held by this user
        setSelected(res.seat_ids || [])
        setActiveHold({ id: res.hold_id, expires_at: res.expires_at })
        setPendingBooking({ id: res.booking_id, reference: res.reference })

        // Restore countdown timer
        const expiresAt = new Date(res.expires_at).getTime()
        const diffSecs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
        setSecondsRemaining(diffSecs)

        setMessage('Active reservation found! Enter the OTP sent to your email to complete verification.')
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [event.id, user, confirmedBooking])

  // Group seats by row label (A, B, C...)
  const rows = useMemo(() => {
    const map = seats.reduce((acc, seat) => {
      (acc[seat.row] ||= []).push(seat)
      return acc
    }, {})
    // Sort seats in each row by position
    Object.keys(map).forEach((r) => {
      map[r].sort((a, b) => a.position - b.position)
    })
    return Object.values(map)
  }, [seats])

  // Countdown timer for active hold
  useEffect(() => {
    if (!activeHold || secondsRemaining <= 0) return
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setActiveHold(null)
          setPendingBooking(null)
          setMessage('Your seat hold has expired. Please select seats again.')
          queryClient.invalidateQueries({ queryKey: ['seats', event.id] })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [activeHold, secondsRemaining, event.id, queryClient])

  const toggle = (seat) => {
    if (seat.status !== 'AVAILABLE') return
    setSelected((old) =>
      old.includes(seat.id) ? old.filter((id) => id !== seat.id) : old.length === 5 ? old : [...old, seat.id]
    )
  }

  const formatTimer = (sec) => {
    const mins = Math.floor(sec / 60)
    const rem = sec % 60
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`
  }

  // Phase 1: Hold seats & generate OTP
  const initiateReservation = async () => {
    if (!selected.length) return
    if (!user) {
      onSignIn()
      return
    }
    try {
      const hold = await eventApi.hold(event.id, selected)
      setActiveHold(hold)
      const expiresAt = new Date(hold.expires_at).getTime()
      const diffSecs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setSecondsRemaining(diffSecs || 300)

      const pending = await eventApi.book(event.id, hold.id)
      setPendingBooking(pending)
      setMessage(`Verification OTP sent! (Dev Mode OTP: ${pending.dev_otp})`)
    } catch (error) {
      if (error.response?.status === 401) {
        onSignIn()
        return
      }
      setMessage(errorMessage(error, 'Unable to hold seats. Please refresh.'))
    }
  }

  // Phase 2: Verify OTP and confirm
  const confirmOtp = async () => {
    if (!pendingBooking || !activeHold || otp.length !== 6) return
    setVerifying(true)
    try {
      const confirmed = await eventApi.verifyBookingOtp(pendingBooking.id, activeHold.id || null , otp)
      setMessage(`Booking confirmed: ${confirmed.reference}`)
      setConfirmedBooking(confirmed)
      setPendingBooking(null)
      setActiveHold(null)
      setSelected([])
      queryClient.invalidateQueries({ queryKey: ['seats', event.id] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
    } catch (error) {
      setMessage(errorMessage(error, 'Invalid or expired OTP.'))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Book ${event.title}`}>
      <div className="modal seminar-modal">
        {/* Header */}
        <div className="modal-head">
          <div>
            <h2>Select your seats</h2>
            <div className="muted">{event.title} · {event.venue}</div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="booking-layout seminar-layout">
          {/* Main Seating Amphitheatre Panel */}
          <div className="seat-panel seminar-panel">
            {/* Dual Projection Screens (S1 & S2 Angled Inward) */}
            <div className="dual-screen-stage">
              <div className="screens-row">
                <div className="screen-box screen-left">
                  <span>SCREEN 1 (S1)</span>
                </div>
                <div className="podium-badge">STAGE / PODIUM</div>
                <div className="screen-box screen-right">
                  <span>SCREEN 2 (S2)</span>
                </div>
              </div>
              <div className="stage-curve-bar" />
              <div className="stage-text">ALL EYES THIS WAY</div>
            </div>

            {query.isLoading ? (
              <p className="muted loading">Loading current seat availability…</p>
            ) : query.isError ? (
              <p className="form-message">Could not load seats: {errorMessage(query.error, 'Please try again.')}</p>
            ) : (
              <div className="seminar-grid">
                {rows.map((rowSeats) => {
                  const rowLabel = rowSeats[0].row
                  const half = Math.ceil(rowSeats.length / 2)
                  const leftSeats = rowSeats.slice(0, half)
                  const rightSeats = rowSeats.slice(half)

                  return (
                    <div className="seminar-row" key={rowLabel}>
                      {/* Left Row Identifier */}
                      <span className="row-name">{rowLabel}</span>

                      {/* Left Block */}
                      <div className="seat-wing left-wing">
                        {leftSeats.map((seat) => (
                          <button
                            key={seat.id}
                            onClick={() => toggle(seat)}
                            className={`seat ${selected.includes(seat.id) ? 'selected' : seat.status.toLowerCase()}`}
                            title={`${seat.label} (${seat.status})`}
                          >
                            {seat.label.replace(/^[A-Z]-?/, '')}
                          </button>
                        ))}
                      </div>

                      {/* Center Aisle / Steps */}
                      <div className="center-aisle">
                        <span className="aisle-step" />
                        <span className="aisle-step" />
                      </div>

                      {/* Right Block */}
                      <div className="seat-wing right-wing">
                        {rightSeats.map((seat) => (
                          <button
                            key={seat.id}
                            onClick={() => toggle(seat)}
                            className={`seat ${selected.includes(seat.id) ? 'selected' : seat.status.toLowerCase()}`}
                            title={`${seat.label} (${seat.status})`}
                          >
                            {seat.label.replace(/^[A-Z]-?/, '')}
                          </button>
                        ))}
                      </div>

                      {/* Right Row Identifier */}
                      <span className="row-name">{rowLabel}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Original Legend */}
            <div className="legend">
              <span>
                <i className="dot" style={{ background: '#e7eefc' }} /> Available
              </span>
              <span>
                <i className="dot" style={{ background: '#5b4ce2' }} /> Selected
              </span>
              <span>
                <i className="dot" style={{ background: '#fae4be' }} /> Held
              </span>
              <span>
                <i className="dot" style={{ background: '#d9dde4' }} /> Booked
              </span>
            </div>
          </div>

          {/* Right Summary & OTP Confirmation Sidebar */}
          <aside className="booking-summary">
            <h3>Your selection</h3>
            <p className="muted">Choose up to 5 seats. Held seats refresh automatically.</p>

            {activeHold && secondsRemaining > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#fff7ed',
                  color: '#c2410c',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  margin: '10px 0',
                }}
              >
                <Clock size={16} /> Hold expires in {formatTimer(secondsRemaining)}
              </div>
            )}

            <div className="seat-tags">
              {selected.length ? (
                selected.map((id) => (
                  <span className="seat-tag" key={id}>
                    {seats.find((s) => s.id === id)?.label}
                  </span>
                ))
              ) : (
                <span className="muted">No seats selected</span>
              )}
            </div>

            <hr className="summary-rule" />

            <p className="muted">
              <strong>{selected.length} ticket{selected.length === 1 ? '' : 's'}</strong>
              <br />
              Free campus event
            </p>

            {confirmedBooking ? (
              <button
                className="secondary-btn full"
                onClick={() => {
                  onClose()
                  onViewBookings()
                }}
              >
                View in My Bookings
              </button>
            ) : pendingBooking ? (
              <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3e4a5d' }}>
                  Enter 6-digit OTP sent to {user?.email}:
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="123456"
                    style={{
                      width: '100%',
                      padding: '8px',
                      textAlign: 'center',
                      letterSpacing: '4px',
                      fontWeight: 700,
                      border: '1px solid #dde2ea',
                      borderRadius: '8px',
                      marginTop: '4px',
                    }}
                    autoFocus
                  />
                </label>
                <button
                  className="primary full"
                  disabled={otp.length !== 6 || verifying}
                  onClick={confirmOtp}
                >
                  {verifying ? 'Verifying OTP…' : 'Verify & Confirm Booking'}
                </button>
              </div>
            ) : (
              <button
                className="primary full"
                disabled={!selected.length || query.isLoading || query.isError}
                onClick={initiateReservation}
              >
                {user ? 'Reserve free tickets' : 'Log in to reserve'}
              </button>
            )}

            <p className="notice">Seat availability is rechecked on the server before confirmation.</p>
          </aside>
        </div>
      </div>
      {message && <div className="toast">{message}</div>}
    </div>
  )
}
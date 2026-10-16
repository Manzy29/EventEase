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
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['seats', event.id],
    queryFn: () => eventApi.seats(event.id),
    refetchInterval: 15000,
    retry: false,
  })

  const seats = query.data ?? noSeats
  const rows = useMemo(() => Object.values(seats.reduce((acc, seat) => {
    (acc[seat.row] ||= []).push(seat)
    return acc
  }, {})), [seats])

  // Countdown timer for active hold
  useEffect(() => {
    if (!activeHold || secondsRemaining <= 0) return
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setActiveHold(null)
          setMessage('Your 5-minute seat hold has expired. Please select seats again.')
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
    setSelected((old) => old.includes(seat.id) ? old.filter((id) => id !== seat.id) : old.length === 5 ? old : [...old, seat.id])
  }

  const formatTimer = (sec) => {
    const mins = Math.floor(sec / 60)
    const rem = sec % 60
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`
  }

  const reserve = async () => {
    if (!selected.length) return
    if (!user) {
      onSignIn()
      return
    }
    try {
      // 1. Transactional Hold
      const hold = await eventApi.hold(event.id, selected)
      setActiveHold(hold)
      const expiresAt = new Date(hold.expires_at).getTime()
      const diffSecs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setSecondsRemaining(diffSecs || 300)

      // 2. Immediate Confirmation
      const booking = await eventApi.book(event.id, hold.id)
      setMessage(`Booking confirmed: ${booking.reference}`)
      setConfirmedBooking(booking)
      setActiveHold(null)
      setSelected([])
      queryClient.invalidateQueries({ queryKey: ['seats', event.id] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
    } catch (error) {
      if (error.response?.status === 401) {
        onSignIn()
        return
      }
      setMessage(errorMessage(error, 'Unable to reserve those seats. Please refresh.'))
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Book ${event.title}`}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>Select your seats</h2>
            <div className="muted">{event.title} · {event.venue}</div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="booking-layout">
          <div className="seat-panel">
            <div className="stage">STAGE <div /></div>
            {query.isLoading ? (
              <p className="muted loading">Loading current seat availability…</p>
            ) : query.isError ? (
              <p className="form-message">Could not load seats: {errorMessage(query.error, 'Please try again.')}</p>
            ) : (
              <>
                <div className="seat-rows">
                  {rows.map((row) => (
                    <div className="seat-row" key={row[0].row}>
                      <span className="row-name">{row[0].row}</span>
                      <div className="seat-line">
                        {row.map((seat) => (
                          <button
                            key={seat.id}
                            onClick={() => toggle(seat)}
                            className={`seat ${selected.includes(seat.id) ? 'selected' : seat.status.toLowerCase()}`}
                            aria-label={`${seat.label}, ${selected.includes(seat.id) ? 'selected' : seat.status.toLowerCase()}`}
                          >
                            {seat.label.replace(/^[A-Z]/, '')}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="legend">
                  <span><i className="dot" style={{ background: '#e7eefc' }} />Available</span>
                  <span><i className="dot" style={{ background: '#5b4ce2' }} />Selected</span>
                  <span><i className="dot" style={{ background: '#fae4be' }} />Held</span>
                  <span><i className="dot" style={{ background: '#d9dde4' }} />Booked</span>
                </div>
              </>
            )}
          </div>
          <aside className="booking-summary">
            <h3>Your selection</h3>
            <p className="muted">Choose up to 5 seats. Held seats refresh automatically.</p>
            
            {activeHold && secondsRemaining > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff7ed', color: '#c2410c', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, margin: '10px 0' }}>
                <Clock size={16} /> Hold expires in {formatTimer(secondsRemaining)}
              </div>
            )}

            <div className="seat-tags">
              {selected.length ? (
                selected.map((id) => (
                  <span className="seat-tag" key={id}>{seats.find((seat) => seat.id === id)?.label}</span>
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
            ) : (
              <button
                className="primary full"
                disabled={!selected.length || query.isLoading || query.isError}
                onClick={reserve}
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

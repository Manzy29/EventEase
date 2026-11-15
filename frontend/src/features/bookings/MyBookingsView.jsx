import { useState } from 'react'
import { CalendarDays, MapPin, Ticket, AlertCircle, QrCode, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { bookingApi } from '../../services/api'

function formatDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function errorMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback
}

export function MyBookingsView({ user, onSignIn, onBrowse, onNotify }) {
  const [cancellingId, setCancellingId] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null)
  const [confirmSeatModal, setConfirmSeatModal] = useState(null) // Holds specific seat to cancel
  const [qrModalTicket, setQrModalTicket] = useState(null)
  const queryClient = useQueryClient()

  const { data: bookings = [], isLoading, isError, error } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: bookingApi.myBookings,
    enabled: !!user,
  })

  // Cancel entire booking
  const handleCancelAll = async (booking) => {
    setCancellingId(booking.id)
    try {
      await bookingApi.cancel(booking.id)
      onNotify(`Booking ${booking.reference} was successfully cancelled.`)
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      setConfirmModal(null)
    } catch (err) {
      onNotify(errorMessage(err, 'Failed to cancel booking.'))
    } finally {
      setCancellingId(null)
    }
  }

  // Cancel only a particular seat
  const handleCancelSingleSeat = async (booking, seatItem) => {
    setCancellingId(seatItem.booking_seat_id)
    try {
      await bookingApi.cancelSeat(booking.id, seatItem.booking_seat_id)
      onNotify(`Seat ${seatItem.label} was cancelled and released.`)
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['seats'] })
      setConfirmSeatModal(null)
    } catch (err) {
      onNotify(errorMessage(err, 'Failed to cancel seat.'))
    } finally {
      setCancellingId(null)
    }
  }

  if (!user) {
    return (
      <div className="bookings-page">
        <div className="portal-hero">
          <div className="eyebrow">Your Campus Tickets</div>
          <h2>My Bookings</h2>
          <p className="muted">Sign in to check your active reservations, digital ticket codes, and seat assignments.</p>
          <div className="portal-actions">
            <button className="primary" onClick={onSignIn}>Sign in to view bookings</button>
            <button className="text-btn" onClick={onBrowse}>Browse campus events</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bookings-page">
      <div className="section-top">
        <div>
          <div className="eyebrow" style={{ color: '#5b4ce2' }}>Reservations</div>
          <h2 className="section-title">My Bookings</h2>
          <p className="section-copy">Review your tickets, check seat allocations, or cancel reservations before deadlines.</p>
        </div>
        <button className="secondary-btn" onClick={onBrowse}>Explore more events</button>
      </div>

      {isLoading ? (
        <p className="muted loading">Loading your bookings…</p>
      ) : isError ? (
        <div className="empty">
          <AlertCircle size={28} style={{ color: '#d32f2f', margin: '0 auto 10px' }} />
          <strong>Unable to load your bookings.</strong>
          <br />
          {errorMessage(error, 'Please make sure you are signed in and refresh.')}
        </div>
      ) : bookings.length === 0 ? (
        <div className="empty">
          <Ticket size={36} style={{ color: '#8d99ae', margin: '0 auto 12px' }} />
          <h3>No bookings found</h3>
          <p className="muted">You haven't reserved tickets for any campus events yet.</p>
          <button className="primary" style={{ marginTop: '16px' }} onClick={onBrowse}>
            Discover events
          </button>
        </div>
      ) : (
        <div className="bookings-grid">
          {bookings.map((booking) => {
            const isConfirmed = booking.status === 'CONFIRMED'
            const isCancelled = booking.status === 'CANCELLED'

            // Use detailed seats if available
            const activeSeatItems = (booking.seats_detailed || [])
              .filter((s) => s.is_active)

            return (
              <article className="booking-card" key={booking.id}>
                <div className="booking-card-head">
                  <div className="ref-pill">
                    <Ticket size={14} />
                    <span>{booking.reference}</span>
                  </div>
                  <span className={`status-badge ${isConfirmed ? 'status-confirmed' : isCancelled ? 'status-cancelled' : ''}`}>
                    {booking.status}
                  </span>
                </div>

                <div className="booking-card-body">
                  <h3 className="booking-title">{booking.event_title}</h3>
                  <div className="booking-meta">
                    <span>
                      <CalendarDays size={14} />
                      {formatDate(booking.start_at)}
                    </span>
                    <span>
                      <MapPin size={14} />
                      {booking.venue_name}
                    </span>
                  </div>

                  {/* Allocated Seats with individual seat cancel button */}
                  <div className="booking-seats-section">
                    <span className="section-label">Allocated Seats:</span>
                    <div className="seat-tags">
                      {activeSeatItems.length > 0 ? (
                        activeSeatItems.map((item) => (
                          <div className="removable-seat-tag" key={item.booking_seat_id}>
                            <span>Seat {item.label}</span>
                            {booking.can_cancel && (
                              <button
                                type="button"
                                className="remove-seat-btn"
                                onClick={() => setConfirmSeatModal({ booking, seat: item })}
                                title={`Cancel only Seat ${item.label}`}
                                aria-label={`Cancel Seat ${item.label}`}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <span className="muted">No active seats</span>
                      )}
                    </div>
                  </div>

                  {/* Digital Ticket Badges */}
                  {booking.tickets && booking.tickets.length > 0 && (
                    <div className="booking-tickets-section">
                      <span className="section-label">Digital Ticket Codes:</span>
                      <div className="ticket-codes" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {booking.tickets.map((code) => (
                          <div
                            key={code}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: '#f4f6fa',
                              border: '1px solid #dde2ea',
                              padding: '4px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            <span className="ticket-code-badge" style={{ border: 0, padding: 0, background: 'transparent' }}>
                              {code}
                            </span>
                            {isConfirmed && (
                              <button
                                className="icon-button"
                                style={{ padding: '2px', background: '#e9e7ff', color: '#5b4ce2', borderRadius: '4px' }}
                                onClick={() =>
                                  setQrModalTicket({
                                    ticket_code: code,
                                    reference: booking.reference,
                                    event_title: booking.event_title,
                                  })
                                }
                                title="View Ticket QR Code"
                                aria-label="View Ticket QR Code"
                              >
                                <QrCode size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="booking-card-footer">
                    <span className="booking-date">Booked on {formatDate(booking.created_at)}</span>
                    {booking.can_cancel && (
                      <button
                        className="danger-btn"
                        onClick={() => setConfirmModal(booking)}
                        disabled={cancellingId === booking.id}
                      >
                        Cancel entire booking
                      </button>
                    )}
                    {isCancelled && booking.cancelled_at && (
                      <span className="cancelled-note">Cancelled {formatDate(booking.cancelled_at)}</span>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Modal 1: Confirm Single Seat Cancellation */}
      {confirmSeatModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm single seat cancellation">
          <div className="auth-modal confirm-modal">
            <div className="eyebrow auth-eyebrow" style={{ color: '#d32f2f' }}>Cancel Single Seat</div>
            <h2>Cancel Seat {confirmSeatModal.seat.label}?</h2>
            <p className="muted">
              Are you sure you want to cancel <strong>Seat {confirmSeatModal.seat.label}</strong> for <strong>{confirmSeatModal.booking.event_title}</strong>?
            </p>
            <p className="muted" style={{ fontSize: '0.84rem' }}>
              Only this seat will be released back into hall inventory. Any other seats in your booking ({confirmSeatModal.booking.reference}) will remain active.
            </p>
            <div className="confirm-modal-actions">
              <button
                className="secondary-btn"
                onClick={() => setConfirmSeatModal(null)}
                disabled={cancellingId === confirmSeatModal.seat.booking_seat_id}
              >
                Keep seat
              </button>
              <button
                className="danger-btn-filled"
                onClick={() => handleCancelSingleSeat(confirmSeatModal.booking, confirmSeatModal.seat)}
                disabled={cancellingId === confirmSeatModal.seat.booking_seat_id}
              >
                {cancellingId === confirmSeatModal.seat.booking_seat_id ? 'Cancelling…' : `Yes, cancel Seat ${confirmSeatModal.seat.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Confirm Entire Booking Cancellation */}
      {confirmModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm cancellation">
          <div className="auth-modal confirm-modal">
            <div className="eyebrow auth-eyebrow" style={{ color: '#d32f2f' }}>Cancel Reservation</div>
            <h2>Confirm Cancellation</h2>
            <p className="muted">
              Are you sure you want to cancel your entire booking <strong>{confirmModal.reference}</strong> for <strong>{confirmModal.event_title}</strong>?
            </p>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              All your seats ({confirmModal.seats?.join(', ')}) will immediately become available for other students.
            </p>
            <div className="confirm-modal-actions">
              <button
                className="secondary-btn"
                onClick={() => setConfirmModal(null)}
                disabled={cancellingId === confirmModal.id}
              >
                Keep booking
              </button>
              <button
                className="danger-btn-filled"
                onClick={() => handleCancelAll(confirmModal)}
                disabled={cancellingId === confirmModal.id}
              >
                {cancellingId === confirmModal.id ? 'Cancelling…' : 'Yes, cancel all seats'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Digital Ticket QR */}
      {qrModalTicket && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Digital Ticket QR">
          <div className="auth-modal" style={{ textAlign: 'center', maxWidth: '380px' }}>
            <button className="icon-button auth-close" type="button" onClick={() => setQrModalTicket(null)} aria-label="Close">
              <X />
            </button>
            <div className="eyebrow auth-eyebrow">Digital Ticket</div>
            <h2>{qrModalTicket.event_title}</h2>
            <p className="muted" style={{ marginBottom: '16px' }}>
              Booking: <strong>{qrModalTicket.reference}</strong>
            </p>
            <div
              style={{
                background: '#ffffff',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                display: 'inline-block',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              }}
            >
              <img
                src={`/api/v1/tickets/${qrModalTicket.ticket_code}/qr`}
                alt="Ticket QR Code"
                style={{ width: '200px', height: '200px', display: 'block' }}
              />
            </div>
            <div
              style={{
                marginTop: '14px',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                fontSize: '1rem',
                letterSpacing: '1px',
                color: '#5b4ce2',
              }}
            >
              {qrModalTicket.ticket_code}
            </div>
            <p className="notice" style={{ marginTop: '12px' }}>
              Present this QR code at the entrance for instant check-in.
            </p>
            <button className="secondary-btn full" style={{ marginTop: '16px' }} onClick={() => setQrModalTicket(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
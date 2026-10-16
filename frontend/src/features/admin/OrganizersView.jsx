import { useState, useMemo } from 'react'
import {
  CalendarDays,
  MapPin,
  Plus,
  Users,
  Ticket,
  AlertCircle,
  X,
  Layers,
  Sparkles,
  Ban,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { organizerApi, eventApi } from '../../services/api'

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

function CreateEventModal({ onClose, onCreated, onNotify }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [venueId, setVenueId] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const { data: venues = [] } = useQuery({
    queryKey: ['venues'],
    queryFn: organizerApi.venues,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: organizerApi.categories,
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')

    if (!categoryId) {
      setMessage('Please select an event category.')
      return
    }
    if (!venueId) {
      setMessage('Please select a venue.')
      return
    }
    if (new Date(endAt) <= new Date(startAt)) {
      setMessage('End time must be after the start time.')
      return
    }

    setSubmitting(true)
    try {
      await organizerApi.createEvent({
        title,
        description,
        category_id: categoryId,
        venue_id: venueId,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
      })
      onNotify(`Event "${title}" published successfully!`)
      onCreated()
      onClose()
    } catch (err) {
      setMessage(errorMessage(err, 'Failed to create event. Please check inputs.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create New Event">
      <form className="auth-modal create-event-modal" onSubmit={handleSubmit}>
        <button className="icon-button auth-close" type="button" onClick={onClose} aria-label="Close">
          <X />
        </button>
        <div className="eyebrow auth-eyebrow">Campus Event Manager</div>
        <h2>Publish New Event</h2>
        <p className="muted">Seat geometry is automatically provisioned based on the chosen venue layout.</p>

        {message && <p className="form-message" role="status">{message}</p>}

        <label>
          Event Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual Hackathon 2026"
            minLength="3"
            maxLength="180"
            required
          />
        </label>

        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description of the workshop, rules, and schedule..."
            rows="3"
            required
            className="styled-textarea"
          />
        </label>

        <div className="form-row">
          <label>
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="styled-select"
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <label>
            Venue
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              required
              className="styled-select"
            >
              <option value="">Select venue…</option>
              {venues.map((v) => (
                <option value={v.id} key={v.id}>{v.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            Start Date & Time
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
            />
          </label>

          <label>
            End Date & Time
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
            />
          </label>
        </div>

        <button className="primary full" type="submit" disabled={submitting}>
          {submitting ? 'Creating layout & publishing…' : 'Publish Event'}
        </button>
      </form>
    </div>
  )
}

function AttendeesModal({ event, onClose, onNotify }) {
  const [scanCode, setScanCode] = useState('')
  const [checkingIn, setCheckingIn] = useState(false)
  const [scanMessage, setScanMessage] = useState(null)
  const queryClient = useQueryClient()

  const { data: attendees = [], isLoading, isError, error } = useQuery({
    queryKey: ['attendees', event.id],
    queryFn: () => organizerApi.attendees(event.id),
  })

  const handleCheckIn = async (codeToUse) => {
    const code = (codeToUse || scanCode).trim()
    if (!code) return
    setCheckingIn(true)
    setScanMessage(null)
    try {
      const res = await organizerApi.checkInTicket(code)
      setScanMessage({ type: 'success', text: res.message })
      setScanCode('')
      queryClient.invalidateQueries({ queryKey: ['attendees', event.id] })
      if (onNotify) onNotify(res.message)
    } catch (err) {
      setScanMessage({ type: 'error', text: errorMessage(err, 'Unable to check in ticket.') })
    } finally {
      setCheckingIn(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Attendees for ${event.title}`}>
      <div className="modal attendees-modal">
        <div className="modal-head">
          <div>
            <h2>{event.title} — Attendee Roster</h2>
            <div className="muted">{event.venue} · {attendees.length} total bookings</div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="attendees-body">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#f8f9fc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
            <Ticket size={18} color="#5b4ce2" />
            <input
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="Scan or enter ticket code (e.g. TIX-...)"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', font: 'inherit', fontSize: '0.9rem' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCheckIn() }}
            />
            <button
              className="primary"
              onClick={() => handleCheckIn()}
              disabled={checkingIn || !scanCode.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {checkingIn ? 'Checking…' : 'Check In'}
            </button>
          </div>

          {scanMessage && (
            <div className={`form-message ${scanMessage.type === 'success' ? 'form-message-success' : ''}`} style={{ marginBottom: '16px' }}>
              {scanMessage.text}
            </div>
          )}

          {isLoading ? (
            <p className="muted loading">Loading attendee roster…</p>
          ) : isError ? (
            <p className="form-message">Unable to load attendees: {errorMessage(error, 'Error')}</p>
          ) : attendees.length === 0 ? (
            <div className="empty" style={{ margin: '20px' }}>
              <Users size={32} style={{ color: '#8d99ae', margin: '0 auto 8px' }} />
              <p className="muted">No students have booked seats for this event yet.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="attendee-table">
                <thead>
                  <tr>
                    <th>Attendee</th>
                    <th>Booking Ref</th>
                    <th>Status</th>
                    <th>Allocated Seats</th>
                    <th>Ticket Code</th>
                    <th>Booked At</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((item) => (
                    <tr key={item.booking_id}>
                      <td>
                        <strong>{item.attendee_name}</strong>
                        <div className="muted" style={{ fontSize: '0.78rem' }}>{item.attendee_email}</div>
                      </td>
                      <td>
                        <span className="ref-pill-small">{item.booking_reference}</span>
                      </td>
                      <td>
                        <span className={`status-badge-small ${item.status === 'CONFIRMED' ? 'status-confirmed' : 'status-cancelled'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div className="seat-tags-inline">
                          {item.seats.map((s) => (
                            <span className="seat-tag-small" key={s}>{s}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="ticket-codes-inline" style={{ alignItems: 'center' }}>
                          {item.tickets.map((t) => (
                            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <code className="ticket-code-small">{t}</code>
                              {item.status === 'CONFIRMED' && (
                                <button
                                  className="text-btn"
                                  style={{ fontSize: '0.72rem', padding: '2px 6px', color: '#16794c', background: '#e6f9f0', borderRadius: '4px', border: '1px solid #b7f0d0' }}
                                  onClick={() => handleCheckIn(t)}
                                  title="Check in attendee at door"
                                >
                                  Admit
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="muted" style={{ fontSize: '0.8rem' }}>
                        {formatDate(item.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BlockSeatsModal({ event, onClose, onNotify }) {
  const [selectedSeatIds, setSelectedSeatIds] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const queryClient = useQueryClient()

  const { data: seats = [], isLoading } = useQuery({
    queryKey: ['seats', event.id],
    queryFn: () => eventApi.seats(event.id),
  })

  const rows = useMemo(() => {
    const map = seats.reduce((acc, seat) => {
      (acc[seat.row] ||= []).push(seat)
      return acc
    }, {})
    Object.keys(map).forEach((r) => {
      map[r].sort((a, b) => a.position - b.position)
    })
    return Object.values(map)
  }, [seats])

  const toggleSeat = (seat) => {
    if (seat.status === 'BOOKED') return
    setSelectedSeatIds((prev) =>
      prev.includes(seat.id) ? prev.filter((id) => id !== seat.id) : [...prev, seat.id]
    )
  }

  const handleUpdateBlocking = async (isBlocked) => {
    if (!selectedSeatIds.length) return
    setSubmitting(true)
    try {
      const res = await organizerApi.blockSeats(event.id, selectedSeatIds, isBlocked)
      onNotify(res.message)
      setSelectedSeatIds([])
      queryClient.invalidateQueries({ queryKey: ['seats', event.id] })
      queryClient.invalidateQueries({ queryKey: ['organizer-events'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    } catch (err) {
      alert(errorMessage(err, 'Failed to update seat status.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Block seats for ${event.title}`}>
      <div className="modal seminar-modal">
        <div className="modal-head">
          <div>
            <h2>Block / Reserve Seats (VIP & Crew)</h2>
            <div className="muted">{event.title} · {event.venue}</div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="booking-layout seminar-layout">
          <div className="seat-panel seminar-panel">
            <p className="muted" style={{ textAlign: 'center', marginBottom: '14px' }}>
              Click any available or blocked seats to select them, then choose <strong>Block</strong> or <strong>Unblock</strong>.
            </p>

            {isLoading ? (
              <p className="muted loading">Loading seat grid…</p>
            ) : (
              <div className="seminar-grid">
                {rows.map((rowSeats) => {
                  const rowLabel = rowSeats[0].row
                  const half = Math.ceil(rowSeats.length / 2)
                  const leftSeats = rowSeats.slice(0, half)
                  const rightSeats = rowSeats.slice(half)

                  return (
                    <div className="seminar-row" key={rowLabel}>
                      <span className="row-name">{rowLabel}</span>
                      <div className="seat-wing left-wing">
                        {leftSeats.map((seat) => {
                          const isSelected = selectedSeatIds.includes(seat.id)
                          return (
                            <button
                              key={seat.id}
                              onClick={() => toggleSeat(seat)}
                              className={`seat ${seat.status.toLowerCase()} ${isSelected ? 'selected' : ''}`}
                              title={`${seat.label}: ${seat.status}`}
                              disabled={seat.status === 'BOOKED'}
                            >
                              {seat.label.replace(/^[A-Z]-?/, '')}
                            </button>
                          )
                        })}
                      </div>

                      <div className="center-aisle">
                        <span className="aisle-step" />
                        <span className="aisle-step" />
                      </div>

                      <div className="seat-wing right-wing">
                        {rightSeats.map((seat) => {
                          const isSelected = selectedSeatIds.includes(seat.id)
                          return (
                            <button
                              key={seat.id}
                              onClick={() => toggleSeat(seat)}
                              className={`seat ${seat.status.toLowerCase()} ${isSelected ? 'selected' : ''}`}
                              title={`${seat.label}: ${seat.status}`}
                              disabled={seat.status === 'BOOKED'}
                            >
                              {seat.label.replace(/^[A-Z]-?/, '')}
                            </button>
                          )
                        })}
                      </div>
                      <span className="row-name">{rowLabel}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="legend" style={{ marginTop: '20px' }}>
              <span><i className="dot" style={{ background: '#e7eefc' }} /> Available</span>
              <span><i className="dot" style={{ background: 'repeating-linear-gradient(135deg,#eee 0 3px,#d7dbe3 3px 6px)' }} /> Blocked (Reserved)</span>
              <span><i className="dot" style={{ background: '#5b4ce2' }} /> Selected to Edit</span>
              <span><i className="dot" style={{ background: '#d9dde4' }} /> Booked (Locked)</span>
            </div>
          </div>

          <aside className="booking-summary">
            <h3>Seat Management</h3>
            <p className="muted">Blocked seats cannot be viewed or selected by students.</p>

            <div style={{ margin: '16px 0' }}>
              <strong>{selectedSeatIds.length} seat(s) selected</strong>
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              <button
                className="danger-btn-filled full"
                disabled={!selectedSeatIds.length || submitting}
                onClick={() => handleUpdateBlocking(true)}
              >
                {submitting ? 'Updating…' : 'Block Selected Seats'}
              </button>

              <button
                className="secondary-btn full"
                disabled={!selectedSeatIds.length || submitting}
                onClick={() => handleUpdateBlocking(false)}
              >
                {submitting ? 'Updating…' : 'Unblock Selected Seats'}
              </button>

              <button className="text-btn full" style={{ marginTop: '10px' }} onClick={onClose}>
                Done / Close
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function OrganizersView({ user, onSignIn, onBrowse, onNotify }) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedEventForAttendees, setSelectedEventForAttendees] = useState(null)
  const [selectedEventForBlocking, setSelectedEventForBlocking] = useState(null)
  const [claimingRole, setClaimingRole] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const queryClient = useQueryClient()

  const isOrganizer = user && (user.role === 'ORGANIZER' || user.role === 'ADMIN')

  const { data: events = [], isLoading, isError, error } = useQuery({
    queryKey: ['organizer-events'],
    queryFn: organizerApi.events,
    enabled: !!isOrganizer,
  })

  const handleClaimRole = async () => {
    setClaimingRole(true)
    try {
      await organizerApi.claimRole()
      await queryClient.invalidateQueries({ queryKey: ['account'] })
      onNotify('Your account was upgraded to Event Organizer!')
    } catch (err) {
      onNotify(errorMessage(err, 'Failed to upgrade role.'))
    } finally {
      setClaimingRole(false)
    }
  }

  if (!user) {
    return (
      <div className="organizer-page">
        <div className="portal-hero">
          <div className="eyebrow">CampusTix for Coordinators & Clubs</div>
          <h2>Host & Manage Campus Events</h2>
          <p className="muted">
            The organizer suite gives campus societies, club leads, and faculty full control over venue layout,
            seat allocations, and real-time attendee admissions.
          </p>

          <div className="portal-features">
            <div className="portal-feature-card">
              <div className="feature-icon"><Layers size={22} /></div>
              <h4>Automatic Seat Layouts</h4>
              <p>Venues automatically generate physical seating grids with row locks to prevent double-booking.</p>
            </div>
            <div className="portal-feature-card">
              <div className="feature-icon"><Ticket size={22} /></div>
              <h4>Instant Digital Tickets</h4>
              <p>Unique cryptographically signed ticket codes are generated upon confirmed reservation.</p>
            </div>
            <div className="portal-feature-card">
              <div className="feature-icon"><Users size={22} /></div>
              <h4>Live Attendee Rosters</h4>
              <p>Track student registrations, seat numbers, and admission verification in real time.</p>
            </div>
          </div>

          <div className="portal-actions">
            <button className="primary" onClick={onSignIn}>Sign in to Organizer Portal</button>
            <button className="text-btn" onClick={onBrowse}>Back to event discovery</button>
          </div>

          <div className="demo-hint-box">
            <Sparkles size={16} />
            <span>Local Demo Account: Sign in with <code>organizer@example.com</code> to preview the live organizer portal.</span>
          </div>
        </div>
      </div>
    )
  }

  if (!isOrganizer) {
    return (
      <div className="organizer-page">
        <div className="portal-hero">
          <div className="eyebrow" style={{ color: '#5b4ce2' }}>Organizer Access</div>
          <h2>Become an Event Organizer</h2>
          <p className="muted">
            You are currently signed in as <strong>{user.full_name}</strong> ({user.email}) with the <strong>Student</strong> role.
            The Organizer Portal is reserved for club coordinators and event hosts to publish events.
          </p>

          <div className="role-claim-card">
            <h3>Try the Organizer Dashboard</h3>
            <p className="muted">
              For evaluation and local demonstration, you can upgrade your account to an Organizer with one click.
            </p>
            <button className="primary" onClick={handleClaimRole} disabled={claimingRole}>
              {claimingRole ? 'Activating…' : 'Enable Organizer Mode for this Account'}
            </button>
          </div>

          <div className="portal-actions" style={{ marginTop: '24px' }}>
            <button className="text-btn" onClick={onBrowse}>Return to Discover</button>
          </div>
        </div>
      </div>
    )
  }

  const totalEvents = events.length
  const totalBookings = events.reduce((acc, ev) => acc + (ev.total_bookings || 0), 0)
  const totalBookedSeats = events.reduce((acc, ev) => acc + (ev.booked_seats || 0), 0)

  const handleSeedDemoData = async (reset = false) => {
    if (reset && !window.confirm('Reset all demo events, venues, and student bookings back to default demo state?')) {
      return
    }
    setSeeding(true)
    try {
      const res = await organizerApi.seedDemoData(reset)
      await queryClient.invalidateQueries({ queryKey: ['organizer-events'] })
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      onNotify(res.message || 'Demonstration data loaded successfully!')
    } catch (err) {
      onNotify(errorMessage(err, 'Failed to seed demo data.'))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="organizer-page">
      <div className="section-top">
        <div>
          <div className="eyebrow" style={{ color: '#5b4ce2' }}>
            {user.role === 'ADMIN' ? 'Administrator' : 'Organizer'} Portal
          </div>
          <h2 className="section-title">Organizer Dashboard</h2>
          <p className="section-copy">
            Welcome back, {user.full_name}. Oversee your scheduled events and seating allocations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="secondary-btn"
            onClick={() => handleSeedDemoData(true)}
            disabled={seeding}
            title="Wipe and restore 5 events across 2 venues with sample bookings"
          >
            <Sparkles size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
            {seeding ? 'Seeding…' : 'Re-Seed Demo Data'}
          </button>
          <button className="primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
            Create New Event
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h4>Events Hosted</h4>
          <div className="stat-value">{totalEvents}</div>
          <span className="stat-sub">Active campus events</span>
        </div>
        <div className="stat-card">
          <h4>Total Bookings</h4>
          <div className="stat-value">{totalBookings}</div>
          <span className="stat-sub">Reservations made</span>
        </div>
        <div className="stat-card">
          <h4>Seats Reserved</h4>
          <div className="stat-value">{totalBookedSeats}</div>
          <span className="stat-sub">Total allocated tickets</span>
        </div>
      </div>

      <h3 style={{ margin: '36px 0 16px', fontFamily: 'Fraunces, serif', fontSize: '1.4rem' }}>
        Your Events
      </h3>

      {isLoading ? (
        <p className="muted loading">Loading your events…</p>
      ) : isError ? (
        <div className="empty">
          <AlertCircle size={28} style={{ color: '#d32f2f', margin: '0 auto 10px' }} />
          <strong>Unable to load organizer events.</strong>
          <br />
          {errorMessage(error, 'Please refresh.')}
        </div>
      ) : events.length === 0 ? (
        <div className="empty">
          <CalendarDays size={36} style={{ color: '#8d99ae', margin: '0 auto 12px' }} />
          <h3>No events published yet</h3>
          <p className="muted">You haven't created any events. Click below to publish your first campus event or populate sample demo events.</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
            <button className="secondary-btn" onClick={() => handleSeedDemoData(false)} disabled={seeding}>
              <Sparkles size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
              {seeding ? 'Populating…' : 'Seed Sample Events & Venues'}
            </button>
            <button className="primary" onClick={() => setShowCreateModal(true)}>
              Create your first event
            </button>
          </div>
        </div>
      ) : (
        <div className="organizer-events-list">
          {events.map((ev) => {
            const booked = ev.booked_seats || 0
            const total = ev.total_seats || 1
            const pct = Math.min(100, Math.round((booked / total) * 100))

            return (
              <article className="organizer-event-card" key={ev.id}>
                <div className="organizer-event-main">
                  <div className="event-header-row">
                    <span className="category-tag">{ev.category}</span>
                    <span className="status-badge-small status-confirmed">{ev.status}</span>
                  </div>
                  <h3>{ev.title}</h3>
                  <p className="muted event-desc-clamp">{ev.description}</p>
                  <div className="event-meta-row">
                    <span><CalendarDays size={14} /> {formatDate(ev.start_at)}</span>
                    <span><MapPin size={14} /> {ev.venue}</span>
                  </div>
                </div>

                <div className="organizer-event-metrics">
                  <div className="occupancy-stats">
                    <div className="occupancy-labels">
                      <span>Seat Occupancy</span>
                      <strong>{booked} / {total} seats ({pct}%)</strong>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mini-stats">
                      <span>Available: <strong>{ev.available_seats}</strong></span>
                      <span>Held: <strong>{ev.held_seats}</strong></span>
                      <span>Bookings: <strong>{ev.total_bookings}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      className="secondary-btn"
                      onClick={() => setSelectedEventForBlocking(ev)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Ban size={15} />
                      Block Seats (VIP / Guests)
                    </button>

                    <button
                      className="secondary-btn"
                      onClick={() => setSelectedEventForAttendees(ev)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Users size={15} />
                      View Attendees ({ev.total_bookings})
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['organizer-events'] })
            queryClient.invalidateQueries({ queryKey: ['events'] })
          }}
          onNotify={onNotify}
        />
      )}

      {selectedEventForAttendees && (
        <AttendeesModal
          event={selectedEventForAttendees}
          onClose={() => setSelectedEventForAttendees(null)}
          onNotify={onNotify}
        />
      )}

      {selectedEventForBlocking && (
        <BlockSeatsModal
          event={selectedEventForBlocking}
          onClose={() => setSelectedEventForBlocking(null)}
          onNotify={onNotify}
        />
      )}
    </div>
  )
}
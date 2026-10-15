import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, MapPin, Search, Ticket, X } from 'lucide-react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, eventApi } from '../services/api'
import { MyBookingsView } from '../features/bookings/MyBookingsView'
import { OrganizersView } from '../features/admin/OrganizersView'

const categories = ['All', 'Technical', 'Cultural', 'Workshop', 'Seminar', 'Hackathon', 'Sports']
const palette = ['one', 'two', 'three', 'four', 'five', 'six']
const noSeats = []

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(value))
}

function errorMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback
}

function AuthModal({ initialMode = 'login', onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const user = await authApi.login(email, password)
        onAuthenticated(user)
        onClose()
      } else {
        const result = await authApi.register(name, email, password)
        setMessage(`${result.message} Then return here and sign in.`)
      }
    } catch (error) {
      setMessage(errorMessage(error, 'Unable to complete that request.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Log in' : 'Create account'}>
      <form className="auth-modal" onSubmit={submit}>
        <button className="icon-button auth-close" type="button" onClick={onClose} aria-label="Close">
          <X />
        </button>
        <div className="eyebrow auth-eyebrow">CampusTix account</div>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="muted">
          {mode === 'login' ? 'Sign in to hold and reserve seats.' : 'Your email must be verified before you can reserve seats.'}
        </p>
        {mode === 'register' && (
          <label>
            Full name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="120" required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={mode === 'register' ? 10 : 1}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {message && <p className="form-message" role="status">{message}</p>}
        <button className="primary full" disabled={submitting}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
        <button
          className="text-btn auth-switch"
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setMessage('')
          }}
        >
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  )
}

function SeatModal({ event, user, onClose, onSignIn, onViewBookings }) {
  const [selected, setSelected] = useState([])
  const [message, setMessage] = useState('')
  const [confirmedBooking, setConfirmedBooking] = useState(null)
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

  const toggle = (seat) => {
    if (seat.status !== 'AVAILABLE') return
    setSelected((old) => old.includes(seat.id) ? old.filter((id) => id !== seat.id) : old.length === 5 ? old : [...old, seat.id])
  }

  const reserve = async () => {
    if (!selected.length) return
    if (!user) {
      onSignIn()
      return
    }
    try {
      const hold = await eventApi.hold(event.id, selected)
      const booking = await eventApi.book(event.id, hold.id)
      setMessage(`Booking confirmed: ${booking.reference}`)
      setConfirmedBooking(booking)
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

function CampusTix() {
  const [view, setView] = useState('discover')
  const [active, setActive] = useState('All')
  const [search, setSearch] = useState('')
  const [booking, setBooking] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [toast, setToast] = useState(null)
  const queryClient = useQueryClient()

  const remote = useQuery({ queryKey: ['events'], queryFn: () => eventApi.list(), retry: false })
  const account = useQuery({ queryKey: ['account'], queryFn: () => authApi.me(), retry: false, staleTime: Infinity })
  const user = account.data
  const events = remote.data || []

  const filtered = events.filter(
    (event) =>
      (active === 'All' || event.category.toLowerCase() === active.toLowerCase()) &&
      `${event.title} ${event.description}`.toLowerCase().includes(search.toLowerCase())
  )

  const signOut = async () => {
    await authApi.logout()
    queryClient.setQueryData(['account'], null)
    setToast('You have been signed out.')
  }

  const handleAuthenticated = (authenticatedUser) => {
    queryClient.setQueryData(['account'], authenticatedUser)
    setToast(`Welcome back, ${authenticatedUser.full_name}!`)
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand" onClick={() => setView('discover')} style={{ cursor: 'pointer' }}>
          <span className="brand-mark"><Ticket size={18} /></span>
          CampusTix
        </div>
        <div className="nav-links">
          <a
            className={view === 'discover' ? 'active' : ''}
            onClick={() => setView('discover')}
          >
            Discover
          </a>
          <a
            className={view === 'bookings' ? 'active' : ''}
            onClick={() => {
              if (!user) setAuthMode('login')
              setView('bookings')
            }}
          >
            My bookings
          </a>
          <a
            className={view === 'organizers' ? 'active' : ''}
            onClick={() => setView('organizers')}
          >
            For organizers
          </a>
        </div>
        <div className="nav-actions">
          {user ? (
            <>
              <span className="signed-in">Hi, {user.full_name}</span>
              <button className="text-btn" onClick={signOut}>Log out</button>
            </>
          ) : (
            <>
              <button className="text-btn" onClick={() => setAuthMode('login')}>Log in</button>
              <button className="primary" onClick={() => setAuthMode('register')}>Create account</button>
            </>
          )}
        </div>
      </nav>

      {view === 'discover' && (
        <>
          <header className="hero">
            <div>
              <div className="eyebrow">Your campus, in one place</div>
              <h1>Find the moments you’ll remember.</h1>
              <p>Discover workshops, shows, talks, and tournaments around campus. Reserve your seat in a few calm, clear steps.</p>
            </div>
            <div className="hero-card">
              <div className="date-chip">THIS WEEK</div>
              <h3>Code & Coffee: AI Edition</h3>
              <p>Practical tools, good coffee and bigger ideas.</p>
              <div className="hero-card-footer">
                <span>Wed, 21 Oct</span>
                <span>IS Seminar Hall</span>
              </div>
            </div>
          </header>

          <main className="content">
            <div className="section-top">
              <div>
                <h2 className="section-title">Upcoming on campus</h2>
                <p className="section-copy">Make a plan. Your next good story starts here.</p>
              </div>
              <div className="search">
                <Search />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search events"
                  aria-label="Search events"
                />
              </div>
            </div>

            <div className="filter-row">
              {categories.map((category) => (
                <button
                  className={`filter ${active === category ? 'active' : ''}`}
                  onClick={() => setActive(category)}
                  key={category}
                >
                  {category}
                </button>
              ))}
            </div>

            {remote.isLoading ? (
              <p className="muted loading">Loading events…</p>
            ) : remote.isError ? (
              <div className="empty">
                <strong>Unable to reach the booking service.</strong>
                <br />
                Start the API on port 8000, then refresh. {errorMessage(remote.error, '')}
              </div>
            ) : (
              <section className="grid">
                {filtered.length ? (
                  filtered.map((event, index) => (
                    <article className="event-card" key={event.id}>
                      <div className={`poster ${palette[index % palette.length]}`}>
                        <small>{event.category}</small>
                        <span className="ticket-icon"><Ticket size={21} /></span>
                      </div>
                      <div className="event-info">
                        <h3>{event.title}</h3>
                        <div className="event-meta">
                          <span><CalendarDays size={13} /> {formatDate(event.start_at)}</span>
                          <span><MapPin size={13} /> {event.venue}</span>
                        </div>
                        <div className="event-footer">
                          <span className="availability">{event.available_seats} seats left</span>
                          <button onClick={() => setBooking(event)}>
                            Book <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty">No events match that search. Try another category.</div>
                )}
              </section>
            )}
          </main>
        </>
      )}

      {view === 'bookings' && (
        <main className="content">
          <MyBookingsView
            user={user}
            onSignIn={() => setAuthMode('login')}
            onBrowse={() => setView('discover')}
            onNotify={(msg) => setToast(msg)}
          />
        </main>
      )}

      {view === 'organizers' && (
        <main className="content">
          <OrganizersView
            user={user}
            onSignIn={() => setAuthMode('login')}
            onBrowse={() => setView('discover')}
            onNotify={(msg) => setToast(msg)}
          />
        </main>
      )}

      {booking && (
        <SeatModal
          event={booking}
          user={user}
          onClose={() => setBooking(null)}
          onSignIn={() => setAuthMode('login')}
          onViewBookings={() => setView('bookings')}
        />
      )}

      {authMode && (
        <AuthModal
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

const client = new QueryClient()
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <CampusTix />
    </QueryClientProvider>
  )
}

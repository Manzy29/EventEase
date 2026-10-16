import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronRight, MapPin, Search, Ticket, Info, Sparkles } from 'lucide-react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, eventApi, systemApi } from '../services/api'
import { Navbar } from '../components/common/Navbar'
import { AuthModal } from '../features/auth/AuthModal'
import { SeatModal } from '../features/events/SeatModal'
import { EventDetailsModal } from '../features/events/EventDetailsModal'
import { MyBookingsView } from '../features/bookings/MyBookingsView'
import { OrganizersView } from '../features/admin/OrganizersView'

const categories = ['All', 'Technical', 'Cultural', 'Workshop', 'Seminar', 'Hackathon', 'Sports']
const palette = ['one', 'two', 'three', 'four', 'five', 'six']

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(value))
}

function errorMessage(error, fallback) {
  return error.response?.data?.detail || error.message || fallback
}

function DiscoverView({ onBook, onViewDetails }) {
  const [active, setActive] = useState('All')
  const [search, setSearch] = useState('')

  const queryParams = {
    search: search.trim() || undefined,
    category: active === 'All' ? undefined : active,
  }

  const remote = useQuery({
    queryKey: ['events', queryParams],
    queryFn: () => eventApi.list(queryParams),
    retry: false,
  })

  const events = remote.data || []

  return (
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
          <div className="skeleton-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div className="skeleton-card" key={i}>
                <div className="skeleton-poster" />
                <div className="skeleton-body">
                  <div className="skeleton-line" />
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : remote.isError ? (
          <div className="empty">
            <strong>Unable to reach the booking service.</strong>
            <br />
            Start the API on port 8000, then refresh. {errorMessage(remote.error, '')}
          </div>
        ) : (
          <section className="grid">
            {events.length ? (
              events.map((event, index) => (
                <article className="event-card" key={event.id}>
                  <div
                    className={`poster ${palette[index % palette.length]}`}
                    onClick={() => onViewDetails(event)}
                    style={{ cursor: 'pointer' }}
                    title="Click to view event details"
                  >
                    <small>{event.category}</small>
                    <span className="ticket-icon"><Ticket size={21} /></span>
                  </div>
                  <div className="event-info">
                    <h3
                      onClick={() => onViewDetails(event)}
                      style={{ cursor: 'pointer' }}
                      title="Click to view event details"
                    >
                      {event.title}
                    </h3>
                    <div className="event-meta">
                      <span><CalendarDays size={13} /> {formatDate(event.start_at)}</span>
                      <span><MapPin size={13} /> {event.venue}</span>
                    </div>
                    <div className="event-footer">
                      <span className="availability">{event.available_seats} seats left</span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="icon-button"
                          onClick={() => onViewDetails(event)}
                          title="Event details"
                          aria-label="Event details"
                          style={{ padding: '6px' }}
                        >
                          <Info size={15} />
                        </button>
                        <button onClick={() => onBook(event)}>
                          Book <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty" style={{ padding: '36px 20px', textAlign: 'center' }}>
                <p className="muted" style={{ marginBottom: '16px' }}>No events match your current filter or database is unseeded.</p>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await systemApi.seed(false)
                      remote.refetch()
                    } catch (e) {
                      console.error('Seed error:', e)
                    }
                  }}
                >
                  <Sparkles size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
                  Load Demonstration Events
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  )
}

function CampusTix() {
  const [booking, setBooking] = useState(null)
  const [detailsEvent, setDetailsEvent] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const account = useQuery({ queryKey: ['account'], queryFn: () => authApi.me(), retry: false, staleTime: Infinity })
  const user = account.data

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
      <Navbar
        user={user}
        onSignIn={() => setAuthMode('login')}
        onRegister={() => setAuthMode('register')}
        onSignOut={signOut}
      />

      <Routes>
        <Route
          path="/"
          element={
            <DiscoverView
              user={user}
              onBook={(ev) => setBooking(ev)}
              onViewDetails={(ev) => setDetailsEvent(ev)}
              onSignIn={() => setAuthMode('login')}
            />
          }
        />
        <Route
          path="/bookings"
          element={
            <main className="content">
              <MyBookingsView
                user={user}
                onSignIn={() => setAuthMode('login')}
                onBrowse={() => navigate('/')}
                onNotify={(msg) => setToast(msg)}
              />
            </main>
          }
        />
        <Route
          path="/organizers"
          element={
            <main className="content">
              <OrganizersView
                user={user}
                onSignIn={() => setAuthMode('login')}
                onBrowse={() => navigate('/')}
                onNotify={(msg) => setToast(msg)}
              />
            </main>
          }
        />
      </Routes>

      {booking && (
        <SeatModal
          event={booking}
          user={user}
          onClose={() => setBooking(null)}
          onSignIn={() => setAuthMode('login')}
          onViewBookings={() => navigate('/bookings')}
        />
      )}

      {detailsEvent && (
        <EventDetailsModal
          event={detailsEvent}
          onClose={() => setDetailsEvent(null)}
          onSelectSeats={(ev) => setBooking(ev)}
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

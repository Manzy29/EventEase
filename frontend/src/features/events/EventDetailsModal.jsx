import { CalendarDays, MapPin, User, Ticket, X } from 'lucide-react'

function formatDateTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function EventDetailsModal({ event, onClose, onSelectSeats }) {
  if (!event) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Details for ${event.title}`}>
      <div className="modal" style={{ maxWidth: '600px', width: '92%' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="category-tag">{event.category}</span>
            <span className="availability" style={{ fontSize: '0.8rem' }}>{event.available_seats} seats left</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <h2 style={{ fontFamily: '"Fraunces", serif', fontSize: '1.6rem', margin: '8px 0 12px', color: '#172233' }}>
            {event.title}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '16px 0', background: '#f8f9fc', padding: '14px 16px', border: '1px solid #eef1f6', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#556275', fontSize: '0.9rem' }}>
              <CalendarDays size={16} color="#5b4ce2" />
              <span><strong>Start:</strong> {formatDateTime(event.start_at)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#556275', fontSize: '0.9rem' }}>
              <CalendarDays size={16} color="#5b4ce2" />
              <span><strong>End:</strong> {formatDateTime(event.end_at)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#556275', fontSize: '0.9rem' }}>
              <MapPin size={16} color="#5b4ce2" />
              <span><strong>Venue:</strong> {event.venue}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#556275', fontSize: '0.9rem' }}>
              <User size={16} color="#5b4ce2" />
              <span><strong>Organized by:</strong> {event.organizer}</span>
            </div>
          </div>

          <div style={{ margin: '16px 0' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>About this event</h4>
            <p style={{ color: '#556275', lineHeight: 1.6, fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>
              {event.description}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button className="secondary-btn full" onClick={onClose}>
              Close
            </button>
            <button
              className="primary full"
              onClick={() => {
                onClose()
                onSelectSeats(event)
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Ticket size={16} /> Select seats
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

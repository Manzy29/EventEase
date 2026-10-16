import axios from 'axios'

// In development Vite proxies this path to FastAPI.  Keeping requests
// same-origin means the HttpOnly session cookie is sent reliably and avoids
// having a browser talk to a hard-coded localhost port directly.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1', withCredentials: true })

export const eventApi = {
  list: (params) => api.get('/events', { params }).then(({ data }) => data),
  get: (eventId) => api.get(`/events/${eventId}`).then(({ data }) => data),
  seats: (eventId) => api.get(`/events/${eventId}/seats`).then(({ data }) => data),
  hold: (eventId, event_seat_ids) => api.post(`/events/${eventId}/holds`, { event_seat_ids }).then(({ data }) => data),
  book: (eventId, hold_id) => api.post(`/events/${eventId}/bookings`, { hold_id }).then(({ data }) => data),
   getPending: (eventId) => api.get(`/events/${eventId}/pending-booking`).then(({ data }) => data),
  verifyBookingOtp: (bookingId, holdId, otp) => api.post(`/bookings/${bookingId}/verify-otp?hold_id=${holdId}`, { otp }).then(({ data }) => data),
}


export const authApi = {
  me: () => api.get('/auth/me').then(({ data }) => data),
  login: (email, password) => api.post('/auth/login', { email, password }).then(({ data }) => data),
  register: (full_name, email, password) => api.post('/auth/register', { full_name, email, password }).then(({ data }) => data),
  verifyEmail: (email, code) => api.post('/auth/verify-email', { email, code }).then(({ data }) => data),
  logout: () => api.post('/auth/logout'),
}

export const bookingApi = {
  myBookings: () => api.get('/bookings/me').then(({ data }) => data),
  cancel: (bookingId) => api.post(`/bookings/${bookingId}/cancel`).then(({ data }) => data),
}

export const organizerApi = {
  events: () => api.get('/organizer/events').then(({ data }) => data),
  attendees: (eventId) => api.get(`/organizer/events/${eventId}/attendees`).then(({ data }) => data),
  createEvent: (data) => api.post('/organizer/events', data).then(({ data }) => data),
  updateEvent: (eventId, data) => api.put(`/organizer/events/${eventId}`, data).then(({ data }) => data),
  cancelEvent: (eventId) => api.post(`/organizer/events/${eventId}/cancel`).then(({ data }) => data),
  checkInTicket: (ticketCode) => api.post(`/organizer/tickets/${ticketCode}/check-in`).then(({ data }) => data),
  venues: () => api.get('/organizer/venues').then(({ data }) => data),
  categories: () => api.get('/organizer/categories').then(({ data }) => data),
  claimRole: () => api.post('/organizer/claim-role').then(({ data }) => data),
  seedDemoData: (reset = false) => api.post('/system/seed-data', null, { params: { reset } }).then(({ data }) => data),
   blockSeats: (eventId, eventSeatIds, isBlocked = true) =>
    api.post(`/organizer/events/${eventId}/block-seats`, {
      event_seat_ids: eventSeatIds,
      is_blocked: isBlocked,
    }).then(({ data }) => data),
}

export const systemApi = {
  seed: (reset = false) => api.post('/system/seed-data', null, { params: { reset } }).then(({ data }) => data),
}


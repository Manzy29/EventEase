import axios from 'axios'

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1', withCredentials: true })

export const eventApi = {
  list: (params) => api.get('/events', { params }).then(({ data }) => data),
  seats: (eventId) => api.get(`/events/${eventId}/seats`).then(({ data }) => data),
  hold: (eventId, event_seat_ids) => api.post(`/events/${eventId}/holds`, { event_seat_ids }).then(({ data }) => data),
  book: (eventId, hold_id) => api.post(`/events/${eventId}/bookings`, { hold_id }).then(({ data }) => data),
}

-- 1. Upcoming events (INNER JOIN)
SELECT e.title, e.start_at, c.name AS category, v.name AS venue, u.full_name AS organizer
FROM events e JOIN event_categories c ON c.id=e.category_id JOIN venues v ON v.id=e.venue_id JOIN users u ON u.id=e.organizer_id
WHERE e.status='PUBLISHED' AND e.start_at > now() ORDER BY e.start_at;

-- 2. Student booking history (LEFT JOIN preserves cancelled records)
SELECT b.booking_reference, b.status, e.title, e.start_at, count(bs.id) AS seats
FROM bookings b JOIN events e ON e.id=b.event_id LEFT JOIN booking_seats bs ON bs.booking_id=b.id
WHERE b.user_id=:user_id GROUP BY b.id,e.title,e.start_at ORDER BY b.created_at DESC;

-- 3. Occupancy and low-capacity report (CTE, aggregates, HAVING)
WITH inventory AS (
 SELECT es.event_id, count(*) FILTER (WHERE NOT es.is_blocked) AS sellable,
 count(bs.id) FILTER (WHERE bs.released_at IS NULL) AS booked
 FROM event_seats es LEFT JOIN booking_seats bs ON bs.event_seat_id=es.id GROUP BY es.event_id
)
SELECT e.title, booked, sellable, round(100.0*booked/nullif(sellable,0),2) AS occupancy_pct
FROM inventory i JOIN events e ON e.id=i.event_id WHERE sellable-booked < :remaining_threshold;

-- 4. Seats booked by row for an event
SELECT vr.row_label, count(*) AS booked_seats FROM booking_seats bs
JOIN event_seats es ON es.id=bs.event_seat_id JOIN venue_seats vs ON vs.id=es.venue_seat_id
JOIN venue_rows vr ON vr.id=vs.venue_row_id WHERE es.event_id=:event_id AND bs.released_at IS NULL GROUP BY vr.row_label ORDER BY vr.row_label;

-- 5. Availability states; expired holds are intentionally ignored.
SELECT count(*) FILTER (WHERE es.is_blocked) AS blocked,
 count(*) FILTER (WHERE NOT es.is_blocked AND bs.id IS NULL AND hi.id IS NULL) AS available,
 count(DISTINCT bs.id) AS booked, count(DISTINCT hi.id) AS held
FROM event_seats es LEFT JOIN booking_seats bs ON bs.event_seat_id=es.id AND bs.released_at IS NULL
LEFT JOIN seat_hold_items hi ON hi.event_seat_id=es.id LEFT JOIN seat_holds h ON h.id=hi.seat_hold_id AND h.status='ACTIVE' AND h.expires_at>now()
WHERE es.event_id=:event_id;

-- 6–8. Most popular events and their students (GROUP BY/HAVING).
SELECT e.title, count(DISTINCT b.id) AS booking_count FROM events e LEFT JOIN bookings b ON b.event_id=e.id AND b.status='CONFIRMED'
GROUP BY e.id HAVING count(DISTINCT b.id)>0 ORDER BY booking_count DESC;
SELECT DISTINCT u.full_name,u.email FROM users u JOIN bookings b ON b.user_id=u.id WHERE b.event_id=:event_id AND b.status='CONFIRMED';

-- 9. Students without a booking (anti-join).
SELECT u.full_name,u.email FROM users u WHERE u.role='STUDENT' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.user_id=u.id AND b.status='CONFIRMED');

-- 10–13. Organizer events, monthly report, cancellations, and expired holds.
SELECT * FROM events WHERE organizer_id=:organizer_id ORDER BY start_at;
SELECT date_trunc('month',created_at) AS month,count(*) AS bookings FROM bookings GROUP BY month ORDER BY month;
SELECT event_id,count(*) AS cancellations FROM bookings WHERE status='CANCELLED' GROUP BY event_id;
SELECT * FROM seat_holds WHERE status='ACTIVE' AND expires_at<=now();

-- 14–16. Ticket lookup and loyal attendees.
SELECT t.ticket_code,b.booking_reference,e.title,u.full_name FROM tickets t JOIN booking_seats bs ON bs.id=t.booking_seat_id JOIN bookings b ON b.id=bs.booking_id JOIN events e ON e.id=b.event_id JOIN users u ON u.id=b.user_id WHERE t.ticket_code=:ticket_code;
SELECT u.id,u.full_name,count(DISTINCT b.event_id) AS events_booked FROM users u JOIN bookings b ON b.user_id=u.id WHERE b.status='CONFIRMED' GROUP BY u.id HAVING count(DISTINCT b.event_id)>1;

-- 17. Inspect a PostgreSQL plan after seeding (use a real parameter in psql).
EXPLAIN ANALYZE SELECT * FROM booking_seats WHERE event_seat_id=:event_seat_id AND released_at IS NULL;

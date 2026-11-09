


-- 1. FIVE SIMPLE QUERIES

-- 1.1 List all verified students
SELECT id, full_name, email, role, created_at 
FROM users 
WHERE role = 'STUDENT' AND is_email_verified = true;

-- 1.2 List all active venues and locations
SELECT id, name, location, description, is_active 
FROM venues 
WHERE is_active = true;

-- 1.3 List all published events with dates and ticket prices
SELECT id, title, ticket_price, start_at, status 
FROM events 
WHERE status = 'PUBLISHED';

-- 1.4 List all confirmed bookings for a specific user
SELECT id, booking_reference, total_amount, status, created_at 
FROM bookings 
WHERE user_id = :user_id AND status = 'CONFIRMED';

-- 1.5 Retrieve valid digital tickets
SELECT ticket_code, booking_seat_id, status, issued_at 
FROM tickets 
WHERE status = 'VALID';



-- 2. FIVE NESTED QUERIES (SUBQUERIES)

-- 2.1 Find students who have booked seats for workshops
SELECT full_name, email FROM users 
WHERE id IN (
    SELECT b.user_id FROM bookings b 
    WHERE b.event_id IN (
        SELECT e.id FROM events e 
        WHERE e.category_id = (SELECT id FROM event_categories WHERE name = 'WORKSHOP')
    )
);

-- 2.2 Find events held in venues that have more than 30 physical seats
SELECT title, venue_id, ticket_price FROM events 
WHERE venue_id IN (
    SELECT vr.venue_id FROM venue_rows vr 
    JOIN venue_seats vs ON vs.venue_row_id = vr.id 
    GROUP BY vr.venue_id HAVING count(vs.id) > 30
);

-- 2.3 Find students with above-average booking counts
SELECT u.full_name, count(b.id) AS total_bookings FROM users u
JOIN bookings b ON b.user_id = u.id
GROUP BY u.id, u.full_name
HAVING count(b.id) > (
    SELECT avg(booking_count) FROM (
        SELECT count(id) AS booking_count FROM bookings GROUP BY user_id
    ) user_counts
);

-- 2.4 Find seats that have never had an active confirmed booking
SELECT seat_label, venue_row_id FROM venue_seats 
WHERE id NOT IN (
    SELECT DISTINCT vs.id FROM venue_seats vs
    JOIN event_seats es ON es.venue_seat_id = vs.id
    JOIN booking_seats bs ON bs.event_seat_id = es.id
    WHERE bs.released_at IS NULL
);

-- 2.5 Retrieve events whose ticket price is higher than the overall average ticket price
SELECT title, ticket_price, start_at FROM events 
WHERE ticket_price > (
    SELECT avg(ticket_price) FROM events
);



-- 3. TWO SET OPERATIONS (UNION & EXCEPT)
-- 3.1 UNION: Users who booked Technical OR Cultural events
SELECT DISTINCT u.full_name, u.email, 'Technical' AS event_type
FROM users u 
JOIN bookings b ON b.user_id = u.id 
JOIN events e ON e.id = b.event_id 
JOIN event_categories c ON c.id = e.category_id
WHERE c.name = 'TECHNICAL'
UNION
SELECT DISTINCT u.full_name, u.email, 'Cultural' AS event_type
FROM users u 
JOIN bookings b ON b.user_id = u.id 
JOIN events e ON e.id = b.event_id 
JOIN event_categories c ON c.id = e.category_id
WHERE c.name = 'CULTURAL';

-- 3.2 EXCEPT: Students who have registered but NEVER made a confirmed booking
SELECT id, full_name, email FROM users WHERE role = 'STUDENT'
EXCEPT
SELECT DISTINCT u.id, u.full_name, u.email 
FROM users u 
JOIN bookings b ON b.user_id = u.id 
WHERE b.status = 'CONFIRMED';



-- 4. TWO GROUP BY QUERIES
-- 4.1 Total physical seats configured per row in IS Seminar Hall
SELECT vr.row_label, count(vs.id) AS total_seats
FROM venue_rows vr
JOIN venue_seats vs ON vs.venue_row_id = vr.id
GROUP BY vr.row_label
ORDER BY vr.row_label;

-- 4.2 Total events scheduled per category
SELECT c.name AS category_name, count(e.id) AS event_count
FROM event_categories c
LEFT JOIN events e ON e.category_id = c.id
GROUP BY c.name;



-- 5. TWO HAVING QUERIES
-- 5.1 Events that have 2 or more confirmed student bookings
SELECT e.title, count(b.id) AS confirmed_bookings
FROM events e
JOIN bookings b ON b.event_id = e.id
WHERE b.status = 'CONFIRMED'
GROUP BY e.id, e.title
HAVING count(b.id) >= 2;

-- 5.2 Categories with total ticket revenue exceeding a threshold
SELECT c.name AS category, coalesce(sum(b.total_amount), 0.00) AS total_category_revenue
FROM event_categories c
JOIN events e ON e.category_id = c.id
JOIN bookings b ON b.event_id = e.id AND b.status = 'CONFIRMED'
GROUP BY c.name
HAVING sum(b.total_amount) > 100.00;


-- 6. THREE LIKE / BETWEEN PATTERN MATCHING QUERIES
-- 6.1 LIKE: Search events by keyword pattern in title or description
SELECT title, description, ticket_price 
FROM events 
WHERE title ILIKE '%Hackathon%' OR description ILIKE '%AI%';

-- 6.2 BETWEEN: Find events scheduled within an upcoming date range
SELECT title, start_at, venue_id, ticket_price 
FROM events 
WHERE start_at BETWEEN now() AND (now() + INTERVAL '30 days');

-- 6.3 LIKE & BETWEEN: Filter attendee tickets by code pattern and issue date range
SELECT ticket_code, status, issued_at 
FROM tickets 
WHERE ticket_code LIKE 'TIX-%' 
  AND issued_at BETWEEN (now() - INTERVAL '30 days') AND now();


-- 7. ONE CORRELATED QUERY
-- 7.1 Events whose confirmed bookings exceed the average bookings for their category
SELECT e1.title, e1.category_id, count(b1.id) AS confirmed_bookings
FROM events e1
LEFT JOIN bookings b1 ON b1.event_id = e1.id AND b1.status = 'CONFIRMED'
GROUP BY e1.id, e1.title, e1.category_id
HAVING count(b1.id) >= (
    SELECT avg(sub_count)
    FROM (
        SELECT count(b2.id) AS sub_count
        FROM events e2
        LEFT JOIN bookings b2 ON b2.event_id = e2.id AND b2.status = 'CONFIRMED'
        WHERE e2.category_id = e1.category_id
        GROUP BY e2.id
    ) sub
);

-- 8. TWO EXISTS / NOT EXISTS QUERIES 
-- 8.1 EXISTS: Venues that currently host published events
SELECT v.name, v.location FROM venues v
WHERE EXISTS (
    SELECT 1 FROM events e WHERE e.venue_id = v.id AND e.status = 'PUBLISHED'
);

-- 8.2 NOT EXISTS: Events that have had zero cancellations
SELECT e.title, e.start_at FROM events e
WHERE NOT EXISTS (
    SELECT 1 FROM cancellations c 
    JOIN bookings b ON b.id = c.booking_id 
    WHERE b.event_id = e.id
);


-- 9. FOUR AGGREGATE FUNCTIONS (COUNT, SUM, AVG, MAX)
SELECT 
    count(b.id) AS total_confirmed_bookings,
    coalesce(sum(b.total_amount), 0.00) AS total_revenue_collected,
    coalesce(avg(b.total_amount), 0.00) AS average_booking_value,
    coalesce(max(b.total_amount), 0.00) AS highest_booking_value
FROM bookings b
WHERE b.status = 'CONFIRMED';
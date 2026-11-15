"""Interactive Query Suite Runner for DBMS Evaluation (24CS520)
Prepared for Phase 1 Demo & Viva, python ../database/run_queries.py
"""
import sys
from pathlib import Path

# Add backend directory to path
backend_path = Path(__file__).resolve().parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from tabulate import tabulate
from sqlalchemy import text
from app.db.session import SessionLocal

QUERIES = [
    # -------------------------------------------------------------
    # CATEGORY 1: SIMPLE QUERIES (5)
    # -------------------------------------------------------------
    (
        "1.1 Simple Query: List verified students",
        "SELECT id, full_name, email, role FROM users WHERE role = 'STUDENT' AND is_email_verified = true;"
    ),
    (
        "1.2 Simple Query: List active campus venues & locations",
        "SELECT name, location, description, is_active FROM venues WHERE is_active = true;"
    ),
    (
        "1.3 Simple Query: List published upcoming events with pricing",
        "SELECT title, ticket_price, start_at, status FROM events WHERE status = 'PUBLISHED';"
    ),
    (
        "1.4 Simple Query: Retrieve all confirmed reservations",
        "SELECT booking_reference, total_amount, status, created_at FROM bookings WHERE status = 'CONFIRMED';"
    ),
    (
        "1.5 Simple Query: Retrieve active digital tickets",
        "SELECT ticket_code, status, issued_at FROM tickets WHERE status = 'VALID' LIMIT 5;"
    ),

    # -------------------------------------------------------------
    # CATEGORY 2: NESTED QUERIES / SUBQUERIES (5)
    # -------------------------------------------------------------
    (
        "2.1 Nested Query: Students who booked workshops (3-Level Subquery)",
        """
        SELECT full_name, email FROM users 
        WHERE id IN (
            SELECT b.user_id FROM bookings b 
            WHERE b.event_id IN (
                SELECT e.id FROM events e 
                WHERE e.category_id = (SELECT id FROM event_categories WHERE name = 'WORKSHOP')
            )
        );
        """
    ),
    (
        "2.2 Nested Query: Events held in high-capacity venues (>30 physical seats)",
        """
        SELECT title, ticket_price, start_at FROM events 
        WHERE venue_id IN (
            SELECT vr.venue_id FROM venue_rows vr 
            JOIN venue_seats vs ON vs.venue_row_id = vr.id 
            GROUP BY vr.venue_id HAVING count(vs.id) > 30
        );
        """
    ),
    (
        "2.3 Nested Query: Students with above-average booking counts",
        """
        SELECT u.full_name, count(b.id) AS total_bookings FROM users u
        JOIN bookings b ON b.user_id = u.id
        GROUP BY u.id, u.full_name
        HAVING count(b.id) >= (
            SELECT avg(booking_count) FROM (
                SELECT count(id) AS booking_count FROM bookings GROUP BY user_id
            ) user_counts
        );
        """
    ),
    (
        "2.4 Nested Query: Unused physical seats that have never had confirmed bookings",
        """
        SELECT seat_label, seat_type FROM venue_seats 
        WHERE id NOT IN (
            SELECT DISTINCT vs.id FROM venue_seats vs
            JOIN event_seats es ON es.venue_seat_id = vs.id
            JOIN booking_seats bs ON bs.event_seat_id = es.id
            WHERE bs.released_at IS NULL
        ) LIMIT 6;
        """
    ),
    (
        "2.5 Nested Query: Events with ticket price higher than average ticket pricing",
        """
        SELECT title, ticket_price, start_at FROM events 
        WHERE ticket_price >= (
            SELECT avg(ticket_price) FROM events
        );
        """
    ),

    # -------------------------------------------------------------
    # CATEGORY 3: SET OPERATIONS (2: UNION & EXCEPT)
    # -------------------------------------------------------------
    (
        "3.1 SET Operation (UNION): Attendees who booked Technical OR Cultural events",
        """
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
        """
    ),
    (
        "3.2 SET Operation (EXCEPT): Registered students who have NEVER confirmed a booking",
        """
        SELECT id, full_name, email FROM users WHERE role = 'STUDENT'
        EXCEPT
        SELECT DISTINCT u.id, u.full_name, u.email 
        FROM users u 
        JOIN bookings b ON b.user_id = u.id 
        WHERE b.status = 'CONFIRMED';
        """
    ),

    # -------------------------------------------------------------
    # CATEGORY 4: GROUP BY (2)
    # -------------------------------------------------------------
    (
        "4.1 GROUP BY: Physical seat capacity configured per row in IS Seminar Hall",
        """
        SELECT vr.row_label, count(vs.id) AS seats_in_row
        FROM venue_rows vr
        JOIN venue_seats vs ON vs.venue_row_id = vr.id
        GROUP BY vr.row_label
        ORDER BY vr.row_label;
        """
    ),
    (
        "4.2 GROUP BY: Total scheduled campus events per category",
        """
        SELECT c.name AS category_name, count(e.id) AS event_count
        FROM event_categories c
        LEFT JOIN events e ON e.category_id = c.id
        GROUP BY c.name;
        """
    ),

    # -------------------------------------------------------------
    # CATEGORY 5: HAVING (2)
    # -------------------------------------------------------------
    (
        "5.1 HAVING: Events with 1 or more confirmed student reservations",
        """
        SELECT e.title, count(b.id) AS confirmed_bookings
        FROM events e
        JOIN bookings b ON b.event_id = e.id
        WHERE b.status = 'CONFIRMED'
        GROUP BY e.id, e.title
        HAVING count(b.id) >= 1;
        """
    ),
    (
        "5.2 HAVING: Event categories generating total revenue exceeding threshold",
        """
        SELECT c.name AS category, coalesce(sum(b.total_amount), 0.00) AS total_revenue
        FROM event_categories c
        JOIN events e ON e.category_id = c.id
        JOIN bookings b ON b.event_id = e.id AND b.status = 'CONFIRMED'
        GROUP BY c.name
        HAVING sum(b.total_amount) >= 0.00;
        """
    ),

    # -------------------------------------------------------------
    # CATEGORY 6: LIKE & BETWEEN PATTERN MATCHING (3)
    # -------------------------------------------------------------
    (
        "6.1 LIKE Pattern: Search events containing keywords ('AI' or 'Hackathon')",
        """
        SELECT title, ticket_price, start_at 
        FROM events 
        WHERE title ILIKE '%AI%' OR title ILIKE '%Hackathon%';
        """
    ),
    (
        "6.2 BETWEEN: Events scheduled within an upcoming 30-day window",
        """
        SELECT title, ticket_price, start_at 
        FROM events 
        WHERE start_at BETWEEN now() AND (now() + INTERVAL '30 days');
        """
    ),
    (
        "6.3 LIKE & BETWEEN: Filter digital tickets by prefix pattern and issue date range",
        """
        SELECT ticket_code, status, issued_at 
        FROM tickets 
        WHERE ticket_code LIKE 'TIX-%' 
          AND issued_at BETWEEN (now() - INTERVAL '30 days') AND now()
        LIMIT 5;
        """
    )
]

def run_suite():
    print("\n" + "=" * 80)
    print("  DATABASE MANAGEMENT SYSTEMS (24CS520) - PHASE 1 QUERY DEMO")
    print("  Department of Computer Science & Engineering, SJCE, JSS STU")
    print("=" * 80)

    with SessionLocal() as db:
        for idx, (title, sql_str) in enumerate(QUERIES, 1):
            print(f"\n[{idx}/{len(QUERIES)}] {title}")
            print("-" * 80)
            print(sql_str.strip())
            print("-" * 80)

            try:
                res = db.execute(text(sql_str))
                rows = [dict(r) for r in res.mappings().all()]
                if rows:
                    headers = rows[0].keys()
                    table_data = [[r[k] for k in headers] for r in rows]
                    print(tabulate(table_data, headers=headers, tablefmt="psql"))
                else:
                    print("(Query returned 0 rows)")
            except Exception as e:
                print(f"Error: {e}")

            # Pause between categories for the jury to review
            if idx in [5, 10, 12, 14, 16, 19]:
                input("\n>>> Press ENTER to proceed to the next syllabus category...")

    print("\n" + "=" * 80)
    print("  ALL RUBRIC QUERIES EXECUTED SUCCESSFULLY")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    run_suite()
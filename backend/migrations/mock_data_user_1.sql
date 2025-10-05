-- Mock data for User ID 1 - Rewards & Tickets System

-- Create/Update user with id 1
INSERT INTO public.users (id, email, points, current_level, total_verified_reports)
VALUES (1, 'test@example.com', 70, 1, 7)
ON CONFLICT (id)
DO UPDATE SET
    email = 'test@example.com',
    points = 70,
    current_level = 1,
    total_verified_reports = 7;

-- Insert 7 verified reports for user 1
INSERT INTO public.reports (user_id, reported_time, bus_number, issue, status, verified_at)
VALUES
    (1, '2025-01-10 10:30:00', '999', 'Traffic jam on Main St', 'verified', '2025-01-10 11:00:00'),
    (1, '2025-01-09 11:45:00', '704', 'Road closure', 'verified', '2025-01-09 12:30:00'),
    (1, '2025-01-08 13:20:00', '111', 'Accident reported', 'verified', '2025-01-08 14:15:00'),
    (1, '2025-01-07 08:50:00', '999', 'Bus delay', 'verified', '2025-01-07 09:20:00'),
    (1, '2025-01-06 15:30:00', '704', 'Construction zone', 'verified', '2025-01-06 16:45:00'),
    (1, '2025-01-05 07:40:00', '111', 'Heavy traffic', 'verified', '2025-01-05 08:10:00'),
    (1, '2025-01-04 09:55:00', '999', 'Weather delay', 'verified', '2025-01-04 10:30:00')
ON CONFLICT DO NOTHING;

-- Verify the data
SELECT
    u.id,
    u.email,
    u.current_level,
    u.total_verified_reports,
    u.points,
    (SELECT COUNT(*) FROM public.reports WHERE user_id = u.id AND status = 'verified') as verified_reports_count
FROM public.users u
WHERE u.id = 1;

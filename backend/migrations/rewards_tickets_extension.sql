-- Rewards and Tickets System Extension for existing schema

-- Add level tracking columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS current_level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_verified_reports INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Update existing reports table to include verification status
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS issue TEXT,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

-- Update status to include 'verified' and 'rejected'
ALTER TABLE public.reports
DROP CONSTRAINT IF EXISTS reports_status_check;

ALTER TABLE public.reports
ADD CONSTRAINT reports_status_check
CHECK (status IN ('pending', 'verified', 'rejected'));

-- Create tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    days INTEGER NOT NULL,
    earned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    earned_level INTEGER NOT NULL,
    activated_date DATE,
    expiry_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(50) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'active', 'expired', 'used')),
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT fk_user_tickets
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_date ON public.reports(reported_time);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_expiry ON public.tickets(expiry_date);

-- Function to calculate level from total reports
CREATE OR REPLACE FUNCTION calculate_level(total_reports INTEGER)
RETURNS INTEGER AS $$
DECLARE
    level INTEGER := 1;
    reports_needed INTEGER := 10;
    total_needed INTEGER := 0;
BEGIN
    WHILE total_reports >= (total_needed + reports_needed) LOOP
        total_needed := total_needed + reports_needed;
        level := level + 1;
        reports_needed := 10 + (level - 1) * 2;
    END LOOP;

    RETURN level;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get reports needed for a specific level
CREATE OR REPLACE FUNCTION get_reports_for_level(level INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN 10 + (level - 1) * 2;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get total reports needed up to a level
CREATE OR REPLACE FUNCTION get_total_reports_up_to_level(level INTEGER)
RETURNS INTEGER AS $$
DECLARE
    total INTEGER := 0;
    i INTEGER;
BEGIN
    FOR i IN 1..(level - 1) LOOP
        total := total + get_reports_for_level(i);
    END LOOP;
    RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get reward days for a level
CREATE OR REPLACE FUNCTION get_reward_days(level INTEGER)
RETURNS INTEGER AS $$
BEGIN
    IF level <= 30 THEN
        RETURN level;
    ELSE
        RETURN 30;  -- Cap at 30 days (1 month)
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to auto-update user level when report is verified
CREATE OR REPLACE FUNCTION update_user_level_on_verified_report()
RETURNS TRIGGER AS $$
DECLARE
    new_level INTEGER;
    old_level INTEGER;
    reward_days INTEGER;
BEGIN
    -- Only process when status changes to 'verified'
    IF NEW.status = 'verified' AND (OLD.status IS NULL OR OLD.status != 'verified') THEN
        -- Update verified_at timestamp
        NEW.verified_at = NOW();

        -- Update total verified reports
        UPDATE public.users
        SET total_verified_reports = total_verified_reports + 1,
            updated_at = NOW()
        WHERE id = NEW.user_id;

        -- Get old and new level
        SELECT current_level INTO old_level
        FROM public.users
        WHERE id = NEW.user_id;

        SELECT total_verified_reports INTO new_level
        FROM public.users
        WHERE id = NEW.user_id;

        new_level := calculate_level(new_level);

        -- If level increased, create a new ticket
        IF new_level > old_level THEN
            reward_days := get_reward_days(new_level);

            INSERT INTO public.tickets (user_id, days, earned_level, earned_date)
            VALUES (NEW.user_id, reward_days, new_level, CURRENT_DATE);

            -- Update level
            UPDATE public.users
            SET current_level = new_level,
                updated_at = NOW()
            WHERE id = NEW.user_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_level_on_verified_report ON public.reports;

-- Create trigger to update user level when report is verified
CREATE TRIGGER update_level_on_verified_report
    BEFORE INSERT OR UPDATE ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION update_user_level_on_verified_report();

-- Function to auto-update ticket status based on expiry
CREATE OR REPLACE FUNCTION update_expired_tickets()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE public.tickets
    SET status = 'expired',
        is_active = false
    WHERE status = 'active'
      AND expiry_date < CURRENT_DATE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to activate a ticket
CREATE OR REPLACE FUNCTION activate_ticket(p_ticket_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    ticket_days INTEGER;
    ticket_status VARCHAR(50);
BEGIN
    -- Get ticket details
    SELECT days, status INTO ticket_days, ticket_status
    FROM public.tickets
    WHERE id = p_ticket_id;

    -- Check if ticket is available
    IF ticket_status != 'available' THEN
        RETURN false;
    END IF;

    -- Activate ticket
    UPDATE public.tickets
    SET activated_date = CURRENT_DATE,
        expiry_date = CURRENT_DATE + (ticket_days || ' days')::INTERVAL,
        is_active = true,
        status = 'active'
    WHERE id = p_ticket_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON COLUMN public.users.current_level IS 'Current reward level of the user';
COMMENT ON COLUMN public.users.total_verified_reports IS 'Total number of verified reports submitted';
COMMENT ON COLUMN public.reports.issue IS 'Description of the traffic/bus issue reported';
COMMENT ON COLUMN public.reports.verified_at IS 'Timestamp when report was verified';
COMMENT ON TABLE public.tickets IS 'Free pass tickets earned by users';
COMMENT ON COLUMN public.tickets.status IS 'Ticket status: available, active, expired, or used';
COMMENT ON COLUMN public.tickets.days IS 'Number of days the free pass is valid for';
COMMENT ON COLUMN public.tickets.earned_level IS 'The level at which this ticket was earned';

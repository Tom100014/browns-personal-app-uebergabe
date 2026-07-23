-- Add shift_revenue column to time_entries table
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS shift_revenue NUMERIC(10,2) DEFAULT 0.00;

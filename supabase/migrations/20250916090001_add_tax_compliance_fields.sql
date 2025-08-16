-- Migration: Add tax compliance fields for future consumption tax handling
-- Date: 2025-01-16
-- Purpose: Add fields to support consumption tax calculation when becoming a taxable business operator

-- Add tax-related fields to payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS application_fee_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS application_fee_tax_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS application_fee_excl_tax INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_included BOOLEAN NOT NULL DEFAULT true;

-- Add tax-related fields to fee_config table
ALTER TABLE public.fee_config
  ADD COLUMN IF NOT EXISTS platform_tax_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS is_tax_included BOOLEAN NOT NULL DEFAULT true;

-- Add comments for documentation
COMMENT ON COLUMN public.payments.application_fee_tax_rate IS 'Tax rate applied to application fee (e.g., 10.00 for 10%)';
COMMENT ON COLUMN public.payments.application_fee_tax_amount IS 'Tax amount in yen (integer)';
COMMENT ON COLUMN public.payments.application_fee_excl_tax IS 'Application fee excluding tax in yen (integer)';
COMMENT ON COLUMN public.payments.tax_included IS 'Whether the application_fee_amount includes tax (true=tax included, false=tax excluded)';

COMMENT ON COLUMN public.fee_config.platform_tax_rate IS 'Platform consumption tax rate (e.g., 10.00 for 10%)';
COMMENT ON COLUMN public.fee_config.is_tax_included IS 'Whether platform fees are calculated as tax-included (true=内税, false=外税)';

-- Create index for efficient tax reporting queries
CREATE INDEX IF NOT EXISTS idx_payments_tax_rate ON public.payments(application_fee_tax_rate);
CREATE INDEX IF NOT EXISTS idx_payments_tax_included ON public.payments(tax_included);

-- Update existing records to maintain consistency
-- During MVP phase (platform fee = 0), all tax amounts remain 0
UPDATE public.payments
SET
  application_fee_tax_rate = 0.00,
  application_fee_tax_amount = 0,
  application_fee_excl_tax = application_fee_amount,
  tax_included = true
WHERE application_fee_tax_rate IS NULL;

-- Update fee_config with default Japanese consumption tax rate
UPDATE public.fee_config
SET
  platform_tax_rate = 10.00,
  is_tax_included = true
WHERE platform_tax_rate IS NULL;

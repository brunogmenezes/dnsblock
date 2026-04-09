-- Adiciona período opcional de bloqueio para domínios
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/003_add_block_period_columns.sql

ALTER TABLE domains
ADD COLUMN IF NOT EXISTS block_start_date DATE NULL;

ALTER TABLE domains
ADD COLUMN IF NOT EXISTS block_end_date DATE NULL;

ALTER TABLE domains
DROP CONSTRAINT IF EXISTS domains_block_range_check;

ALTER TABLE domains
ADD CONSTRAINT domains_block_range_check CHECK (
  block_start_date IS NULL
  OR block_end_date IS NULL
  OR block_end_date >= block_start_date
);

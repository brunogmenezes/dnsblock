-- Adiciona período opcional de bloqueio para ofícios
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/013_add_block_dates_to_notices.sql

ALTER TABLE "public"."notices"
ADD COLUMN IF NOT EXISTS "block_start_date" DATE NULL,
ADD COLUMN IF NOT EXISTS "block_end_date" DATE NULL;

ALTER TABLE "public"."notices"
DROP CONSTRAINT IF EXISTS notices_block_range_check;

ALTER TABLE "public"."notices"
ADD CONSTRAINT notices_block_range_check CHECK (
  block_start_date IS NULL
  OR block_end_date IS NULL
  OR block_end_date >= block_start_date
);

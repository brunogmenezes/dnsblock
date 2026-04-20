-- Adiciona status e controle de resposta aos ofícios
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/014_add_status_to_notices.sql

ALTER TABLE "public"."notices"
ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'registered',
ADD COLUMN IF NOT EXISTS "informed_at" timestamptz(6),
ADD COLUMN IF NOT EXISTS "informed_by" int8;

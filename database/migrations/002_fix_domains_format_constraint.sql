-- Corrige a constraint de formato de domínio para bancos já existentes
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/002_fix_domains_format_constraint.sql

ALTER TABLE domains
DROP CONSTRAINT IF EXISTS domains_format_check;

ALTER TABLE domains
ADD CONSTRAINT domains_format_check CHECK (
  char_length(domain_name) <= 253
  AND domain_name ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$'
);

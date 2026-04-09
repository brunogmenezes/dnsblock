-- Cria tabela para armazenar domínios inválidos enviados no cadastro
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/004_create_domain_import_invalids.sql

CREATE TABLE IF NOT EXISTS domain_import_invalids (
  id BIGSERIAL PRIMARY KEY,
  original_value TEXT NOT NULL,
  normalized_value TEXT NULL,
  reason TEXT NOT NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_import_invalids_created_by
ON domain_import_invalids(created_by);

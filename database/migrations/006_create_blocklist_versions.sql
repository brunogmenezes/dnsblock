-- Cria tabela de versionamento da blocklist para consumo do DNS
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/006_create_blocklist_versions.sql

CREATE TABLE IF NOT EXISTS blocklist_versions (
  id BIGSERIAL PRIMARY KEY,
  version VARCHAR(20) NOT NULL UNIQUE,
  changed_by BIGINT REFERENCES users(id),
  reason VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocklist_versions_created_at
ON blocklist_versions(created_at);

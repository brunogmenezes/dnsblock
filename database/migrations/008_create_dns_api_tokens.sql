-- Cria tabela de tokens para autenticacao dos endpoints DNS
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/008_create_dns_api_tokens.sql

CREATE TABLE IF NOT EXISTS dns_api_tokens (
  id BIGSERIAL PRIMARY KEY,
  token_name VARCHAR(120) NOT NULL DEFAULT 'DNS Export',
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_prefix VARCHAR(24) NOT NULL,
  last_used_at TIMESTAMPTZ NULL,
  last_used_ip VARCHAR(64) NULL,
  created_by BIGINT REFERENCES users(id),
  revoked_by BIGINT REFERENCES users(id),
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dns_api_tokens_active
ON dns_api_tokens(revoked_at, created_at DESC);
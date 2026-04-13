-- Cria tabela de auditoria para rastrear login, IP e acoes executadas
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/012_create_audit_logs.sql

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  username_snapshot VARCHAR(120) NULL,
  action VARCHAR(120) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent TEXT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
ON audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action, created_at DESC);

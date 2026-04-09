-- Cria controle de relatorios por versao da blocklist
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/007_create_blocklist_reports.sql

CREATE TABLE IF NOT EXISTS blocklist_reports (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL UNIQUE,
  blocklist_version VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  report_file_name VARCHAR(255) NULL,
  requested_by BIGINT REFERENCES users(id),
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT blocklist_reports_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_blocklist_reports_version
ON blocklist_reports(blocklist_version);

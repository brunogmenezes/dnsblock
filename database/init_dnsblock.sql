-- Script de inicialização do sistema DNSBlock
-- Execute no psql com um usuário que tenha permissão para criar banco:
-- psql -U postgres -f database/init_dnsblock.sql

CREATE DATABASE dnsblock;
\connect dnsblock;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notices (
  id BIGSERIAL PRIMARY KEY,
  notice_code VARCHAR(200) NULL,
  original_file_name VARCHAR(255) NULL,
  stored_file_name VARCHAR(255) NULL,
  mime_type VARCHAR(150) NULL,
  file_size BIGINT NULL,
  uploaded_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notice_files (
  id BIGSERIAL PRIMARY KEY,
  notice_id BIGINT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  original_file_name VARCHAR(255) NULL,
  stored_file_name VARCHAR(255) NULL,
  mime_type VARCHAR(150) NULL,
  file_size BIGINT NULL,
  uploaded_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domains (
  id BIGSERIAL PRIMARY KEY,
  domain_name VARCHAR(253) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'blocked',
  blocked_at TIMESTAMPTZ NULL,
  block_start_date DATE NULL,
  block_end_date DATE NULL,
  notice_id BIGINT NULL REFERENCES notices(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT domains_status_check CHECK (status = 'blocked'),
  CONSTRAINT domains_format_check CHECK (
    char_length(domain_name) <= 253
    AND domain_name ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$'
  ),
  CONSTRAINT domains_block_range_check CHECK (
    block_start_date IS NULL
    OR block_end_date IS NULL
    OR block_end_date >= block_start_date
  )
);

CREATE TABLE IF NOT EXISTS domain_executions (
  id BIGSERIAL PRIMARY KEY,
  domain_id BIGINT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  executed_by BIGINT REFERENCES users(id),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domain_import_invalids (
  id BIGSERIAL PRIMARY KEY,
  original_value TEXT NOT NULL,
  normalized_value TEXT NULL,
  reason TEXT NOT NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocklist_versions (
  id BIGSERIAL PRIMARY KEY,
  version VARCHAR(20) NOT NULL UNIQUE,
  changed_by BIGINT REFERENCES users(id),
  reason VARCHAR(80) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_notice_id ON domains(notice_id);
CREATE INDEX IF NOT EXISTS idx_notice_files_notice_id ON notice_files(notice_id);
CREATE INDEX IF NOT EXISTS idx_domain_executions_domain_id ON domain_executions(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_import_invalids_created_by ON domain_import_invalids(created_by);
CREATE INDEX IF NOT EXISTS idx_blocklist_versions_created_at ON blocklist_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_blocklist_reports_version ON blocklist_reports(blocklist_version);
CREATE INDEX IF NOT EXISTS idx_dns_api_tokens_active ON dns_api_tokens(revoked_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions(expire);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_domains_updated_at ON domains;
CREATE TRIGGER trg_domains_updated_at
BEFORE UPDATE ON domains
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

INSERT INTO users (username, password_hash, full_name)
VALUES ('admin', crypt('admin123', gen_salt('bf')), 'Administrador DNSBlock')
ON CONFLICT (username) DO NOTHING;

-- Migração incremental para banco já existente
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/001_add_notices_and_domain_relation.sql

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

ALTER TABLE domains
ADD COLUMN IF NOT EXISTS notice_id BIGINT NULL REFERENCES notices(id);

CREATE INDEX IF NOT EXISTS idx_domains_notice_id ON domains(notice_id);

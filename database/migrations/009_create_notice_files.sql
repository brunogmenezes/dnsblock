-- Cria suporte a multiplos anexos por oficio
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/009_create_notice_files.sql

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

CREATE INDEX IF NOT EXISTS idx_notice_files_notice_id
ON notice_files(notice_id);
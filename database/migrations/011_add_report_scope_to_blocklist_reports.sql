-- Adiciona escopo ao relatorio da blocklist (geral ou por oficio)
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/011_add_report_scope_to_blocklist_reports.sql

ALTER TABLE blocklist_reports
ADD COLUMN IF NOT EXISTS report_scope VARCHAR(20);

ALTER TABLE blocklist_reports
ADD COLUMN IF NOT EXISTS notice_id BIGINT REFERENCES notices(id);

UPDATE blocklist_reports
SET report_scope = 'general'
WHERE report_scope IS NULL;

ALTER TABLE blocklist_reports
ALTER COLUMN report_scope SET DEFAULT 'general';

ALTER TABLE blocklist_reports
ALTER COLUMN report_scope SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'blocklist_reports_scope_check'
  ) THEN
    ALTER TABLE blocklist_reports
    ADD CONSTRAINT blocklist_reports_scope_check
    CHECK (report_scope IN ('general', 'notice'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_blocklist_reports_scope
ON blocklist_reports(blocklist_version, report_scope, notice_id);

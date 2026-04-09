-- Remove separação pendente/bloqueado: tudo entra como bloqueado
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/005_unify_blocked_flow.sql

UPDATE domains
SET status = 'blocked',
    blocked_at = COALESCE(blocked_at, now()),
    updated_at = now()
WHERE status <> 'blocked' OR blocked_at IS NULL;

ALTER TABLE domains
ALTER COLUMN status SET DEFAULT 'blocked';

ALTER TABLE domains
DROP CONSTRAINT IF EXISTS domains_status_check;

ALTER TABLE domains
ADD CONSTRAINT domains_status_check CHECK (status = 'blocked');

INSERT INTO domain_executions (domain_id, executed_by, executed_at)
SELECT d.id, d.created_by, COALESCE(d.blocked_at, d.created_at, now())
FROM domains d
WHERE d.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM domain_executions de WHERE de.domain_id = d.id
  );

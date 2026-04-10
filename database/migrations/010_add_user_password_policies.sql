-- Adiciona controle de troca obrigatoria de senha e perfil administrativo.
-- Execute conectado ao banco dnsblock:
-- psql -U postgres -d dnsblock -f database/migrations/010_add_user_password_policies.sql

ALTER TABLE users
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE users
SET password_changed_at = COALESCE(password_changed_at, now())
WHERE password_hash IS NOT NULL;

UPDATE users
SET is_admin = true,
    must_change_password = false,
    password_changed_at = COALESCE(password_changed_at, now())
WHERE username = 'admin';

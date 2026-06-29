-- Migration 019: Criar tabela de whitelist de domínios

CREATE TABLE IF NOT EXISTS whitelist (
    id BIGSERIAL PRIMARY KEY,
    domain_name VARCHAR(253) NOT NULL UNIQUE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT whitelist_domain_format_check CHECK (
        char_length(domain_name) <= 253
        AND domain_name ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_whitelist_domain_name ON whitelist(domain_name);

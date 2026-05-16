-- Migration: 018_create_ips_table.sql
-- Adiciona suporte para bloqueio/desbloqueio de IPs (v4 e v6)

CREATE TABLE IF NOT EXISTS ips (
    id BIGSERIAL PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL, -- IPv6 pode ter até 45 caracteres
    ip_type VARCHAR(10) NOT NULL,    -- 'v4' ou 'v6'
    status VARCHAR(20) DEFAULT 'blocked',
    is_active BOOLEAN NOT NULL DEFAULT true,
    notice_id BIGINT REFERENCES notices(id) ON DELETE CASCADE,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(ip_address)
);

CREATE TABLE IF NOT EXISTS ip_import_invalids (
    id BIGSERIAL PRIMARY KEY,
    original_value TEXT,
    normalized_value TEXT,
    reason TEXT,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ips_notice_id ON ips(notice_id);
CREATE INDEX IF NOT EXISTS idx_ips_is_active ON ips(is_active);
CREATE INDEX IF NOT EXISTS idx_ips_address ON ips(ip_address);

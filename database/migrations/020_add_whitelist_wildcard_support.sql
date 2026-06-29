-- Migration 020: Adiciona suporte a wildcards (ex: *.gov.br) na whitelist

ALTER TABLE whitelist DROP CONSTRAINT IF EXISTS whitelist_domain_format_check;

ALTER TABLE whitelist ADD CONSTRAINT whitelist_domain_format_check CHECK (
    char_length(domain_name) <= 253
    AND (
        domain_name ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$'
        OR 
        domain_name ~ '^\*\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$'
    )
);

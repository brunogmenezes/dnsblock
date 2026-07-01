-- Migration 021: Adiciona número do processo e órgão solicitante na tabela de ofícios
ALTER TABLE "public"."notices"
ADD COLUMN IF NOT EXISTS "process_number" varchar(200) NULL,
ADD COLUMN IF NOT EXISTS "requesting_organ" varchar(200) NULL;

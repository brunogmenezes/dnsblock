-- Migration 016: Criar tabela de grupos de usuários e permissões

-- 1. Criar tabela de grupos
CREATE TABLE IF NOT EXISTS "public"."user_groups" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL UNIQUE,
  "description" TEXT,
  "permissions" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- 2. Adicionar group_id na tabela de usuários
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "group_id" INT8;

-- 3. Adicionar chave estrangeira
ALTER TABLE "public"."users" 
DROP CONSTRAINT IF EXISTS "users_group_id_fkey",
ADD CONSTRAINT "users_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups" ("id") ON DELETE SET NULL;

-- 4. Criar um grupo padrão de Administradores
INSERT INTO "public"."user_groups" ("name", "description", "permissions")
VALUES ('Administrador', 'Acesso total ao sistema', '{"all": true}')
ON CONFLICT (name) DO NOTHING;

-- 5. Criar gatilho de updated_at para user_groups
CREATE TRIGGER "trg_user_groups_updated_at" BEFORE UPDATE ON "public"."user_groups"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_updated_at_timestamp"();

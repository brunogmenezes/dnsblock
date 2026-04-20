-- Migration: Permitir exclusão de usuários limpando referências em outras tabelas
-- Ajusta chaves estrangeiras para SET NULL ao excluir o usuário pai

-- 1. audit_logs
ALTER TABLE "public"."audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 2. blocklist_reports
ALTER TABLE "public"."blocklist_reports" DROP CONSTRAINT IF EXISTS "blocklist_reports_requested_by_fkey";
ALTER TABLE "public"."blocklist_reports" ADD CONSTRAINT "blocklist_reports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 3. blocklist_versions
ALTER TABLE "public"."blocklist_versions" DROP CONSTRAINT IF EXISTS "blocklist_versions_changed_by_fkey";
ALTER TABLE "public"."blocklist_versions" ADD CONSTRAINT "blocklist_versions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 4. dns_api_tokens
ALTER TABLE "public"."dns_api_tokens" DROP CONSTRAINT IF EXISTS "dns_api_tokens_created_by_fkey";
ALTER TABLE "public"."dns_api_tokens" ADD CONSTRAINT "dns_api_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

ALTER TABLE "public"."dns_api_tokens" DROP CONSTRAINT IF EXISTS "dns_api_tokens_revoked_by_fkey";
ALTER TABLE "public"."dns_api_tokens" ADD CONSTRAINT "dns_api_tokens_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 5. domain_executions
ALTER TABLE "public"."domain_executions" DROP CONSTRAINT IF EXISTS "domain_executions_executed_by_fkey";
ALTER TABLE "public"."domain_executions" ADD CONSTRAINT "domain_executions_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 6. domain_import_invalids
ALTER TABLE "public"."domain_import_invalids" DROP CONSTRAINT IF EXISTS "domain_import_invalids_created_by_fkey";
ALTER TABLE "public"."domain_import_invalids" ADD CONSTRAINT "domain_import_invalids_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 7. domains
ALTER TABLE "public"."domains" DROP CONSTRAINT IF EXISTS "domains_created_by_fkey";
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 8. notice_files
ALTER TABLE "public"."notice_files" DROP CONSTRAINT IF EXISTS "notice_files_uploaded_by_fkey";
ALTER TABLE "public"."notice_files" ADD CONSTRAINT "notice_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

-- 9. notices
ALTER TABLE "public"."notices" DROP CONSTRAINT IF EXISTS "notices_uploaded_by_fkey";
ALTER TABLE "public"."notices" ADD CONSTRAINT "notices_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

ALTER TABLE "public"."notices" DROP CONSTRAINT IF EXISTS "notices_informed_by_fkey";
ALTER TABLE "public"."notices" ADD CONSTRAINT "notices_informed_by_fkey" FOREIGN KEY ("informed_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL;

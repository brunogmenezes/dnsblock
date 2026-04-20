/*
 Navicat Premium Data Transfer

 Source Server         : 172.16.152.2
 Source Server Type    : PostgreSQL
 Source Server Version : 150010 (150010)
 Source Host           : 172.16.152.2:5432
 Source Catalog        : dnsblock
 Source Schema         : public

 Target Server Type    : PostgreSQL
 Target Server Version : 150010 (150010)
 File Encoding         : 65001

 Date: 20/04/2026 08:58:42
*/


-- ----------------------------
-- Sequence structure for audit_logs_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."audit_logs_id_seq";
CREATE SEQUENCE "public"."audit_logs_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for blocklist_reports_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."blocklist_reports_id_seq";
CREATE SEQUENCE "public"."blocklist_reports_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for blocklist_versions_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."blocklist_versions_id_seq";
CREATE SEQUENCE "public"."blocklist_versions_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for dns_api_tokens_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."dns_api_tokens_id_seq";
CREATE SEQUENCE "public"."dns_api_tokens_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for domain_executions_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."domain_executions_id_seq";
CREATE SEQUENCE "public"."domain_executions_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for domain_import_invalids_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."domain_import_invalids_id_seq";
CREATE SEQUENCE "public"."domain_import_invalids_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for domains_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."domains_id_seq";
CREATE SEQUENCE "public"."domains_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for notice_files_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."notice_files_id_seq";
CREATE SEQUENCE "public"."notice_files_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for notices_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."notices_id_seq";
CREATE SEQUENCE "public"."notices_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for users_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."users_id_seq";
CREATE SEQUENCE "public"."users_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

-- ----------------------------
-- Table structure for audit_logs
-- ----------------------------
DROP TABLE IF EXISTS "public"."audit_logs";
CREATE TABLE "public"."audit_logs" (
  "id" int8 NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
  "user_id" int8,
  "username_snapshot" varchar(120) COLLATE "pg_catalog"."default",
  "action" varchar(120) COLLATE "pg_catalog"."default" NOT NULL,
  "ip_address" varchar(64) COLLATE "pg_catalog"."default",
  "user_agent" text COLLATE "pg_catalog"."default",
  "details" jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for blocklist_reports
-- ----------------------------
DROP TABLE IF EXISTS "public"."blocklist_reports";
CREATE TABLE "public"."blocklist_reports" (
  "id" int8 NOT NULL DEFAULT nextval('blocklist_reports_id_seq'::regclass),
  "job_id" uuid NOT NULL,
  "blocklist_version" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "progress" int4 NOT NULL DEFAULT 0,
  "total" int4 NOT NULL DEFAULT 0,
  "processed" int4 NOT NULL DEFAULT 0,
  "report_file_name" varchar(255) COLLATE "pg_catalog"."default",
  "requested_by" int8,
  "error" text COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "report_scope" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'general'::character varying,
  "notice_id" int8
)
;

-- ----------------------------
-- Table structure for blocklist_versions
-- ----------------------------
DROP TABLE IF EXISTS "public"."blocklist_versions";
CREATE TABLE "public"."blocklist_versions" (
  "id" int8 NOT NULL DEFAULT nextval('blocklist_versions_id_seq'::regclass),
  "version" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "changed_by" int8,
  "reason" varchar(80) COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for dns_api_tokens
-- ----------------------------
DROP TABLE IF EXISTS "public"."dns_api_tokens";
CREATE TABLE "public"."dns_api_tokens" (
  "id" int8 NOT NULL DEFAULT nextval('dns_api_tokens_id_seq'::regclass),
  "token_name" varchar(120) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'DNS Export'::character varying,
  "token_hash" char(64) COLLATE "pg_catalog"."default" NOT NULL,
  "token_prefix" varchar(24) COLLATE "pg_catalog"."default" NOT NULL,
  "last_used_at" timestamptz(6),
  "last_used_ip" varchar(64) COLLATE "pg_catalog"."default",
  "created_by" int8,
  "revoked_by" int8,
  "revoked_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for domain_executions
-- ----------------------------
DROP TABLE IF EXISTS "public"."domain_executions";
CREATE TABLE "public"."domain_executions" (
  "id" int8 NOT NULL DEFAULT nextval('domain_executions_id_seq'::regclass),
  "domain_id" int8 NOT NULL,
  "executed_by" int8,
  "executed_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for domain_import_invalids
-- ----------------------------
DROP TABLE IF EXISTS "public"."domain_import_invalids";
CREATE TABLE "public"."domain_import_invalids" (
  "id" int8 NOT NULL DEFAULT nextval('domain_import_invalids_id_seq'::regclass),
  "original_value" text COLLATE "pg_catalog"."default" NOT NULL,
  "normalized_value" text COLLATE "pg_catalog"."default",
  "reason" text COLLATE "pg_catalog"."default" NOT NULL,
  "created_by" int8,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for domains
-- ----------------------------
DROP TABLE IF EXISTS "public"."domains";
CREATE TABLE "public"."domains" (
  "id" int8 NOT NULL DEFAULT nextval('domains_id_seq'::regclass),
  "domain_name" varchar(253) COLLATE "pg_catalog"."default" NOT NULL,
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'blocked'::character varying,
  "blocked_at" timestamptz(6),
  "is_active" bool NOT NULL DEFAULT true,
  "created_by" int8,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "notice_id" int8,
  "block_start_date" date,
  "block_end_date" date
)
;

-- ----------------------------
-- Table structure for notice_files
-- ----------------------------
DROP TABLE IF EXISTS "public"."notice_files";
CREATE TABLE "public"."notice_files" (
  "id" int8 NOT NULL DEFAULT nextval('notice_files_id_seq'::regclass),
  "notice_id" int8 NOT NULL,
  "original_file_name" varchar(255) COLLATE "pg_catalog"."default",
  "stored_file_name" varchar(255) COLLATE "pg_catalog"."default",
  "mime_type" varchar(150) COLLATE "pg_catalog"."default",
  "file_size" int8,
  "uploaded_by" int8,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for notices
-- ----------------------------
DROP TABLE IF EXISTS "public"."notices";
CREATE TABLE "public"."notices" (
  "id" int8 NOT NULL DEFAULT nextval('notices_id_seq'::regclass),
  "notice_code" varchar(200) COLLATE "pg_catalog"."default",
  "original_file_name" varchar(255) COLLATE "pg_catalog"."default",
  "stored_file_name" varchar(255) COLLATE "pg_catalog"."default",
  "mime_type" varchar(150) COLLATE "pg_catalog"."default",
  "file_size" int8,
  "uploaded_by" int8,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for user_sessions
-- ----------------------------
DROP TABLE IF EXISTS "public"."user_sessions";
CREATE TABLE "public"."user_sessions" (
  "sid" varchar COLLATE "pg_catalog"."default" NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users" (
  "id" int8 NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  "username" varchar(80) COLLATE "pg_catalog"."default" NOT NULL,
  "password_hash" text COLLATE "pg_catalog"."default" NOT NULL,
  "full_name" varchar(150) COLLATE "pg_catalog"."default" NOT NULL,
  "is_active" bool NOT NULL DEFAULT true,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "must_change_password" bool NOT NULL DEFAULT false,
  "password_changed_at" timestamptz(6),
  "is_admin" bool NOT NULL DEFAULT false
)
;

-- ----------------------------
-- Function structure for armor
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."armor"(bytea);
CREATE OR REPLACE FUNCTION "public"."armor"(bytea)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_armor'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for armor
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."armor"(bytea, _text, _text);
CREATE OR REPLACE FUNCTION "public"."armor"(bytea, _text, _text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_armor'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for crypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."crypt"(text, text);
CREATE OR REPLACE FUNCTION "public"."crypt"(text, text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_crypt'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for dearmor
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."dearmor"(text);
CREATE OR REPLACE FUNCTION "public"."dearmor"(text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_dearmor'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for decrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."decrypt"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."decrypt"(bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_decrypt'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for decrypt_iv
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."decrypt_iv"(bytea, bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."decrypt_iv"(bytea, bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_decrypt_iv'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for digest
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."digest"(text, text);
CREATE OR REPLACE FUNCTION "public"."digest"(text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_digest'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for digest
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."digest"(bytea, text);
CREATE OR REPLACE FUNCTION "public"."digest"(bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_digest'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for encrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."encrypt"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."encrypt"(bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_encrypt'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for encrypt_iv
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."encrypt_iv"(bytea, bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."encrypt_iv"(bytea, bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_encrypt_iv'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for gen_random_bytes
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."gen_random_bytes"(int4);
CREATE OR REPLACE FUNCTION "public"."gen_random_bytes"(int4)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_random_bytes'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for gen_random_uuid
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."gen_random_uuid"();
CREATE OR REPLACE FUNCTION "public"."gen_random_uuid"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/pgcrypto', 'pg_random_uuid'
  LANGUAGE c VOLATILE
  COST 1;

-- ----------------------------
-- Function structure for gen_salt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."gen_salt"(text, int4);
CREATE OR REPLACE FUNCTION "public"."gen_salt"(text, int4)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_gen_salt_rounds'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for gen_salt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."gen_salt"(text);
CREATE OR REPLACE FUNCTION "public"."gen_salt"(text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_gen_salt'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for hmac
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."hmac"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."hmac"(bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_hmac'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for hmac
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."hmac"(text, text, text);
CREATE OR REPLACE FUNCTION "public"."hmac"(text, text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_hmac'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_armor_headers
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_armor_headers"(text, OUT "key" text, OUT "value" text);
CREATE OR REPLACE FUNCTION "public"."pgp_armor_headers"(IN text, OUT "key" text, OUT "value" text)
  RETURNS SETOF "pg_catalog"."record" AS '$libdir/pgcrypto', 'pgp_armor_headers'
  LANGUAGE c IMMUTABLE STRICT
  COST 1
  ROWS 1000;

-- ----------------------------
-- Function structure for pgp_key_id
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_key_id"(bytea);
CREATE OR REPLACE FUNCTION "public"."pgp_key_id"(bytea)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pgp_key_id_w'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_decrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_decrypt"(bytea, bytea, text, text);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_decrypt"(bytea, bytea, text, text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pgp_pub_decrypt_text'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_decrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_decrypt"(bytea, bytea);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_decrypt"(bytea, bytea)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pgp_pub_decrypt_text'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_decrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_decrypt"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_decrypt"(bytea, bytea, text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pgp_pub_decrypt_text'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_decrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_decrypt_bytea"(bytea, bytea);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_decrypt_bytea"(bytea, bytea)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_pub_decrypt_bytea'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_decrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_decrypt_bytea"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_decrypt_bytea"(bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_pub_decrypt_bytea'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_decrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_decrypt_bytea"(bytea, bytea, text, text);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_decrypt_bytea"(bytea, bytea, text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_pub_decrypt_bytea'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_encrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_encrypt"(text, bytea);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_encrypt"(text, bytea)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_pub_encrypt_text'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_encrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_encrypt"(text, bytea, text);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_encrypt"(text, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_pub_encrypt_text'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_encrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_encrypt_bytea"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_encrypt_bytea"(bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_pub_encrypt_bytea'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_pub_encrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_pub_encrypt_bytea"(bytea, bytea);
CREATE OR REPLACE FUNCTION "public"."pgp_pub_encrypt_bytea"(bytea, bytea)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_pub_encrypt_bytea'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_decrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_decrypt"(bytea, text, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_decrypt"(bytea, text, text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pgp_sym_decrypt_text'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_decrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_decrypt"(bytea, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_decrypt"(bytea, text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pgp_sym_decrypt_text'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_decrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_decrypt_bytea"(bytea, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_decrypt_bytea"(bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_sym_decrypt_bytea'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_decrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_decrypt_bytea"(bytea, text, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_decrypt_bytea"(bytea, text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_sym_decrypt_bytea'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_encrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_encrypt"(text, text, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_encrypt"(text, text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_sym_encrypt_text'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_encrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_encrypt"(text, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_encrypt"(text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_sym_encrypt_text'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_encrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_encrypt_bytea"(bytea, text, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_encrypt_bytea"(bytea, text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_sym_encrypt_bytea'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for pgp_sym_encrypt_bytea
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."pgp_sym_encrypt_bytea"(bytea, text);
CREATE OR REPLACE FUNCTION "public"."pgp_sym_encrypt_bytea"(bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pgp_sym_encrypt_bytea'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for set_updated_at_timestamp
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."set_updated_at_timestamp"();
CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."audit_logs_id_seq"
OWNED BY "public"."audit_logs"."id";
SELECT setval('"public"."audit_logs_id_seq"', 42, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."blocklist_reports_id_seq"
OWNED BY "public"."blocklist_reports"."id";
SELECT setval('"public"."blocklist_reports_id_seq"', 12, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."blocklist_versions_id_seq"
OWNED BY "public"."blocklist_versions"."id";
SELECT setval('"public"."blocklist_versions_id_seq"', 34, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."dns_api_tokens_id_seq"
OWNED BY "public"."dns_api_tokens"."id";
SELECT setval('"public"."dns_api_tokens_id_seq"', 3, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."domain_executions_id_seq"
OWNED BY "public"."domain_executions"."id";
SELECT setval('"public"."domain_executions_id_seq"', 20868, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."domain_import_invalids_id_seq"
OWNED BY "public"."domain_import_invalids"."id";
SELECT setval('"public"."domain_import_invalids_id_seq"', 1332, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."domains_id_seq"
OWNED BY "public"."domains"."id";
SELECT setval('"public"."domains_id_seq"', 20896, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."notice_files_id_seq"
OWNED BY "public"."notice_files"."id";
SELECT setval('"public"."notice_files_id_seq"', 57, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."notices_id_seq"
OWNED BY "public"."notices"."id";
SELECT setval('"public"."notices_id_seq"', 38, true);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
ALTER SEQUENCE "public"."users_id_seq"
OWNED BY "public"."users"."id";
SELECT setval('"public"."users_id_seq"', 2, true);

-- ----------------------------
-- Indexes structure for table audit_logs
-- ----------------------------
CREATE INDEX "idx_audit_logs_action" ON "public"."audit_logs" USING btree (
  "action" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "created_at" "pg_catalog"."timestamptz_ops" DESC NULLS FIRST
);
CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING btree (
  "created_at" "pg_catalog"."timestamptz_ops" DESC NULLS FIRST
);
CREATE INDEX "idx_audit_logs_user_id" ON "public"."audit_logs" USING btree (
  "user_id" "pg_catalog"."int8_ops" ASC NULLS LAST,
  "created_at" "pg_catalog"."timestamptz_ops" DESC NULLS FIRST
);

-- ----------------------------
-- Primary Key structure for table audit_logs
-- ----------------------------
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table blocklist_reports
-- ----------------------------
CREATE INDEX "idx_blocklist_reports_scope" ON "public"."blocklist_reports" USING btree (
  "blocklist_version" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "report_scope" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "notice_id" "pg_catalog"."int8_ops" ASC NULLS LAST
);
CREATE INDEX "idx_blocklist_reports_version" ON "public"."blocklist_reports" USING btree (
  "blocklist_version" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Uniques structure for table blocklist_reports
-- ----------------------------
ALTER TABLE "public"."blocklist_reports" ADD CONSTRAINT "blocklist_reports_job_id_key" UNIQUE ("job_id");

-- ----------------------------
-- Checks structure for table blocklist_reports
-- ----------------------------
ALTER TABLE "public"."blocklist_reports" ADD CONSTRAINT "blocklist_reports_status_check" CHECK (status::text = ANY (ARRAY['queued'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying]::text[]));
ALTER TABLE "public"."blocklist_reports" ADD CONSTRAINT "blocklist_reports_scope_check" CHECK (report_scope::text = ANY (ARRAY['general'::character varying, 'notice'::character varying]::text[]));

-- ----------------------------
-- Primary Key structure for table blocklist_reports
-- ----------------------------
ALTER TABLE "public"."blocklist_reports" ADD CONSTRAINT "blocklist_reports_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table blocklist_versions
-- ----------------------------
CREATE INDEX "idx_blocklist_versions_created_at" ON "public"."blocklist_versions" USING btree (
  "created_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);

-- ----------------------------
-- Uniques structure for table blocklist_versions
-- ----------------------------
ALTER TABLE "public"."blocklist_versions" ADD CONSTRAINT "blocklist_versions_version_key" UNIQUE ("version");

-- ----------------------------
-- Primary Key structure for table blocklist_versions
-- ----------------------------
ALTER TABLE "public"."blocklist_versions" ADD CONSTRAINT "blocklist_versions_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table dns_api_tokens
-- ----------------------------
CREATE INDEX "idx_dns_api_tokens_active" ON "public"."dns_api_tokens" USING btree (
  "revoked_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST,
  "created_at" "pg_catalog"."timestamptz_ops" DESC NULLS FIRST
);

-- ----------------------------
-- Uniques structure for table dns_api_tokens
-- ----------------------------
ALTER TABLE "public"."dns_api_tokens" ADD CONSTRAINT "dns_api_tokens_token_hash_key" UNIQUE ("token_hash");

-- ----------------------------
-- Primary Key structure for table dns_api_tokens
-- ----------------------------
ALTER TABLE "public"."dns_api_tokens" ADD CONSTRAINT "dns_api_tokens_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table domain_executions
-- ----------------------------
CREATE INDEX "idx_domain_executions_domain_id" ON "public"."domain_executions" USING btree (
  "domain_id" "pg_catalog"."int8_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table domain_executions
-- ----------------------------
ALTER TABLE "public"."domain_executions" ADD CONSTRAINT "domain_executions_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table domain_import_invalids
-- ----------------------------
CREATE INDEX "idx_domain_import_invalids_created_by" ON "public"."domain_import_invalids" USING btree (
  "created_by" "pg_catalog"."int8_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table domain_import_invalids
-- ----------------------------
ALTER TABLE "public"."domain_import_invalids" ADD CONSTRAINT "domain_import_invalids_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table domains
-- ----------------------------
CREATE INDEX "idx_domains_notice_id" ON "public"."domains" USING btree (
  "notice_id" "pg_catalog"."int8_ops" ASC NULLS LAST
);
CREATE INDEX "idx_domains_status" ON "public"."domains" USING btree (
  "status" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Triggers structure for table domains
-- ----------------------------
CREATE TRIGGER "trg_domains_updated_at" BEFORE UPDATE ON "public"."domains"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_updated_at_timestamp"();

-- ----------------------------
-- Uniques structure for table domains
-- ----------------------------
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_domain_name_key" UNIQUE ("domain_name");

-- ----------------------------
-- Checks structure for table domains
-- ----------------------------
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_format_check" CHECK (char_length(domain_name::text) <= 253 AND domain_name::text ~ '^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$'::text);
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_block_range_check" CHECK (block_start_date IS NULL OR block_end_date IS NULL OR block_end_date >= block_start_date);
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_status_check" CHECK (status::text = 'blocked'::text);

-- ----------------------------
-- Primary Key structure for table domains
-- ----------------------------
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table notice_files
-- ----------------------------
CREATE INDEX "idx_notice_files_notice_id" ON "public"."notice_files" USING btree (
  "notice_id" "pg_catalog"."int8_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table notice_files
-- ----------------------------
ALTER TABLE "public"."notice_files" ADD CONSTRAINT "notice_files_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table notices
-- ----------------------------
ALTER TABLE "public"."notices" ADD CONSTRAINT "notices_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table user_sessions
-- ----------------------------
CREATE INDEX "idx_user_sessions_expire" ON "public"."user_sessions" USING btree (
  "expire" "pg_catalog"."timestamp_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table user_sessions
-- ----------------------------
ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid");

-- ----------------------------
-- Triggers structure for table users
-- ----------------------------
CREATE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "public"."users"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_updated_at_timestamp"();

-- ----------------------------
-- Uniques structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_username_key" UNIQUE ("username");

-- ----------------------------
-- Primary Key structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table audit_logs
-- ----------------------------
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table blocklist_reports
-- ----------------------------
ALTER TABLE "public"."blocklist_reports" ADD CONSTRAINT "blocklist_reports_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."notices" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."blocklist_reports" ADD CONSTRAINT "blocklist_reports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table blocklist_versions
-- ----------------------------
ALTER TABLE "public"."blocklist_versions" ADD CONSTRAINT "blocklist_versions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table dns_api_tokens
-- ----------------------------
ALTER TABLE "public"."dns_api_tokens" ADD CONSTRAINT "dns_api_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."dns_api_tokens" ADD CONSTRAINT "dns_api_tokens_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table domain_executions
-- ----------------------------
ALTER TABLE "public"."domain_executions" ADD CONSTRAINT "domain_executions_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."domains" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."domain_executions" ADD CONSTRAINT "domain_executions_executed_by_fkey" FOREIGN KEY ("executed_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table domain_import_invalids
-- ----------------------------
ALTER TABLE "public"."domain_import_invalids" ADD CONSTRAINT "domain_import_invalids_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table domains
-- ----------------------------
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."domains" ADD CONSTRAINT "domains_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."notices" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table notice_files
-- ----------------------------
ALTER TABLE "public"."notice_files" ADD CONSTRAINT "notice_files_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."notices" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."notice_files" ADD CONSTRAINT "notice_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table notices
-- ----------------------------
ALTER TABLE "public"."notices" ADD CONSTRAINT "notices_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

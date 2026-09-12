-- ============================================================================
-- APPEND-ONLY SECURITY HARDENING: Activity, StatusHistory, AuditLog
-- ============================================================================

-- 1. PostgreSQL Trigger Function to enforce append-only semantics
-- Blocks all UPDATE and DELETE operations regardless of caller or role.
CREATE OR REPLACE FUNCTION prevent_update_or_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'This table is append-only: updates and deletes are strictly prohibited on %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach Triggers to Activity, StatusHistory, and AuditLog
DROP TRIGGER IF EXISTS trg_activity_append_only ON "Activity";
CREATE TRIGGER trg_activity_append_only
BEFORE UPDATE OR DELETE ON "Activity"
FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete();

DROP TRIGGER IF EXISTS trg_statushistory_append_only ON "StatusHistory";
CREATE TRIGGER trg_statushistory_append_only
BEFORE UPDATE OR DELETE ON "StatusHistory"
FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete();

DROP TRIGGER IF EXISTS trg_auditlog_append_only ON "AuditLog";
CREATE TRIGGER trg_auditlog_append_only
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_update_or_delete();

-- 3. Dedicated Application Role "crm_app" (Safe for Managed Cloud DBs)
-- Handled inside a protected DO block so environments with restricted
-- role-creation privileges (e.g. Neon, Render free tier) do not fail the migration.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'crm_app') THEN
        CREATE ROLE crm_app WITH LOGIN NOINHERIT;
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Notice: Skipping role creation of crm_app due to insufficient privileges in managed cloud environment. Trigger-based append-only enforcement remains fully active.';
END
$$;

-- 4. Role Permissions: Grant only SELECT & INSERT on append-only tables; revoke UPDATE & DELETE
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'crm_app') THEN
        -- Schema and sequence access
        GRANT USAGE ON SCHEMA "public" TO crm_app;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "public" TO crm_app;

        -- Standard CRUD on mutable business tables
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
            "User",
            "RefreshToken",
            "Customer",
            "Enquiry",
            "Followup",
            "Quotation",
            "Attachment",
            "Notification"
        TO crm_app;

        -- Append-only permissions: SELECT and INSERT only
        GRANT SELECT, INSERT ON TABLE "Activity", "StatusHistory", "AuditLog" TO crm_app;
        REVOKE UPDATE, DELETE ON TABLE "Activity", "StatusHistory", "AuditLog" FROM crm_app;
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Notice: Skipping role privilege adjustments. Trigger-based append-only enforcement remains fully active.';
END
$$;

-- Migration 014: permanently remove school users previously soft-deleted.
-- Dependent sessions, reset codes, and role memberships cascade on user deletion.
-- Audit rows survive with user_id set to NULL and actor_email retained.
DELETE FROM users
 WHERE deleted_at IS NOT NULL;

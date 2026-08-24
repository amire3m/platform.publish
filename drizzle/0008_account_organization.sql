ALTER TABLE "social_accounts"
ADD COLUMN IF NOT EXISTS "organization" text;

ALTER TABLE "social_accounts"
DROP CONSTRAINT IF EXISTS "social_accounts_organization_check";

ALTER TABLE "social_accounts"
ADD CONSTRAINT "social_accounts_organization_check"
CHECK ("organization" IS NULL OR "organization" IN ('emro', 'sana'));

CREATE INDEX IF NOT EXISTS "social_accounts_organization_idx"
ON "social_accounts" ("organization");

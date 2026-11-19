ALTER TABLE "policy_chunks" ADD COLUMN IF NOT EXISTS "doc_title" text DEFAULT '' NOT NULL;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "user_key" text DEFAULT 'anonymous' NOT NULL;
ALTER TABLE "chat_messages" ALTER COLUMN "employee_id" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "chat_messages_user_idx" ON "chat_messages" USING btree ("user_key", "created_at");

CREATE TABLE "public"."communities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "slug" character varying(255) NOT NULL,
    "description" "text",
    "current_payout_profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "communities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "communities_slug_key" UNIQUE ("slug"),
    CONSTRAINT "communities_soft_delete_consistency" CHECK (("is_deleted" = ("deleted_at" IS NOT NULL)))
);

ALTER TABLE ONLY "public"."communities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY "public"."communities" FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."communities" IS 'コミュニティ情報';
COMMENT ON COLUMN "public"."communities"."created_by" IS 'コミュニティ作成者ユーザーID';
COMMENT ON COLUMN "public"."communities"."slug" IS '公開URL用slug。推測困難なランダム値を保存する';
COMMENT ON COLUMN "public"."communities"."current_payout_profile_id" IS 'コミュニティの現在のデフォルト受取先。未設定時はNULL';

CREATE TABLE "public"."payout_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "stripe_account_id" character varying(255) NOT NULL,
    "status" "public"."stripe_account_status_enum" DEFAULT 'unverified'::"public"."stripe_account_status_enum" NOT NULL,
    "charges_enabled" boolean DEFAULT false NOT NULL,
    "payouts_enabled" boolean DEFAULT false NOT NULL,
    "representative_community_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payout_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payout_profiles_owner_user_id_key" UNIQUE ("owner_user_id"),
    CONSTRAINT "payout_profiles_stripe_account_id_key" UNIQUE ("stripe_account_id")
);

ALTER TABLE ONLY "public"."payout_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY "public"."payout_profiles" FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE "public"."payout_profiles" IS '受取先プロファイル。既存stripe_connect_accountsの移行先';
COMMENT ON COLUMN "public"."payout_profiles"."owner_user_id" IS 'MVPでの受取先オーナーユーザーID。1ユーザー1受取先';
COMMENT ON COLUMN "public"."payout_profiles"."representative_community_id" IS 'Stripe審査用URLの代表コミュニティ';

ALTER TABLE ONLY "public"."communities"
    ADD CONSTRAINT "communities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");

ALTER TABLE ONLY "public"."payout_profiles"
    ADD CONSTRAINT "payout_profiles_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."payout_profiles"
    ADD CONSTRAINT "payout_profiles_representative_community_id_fkey" FOREIGN KEY ("representative_community_id") REFERENCES "public"."communities"("id");

ALTER TABLE ONLY "public"."communities"
    ADD CONSTRAINT "communities_current_payout_profile_id_fkey" FOREIGN KEY ("current_payout_profile_id") REFERENCES "public"."payout_profiles"("id");

CREATE INDEX "idx_communities_created_by" ON "public"."communities" USING "btree" ("created_by");
CREATE INDEX "idx_communities_current_payout_profile_id" ON "public"."communities" USING "btree" ("current_payout_profile_id");
CREATE INDEX "idx_payout_profiles_owner_user_id" ON "public"."payout_profiles" USING "btree" ("owner_user_id");
CREATE INDEX "idx_payout_profiles_representative_community_id" ON "public"."payout_profiles" USING "btree" ("representative_community_id");

CREATE OR REPLACE TRIGGER "update_communities_updated_at" BEFORE UPDATE ON "public"."communities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
CREATE OR REPLACE TRIGGER "update_payout_profiles_updated_at" BEFORE UPDATE ON "public"."payout_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."events"
    ADD COLUMN "community_id" "uuid",
    ADD COLUMN "payout_profile_id" "uuid";

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id");

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_payout_profile_id_fkey" FOREIGN KEY ("payout_profile_id") REFERENCES "public"."payout_profiles"("id");

CREATE INDEX "idx_events_community_id" ON "public"."events" USING "btree" ("community_id");
CREATE INDEX "idx_events_payout_profile_id" ON "public"."events" USING "btree" ("payout_profile_id");

COMMENT ON COLUMN "public"."events"."community_id" IS 'イベントが所属するコミュニティID';
COMMENT ON COLUMN "public"."events"."payout_profile_id" IS 'イベント作成時点の受取先スナップショット';

ALTER TABLE "public"."payments"
    ADD COLUMN "payout_profile_id" "uuid";

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payout_profile_id_fkey" FOREIGN KEY ("payout_profile_id") REFERENCES "public"."payout_profiles"("id");

CREATE INDEX "idx_payments_payout_profile_id" ON "public"."payments" USING "btree" ("payout_profile_id");

COMMENT ON COLUMN "public"."payments"."payout_profile_id" IS '決済時点の受取先スナップショット';

ALTER TABLE "public"."settlements"
    ADD COLUMN "community_id" "uuid",
    ADD COLUMN "payout_profile_id" "uuid",
    ADD COLUMN "initiated_by" "uuid";

ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id");

ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_payout_profile_id_fkey" FOREIGN KEY ("payout_profile_id") REFERENCES "public"."payout_profiles"("id");

ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id");

CREATE INDEX "idx_settlements_community_id" ON "public"."settlements" USING "btree" ("community_id");
CREATE INDEX "idx_settlements_payout_profile_id" ON "public"."settlements" USING "btree" ("payout_profile_id");
CREATE INDEX "idx_settlements_initiated_by" ON "public"."settlements" USING "btree" ("initiated_by");

COMMENT ON COLUMN "public"."settlements"."community_id" IS '清算対象イベントが属するコミュニティID';
COMMENT ON COLUMN "public"."settlements"."payout_profile_id" IS '清算時点の受取先スナップショット';
COMMENT ON COLUMN "public"."settlements"."initiated_by" IS '清算処理を実行したユーザーID';

ALTER TABLE "notification_settings"
  ADD COLUMN IF NOT EXISTS "circuit_breaker_channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "daily_leaderboard_channels" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "cost_alert_channels" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "notification_settings"
SET "circuit_breaker_channels" =
    CASE
      WHEN COALESCE("circuit_breaker_webhook", '') <> ''
        THEN jsonb_build_array(jsonb_build_object('channel', 'wechat', 'webhookUrl', "circuit_breaker_webhook", 'secret', null, 'enabled', true))
      ELSE '[]'::jsonb
    END
WHERE jsonb_typeof("circuit_breaker_channels") IS NULL
   OR jsonb_array_length("circuit_breaker_channels") = 0;

UPDATE "notification_settings"
SET "daily_leaderboard_channels" =
    CASE
      WHEN COALESCE("daily_leaderboard_webhook", '') <> ''
        THEN jsonb_build_array(jsonb_build_object('channel', 'wechat', 'webhookUrl', "daily_leaderboard_webhook", 'secret', null, 'enabled', true))
      ELSE '[]'::jsonb
    END
WHERE jsonb_typeof("daily_leaderboard_channels") IS NULL
   OR jsonb_array_length("daily_leaderboard_channels") = 0;

UPDATE "notification_settings"
SET "cost_alert_channels" =
    CASE
      WHEN COALESCE("cost_alert_webhook", '') <> ''
        THEN jsonb_build_array(jsonb_build_object('channel', 'wechat', 'webhookUrl', "cost_alert_webhook", 'secret', null, 'enabled', true))
      ELSE '[]'::jsonb
    END
WHERE jsonb_typeof("cost_alert_channels") IS NULL
   OR jsonb_array_length("cost_alert_channels") = 0;

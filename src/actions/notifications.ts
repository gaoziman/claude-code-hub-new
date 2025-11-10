"use server";

import { logger } from "@/lib/logger";
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
  type UpdateNotificationSettingsInput,
} from "@/repository/notifications";
import { testNotificationChannel } from "@/lib/notification/channels";
import type { NotificationChannelConfig, NotificationChannelType } from "@/types/notification";

/**
 * 获取通知设置
 */
export async function getNotificationSettingsAction(): Promise<NotificationSettings> {
  return getNotificationSettings();
}

/**
 * 更新通知设置并重新调度任务
 */
export async function updateNotificationSettingsAction(
  payload: UpdateNotificationSettingsInput
): Promise<{ success: boolean; data?: NotificationSettings; error?: string }> {
  try {
    const updated = await updateNotificationSettings(payload);

    // 重新调度通知任务（仅生产环境）
    if (process.env.NODE_ENV === "production") {
      // 动态导入避免 Turbopack 编译 Bull 模块
      const { scheduleNotifications } = await import("@/lib/notification/notification-queue");
      await scheduleNotifications();
    } else {
      logger.warn({
        action: "schedule_notifications_skipped",
        reason: "development_mode",
        message: "Notification scheduling is disabled in development mode",
      });
    }

    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "更新通知设置失败",
    };
  }
}

/**
 * 测试 Webhook 连通性
 */
export async function testWebhookAction(input: {
  channel: NotificationChannelType;
  webhookUrl: string;
  secret?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!input.webhookUrl || !input.webhookUrl.trim()) {
    return { success: false, error: "Webhook URL 不能为空" };
  }

  const config: NotificationChannelConfig = {
    channel: input.channel,
    webhookUrl: input.webhookUrl.trim(),
    secret: input.secret?.trim() || null,
    enabled: true,
  };

  try {
    const result = await testNotificationChannel(config);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "测试连接失败",
    };
  }
}

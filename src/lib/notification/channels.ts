import crypto from "crypto";
import { logger } from "@/lib/logger";
import { sendWeChatNotification } from "@/lib/wechat/bot";
import type { NotificationChannelConfig, NotificationChannelType } from "@/types/notification";

export interface ChannelSendResult {
  channel: NotificationChannelType;
  success: boolean;
  error?: string;
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/`/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#+\s?/g, "")
    .replace(/>+\s?/g, "")
    .replace(/\r?\n{2,}/g, "\n")
    .trim();
}

async function sendFeishuNotification(
  config: NotificationChannelConfig,
  markdownContent: string
): Promise<ChannelSendResult> {
  const plainText = markdownToPlainText(markdownContent);
  const body: Record<string, unknown> = {
    msg_type: "text",
    content: {
      text: plainText,
    },
  };

  if (config.secret?.trim()) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `${timestamp}\n${config.secret.trim()}`;
    const sign = crypto.createHmac("sha256", config.secret.trim()).update(stringToSign).digest("base64");
    body.timestamp = timestamp;
    body.sign = sign;
  }

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return {
      channel: "feishu",
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const result = (await response.json().catch(() => ({}))) as {
    StatusCode?: number;
    status_code?: number;
    Code?: number;
    code?: number;
    msg?: string;
    StatusMessage?: string;
  };

  const code =
    result.StatusCode ?? result.status_code ?? result.Code ?? result.code ?? 0;

  if (code === 0) {
    return { channel: "feishu", success: true };
  }

  return {
    channel: "feishu",
    success: false,
    error: result.msg || result.StatusMessage || "Feishu webhook error",
  };
}

function withDingTalkSignature(url: string, secret?: string | null): string {
  if (!secret) return url;
  const trimmed = secret.trim();
  if (!trimmed) return url;
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${trimmed}`;
  const sign = crypto.createHmac("sha256", trimmed).update(stringToSign).digest("base64");
  const signedUrl = new URL(url);
  signedUrl.searchParams.set("timestamp", timestamp.toString());
  signedUrl.searchParams.set("sign", sign);
  return signedUrl.toString();
}

async function sendDingTalkNotification(
  config: NotificationChannelConfig,
  markdownContent: string
): Promise<ChannelSendResult> {
  const plainText = markdownToPlainText(markdownContent);
  const targetUrl = withDingTalkSignature(config.webhookUrl, config.secret);

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msgtype: "text",
      text: {
        content: plainText,
      },
    }),
  });

  if (!response.ok) {
    return {
      channel: "dingtalk",
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const result = (await response.json().catch(() => ({}))) as {
    errcode?: number;
    errmsg?: string;
  };

  if (result.errcode === 0) {
    return { channel: "dingtalk", success: true };
  }

  return {
    channel: "dingtalk",
    success: false,
    error: result.errmsg || "DingTalk webhook error",
  };
}

export async function sendNotificationThroughChannel(
  config: NotificationChannelConfig,
  markdownContent: string
): Promise<ChannelSendResult> {
  if (!config || config.enabled === false) {
    return { channel: config?.channel ?? "wechat", success: true };
  }

  if (!config.webhookUrl?.trim()) {
    return {
      channel: config.channel,
      success: false,
      error: "Webhook URL is empty",
    };
  }

  try {
    switch (config.channel) {
      case "feishu":
        return await sendFeishuNotification(config, markdownContent);
      case "dingtalk":
        return await sendDingTalkNotification(config, markdownContent);
      case "wechat":
      default: {
        const result = await sendWeChatNotification(config.webhookUrl.trim(), markdownContent);
        return { channel: "wechat", success: result.success, error: result.error };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({
      action: "notification_channel_send_error",
      channel: config.channel,
      error: message,
    });
    return { channel: config.channel, success: false, error: message };
  }
}

export async function testNotificationChannel(config: NotificationChannelConfig) {
  return sendNotificationThroughChannel(config, "✅ 测试消息\n\n来自 Claude Code Hub");
}

export function getActiveChannels(
  channels?: NotificationChannelConfig[] | null
): NotificationChannelConfig[] {
  if (!Array.isArray(channels)) return [];
  return channels.filter((channel) => Boolean(channel?.webhookUrl?.trim()) && channel.enabled !== false);
}

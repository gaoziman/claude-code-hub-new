export type NotificationChannelType = "wechat" | "feishu" | "dingtalk";

export interface NotificationChannelConfig {
  channel: NotificationChannelType;
  webhookUrl: string;
  secret?: string | null;
  enabled?: boolean | null;
}

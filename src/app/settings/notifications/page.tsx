"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type Resolver,
  type UseFieldArrayReturn,
} from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, TestTube, Bell, TrendingUp, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  getNotificationSettingsAction,
  updateNotificationSettingsAction,
  testWebhookAction,
} from "@/actions/notifications";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NotificationChannelType, NotificationChannelConfig } from "@/types/notification";

const channelTypeEnum = z.enum(["wechat", "feishu", "dingtalk"]);

const channelFieldSchema = z.object({
  id: z.string().optional(),
  channel: channelTypeEnum,
  webhookUrl: z.string().url("请输入有效的 Webhook URL"),
  secret: z.string().optional(),
  enabled: z.boolean().default(true),
});

function normalizeChannelsForForm(
  channels?: NotificationChannelConfig[] | null
): NotificationFormData["circuitBreakerChannels"] {
  if (!Array.isArray(channels)) return [];
  return channels.map((item, index) => ({
    id: `${item.channel}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    channel: item.channel,
    webhookUrl: item.webhookUrl,
    secret: item.secret || "",
    enabled: item.enabled !== false,
  }));
}

function mapChannelsForSubmit(channels: NotificationFormData["circuitBreakerChannels"]): NotificationChannelConfig[] {
  return channels
    .filter((channel) => channel.webhookUrl && channel.webhookUrl.trim())
    .map((channel) => ({
      channel: channel.channel,
      webhookUrl: channel.webhookUrl.trim(),
      secret: channel.secret?.trim() || null,
      enabled: channel.enabled !== false,
    }));
}

function createEmptyChannel(): NotificationFormData["circuitBreakerChannels"][number] {
  return {
    id: `channel-${Math.random().toString(36).slice(2, 8)}`,
    channel: "wechat",
    webhookUrl: "",
    secret: "",
    enabled: true,
  };
}

/**
 * 通知设置表单 Schema
 */
const notificationSchema = z.object({
  enabled: z.boolean(),

  // 熔断器告警
  circuitBreakerEnabled: z.boolean(),
  circuitBreakerWebhook: z.string().optional(),
  circuitBreakerChannels: z.array(channelFieldSchema),

  // 每日排行榜
  dailyLeaderboardEnabled: z.boolean(),
  dailyLeaderboardWebhook: z.string().optional(),
  dailyLeaderboardTime: z.string().regex(/^\d{2}:\d{2}$/, "时间格式错误，应为 HH:mm"),
  dailyLeaderboardTopN: z.number().int().min(1).max(20),
  dailyLeaderboardChannels: z.array(channelFieldSchema),

  // 成本预警
  costAlertEnabled: z.boolean(),
  costAlertWebhook: z.string().optional(),
  costAlertThreshold: z.number().min(0.5).max(1.0),
  costAlertCheckInterval: z.number().int().min(10).max(1440),
  costAlertChannels: z.array(channelFieldSchema),
});

type NotificationFormData = z.infer<typeof notificationSchema>;

export default function NotificationsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema) as Resolver<NotificationFormData>,
    defaultValues: {
      enabled: false,
      circuitBreakerEnabled: false,
      circuitBreakerWebhook: "",
      circuitBreakerChannels: [],
      dailyLeaderboardEnabled: false,
      dailyLeaderboardWebhook: "",
      dailyLeaderboardTime: "09:00",
      dailyLeaderboardTopN: 5,
      dailyLeaderboardChannels: [],
      costAlertEnabled: false,
      costAlertWebhook: "",
      costAlertThreshold: 0.8,
      costAlertCheckInterval: 60,
      costAlertChannels: [],
    },
  });

  const enabled = watch("enabled");
  const circuitBreakerEnabled = watch("circuitBreakerEnabled");
  const dailyLeaderboardEnabled = watch("dailyLeaderboardEnabled");
  const costAlertEnabled = watch("costAlertEnabled");
  const costAlertThreshold = watch("costAlertThreshold");
  const circuitChannelsValues = watch("circuitBreakerChannels");
  const leaderboardChannelsValues = watch("dailyLeaderboardChannels");
  const costChannelsValues = watch("costAlertChannels");
  const circuitChannelErrors = errors.circuitBreakerChannels;
  const leaderboardChannelErrors = errors.dailyLeaderboardChannels;
  const costChannelErrors = errors.costAlertChannels;

  const circuitChannelArray = useFieldArray<NotificationFormData, "circuitBreakerChannels">({
    control,
    name: "circuitBreakerChannels",
  });
  const leaderboardChannelArray = useFieldArray<NotificationFormData, "dailyLeaderboardChannels">({
    control,
    name: "dailyLeaderboardChannels",
  });
  const costChannelArray = useFieldArray<NotificationFormData, "costAlertChannels">({
    control,
    name: "costAlertChannels",
  });

  const loadSettings = useCallback(async () => {
    try {
      const data = await getNotificationSettingsAction();

      // 设置表单默认值
      setValue("enabled", data.enabled);
      setValue("circuitBreakerEnabled", data.circuitBreakerEnabled);
      setValue("circuitBreakerWebhook", data.circuitBreakerWebhook || "");
      setValue("circuitBreakerChannels", normalizeChannelsForForm(data.circuitBreakerChannels));
      setValue("dailyLeaderboardEnabled", data.dailyLeaderboardEnabled);
      setValue("dailyLeaderboardWebhook", data.dailyLeaderboardWebhook || "");
      setValue("dailyLeaderboardTime", data.dailyLeaderboardTime || "09:00");
      setValue("dailyLeaderboardTopN", data.dailyLeaderboardTopN || 5);
      setValue("dailyLeaderboardChannels", normalizeChannelsForForm(data.dailyLeaderboardChannels));
      setValue("costAlertEnabled", data.costAlertEnabled);
      setValue("costAlertWebhook", data.costAlertWebhook || "");
      setValue("costAlertThreshold", parseFloat(data.costAlertThreshold || "0.80"));
      setValue("costAlertCheckInterval", data.costAlertCheckInterval || 60);
      setValue("costAlertChannels", normalizeChannelsForForm(data.costAlertChannels));
    } catch (error) {
      toast.error("加载通知设置失败");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [setValue]);

  // 加载设置
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: NotificationFormData) => {
    setIsSubmitting(true);

    try {
      const result = await updateNotificationSettingsAction({
        enabled: data.enabled,
        circuitBreakerEnabled: data.circuitBreakerEnabled,
        circuitBreakerWebhook: data.circuitBreakerWebhook || null,
        circuitBreakerChannels: mapChannelsForSubmit(data.circuitBreakerChannels),
        dailyLeaderboardEnabled: data.dailyLeaderboardEnabled,
        dailyLeaderboardWebhook: data.dailyLeaderboardWebhook || null,
        dailyLeaderboardTime: data.dailyLeaderboardTime,
        dailyLeaderboardTopN: data.dailyLeaderboardTopN,
        dailyLeaderboardChannels: mapChannelsForSubmit(data.dailyLeaderboardChannels),
        costAlertEnabled: data.costAlertEnabled,
        costAlertWebhook: data.costAlertWebhook || null,
        costAlertThreshold: data.costAlertThreshold.toString(),
        costAlertCheckInterval: data.costAlertCheckInterval,
        costAlertChannels: mapChannelsForSubmit(data.costAlertChannels),
      });

      if (result.success) {
        toast.success("通知设置已保存并重新调度任务");
        loadSettings();
      } else {
        toast.error(result.error || "保存失败");
      }
    } catch (error) {
      console.error("Save error:", error);
      toast.error("保存设置失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestChannel = async (
    channelConfig: NotificationChannelConfig,
    key: string
  ) => {
    if (!channelConfig.webhookUrl?.trim()) {
      toast.error("请先填写 Webhook URL");
      return;
    }

    setTestingWebhook(key);

    try {
      const result = await testWebhookAction({
        channel: channelConfig.channel,
        webhookUrl: channelConfig.webhookUrl,
        secret: channelConfig.secret,
      });

      if (result.success) {
        toast.success("测试消息已发送，请检查对应渠道");
      } else {
        toast.error(result.error || "测试失败");
      }
    } catch (error) {
      console.error("Test error:", error);
      toast.error("测试连接失败");
    } finally {
      setTestingWebhook(null);
    }
  };

  type ChannelFieldPath =
    | "circuitBreakerChannels"
    | "dailyLeaderboardChannels"
    | "costAlertChannels";

  const renderChannelList = (
    fieldPath: ChannelFieldPath,
    sectionKey: string,
    fieldArray: UseFieldArrayReturn<NotificationFormData, ChannelFieldPath>,
    values: NotificationFormData[typeof fieldPath],
    fieldErrors: typeof errors.circuitBreakerChannels,
    disabled: boolean
  ) => {
    return (
      <div className="space-y-3">
        {fieldArray.fields.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无渠道，点击下方“添加渠道”以新增。</p>
        )}
        {fieldArray.fields.map((field, index) => {
          const current = values?.[index];
          const errorBag = fieldErrors?.[index];
          const requiresSecret = current?.channel === "feishu" || current?.channel === "dingtalk";
          const testKey = `${sectionKey}-${index}`;
          const canTest = Boolean(current?.webhookUrl?.trim());
          const payload: NotificationChannelConfig = {
            channel: current?.channel || "wechat",
            webhookUrl: current?.webhookUrl?.trim() || "",
            secret: current?.secret?.trim() || null,
            enabled: current?.enabled !== false,
          };

          return (
            <div
              key={field.id}
              className="rounded-xl border border-border/70 bg-muted/5 p-3 space-y-3"
            >
              <div className="space-y-2">
                <Label>渠道类型</Label>
                <Controller
                  control={control}
                  name={`${fieldPath}.${index}.channel` as const}
                  render={({ field: ctrl }) => (
                    <Select
                      value={ctrl.value}
                      onValueChange={(value) => ctrl.onChange(value as NotificationChannelType)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择渠道" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wechat">企业微信</SelectItem>
                        <SelectItem value="feishu">飞书</SelectItem>
                        <SelectItem value="dingtalk">钉钉</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input
                  {...register(`${fieldPath}.${index}.webhookUrl` as const)}
                  disabled={disabled}
                  placeholder="粘贴机器人 Webhook 地址"
                />
                {errorBag?.webhookUrl && (
                  <p className="text-sm text-red-500">{errorBag.webhookUrl.message}</p>
                )}
              </div>

              {(requiresSecret || current?.secret) && (
                <div className="space-y-2">
                  <Label>签名 Secret（飞书/钉钉可选）</Label>
                  <Input
                    {...register(`${fieldPath}.${index}.secret` as const)}
                    disabled={disabled}
                    placeholder={
                      current?.channel === "wechat"
                        ? "企业微信无需 Secret"
                        : "填写飞书/钉钉的签名 Secret"
                    }
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 justify-between">
                <Controller
                  control={control}
                  name={`${fieldPath}.${index}.enabled` as const}
                  render={({ field: ctrl }) => (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={ctrl.value !== false}
                        onCheckedChange={(checked) => ctrl.onChange(checked)}
                        disabled={disabled}
                      />
                      <span className="text-sm text-muted-foreground">启用此渠道</span>
                    </div>
                  )}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || !canTest || testingWebhook === testKey}
                    onClick={() => handleTestChannel(payload, testKey)}
                  >
                    {testingWebhook === testKey ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 测试中...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-4 h-4 mr-2" /> 测试连接
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => fieldArray.remove(index)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> 删除渠道
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => fieldArray.append(createEmptyChannel())}
        >
          <Plus className="w-4 h-4 mr-2" /> 添加渠道
        </Button>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">消息推送</h1>
        <p className="text-muted-foreground mt-2">配置企业微信、飞书或钉钉机器人消息推送</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 全局开关 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              通知总开关
            </CardTitle>
            <CardDescription>启用或禁用所有消息推送功能</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">启用消息推送</Label>
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={(checked) => setValue("enabled", checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 熔断器告警配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              熔断器告警
            </CardTitle>
            <CardDescription>供应商完全熔断时立即推送告警消息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="circuitBreakerEnabled">启用熔断器告警</Label>
              <Switch
                id="circuitBreakerEnabled"
                checked={circuitBreakerEnabled}
                disabled={!enabled}
                onCheckedChange={(checked) => setValue("circuitBreakerEnabled", checked)}
              />
            </div>

            {circuitBreakerEnabled && (
              <div className="space-y-4 pt-4">
                <Separator />
                {renderChannelList(
                  "circuitBreakerChannels",
                  "circuit",
                  circuitChannelArray,
                  circuitChannelsValues,
                  circuitChannelErrors,
                  !enabled
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 每日排行榜配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              每日用户消费排行榜
            </CardTitle>
            <CardDescription>每天定时发送用户消费 Top N 排行榜</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="dailyLeaderboardEnabled">启用每日排行榜</Label>
              <Switch
                id="dailyLeaderboardEnabled"
                checked={dailyLeaderboardEnabled}
                disabled={!enabled}
                onCheckedChange={(checked) => setValue("dailyLeaderboardEnabled", checked)}
              />
            </div>

            {dailyLeaderboardEnabled && (
              <div className="space-y-4 pt-4">
                <Separator />
                {renderChannelList(
                  "dailyLeaderboardChannels",
                  "leaderboard",
                  leaderboardChannelArray,
                  leaderboardChannelsValues,
                  leaderboardChannelErrors,
                  !enabled
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dailyLeaderboardTime">发送时间</Label>
                    <Input
                      id="dailyLeaderboardTime"
                      {...register("dailyLeaderboardTime")}
                      placeholder="09:00"
                      disabled={!enabled}
                    />
                    {errors.dailyLeaderboardTime && (
                      <p className="text-sm text-red-500">{errors.dailyLeaderboardTime.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dailyLeaderboardTopN">显示前 N 名</Label>
                    <Input
                      id="dailyLeaderboardTopN"
                      type="number"
                      {...register("dailyLeaderboardTopN", { valueAsNumber: true })}
                      min={1}
                      max={20}
                      disabled={!enabled}
                    />
                    {errors.dailyLeaderboardTopN && (
                      <p className="text-sm text-red-500">{errors.dailyLeaderboardTopN.message}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 成本预警配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              成本预警
            </CardTitle>
            <CardDescription>检测用户/供应商消费超过配额阈值时触发告警</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="costAlertEnabled">启用成本预警</Label>
              <Switch
                id="costAlertEnabled"
                checked={costAlertEnabled}
                disabled={!enabled}
                onCheckedChange={(checked) => setValue("costAlertEnabled", checked)}
              />
            </div>

            {costAlertEnabled && (
              <div className="space-y-4 pt-4">
                <Separator />
                {renderChannelList(
                  "costAlertChannels",
                  "cost",
                  costChannelArray,
                  costChannelsValues,
                  costChannelErrors,
                  !enabled
                )}

                <div className="space-y-2">
                  <Label htmlFor="costAlertThreshold">
                    预警阈值: {((costAlertThreshold || 0.8) * 100).toFixed(0)}%
                  </Label>
                  <Slider
                    id="costAlertThreshold"
                    min={0.5}
                    max={1.0}
                    step={0.05}
                    value={[costAlertThreshold || 0.8]}
                    onValueChange={([value]) => setValue("costAlertThreshold", value)}
                    disabled={!enabled}
                    className="w-full"
                  />
                  <p className="text-sm text-muted-foreground">
                    当消费达到配额的 {((costAlertThreshold || 0.8) * 100).toFixed(0)}% 时触发告警
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="costAlertCheckInterval">检查间隔（分钟）</Label>
                  <Input
                    id="costAlertCheckInterval"
                    type="number"
                    {...register("costAlertCheckInterval", { valueAsNumber: true })}
                    min={10}
                    max={1440}
                    disabled={!enabled}
                  />
                  {errors.costAlertCheckInterval && (
                    <p className="text-sm text-red-500">{errors.costAlertCheckInterval.message}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              "保存设置"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

import { createMessageRequest } from "@/repository/message";
import type { ProxySession } from "./session";

export class ProxyMessageService {
  static async ensureContext(session: ProxySession): Promise<void> {
    const authState = session.authState;
    const provider = session.provider;

    if (
      !authState ||
      !authState.success ||
      !authState.user ||
      !authState.key ||
      !authState.apiKey ||
      !provider
    ) {
      session.setMessageContext(null);
      return;
    }

    const messageRequest = await createMessageRequest({
      provider_id: provider.id,
      user_id: authState.user.id,
      key: authState.key.key, 
      model: session.request.model ?? undefined,
      session_id: session.sessionId ?? undefined, // 传入 session_id
      cost_multiplier: provider.costMultiplier, // 传入 cost_multiplier
      user_agent: session.userAgent ?? undefined, // 传入 user_agent
      original_model: session.getOriginalModel() ?? undefined, // 传入原始模型（用户请求的模型）
      messages_count: session.getMessagesLength(), // 传入 messages 数量
    });

    session.setMessageContext({
      id: messageRequest.id,
      user: authState.user,
      key: authState.key,
      apiKey: authState.apiKey,
    });
  }
}

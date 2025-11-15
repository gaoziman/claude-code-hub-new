export class ProxyResponses {
  /**
   * 构建符合 Anthropic API 规范的错误响应
   * @param status HTTP 状态码
   * @param message 错误消息
   * @param errorType 错误类型 (如 "rate_limit_error", "invalid_request_error" 等)
   */
  static buildError(status: number, message: string, errorType?: string): Response {
    const payload = {
      type: "error", // Anthropic API 标准格式：顶层必须有 type: "error"
      error: {
        type: errorType || this.mapStatusToErrorType(status),
        message,
      },
    };

    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  }

  /**
   * 将 HTTP 状态码映射到 Anthropic 错误类型
   */
  private static mapStatusToErrorType(status: number): string {
    switch (status) {
      case 401:
      case 403:
        return "authentication_error";
      case 429:
        return "rate_limit_error";
      case 400:
        return "invalid_request_error";
      case 500:
      case 502:
      case 503:
        return "api_error";
      case 529:
        return "overloaded_error";
      default:
        return "api_error";
    }
  }
}

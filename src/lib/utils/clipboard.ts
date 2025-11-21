/**
 * 复制文本到剪贴板（兼容 HTTP 环境）
 *
 * 在 HTTPS 或 localhost 环境下使用现代的 Clipboard API，
 * 在 HTTP 环境下使用传统的 document.execCommand 方法
 */
export async function copyToClipboard(text: string): Promise<void> {
  // 优先使用现代 Clipboard API（HTTPS/localhost）
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      console.warn('Clipboard API failed, falling back to execCommand:', err);
    }
  }

  // Fallback: 使用 document.execCommand (HTTP 环境)
  return fallbackCopyToClipboard(text);
}

/**
 * 使用传统方法复制文本（兼容 HTTP 环境）
 */
function fallbackCopyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;

    // 样式设置：防止页面滚动和闪烁
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        resolve();
      } else {
        reject(new Error('execCommand("copy") failed'));
      }
    } catch (err) {
      document.body.removeChild(textArea);
      reject(err);
    }
  });
}

/**
 * 密钥加密/解密工具
 *
 * 使用混合方案：SHA-256 哈希 + AES-256-GCM 加密
 * - 哈希用于快速查询和验证
 * - 加密用于存储和保护原始密钥
 *
 * 存储格式：hash:iv:authTag:encryptedData
 *
 * 安全特性：
 * - SHA-256 哈希用于快速查询（单向，不可逆）
 * - AES-256-GCM 加密保护原始密钥（可逆，需要时解密使用）
 * - GCM 模式提供认证加密（AEAD）
 * - 每次加密生成随机 IV
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { logger } from "@/lib/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 推荐使用 12 字节 IV
const AUTH_TAG_LENGTH = 16; // GCM 认证标签长度

/**
 * 计算密钥的 SHA-256 哈希
 *
 * @param plaintext - 明文密钥
 * @returns 十六进制哈希字符串
 */
export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * 获取加密密钥
 *
 * 从环境变量 ENCRYPTION_KEY 获取，必须是 64 位十六进制字符串（32 字节 = 256 位）
 * 如果未设置，抛出错误
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;

  if (!envKey) {
    throw new Error(
      "ENCRYPTION_KEY 环境变量未设置。请使用以下命令生成密钥：\n" + "openssl rand -hex 32"
    );
  }

  // 验证密钥格式
  if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
    throw new Error(
      "ENCRYPTION_KEY 格式错误。必须是 64 位十六进制字符串（32 字节）。\n" +
        "使用以下命令生成：openssl rand -hex 32"
    );
  }

  return Buffer.from(envKey, "hex");
}

/**
 * 加密 API 密钥（带哈希）
 *
 * @param plaintext - 明文密钥（如：sk-abc123...）
 * @returns 加密后的字符串，格式：hash:iv:authTag:encryptedData
 *
 * @example
 * const encrypted = encryptKey("sk-abc123def456");
 * // 返回: "a1b2c3...:d4e5f6...:g7h8i9...:j0k1l2..."
 */
export function encryptKey(plaintext: string): string {
  try {
    const key = getEncryptionKey();

    // 计算哈希（用于快速查询）
    const hash = hashKey(plaintext);

    // 加密原始密钥（用于需要时解密）
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // 格式：hash:iv:authTag:encryptedData
    const result = `${hash}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;

    logger.debug("[Crypto] Key encrypted successfully");
    return result;
  } catch (error) {
    logger.error("[Crypto] Encryption failed:", error);
    throw new Error("密钥加密失败");
  }
}

/**
 * 解密 API 密钥
 *
 * @param ciphertext - 加密后的字符串（格式：hash:iv:authTag:encryptedData）
 * @returns 明文密钥
 *
 * @throws 如果格式错误或解密失败
 *
 * @example
 * const decrypted = decryptKey("a1b2c3...:d4e5f6...:g7h8i9...:j0k1l2...");
 * // 返回: "sk-abc123def456"
 */
export function decryptKey(ciphertext: string): string {
  try {
    const key = getEncryptionKey();

    // 解析加密数据
    const parts = ciphertext.split(":");
    if (parts.length !== 4) {
      throw new Error("加密数据格式错误");
    }

    const [hash, ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    logger.debug("[Crypto] Key decrypted successfully");
    return decrypted;
  } catch (error) {
    logger.error("[Crypto] Decryption failed:", error);
    throw new Error("密钥解密失败");
  }
}

/**
 * 从加密字符串中提取哈希
 *
 * @param ciphertext - 加密后的字符串
 * @returns SHA-256 哈希字符串
 */
export function extractHash(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new Error("加密数据格式错误");
  }
  return parts[0];
}

/**
 * 验证明文密钥是否匹配加密字符串
 *
 * @param plaintext - 明文密钥
 * @param ciphertext - 加密后的字符串
 * @returns true 表示匹配，false 表示不匹配
 */
export function verifyKey(plaintext: string, ciphertext: string): boolean {
  try {
    const hash = hashKey(plaintext);
    const storedHash = extractHash(ciphertext);

    // 先比较哈希（快速）
    if (hash !== storedHash) {
      return false;
    }

    // 哈希匹配后，解密验证（确保完整性）
    const decrypted = decryptKey(ciphertext);
    return plaintext === decrypted;
  } catch (error) {
    logger.error("[Crypto] Key verification failed:", error);
    return false;
  }
}

/**
 * 验证加密密钥是否正确配置
 *
 * 通过加密和解密一个测试字符串来验证
 *
 * @returns true 表示配置正确，false 表示配置错误
 */
export function validateEncryptionSetup(): boolean {
  try {
    const testString = "test-key-sk-" + randomBytes(8).toString("hex");
    const encrypted = encryptKey(testString);
    const decrypted = decryptKey(encrypted);

    if (testString === decrypted && verifyKey(testString, encrypted)) {
      logger.info("[Crypto] Encryption setup validated successfully");
      return true;
    }

    logger.error("[Crypto] Encryption validation failed: decrypted text doesn't match");
    return false;
  } catch (error) {
    logger.error("[Crypto] Encryption validation failed:", error);
    return false;
  }
}

/**
 * 生成新的加密密钥（用于初始化）
 *
 * @returns 64 位十六进制字符串
 *
 * @example
 * const newKey = generateEncryptionKey();
 * console.log("Add this to your .env file:");
 * console.log(`ENCRYPTION_KEY=${newKey}`);
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}

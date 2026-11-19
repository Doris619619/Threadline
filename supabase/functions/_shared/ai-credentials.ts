/** @fileoverview 定义账号 DeepSeek 凭据的加密合同与密钥选择，明文仅存在 Edge 请求内存。 */

export type EncryptedAiCredential = {
  provider: 'deepseek';
  encrypted_key: string;
  iv: string;
  version: 1;
};

export type AiCredentialStore = {
  read: (owner: string, signal: AbortSignal) => Promise<EncryptedAiCredential | null>;
  save: (
    owner: string,
    value: EncryptedAiCredential,
    signal: AbortSignal,
  ) => Promise<void>;
  delete: (owner: string, signal: AbortSignal) => Promise<void>;
};

/** 用公开安全的错误标识报告配置故障，不包含主密钥、用户密钥或底层加密异常。 */
export class AiCredentialsUnavailableError extends Error {
  constructor() {
    super('ai_credentials_unavailable');
  }
}

/** 将受限二进制数据编码为标准 base64，避免把密钥转为可持久化的明文 JSON。 */
function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** 只接受标准 base64；异常只返回统一配置错误。 */
function decode(value: string): Uint8Array<ArrayBuffer> {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error();
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new AiCredentialsUnavailableError();
  }
}

/** 主密钥必须是独立生成的 32 字节 base64，不能把普通口令当 AES 密钥。 */
function masterBytes(value?: string): Uint8Array<ArrayBuffer> {
  const bytes = decode(value?.trim() ?? '');
  if (bytes.byteLength !== 32) throw new AiCredentialsUnavailableError();
  return bytes;
}

/** 状态接口只披露能否保存，绝不披露加密主密钥内容或错误细节。 */
export function hasAiEncryptionKey(value?: string): boolean {
  try {
    masterBytes(value);
    return true;
  } catch {
    return false;
  }
}

/** AAD 同时绑定账号、供应商和加密版本，拷贝其他账号密文不能解密。 */
function additionalData(owner: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`threadline:ai-key:v1:deepseek:${owner}`);
}

/** 每次保存生成新的随机 IV；持久化返回值只含 AES-GCM 密文与非敏感版本信息。 */
export async function encryptAiKey(
  apiKey: string,
  owner: string,
  master: string,
): Promise<EncryptedAiCredential> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      masterBytes(master),
      'AES-GCM',
      false,
      ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(owner) },
      key,
      new TextEncoder().encode(apiKey),
    );
    return {
      provider: 'deepseek',
      encrypted_key: base64(new Uint8Array(encrypted)),
      iv: base64(iv),
      version: 1,
    };
  } catch {
    throw new AiCredentialsUnavailableError();
  }
}

/** 仅服务端解密当前账号凭据；版本、账号、主密钥或认证标签不匹配均安全失败。 */
export async function decryptAiKey(
  value: EncryptedAiCredential,
  owner: string,
  master: string,
): Promise<string> {
  try {
    if (value.provider !== 'deepseek' || value.version !== 1) throw new Error();
    const iv = decode(value.iv);
    if (iv.byteLength !== 12) throw new Error();
    const key = await crypto.subtle.importKey(
      'raw',
      masterBytes(master),
      'AES-GCM',
      false,
      ['decrypt'],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(owner) },
      key,
      decode(value.encrypted_key),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new AiCredentialsUnavailableError();
  }
}

/** 用户配置优先于全局配置；已有密文缺少主密钥或解密失败时不静默使用另一份额度，无账号记录才回退全局。 */
export async function resolveAiApiKey(
  owner: string,
  signal: AbortSignal,
  options: { store?: AiCredentialStore; encryptionKey?: string; serverApiKey?: string },
): Promise<string | undefined> {
  if (options.store) {
    let stored: EncryptedAiCredential | null;
    try {
      stored = await options.store.read(owner, signal);
    } catch {
      throw new AiCredentialsUnavailableError();
    }
    if (stored) {
      if (!hasAiEncryptionKey(options.encryptionKey))
        throw new AiCredentialsUnavailableError();
      return decryptAiKey(stored, owner, options.encryptionKey!);
    }
  }
  return options.serverApiKey?.trim() || undefined;
}

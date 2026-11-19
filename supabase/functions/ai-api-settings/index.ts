/** @fileoverview 在 Edge Runtime 中连接账号密钥设置、用户认证及受限服务端加密存储。 */

import { authenticateAiUser, createAiCredentialStore } from '../_shared/supabase.ts';
import { createAiSettingsHandler } from './handler.ts';

Deno.serve(
  createAiSettingsHandler({
    authenticate: authenticateAiUser,
    store: createAiCredentialStore(),
    encryptionKey: Deno.env.get('AI_CREDENTIALS_ENCRYPTION_KEY'),
    serverApiKey: Deno.env.get('DEEPSEEK_API_KEY'),
  }),
);

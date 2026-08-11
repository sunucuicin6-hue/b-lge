// threadUtils.ts — MessageService ve MediaMessageService'in ikisinin de
// kullandığı ortak "sohbet önizlemesini güncelle" mantığı. Böylece hem metin
// hem medya mesajları sohbet listesinde aynı şekilde görünür.

import { LocalStore } from '../data/localStore';

export async function touchThread(
  store: LocalStore,
  threadId: string,
  isGroup: boolean,
  preview: string,
  at: number,
  unreadDelta: number,
  fallbackTitle: string
): Promise<void> {
  const existing = (await store.listThreads()).find((t) => t.id === threadId);
  await store.upsertThread({
    id: threadId,
    kind: isGroup ? 'group' : 'direct',
    title: existing?.title ?? fallbackTitle,
    lastMessagePreview: preview,
    lastMessageAt: at,
    unreadCount: (existing?.unreadCount ?? 0) + unreadDelta,
  });
}

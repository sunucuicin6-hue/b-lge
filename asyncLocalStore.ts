// asyncLocalStore.ts — LocalStore arayüzünün AsyncStorage ile kalıcı implementasyonu.
// InMemoryLocalStore sadece test amaçlıydı (uygulama kapanınca veri silinirdi).
// Bu sınıf aynı sözleşmeyi (LocalStore) uygular ama verileri cihazda saklar,
// böylece kullanıcı uygulamayı kapatıp açtığında arkadaşları/sohbetleri kaybolmaz.
//
// Not: Basitlik için tüm koleksiyonlar tek bir JSON blob olarak saklanır ve
// her yazımda tamamı yeniden yazılır. Mesaj/kullanıcı sayısı çok büyümeden
// (binlerce mesaj) önce gerçek bir SQLite/WatermelonDB implementasyonuna
// geçilmesi önerilir — ama küçük/orta ölçek için bu yeterlidir.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalStore } from './localStore';
import { UserProfile, FriendRequest, Friendship, Group, ChatMessage, ChatThread } from './models';

const KEYS = {
  profiles: 'whatsmesh:profiles',
  friendRequests: 'whatsmesh:friendRequests',
  friendships: 'whatsmesh:friendships',
  groups: 'whatsmesh:groups',
  messages: 'whatsmesh:messages',
  threads: 'whatsmesh:threads',
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export class AsyncLocalStore implements LocalStore {
  async saveProfile(user: UserProfile) {
    const all = await readJson<Record<string, UserProfile>>(KEYS.profiles, {});
    all[user.id] = user;
    await writeJson(KEYS.profiles, all);
  }

  async getProfile(userId: string) {
    const all = await readJson<Record<string, UserProfile>>(KEYS.profiles, {});
    return all[userId] ?? null;
  }

  async getProfileByUsername(username: string) {
    const clean = username.replace(/^@/, '');
    const all = await readJson<Record<string, UserProfile>>(KEYS.profiles, {});
    return Object.values(all).find((u) => u.username === clean) ?? null;
  }

  async cacheKnownUser(user: UserProfile) {
    await this.saveProfile(user);
  }

  async saveFriendRequest(req: FriendRequest) {
    const all = await readJson<Record<string, FriendRequest>>(KEYS.friendRequests, {});
    all[req.id] = req;
    await writeJson(KEYS.friendRequests, all);
  }

  async updateFriendRequestStatus(id: string, status: FriendRequest['status']) {
    const all = await readJson<Record<string, FriendRequest>>(KEYS.friendRequests, {});
    if (all[id]) {
      all[id].status = status;
      await writeJson(KEYS.friendRequests, all);
    }
  }

  async listIncomingFriendRequests(userId: string) {
    const all = await readJson<Record<string, FriendRequest>>(KEYS.friendRequests, {});
    return Object.values(all).filter((r) => r.toUserId === userId && r.status === 'pending');
  }

  async saveFriendship(f: Friendship) {
    const all = await readJson<Friendship[]>(KEYS.friendships, []);
    all.push(f);
    await writeJson(KEYS.friendships, all);
  }

  async listFriends(userId: string) {
    const friendships = await readJson<Friendship[]>(KEYS.friendships, []);
    const profiles = await readJson<Record<string, UserProfile>>(KEYS.profiles, {});
    return friendships
      .filter((f) => f.userId === userId)
      .map((f) => profiles[f.friendId])
      .filter(Boolean) as UserProfile[];
  }

  async isFriend(userId: string, otherUserId: string) {
    const friendships = await readJson<Friendship[]>(KEYS.friendships, []);
    return friendships.some((f) => f.userId === userId && f.friendId === otherUserId);
  }

  async saveGroup(g: Group) {
    const all = await readJson<Record<string, Group>>(KEYS.groups, {});
    all[g.id] = g;
    await writeJson(KEYS.groups, all);
  }

  async getGroup(groupId: string) {
    const all = await readJson<Record<string, Group>>(KEYS.groups, {});
    return all[groupId] ?? null;
  }

  async listUserGroups(userId: string) {
    const all = await readJson<Record<string, Group>>(KEYS.groups, {});
    return Object.values(all).filter((g) => g.members.some((m) => m.userId === userId));
  }

  async isGroupMember(groupId: string, userId: string) {
    const g = await this.getGroup(groupId);
    return !!g && g.members.some((m) => m.userId === userId);
  }

  async saveMessage(msg: ChatMessage) {
    const all = await readJson<ChatMessage[]>(KEYS.messages, []);
    all.push(msg);
    await writeJson(KEYS.messages, all);
  }

  async updateMessageProgress(messageId: string, percent: number) {
    const all = await readJson<ChatMessage[]>(KEYS.messages, []);
    const msg = all.find((m) => m.id === messageId);
    if (msg) {
      msg.transferProgressPercent = percent;
      await writeJson(KEYS.messages, all);
    }
  }

  async updateMessageDeliveryState(messageId: string, state: ChatMessage['deliveryState']) {
    const all = await readJson<ChatMessage[]>(KEYS.messages, []);
    const msg = all.find((m) => m.id === messageId);
    if (msg) {
      msg.deliveryState = state;
      await writeJson(KEYS.messages, all);
    }
  }

  async listMessages(threadId: string, limit = 50) {
    const all = await readJson<ChatMessage[]>(KEYS.messages, []);
    return all.filter((m) => m.threadId === threadId).slice(-limit);
  }

  async upsertThread(thread: ChatThread) {
    const all = await readJson<Record<string, ChatThread>>(KEYS.threads, {});
    all[thread.id] = thread;
    await writeJson(KEYS.threads, all);
  }

  async listThreads() {
    const all = await readJson<Record<string, ChatThread>>(KEYS.threads, {});
    return Object.values(all).sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  }
}

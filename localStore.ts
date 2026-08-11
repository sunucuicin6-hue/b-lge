// localStore.ts — Cihaz içi kalıcı depolama arayüzü.
// Gerçek projede WatermelonDB veya react-native-sqlite-storage ile implemente edilir;
// burada servislerin (FriendService/GroupService) bağımlı olduğu SÖZLEŞME (interface)
// ve basit bir in-memory referans implementasyonu verilmiştir (test/geliştirme amaçlı).

import { UserProfile, FriendRequest, Friendship, Group, ChatMessage, ChatThread } from './models';

export interface LocalStore {
  // Kullanıcı
  saveProfile(user: UserProfile): Promise<void>;
  getProfile(userId: string): Promise<UserProfile | null>;
  getProfileByUsername(username: string): Promise<UserProfile | null>;
  cacheKnownUser(user: UserProfile): Promise<void>; // BT keşifle görülen kullanıcıları önbelleğe alır

  // Arkadaşlık
  saveFriendRequest(req: FriendRequest): Promise<void>;
  updateFriendRequestStatus(id: string, status: FriendRequest['status']): Promise<void>;
  listIncomingFriendRequests(userId: string): Promise<FriendRequest[]>;
  saveFriendship(f: Friendship): Promise<void>;
  listFriends(userId: string): Promise<UserProfile[]>;
  isFriend(userId: string, otherUserId: string): Promise<boolean>;

  // Grup
  saveGroup(g: Group): Promise<void>;
  getGroup(groupId: string): Promise<Group | null>;
  listUserGroups(userId: string): Promise<Group[]>;
  isGroupMember(groupId: string, userId: string): Promise<boolean>;

  // Mesajlar / sohbetler
  saveMessage(msg: ChatMessage): Promise<void>;
  updateMessageProgress(messageId: string, percent: number): Promise<void>;
  updateMessageDeliveryState(messageId: string, state: ChatMessage['deliveryState']): Promise<void>;
  listMessages(threadId: string, limit?: number): Promise<ChatMessage[]>;
  upsertThread(thread: ChatThread): Promise<void>;
  listThreads(): Promise<ChatThread[]>;
}

/** Geliştirme/test amaçlı basit in-memory implementasyon. */
export class InMemoryLocalStore implements LocalStore {
  private profiles = new Map<string, UserProfile>();
  private friendRequests = new Map<string, FriendRequest>();
  private friendships: Friendship[] = [];
  private groups = new Map<string, Group>();
  private messages: ChatMessage[] = [];
  private threads = new Map<string, ChatThread>();

  async saveProfile(user: UserProfile) { this.profiles.set(user.id, user); }
  async getProfile(userId: string) { return this.profiles.get(userId) ?? null; }
  async getProfileByUsername(username: string) {
    const clean = username.replace(/^@/, '');
    return [...this.profiles.values()].find((u) => u.username === clean) ?? null;
  }
  async cacheKnownUser(user: UserProfile) { this.profiles.set(user.id, user); }

  async saveFriendRequest(req: FriendRequest) { this.friendRequests.set(req.id, req); }
  async updateFriendRequestStatus(id: string, status: FriendRequest['status']) {
    const req = this.friendRequests.get(id);
    if (req) req.status = status;
  }
  async listIncomingFriendRequests(userId: string) {
    return [...this.friendRequests.values()].filter((r) => r.toUserId === userId && r.status === 'pending');
  }
  async saveFriendship(f: Friendship) { this.friendships.push(f); }
  async listFriends(userId: string) {
    const ids = this.friendships.filter((f) => f.userId === userId).map((f) => f.friendId);
    return ids.map((id) => this.profiles.get(id)).filter(Boolean) as UserProfile[];
  }
  async isFriend(userId: string, otherUserId: string) {
    return this.friendships.some((f) => f.userId === userId && f.friendId === otherUserId);
  }

  async saveGroup(g: Group) { this.groups.set(g.id, g); }
  async getGroup(groupId: string) { return this.groups.get(groupId) ?? null; }
  async listUserGroups(userId: string) {
    return [...this.groups.values()].filter((g) => g.members.some((m) => m.userId === userId));
  }
  async isGroupMember(groupId: string, userId: string) {
    const g = this.groups.get(groupId);
    return !!g && g.members.some((m) => m.userId === userId);
  }

  async saveMessage(msg: ChatMessage) { this.messages.push(msg); }
  async updateMessageProgress(messageId: string, percent: number) {
    const msg = this.messages.find((m) => m.id === messageId);
    if (msg) msg.transferProgressPercent = percent;
  }
  async updateMessageDeliveryState(messageId: string, state: ChatMessage['deliveryState']) {
    const msg = this.messages.find((m) => m.id === messageId);
    if (msg) msg.deliveryState = state;
  }
  async listMessages(threadId: string, limit = 50) {
    return this.messages.filter((m) => m.threadId === threadId).slice(-limit);
  }
  async upsertThread(thread: ChatThread) { this.threads.set(thread.id, thread); }
  async listThreads() { return [...this.threads.values()]; }
}

// models.ts — Kullanıcı, arkadaşlık, grup ve mesaj için cihaz içi veri modelleri.
// Gerçek projede bu tipler WatermelonDB/Realm/SQLite şemasına bire bir eşlenir.

export interface UserProfile {
  id: string;            // UUID
  username: string;      // "@kullanici_adi" (@ olmadan saklanır)
  displayName?: string;
  avatarUrl?: string;
  publicKey: string;     // E2E şifreleme anahtarı
  lastSeen?: number;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';
export type FriendRequestOrigin = 'internet' | 'bluetooth';

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  origin: FriendRequestOrigin;
  createdAt: number;
}

export interface Friendship {
  userId: string;
  friendId: string;
  createdAt: number;
}

export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupMember {
  userId: string;
  role: GroupRole;
  joinedAt: number;
}

export interface Group {
  id: string;            // Group_ID (UUID)
  name: string;
  avatarUrl?: string;
  ownerId: string;
  members: GroupMember[];
  createdAt: number;
}

export type ChatKind = 'direct' | 'group';

export interface ChatThread {
  id: string;             // direct: karşı tarafın userId'si; group: groupId
  kind: ChatKind;
  title: string;
  lastMessagePreview?: string;
  lastMessageAt?: number;
  unreadCount: number;
}

export type MessageDeliveryState = 'sending' | 'sent' | 'delivered' | 'failed';
export type MessageContentType = 'text' | 'image' | 'audio' | 'sticker';

export interface ChatMessage {
  id: string;             // messageId (packet.messageId ile aynı)
  threadId: string;       // direct: karşı tarafın userId'si; group: groupId
  senderId: string;
  contentType: MessageContentType;
  text?: string;
  mediaLocalPath?: string;      // birleştirme tamamlandıktan sonra cihazdaki dosya yolu
  stickerId?: string;           // ':sticker_101:' gibi
  sentVia: 'internet' | 'bluetooth';
  deliveryState: MessageDeliveryState;
  transferProgressPercent?: number; // medya mesajları için ilerleme çubuğu
  createdAt: number;
}

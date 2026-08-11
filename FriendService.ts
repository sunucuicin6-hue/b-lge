// FriendService.ts — "@kullanici_adi ile arkadaş ekleme" iş mantığı.
// - İnternet varken: Render sunucusunun REST API'si üzerinden kullanıcı adına göre arama +
//   arkadaşlık isteği (bkz. backend/src/server.js -> POST /api/friend-requests).
// - İnternet yokken: Bluetooth mesh keşif (DISCOVERY) sırasında görülen yakındaki
//   kullanıcıya doğrudan FRIEND_REQUEST paketi (ttl=1, sadece 1 sıçrama; zira arkadaşlık
//   isteği yakın-menzil bir etkileşimdir) gönderilir.

import { NetworkRouter } from '../network/NetworkRouter';
import { LocalStore } from '../data/localStore';
import { FriendRequest, UserProfile } from '../data/models';
import { PacketType, createBaseEnvelope, MeshPacket } from '../types/packet';

const RELAY_API_BASE = process.env.RELAY_API_BASE || 'https://b-lge-1.onrender.com';

export class FriendService {
  constructor(
    private currentUser: UserProfile,
    private router: NetworkRouter,
    private store: LocalStore
  ) {
    // Gelen arkadaşlık isteği/onay paketlerini dinle (hem internet hem BT'den gelebilir)
    this.router.onPacket((packet) => this.handleIncomingPacket(packet));
  }

  /** İnternet varken kullanıcı adına göre arama (Render REST API). */
  async searchUsersOnline(query: string): Promise<UserProfile[]> {
    const res = await fetch(`${RELAY_API_BASE}/api/users/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((r: any) => ({
      id: r.id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url, publicKey: '',
    }));
  }

  /** İnternet varken kullanıcı adıyla arkadaşlık isteği gönderir. */
  async sendFriendRequestOnline(toUsername: string): Promise<void> {
    await fetch(`${RELAY_API_BASE}/api/friend-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId: this.currentUser.id, toUsername, origin: 'internet' }),
    });
  }

  /**
   * Bluetooth mesh keşfinde görülen bir cihaza doğrudan arkadaşlık isteği gönderir.
   * ttl=1 verilir: bu bir "yakındaki kullanıcı" etkileşimidir, ağda uzağa sıçramamalı.
   */
  async sendFriendRequestNearby(toUser: UserProfile): Promise<void> {
    const base = createBaseEnvelope({
      packetType: PacketType.FRIEND_REQUEST,
      senderId: this.currentUser.id,
      receiverId: toUser.id,
      ttl: 1,
    });
    const packet: MeshPacket = {
      ...base,
      chunkIndex: 0,
      totalChunks: 1,
      payload: JSON.stringify({ username: this.currentUser.username, publicKey: this.currentUser.publicKey }),
    };

    await this.store.cacheKnownUser(toUser);
    await this.store.saveFriendRequest({
      id: packet.messageId, fromUserId: this.currentUser.id, toUserId: toUser.id,
      status: 'pending', origin: 'bluetooth', createdAt: packet.timestamp,
    });

    await this.router.sendPacket(packet);
  }

  /** Gelen bir isteği onaylar; kanal fark etmeksizin (online/offline) aynı akış çalışır. */
  async acceptFriendRequest(request: FriendRequest): Promise<void> {
    await this.store.updateFriendRequestStatus(request.id, 'accepted');
    await this.store.saveFriendship({ userId: this.currentUser.id, friendId: request.fromUserId, createdAt: Date.now() });
    await this.store.saveFriendship({ userId: request.fromUserId, friendId: this.currentUser.id, createdAt: Date.now() });

    if (request.origin === 'internet') {
      await fetch(`${RELAY_API_BASE}/api/friend-requests/${request.id}/accept`, { method: 'POST' });
    } else {
      const base = createBaseEnvelope({
        packetType: PacketType.FRIEND_ACCEPT,
        senderId: this.currentUser.id,
        receiverId: request.fromUserId,
        ttl: 1,
      });
      await this.router.sendPacket({
        ...base, chunkIndex: 0, totalChunks: 1,
        payload: JSON.stringify({ requestId: request.id }),
      });
    }
  }

  async rejectFriendRequest(requestId: string): Promise<void> {
    await this.store.updateFriendRequestStatus(requestId, 'rejected');
  }

  async listFriends(): Promise<UserProfile[]> {
    return this.store.listFriends(this.currentUser.id);
  }

  // ---------------- gelen paket işleyicisi ----------------

  private async handleIncomingPacket(packet: MeshPacket) {
    if (packet.receiverId !== this.currentUser.id) return;

    if (packet.packetType === PacketType.FRIEND_REQUEST) {
      const data = JSON.parse(packet.payload) as { username: string; publicKey: string };
      const fromProfile: UserProfile = {
        id: packet.senderId, username: data.username, publicKey: data.publicKey,
      };
      await this.store.cacheKnownUser(fromProfile);
      await this.store.saveFriendRequest({
        id: packet.messageId, fromUserId: packet.senderId, toUserId: this.currentUser.id,
        status: 'pending', origin: 'bluetooth', createdAt: packet.timestamp,
      });
    }

    if (packet.packetType === PacketType.FRIEND_ACCEPT) {
      await this.store.saveFriendship({ userId: this.currentUser.id, friendId: packet.senderId, createdAt: Date.now() });
      await this.store.saveFriendship({ userId: packet.senderId, friendId: this.currentUser.id, createdAt: Date.now() });
    }
  }
}

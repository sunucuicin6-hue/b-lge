// GroupService.ts — Grup oluşturma, üye yönetimi ve grup mesajlarının hem
// İnternet (Render relay -> tüm üyelere fan-out sunucuda yapılır) hem de
// Bluetooth Mesh (TTL flood otomatik olarak grup üyelerine ulaşır) üzerinden gönderimi.
//
// Önemli tasarım kararı: Grup mesajı gönderirken istemci TEK BİR paket üretir
// (`receiverId = groupId`, `isGroup = true`). Kimin bu paketi kimlere dağıtacağına
// taşıyıcı karar verir:
//   - İnternet: Render sunucusu `getGroupMemberIds(groupId)` ile fan-out yapar.
//   - Bluetooth: TTL flood zaten paketi ağdaki tüm cihazlara yayar; her cihaz
//     `isGroupMember(groupId)` kontrolüyle kendine ait olup olmadığına bakar.
// Böylece istemci N adet ayrı paket göndermek zorunda kalmaz.

import { NetworkRouter } from '../network/NetworkRouter';
import { LocalStore } from '../data/localStore';
import { Group, GroupMember, UserProfile } from '../data/models';
import { PacketType, createBaseEnvelope, MeshPacket, DEFAULT_MESH_TTL } from '../types/packet';

const RELAY_API_BASE = process.env.RELAY_API_BASE || 'https://b-lge-1.onrender.com';

export class GroupService {
  constructor(
    private currentUser: UserProfile,
    private router: NetworkRouter,
    private store: LocalStore
  ) {
    this.router.onPacket((packet) => this.handleIncomingPacket(packet));
  }

  /** Arkadaş listesinden seçilen kişilerle yeni bir grup kurar. */
  async createGroup(name: string, memberIds: string[]): Promise<Group> {
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const members: GroupMember[] = [
      { userId: this.currentUser.id, role: 'owner', joinedAt: Date.now() },
      ...memberIds.map((id) => ({ userId: id, role: 'member' as const, joinedAt: Date.now() })),
    ];
    const group: Group = { id: groupId, name, ownerId: this.currentUser.id, members, createdAt: Date.now() };
    await this.store.saveGroup(group);

    if (this.router.getMode() === 'internet') {
      // İnternet varsa yetkili kayıt sunucuda (Render/DB) tutulur.
      const res = await fetch(`${RELAY_API_BASE}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ownerId: this.currentUser.id, memberIds }),
      });
      const serverGroup = await res.json();
      group.id = serverGroup.id; // sunucunun ürettiği kalıcı Group_ID kullanılır
      await this.store.saveGroup(group);
    } else {
      // Offline: grup daveti Bluetooth mesh üzerinden üyelere GROUP_INVITE olarak yayılır.
      const base = createBaseEnvelope({
        packetType: PacketType.GROUP_INVITE,
        senderId: this.currentUser.id,
        receiverId: groupId,
        isGroup: true,
        ttl: DEFAULT_MESH_TTL,
      });
      const packet: MeshPacket = {
        ...base, chunkIndex: 0, totalChunks: 1,
        payload: JSON.stringify({ groupId, name, memberIds: members.map((m) => m.userId) }),
      };
      await this.router.sendPacket(packet);
    }

    return group;
  }

  async addMember(groupId: string, userId: string): Promise<void> {
    const group = await this.store.getGroup(groupId);
    if (!group) throw new Error('Grup bulunamadı');
    group.members.push({ userId, role: 'member', joinedAt: Date.now() });
    await this.store.saveGroup(group);
  }

  async listMyGroups(): Promise<Group[]> {
    return this.store.listUserGroups(this.currentUser.id);
  }

  /**
   * Bir metin mesajını gruba gönderir. Fan-out mantığı router/taşıyıcı seviyesinde
   * otomatik gerçekleşir (yukarıdaki dosya başı açıklamasına bakınız).
   */
  async sendGroupText(groupId: string, text: string): Promise<MeshPacket> {
    const base = createBaseEnvelope({
      packetType: PacketType.TEXT,
      senderId: this.currentUser.id,
      receiverId: groupId,
      isGroup: true,
    });
    const packet: MeshPacket = { ...base, chunkIndex: 0, totalChunks: 1, payload: text };
    await this.router.sendPacket(packet);
    return packet;
  }

  isMember(groupId: string, userId: string): Promise<boolean> {
    return this.store.isGroupMember(groupId, userId);
  }

  private async handleIncomingPacket(packet: MeshPacket) {
    if (packet.packetType === PacketType.GROUP_INVITE) {
      const data = JSON.parse(packet.payload) as { groupId: string; name: string; memberIds: string[] };
      if (!data.memberIds.includes(this.currentUser.id)) return;

      const existing = await this.store.getGroup(data.groupId);
      if (existing) return;

      const group: Group = {
        id: data.groupId,
        name: data.name,
        ownerId: packet.senderId,
        members: data.memberIds.map((id) => ({
          userId: id, role: id === packet.senderId ? 'owner' : 'member', joinedAt: Date.now(),
        })),
        createdAt: packet.timestamp,
      };
      await this.store.saveGroup(group);
    }
  }
}

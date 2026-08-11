// MessageService.ts — Düz metin mesajlarının gönderilmesi/alınması ve sohbet
// listesinin (ChatThread) güncel tutulması.
//
// NOT: Diğer servisler (FriendService, GroupService, StickerService,
// MediaMessageService) hep daha "özel" paket tiplerini (FRIEND_REQUEST,
// GROUP_INVITE, STICKER, MEDIA_CHUNK) ele alıyordu; sıradan yazı mesajı
// (PacketType.TEXT) için ayrı bir servis yoktu. UI ekranlarının ihtiyaç
// duyduğu "sohbet gönder / sohbet dinle" akışı burada toplanıyor.

import { NetworkRouter } from '../network/NetworkRouter';
import { LocalStore } from '../data/localStore';
import { ChatMessage, UserProfile } from '../data/models';
import { PacketType, createBaseEnvelope, MeshPacket } from '../types/packet';
import { touchThread } from './threadUtils';

type MessageHandler = (message: ChatMessage) => void;

export class MessageService {
  private handlers: MessageHandler[] = [];

  constructor(
    private currentUser: UserProfile,
    private router: NetworkRouter,
    private store: LocalStore
  ) {
    this.router.onPacket((packet) => this.handleIncomingPacket(packet));
  }

  /** Bir direkt sohbete (kullanıcı) veya gruba düz metin mesajı gönderir. */
  async sendText(receiverId: string, text: string, isGroup = false): Promise<ChatMessage> {
    const base = createBaseEnvelope({
      packetType: PacketType.TEXT,
      senderId: this.currentUser.id,
      receiverId,
      isGroup,
    });
    const packet: MeshPacket = { ...base, chunkIndex: 0, totalChunks: 1, payload: text };

    const localMessage: ChatMessage = {
      id: packet.messageId,
      threadId: receiverId,
      senderId: this.currentUser.id,
      contentType: 'text',
      text,
      sentVia: 'internet',
      deliveryState: 'sending',
      createdAt: packet.timestamp,
    };
    await this.store.saveMessage(localMessage);
    await this.touchThread(receiverId, isGroup, text, packet.timestamp, 0);

    const result = await this.router.sendPacket(packet);
    const newState = result.sent ? 'sent' : 'failed';
    await this.store.updateMessageDeliveryState(packet.messageId, newState);
    localMessage.deliveryState = newState;
    localMessage.sentVia = result.via === 'bluetooth' ? 'bluetooth' : 'internet';

    return localMessage;
  }

  /** UI'ın bir sohbetin geçmişini çekmesi için. */
  async listMessages(threadId: string, limit = 50): Promise<ChatMessage[]> {
    return this.store.listMessages(threadId, limit);
  }

  async listThreads() {
    return this.store.listThreads();
  }

  /** UI'ın yeni mesaj geldiğinde canlı olarak güncellenmesi için. */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  // ---------------- gelen paket işleyicisi ----------------

  private async handleIncomingPacket(packet: MeshPacket) {
    if (packet.packetType !== PacketType.TEXT && packet.packetType !== PacketType.STICKER) return;
    if (packet.receiverId !== this.currentUser.id && !packet.isGroup) return;

    const threadId = packet.isGroup ? packet.receiverId : packet.senderId;

    const message: ChatMessage = {
      id: packet.messageId,
      threadId,
      senderId: packet.senderId,
      contentType: packet.packetType === PacketType.STICKER ? 'sticker' : 'text',
      text: packet.packetType === PacketType.TEXT ? packet.payload : undefined,
      stickerId: packet.packetType === PacketType.STICKER ? packet.payload : undefined,
      sentVia: 'internet',
      deliveryState: 'delivered',
      createdAt: packet.timestamp,
    };

    await this.store.saveMessage(message);
    await this.touchThread(threadId, packet.isGroup, message.text ?? '🖼️ Sticker', packet.timestamp, 1);

    for (const handler of this.handlers) handler(message);
  }

  private async touchThread(threadId: string, isGroup: boolean, preview: string, at: number, unreadDelta: number) {
    const profile = isGroup ? null : await this.store.getProfile(threadId);
    const fallbackTitle = profile?.displayName ?? profile?.username ?? threadId;
    await touchThread(this.store, threadId, isGroup, preview, at, unreadDelta, fallbackTitle);
  }
}

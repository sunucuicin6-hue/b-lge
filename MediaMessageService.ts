// MediaMessageService.ts — Fotoğraf/ses mesajlarının uçtan uca akışını (gönderim + alım +
// ilerleme çubuğu + yeniden birleştirme) `NetworkRouter` ve `ChunkManager` üzerinden yönetir.
// Kanal İnternet ya da Bluetooth Mesh olsun, akış tamamen aynıdır — çünkü her ikisi de
// MeshPacket şemasını konuşur. İnternette chunk'lama teknik olarak zorunlu değildir
// (Render sunucusu büyük payload'ı tek seferde kabul edebilir) ancak KOD YOLU BİRLEŞTİRİLEREK
// tutarlılık ve tek bir "progress" deneyimi sağlanır.

import { NetworkRouter } from '../network/NetworkRouter';
import { LocalStore } from '../data/localStore';
import { ChunkReassembler, splitFileIntoChunks, MediaMeta } from '../media/ChunkManager';
import { MeshPacket, PacketType } from '../types/packet';
import { ChatMessage } from '../data/models';
import { touchThread } from './threadUtils';

type MessageHandler = (message: ChatMessage) => void;

export class MediaMessageService {
  private reassembler: ChunkReassembler;
  private handlers: MessageHandler[] = [];

  constructor(
    private currentUserId: string,
    private router: NetworkRouter,
    private store: LocalStore,
    // Birleşen baytları diske yazıp yerel dosya yolunu (örn. file:///.../abc.jpg) döndürür.
    // Gerçek implementasyon react-native-fs (RNFS) ile yapılır — bkz. AppContext.tsx.
    private onFileReady: (messageId: string, fileBytes: Uint8Array, meta?: MediaMeta) => Promise<string>
  ) {
    this.reassembler = new ChunkReassembler(
      (progress) => {
        void this.store.updateMessageProgress(progress.messageId, progress.percent);
      },
      (result) => {
        void this.handleIncomingComplete(result);
      }
    );

    this.router.onPacket((packet) => {
      if (packet.packetType === PacketType.MEDIA_CHUNK) {
        this.reassembler.ingest(packet);
      }
    });
  }

  /**
   * Bir fotoğraf/ses dosyasını (orijinal kalitede) hedefe gönderir.
   * BLE limiti nedeniyle chunk'lanır; İnternet modunda da AYNI chunk seti gönderilerek
   * kod yolu ve progress bar deneyimi birleştirilir.
   */
  async sendMedia(params: {
    fileBytes: Uint8Array;
    receiverId: string;
    isGroup: boolean;
    meta: MediaMeta;
    localPreviewPath?: string; // gönderen tarafta anında önizleme için (örn. seçilen dosyanın kendi yolu)
  }): Promise<string> {
    const chunks = splitFileIntoChunks({
      fileBytes: params.fileBytes,
      senderId: this.currentUserId,
      receiverId: params.receiverId,
      isGroup: params.isGroup,
      meta: params.meta,
    });

    const messageId = chunks[0].messageId;
    const chatMessage: ChatMessage = {
      id: messageId,
      threadId: params.receiverId,
      senderId: this.currentUserId,
      contentType: params.meta.mimeType.startsWith('audio') ? 'audio' : 'image',
      mediaLocalPath: params.localPreviewPath,
      sentVia: this.router.getMode() === 'bluetooth' ? 'bluetooth' : 'internet',
      deliveryState: 'sending',
      transferProgressPercent: 0,
      createdAt: Date.now(),
    };
    await this.store.saveMessage(chatMessage);
    await touchThread(
      this.store,
      params.receiverId,
      params.isGroup,
      chatMessage.contentType === 'audio' ? '🎵 Ses mesajı' : '📷 Fotoğraf',
      chatMessage.createdAt,
      0,
      params.receiverId
    );
    this.notify(chatMessage);

    // Chunk'lar sırayla gönderilir (görev tanımındaki "Sıralı Gönderim" gereksinimi).
    // Router her chunk için uygun kanalı seçer; kanal chunk'lar arasında değişirse bile
    // messageId/chunkIndex sabit kaldığından alıcı taraf sorunsuz birleştirir.
    let allSent = true;
    for (const chunk of chunks) {
      const { sent } = await this.router.sendPacket(chunk);
      if (!sent) allSent = false;
      const percent = Math.round(((chunk.chunkIndex + 1) / chunk.totalChunks) * 100);
      await this.store.updateMessageProgress(messageId, percent);
    }

    const finalState = allSent ? 'sent' : 'failed';
    await this.store.updateMessageDeliveryState(messageId, finalState);
    chatMessage.deliveryState = finalState;
    this.notify(chatMessage);

    return messageId;
  }

  /** UI'ın ilerleme çubuğunu anlık okumak için kullanabileceği yardımcı. */
  getIncomingProgress(messageId: string) {
    return this.reassembler.getProgress(messageId);
  }

  /** UI'ın yeni/güncellenen medya mesajlarında canlı olarak yenilenmesi için. */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  private notify(message: ChatMessage) {
    for (const handler of this.handlers) handler(message);
  }

  // ---------------- alıcı taraf: chunk'lar tamamlanınca çalışır ----------------

  private async handleIncomingComplete(result: {
    messageId: string;
    fileBytes: Uint8Array;
    meta?: MediaMeta;
    senderId: string;
    receiverId: string;
    isGroup: boolean;
  }) {
    const localPath = await this.onFileReady(result.messageId, result.fileBytes, result.meta);
    const threadId = result.isGroup ? result.receiverId : result.senderId;
    const contentType = result.meta?.mimeType.startsWith('audio') ? 'audio' : 'image';

    const message: ChatMessage = {
      id: result.messageId,
      threadId,
      senderId: result.senderId,
      contentType,
      mediaLocalPath: localPath,
      sentVia: 'internet',
      deliveryState: 'delivered',
      transferProgressPercent: 100,
      createdAt: Date.now(),
    };
    await this.store.saveMessage(message);
    await touchThread(
      this.store,
      threadId,
      result.isGroup,
      contentType === 'audio' ? '🎵 Ses mesajı' : '📷 Fotoğraf',
      message.createdAt,
      1,
      threadId
    );
    this.notify(message);
  }
}

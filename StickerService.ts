// StickerService.ts — "Sticker ID Mantığı" gereksinimi.
// Bluetooth mesh üzerinde bant genişliği kısıtlıdır; bu yüzden çıkartmalar dosya
// olarak GÖNDERİLMEZ. Her sticker, uygulama kurulumunda cihaza önceden yüklenmiş
// (bundled asset) bir kütüphanenin parçasıdır. Ağdan sadece ":sticker_101:" gibi
// kısa bir metin ID'si geçer; alıcı cihaz bu ID'yi kendi yerel kütüphanesinden çözer.

import { NetworkRouter } from '../network/NetworkRouter';
import { PacketType, createBaseEnvelope, MeshPacket } from '../types/packet';

// Cihazda önceden yüklü sticker kütüphanesi (uygulama paketine gömülü asset'ler).
export const STICKER_LIBRARY: Record<string, { assetPath: string; label: string }> = {
  ':sticker_101:': { assetPath: 'assets/stickers/sticker_101.webp', label: 'Gülen yüz' },
  ':sticker_102:': { assetPath: 'assets/stickers/sticker_102.webp', label: 'Baş parmak' },
  ':sticker_103:': { assetPath: 'assets/stickers/sticker_103.webp', label: 'Kalp' },
  // ... kütüphaneye yeni sticker eklemek sadece bu tabloya ve asset klasörüne ekleme gerektirir.
};

export class StickerService {
  constructor(private currentUserId: string, private router: NetworkRouter) {}

  /** ID'nin cihazda kayıtlı geçerli bir sticker olup olmadığını doğrular. */
  isKnownSticker(stickerId: string): boolean {
    return stickerId in STICKER_LIBRARY;
  }

  resolveAssetPath(stickerId: string): string | null {
    return STICKER_LIBRARY[stickerId]?.assetPath ?? null;
  }

  /** Sadece ID'yi taşıyan minimal bir paket gönderir (hiçbir görsel bayt aktarılmaz). */
  async sendSticker(receiverId: string, stickerId: string, isGroup = false): Promise<MeshPacket> {
    if (!this.isKnownSticker(stickerId)) {
      throw new Error(`Bilinmeyen sticker ID: ${stickerId}`);
    }
    const base = createBaseEnvelope({
      packetType: PacketType.STICKER,
      senderId: this.currentUserId,
      receiverId,
      isGroup,
    });
    const packet: MeshPacket = { ...base, chunkIndex: 0, totalChunks: 1, payload: stickerId };
    await this.router.sendPacket(packet);
    return packet;
  }
}

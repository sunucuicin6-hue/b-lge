// CompositeMeshTransport.ts — Gerçek Bluetooth Mesh (RealBleBridge) VE Wi-Fi/Hotspot
// yerel ağ (LocalNetworkTransport) kanallarını TEK bir "offline mesh" taşıyıcısı olarak
// NetworkRouter'a sunar. Böylece:
//   - İkisi de kullanılabilirse: gönderim BLE ile denenir, başarısız olursa Wi-Fi ile.
//   - Sadece biri kullanılabilirse: sadece o kullanılır.
//   - Hiçbiri yoksa: router otomatik olarak "offline"a düşer (mevcut davranış).
//
// NetworkRouter ve GatewayBridge zaten sadece ITransport arayüzünün üyelerini
// kullandığından (BluetoothMeshTransport somut sınıfına özel bir şey çağırmıyorlar),
// bu sınıf onların yerine sorunsuzca geçebilir.

import { ITransport, PacketHandler, ConnectivityHandler } from './ITransport';
import { MeshPacket, packetSeenKey } from '../types/packet';

export class CompositeMeshTransport implements ITransport {
  readonly kind: 'bluetooth' = 'bluetooth';

  private packetHandlers: PacketHandler[] = [];
  private availabilityHandlers: ConnectivityHandler[] = [];
  private seenCache = new Map<string, number>();
  private seenTtlMs = 5 * 60 * 1000;

  constructor(private channels: ITransport[]) {}

  async start(): Promise<void> {
    for (const channel of this.channels) {
      channel.onPacket((packet) => this.handleIncoming(packet));
      channel.onAvailabilityChange(() => this.recomputeAvailability());
    }
    // Bir kanal çökerse diğerini engellemesin diye ayrı ayrı başlatılır.
    await Promise.allSettled(this.channels.map((c) => c.start()));
    this.recomputeAvailability();
    setInterval(() => this.cleanupSeenCache(), 30_000);
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.channels.map((c) => c.stop()));
  }

  isAvailable(): boolean {
    return this.channels.some((c) => c.isAvailable());
  }

  async send(packet: MeshPacket): Promise<boolean> {
    for (const channel of this.channels) {
      if (!channel.isAvailable()) continue;
      const ok = await channel.send(packet);
      if (ok) return true;
    }
    return false;
  }

  onPacket(handler: PacketHandler): void {
    this.packetHandlers.push(handler);
  }

  onAvailabilityChange(handler: ConnectivityHandler): void {
    this.availabilityHandlers.push(handler);
  }

  /** UI'ın hangi alt kanaldan geldiğini göstermek istemesi durumunda kullanılabilir. */
  getActiveChannelKinds(): string[] {
    return this.channels.filter((c) => c.isAvailable()).map((_, i) => `channel-${i}`);
  }

  private handleIncoming(packet: MeshPacket) {
    // İki kanaldan da (BLE + Wi-Fi) aynı paket gelirse (örn. iki cihaz her iki kanalda da
    // birbirini görüyorsa) tekrar işlenmesini/UI'a iki kez düşmesini önler.
    const key = packetSeenKey(packet);
    if (this.seenCache.has(key)) return;
    this.seenCache.set(key, Date.now());
    for (const handler of this.packetHandlers) handler(packet);
  }

  private recomputeAvailability() {
    const available = this.isAvailable();
    for (const h of this.availabilityHandlers) h(available);
  }

  private cleanupSeenCache() {
    const now = Date.now();
    for (const [key, seenAt] of this.seenCache) {
      if (now - seenAt > this.seenTtlMs) this.seenCache.delete(key);
    }
  }
}

// NetworkRouter.ts — Uygulamanın TEK giriş noktası (Multi-Bearer Routing).
//
// Görev tanımındaki "Uygulama içi kanal geçişini (İnternet <-> Bluetooth) pürüzsüz
// yöneten router mantığı" burada uygulanır. Üst katmanlar (FriendService, GroupService,
// UI) hiçbir zaman doğrudan InternetTransport ya da BluetoothMeshTransport ile konuşmaz;
// sadece `router.sendPacket(packet)` çağırır. Router hangi kanalın aktif olduğuna
// kendi karar verir ve gönderilemeyen paketleri kanal değişince yeniden dener.

import { ITransport } from './ITransport';
import { InternetTransport } from './InternetTransport';
import { GatewayBridge } from './GatewayBridge';
import { MeshPacket } from '../types/packet';

export type RouterMode = 'internet' | 'bluetooth' | 'offline';

type ModeChangeHandler = (mode: RouterMode) => void;

interface OutboxEntry {
  packet: MeshPacket;
  attempts: number;
  enqueuedAt: number;
}

export class NetworkRouter {
  private mode: RouterMode = 'offline';
  private modeHandlers: ModeChangeHandler[] = [];
  private packetHandlers: ((packet: MeshPacket) => void)[] = [];

  // Gönderilemeyen paketler burada bekler; kanal her uygunluk kazandığında flush edilir.
  private outbox: OutboxEntry[] = [];
  private maxAttempts = 20;

  private gateway: GatewayBridge;

  constructor(
    private currentUserId: string,
    private internet: InternetTransport,
    private mesh: ITransport
  ) {
    this.gateway = new GatewayBridge(currentUserId, internet, mesh);
  }

  async start(): Promise<void> {
    this.internet.onAvailabilityChange((available) => this.recomputeMode(available, this.mesh.isAvailable()));
    this.mesh.onAvailabilityChange((available) => this.recomputeMode(this.internet.isAvailable(), available));

    this.internet.onPacket((p) => this.dispatchIncoming(p));
    this.mesh.onPacket((p) => this.dispatchIncoming(p));

    await Promise.all([this.internet.start(), this.mesh.start()]);
    this.gateway.start();

    this.recomputeMode(this.internet.isAvailable(), this.mesh.isAvailable());
  }

  async stop(): Promise<void> {
    this.gateway.stop();
    await Promise.all([this.internet.stop(), this.mesh.stop()]);
  }

  /**
   * Uygulama katmanının çağıracağı TEK gönderim fonksiyonu.
   * Kanal seçimi burada, şeffaf biçimde yapılır: önce internet denenir (varsa),
   * yoksa Bluetooth mesh'e düşülür (fallback). Her ikisi de yoksa outbox'a kuyruklanır.
   */
  async sendPacket(packet: MeshPacket): Promise<{ sent: boolean; via: RouterMode }> {
    const transport = this.pickTransport();

    if (transport) {
      const ok = await transport.send(packet);
      if (ok) return { sent: true, via: transport.kind };
    }

    // Birincil kanal başarısız olduysa diğer kanalı da bir kez dene (ör. internet
    // "available" görünüyor ama anlık gönderim hata verdi).
    const fallback = this.pickTransport(transport?.kind);
    if (fallback) {
      const ok = await fallback.send(packet);
      if (ok) return { sent: true, via: fallback.kind };
    }

    this.outbox.push({ packet, attempts: 0, enqueuedAt: Date.now() });
    return { sent: false, via: 'offline' };
  }

  onPacket(handler: (packet: MeshPacket) => void): void {
    this.packetHandlers.push(handler);
  }

  onModeChange(handler: ModeChangeHandler): void {
    this.modeHandlers.push(handler);
  }

  getMode(): RouterMode {
    return this.mode;
  }

  // ---------------- iç mantık ----------------

  private pickTransport(exclude?: RouterMode): ITransport | null {
    if (exclude !== 'internet' && this.internet.isAvailable()) return this.internet;
    if (exclude !== 'bluetooth' && this.mesh.isAvailable()) return this.mesh;
    return null;
  }

  private dispatchIncoming(packet: MeshPacket) {
    for (const handler of this.packetHandlers) handler(packet);
  }

  private recomputeMode(internetAvailable: boolean, meshAvailable: boolean) {
    const newMode: RouterMode = internetAvailable ? 'internet' : meshAvailable ? 'bluetooth' : 'offline';
    const changed = newMode !== this.mode;
    this.mode = newMode;

    if (changed) {
      for (const h of this.modeHandlers) h(newMode);
    }

    // Kanal her yeniden kullanılabilir hale geldiğinde bekleyen kuyruğu boşaltmayı dene
    // — bu "pürüzsüz geçiş"in kalbidir: kullanıcı hiçbir şey yapmadan mesajlar iletilir.
    if (newMode !== 'offline') void this.flushOutbox();
  }

  private async flushOutbox() {
    if (this.outbox.length === 0) return;
    const pending = [...this.outbox];
    this.outbox = [];

    for (const entry of pending) {
      entry.attempts += 1;
      const transport = this.pickTransport();
      const ok = transport ? await transport.send(entry.packet) : false;
      if (!ok && entry.attempts < this.maxAttempts) {
        this.outbox.push(entry);
      }
      // maxAttempts aşılan paketler UI katmanına "gönderilemedi" olarak işaretlenmek üzere düşürülür.
    }
  }
}

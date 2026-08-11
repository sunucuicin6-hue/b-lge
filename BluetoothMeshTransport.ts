// BluetoothMeshTransport.ts — İnternetsiz (off-grid) modda çalışan Bluetooth LE Mesh taşıyıcısı.
//
// Strateji: Klasik BLE bağlantı-merkezli (GATT client/server) model yerine,
// "flood mesh" yaklaşımı kullanılır: her cihaz aynı anda hem Peripheral (advertise/GATT server)
// hem Central (scan/GATT client) rolündedir. Bir paket alan cihaz, TTL > 0 ise paketi
// TTL'i 1 azaltarak civardaki TÜM komşularına tekrar yayınlar (kendi gönderdiği ve daha önce
// gördüğü paketler hariç). Böylece mesaj, doğrudan menzilde olmayan hedeflere de "sıçrayarak" ulaşır.
//
// NOT: Bu dosya react-native-ble-plx (Central) + react-native-ble-advertiser (Peripheral)
// gibi native köprü kütüphanelerini SARMALAYAN platform-agnostik bir servis katmanıdır.
// Gerçek BLE API çağrıları `NativeBleBridge` arayüzü arkasına soyutlanmıştır ki bu dosya
// test edilebilir ve kütüphane değişikliğine dayanıklı kalsın.

import { ITransport, PacketHandler, ConnectivityHandler } from './ITransport';
import { MeshPacket, packetSeenKey } from '../types/packet';

// WhatsMesh mesh ağını diğer BLE cihazlarından ayırt etmek için özel servis UUID'si.
export const MESH_SERVICE_UUID = '5f1a0000-79b3-4f2a-9c0e-8e6c8f2a0001';
export const MESH_CHARACTERISTIC_UUID = '5f1a0001-79b3-4f2a-9c0e-8e6c8f2a0001';

/** Native BLE katmanına delege edilen minimal işlemler. */
export interface NativeBleBridge {
  startAdvertising(serviceUuid: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(serviceUuid: string, onDeviceFound: (deviceId: string) => void): Promise<void>;
  stopScanning(): Promise<void>;
  connectAndWrite(deviceId: string, characteristicUuid: string, base64Data: string): Promise<void>;
  /** Bir GATT server (peripheral) olarak karakteristiğe yazma isteklerini dinler. */
  onCharacteristicWrite(handler: (base64Data: string) => void): void;
  getConnectedNeighborIds(): string[];
}

interface SeenEntry { seenAt: number }

export class BluetoothMeshTransport implements ITransport {
  readonly kind = 'bluetooth' as const;

  private packetHandlers: PacketHandler[] = [];
  private availabilityHandlers: ConnectivityHandler[] = [];
  private seenCache = new Map<string, SeenEntry>();
  private seenTtlMs = 5 * 60 * 1000; // aynı paketi 5 dk boyunca tekrar işleme/relay etme
  private neighborCount = 0;

  constructor(private ble: NativeBleBridge, private currentUserId: string) {}

  async start(): Promise<void> {
    // Peripheral rolü: kimliğimizi ve mesh servisini duyur, gelen yazma isteklerini dinle.
    await this.ble.startAdvertising(MESH_SERVICE_UUID);
    this.ble.onCharacteristicWrite((base64Data) => this.handleIncomingRaw(base64Data));

    // Central rolü: civardaki diğer WhatsMesh cihazlarını tara.
    await this.ble.startScanning(MESH_SERVICE_UUID, (_deviceId) => {
      const prev = this.neighborCount;
      this.neighborCount = this.ble.getConnectedNeighborIds().length;
      if (prev === 0 && this.neighborCount > 0) this.notifyAvailability(true);
    });

    this.periodicNeighborCheck();
    this.periodicSeenCacheCleanup();
  }

  async stop(): Promise<void> {
    await this.ble.stopAdvertising();
    await this.ble.stopScanning();
    this.notifyAvailability(false);
  }

  isAvailable(): boolean {
    return this.neighborCount > 0;
  }

  /** Yeni bir paket gönderilirken çağrılır (uygulama katmanından). */
  async send(packet: MeshPacket): Promise<boolean> {
    this.markSeen(packet); // kendi gönderdiğimiz paketi tekrar işlemeyelim (loop guard)
    return this.floodToNeighbors(packet);
  }

  onPacket(handler: PacketHandler): void {
    this.packetHandlers.push(handler);
  }

  onAvailabilityChange(handler: ConnectivityHandler): void {
    this.availabilityHandlers.push(handler);
  }

  // ---------------- TTL Flood çekirdek mantığı ----------------

  private handleIncomingRaw(base64Data: string) {
    let packet: MeshPacket;
    try {
      packet = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf8'));
    } catch {
      return; // bozuk paket, sessizce yok say
    }
    this.handleIncomingPacket(packet);
  }

  private handleIncomingPacket(packet: MeshPacket) {
    const key = packetSeenKey(packet);
    if (this.seenCache.has(key)) return; // döngü/duplicate koruması
    this.markSeen(packet);

    const isForMe =
      packet.receiverId === this.currentUserId ||
      (packet.isGroup && this.isMemberOfGroup(packet.receiverId));

    if (isForMe) {
      for (const handler of this.packetHandlers) handler(packet);
    }

    // Bana ait olmasa bile (ya da grup mesajıysa) TTL varsa komşulara sıçrat.
    if (packet.ttl > 0) {
      const relayed: MeshPacket = { ...packet, ttl: packet.ttl - 1 };
      void this.floodToNeighbors(relayed);
    }
  }

  /** TTL flood: paketi tüm bağlı komşulara yazar. En az bir komşuya ulaştıysa true döner. */
  private async floodToNeighbors(packet: MeshPacket): Promise<boolean> {
    const neighborIds = this.ble.getConnectedNeighborIds();
    if (neighborIds.length === 0) return false;

    const payload = Buffer.from(JSON.stringify(packet), 'utf8').toString('base64');
    const results = await Promise.allSettled(
      neighborIds.map((id) => this.ble.connectAndWrite(id, MESH_CHARACTERISTIC_UUID, payload))
    );
    return results.some((r) => r.status === 'fulfilled');
  }

  private markSeen(packet: MeshPacket) {
    this.seenCache.set(packetSeenKey(packet), { seenAt: Date.now() });
  }

  private periodicSeenCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.seenCache) {
        if (now - entry.seenAt > this.seenTtlMs) this.seenCache.delete(key);
      }
    }, 30_000);
  }

  private periodicNeighborCheck() {
    setInterval(() => {
      const count = this.ble.getConnectedNeighborIds().length;
      if (count !== this.neighborCount) {
        const wasAvailable = this.neighborCount > 0;
        this.neighborCount = count;
        const isAvailable = count > 0;
        if (wasAvailable !== isAvailable) this.notifyAvailability(isAvailable);
      }
    }, 5000);
  }

  private notifyAvailability(v: boolean) {
    for (const h of this.availabilityHandlers) h(v);
  }

  // Grup üyeliği kontrolü gerçek projede local DB'den (data/localStore.ts) sorgulanır.
  private isMemberOfGroup(_groupId: string): boolean {
    // Basitleştirilmiş: GroupService.isMember(groupId) çağrısına delege edilmesi önerilir.
    return true;
  }
}

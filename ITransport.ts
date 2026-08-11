// ITransport.ts — İnternet ve Bluetooth Mesh taşıyıcılarının uyması gereken ortak arayüz.
// NetworkRouter sadece bu arayüzle konuşur; taşıyıcının Socket.IO mu yoksa BLE mi
// olduğunu bilmek zorunda değildir. Bu, "pürüzsüz kanal geçişi" gereksiniminin temelidir.

import { MeshPacket } from '../types/packet';

export type PacketHandler = (packet: MeshPacket) => void;
export type ConnectivityHandler = (isAvailable: boolean) => void;

export interface ITransport {
  readonly kind: 'internet' | 'bluetooth';

  /** Taşıyıcıyı başlatır (soket bağlantısı kur / BLE tarama+advertise başlat). */
  start(): Promise<void>;

  /** Taşıyıcıyı durdurur, kaynakları serbest bırakır. */
  stop(): Promise<void>;

  /** Bir paketi bu kanaldan göndermeyi dener. Başarılıysa true döner. */
  send(packet: MeshPacket): Promise<boolean>;

  /** Bu kanaldan bir paket alındığında tetiklenecek callback'i kaydeder. */
  onPacket(handler: PacketHandler): void;

  /** Kanalın kullanılabilirlik durumu değiştiğinde (ör. internet koptu) tetiklenir. */
  onAvailabilityChange(handler: ConnectivityHandler): void;

  /** Şu an gönderime hazır mı? (İnternet: bağlı mı; BT: en az 1 komşu var mı) */
  isAvailable(): boolean;
}

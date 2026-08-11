// InternetTransport.ts — Render/Relay sunucusuna Socket.IO ile bağlanan taşıyıcı.
// "not: mesaj sistemi render sunucusundan gidip gelsin" gereksinimi burada karşılanır:
// Tüm İnternet modundaki metin/medya/sticker/arkadaşlık paketleri bu taşıyıcı
// üzerinden `packet` event'i ile Render sunucusuna gönderilir ve sunucudan
// yine `packet` event'i ile alınır.

import { io, Socket } from 'socket.io-client';
import NetInfo from '@react-native-community/netinfo';
import { ITransport, PacketHandler, ConnectivityHandler } from './ITransport';
import { MeshPacket } from '../types/packet';

// Render'a deploy edilen backend'in URL'i (örn: https://whatsmesh-relay.onrender.com)
const RELAY_SERVER_URL = process.env.RELAY_SERVER_URL || 'https://b-lge-1.onrender.com';

export class InternetTransport implements ITransport {
  readonly kind = 'internet' as const;

  private socket: Socket | null = null;
  private packetHandlers: PacketHandler[] = [];
  private availabilityHandlers: ConnectivityHandler[] = [];
  private connected = false;
  private netInfoUnsubscribe: (() => void) | null = null;

  constructor(private currentUserId: string) {}

  async start(): Promise<void> {
    // Cihazın gerçek internet erişimini (sadece Wi-Fi'a bağlı olmak yetmez,
    // captive portal gibi durumlar da olabilir) NetInfo ile izliyoruz.
    this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const hasInternet = !!state.isConnected && state.isInternetReachable !== false;
      if (!hasInternet && this.connected) {
        this.teardownSocket();
      } else if (hasInternet && !this.socket) {
        this.connectSocket();
      }
    });

    const netState = await NetInfo.fetch();
    if (netState.isConnected && netState.isInternetReachable !== false) {
      this.connectSocket();
    }
  }

  async stop(): Promise<void> {
    this.netInfoUnsubscribe?.();
    this.teardownSocket();
  }

  private connectSocket() {
    this.socket = io(RELAY_SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    this.socket.on('connect', () => {
      this.socket?.emit('auth', { userId: this.currentUserId });
    });

    this.socket.on('auth:ok', () => {
      this.connected = true;
      this.notifyAvailability(true);
    });

    this.socket.on('packet', (packet: MeshPacket) => {
      for (const handler of this.packetHandlers) handler(packet);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.notifyAvailability(false);
    });

    this.socket.on('connect_error', () => {
      this.connected = false;
      this.notifyAvailability(false);
    });
  }

  private teardownSocket() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.notifyAvailability(false);
  }

  async send(packet: MeshPacket): Promise<boolean> {
    if (!this.socket || !this.connected) return false;
    this.socket.emit('packet', packet);
    return true; // gerçek teslim onayı 'packet:ack' event'i ile asenkron gelir
  }

  /** Bluetooth mesh'ten toplanmış bir paketi Render sunucusuna köprüler (Proxy Gateway). */
  async bridgeForward(packet: MeshPacket): Promise<boolean> {
    if (!this.socket || !this.connected) return false;
    this.socket.emit('bridge:forward', packet);
    return true;
  }

  onPacket(handler: PacketHandler): void {
    this.packetHandlers.push(handler);
  }

  onAvailabilityChange(handler: ConnectivityHandler): void {
    this.availabilityHandlers.push(handler);
  }

  isAvailable(): boolean {
    return this.connected;
  }

  private notifyAvailability(v: boolean) {
    for (const h of this.availabilityHandlers) h(v);
  }
}

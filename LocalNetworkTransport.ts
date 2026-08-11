// LocalNetworkTransport.ts — İnternet OLMADAN, aynı yerel ağda (Wi-Fi veya bir telefonun
// açtığı Hotspot) çalışan alternatif "mesh" taşıyıcısı.
//
// NEDEN: Gerçek Bluetooth LE mesh (RealBleBridge.ts) native Android/iOS kodu gerektirir
// ve BLE'nin doğası nedeniyle bazı telefon modellerinde/Android sürümlerinde kararsız
// çalışabilir. Bu taşıyıcı ise SADECE React Native kütüphaneleriyle (native derleme
// dışında ekstra platform kodu YOK) çalışır ve genelde daha güvenilirdir:
//
//   1) Bir telefon Hotspot açar (ya da ikisi de aynı Wi-Fi ağına bağlanır).
//   2) Her cihaz UDP broadcast ile "buradayım, ben @kullanici_adi" mesajı yayınlar.
//   3) Diğer cihaz bu beacon'ı görünce IP adresini not eder.
//   4) Mesaj göndermek için bilinen IP'ye doğrudan TCP bağlantısı açılıp veri yazılır.
//
// NOT: Bu, gerçek çoklu-sıçrama (multi-hop) mesh DEĞİLDİR — sadece aynı yerel ağdaki
// cihazlar birbirini doğrudan görür (tipik bir ev Wi-Fi'sinde veya hotspot'ta bu yeterlidir).

import dgram from 'react-native-udp';
import TcpSockets from 'react-native-tcp-socket';
import { ITransport, PacketHandler, ConnectivityHandler } from './ITransport';
import { MeshPacket } from '../types/packet';

const DISCOVERY_PORT = 47810;
const TCP_PORT = 47811;
const BEACON_INTERVAL_MS = 3000;
const PEER_TIMEOUT_MS = 10_000; // bu süre boyunca beacon gelmeyen peer "kayıp" sayılır

interface KnownPeer {
  ip: string;
  lastSeenAt: number;
}

export class LocalNetworkTransport implements ITransport {
  readonly kind: 'bluetooth' = 'bluetooth'; // router'a "offline mesh kanalı" olarak görünür

  private packetHandlers: PacketHandler[] = [];
  private availabilityHandlers: ConnectivityHandler[] = [];
  private peers = new Map<string, KnownPeer>(); // userId -> { ip, lastSeenAt }
  private udpSocket: any = null;
  private tcpServer: any = null;
  private beaconTimer: any = null;
  private cleanupTimer: any = null;
  private wasAvailable = false;

  constructor(private currentUserId: string, private currentUsername: string) {}

  async start(): Promise<void> {
    this.startTcpServer();
    this.startUdpDiscovery();
    this.beaconTimer = setInterval(() => this.broadcastBeacon(), BEACON_INTERVAL_MS);
    this.cleanupTimer = setInterval(() => this.evictStalePeers(), 2000);
    this.broadcastBeacon();
  }

  async stop(): Promise<void> {
    clearInterval(this.beaconTimer);
    clearInterval(this.cleanupTimer);
    try { this.udpSocket?.close(); } catch {}
    try { this.tcpServer?.close(); } catch {}
    this.peers.clear();
    this.notifyAvailability(false);
  }

  isAvailable(): boolean {
    return this.peers.size > 0;
  }

  async send(packet: MeshPacket): Promise<boolean> {
    if (this.peers.size === 0) return false;

    // Doğrudan mesajlarda hedefin IP'si biliniyorsa sadece ona yaz; grup/bilinmeyen
    // hedeflerde bilinen tüm peer'lara yaz (alıcı taraf receiverId'ye göre filtreler —
    // bu, BluetoothMeshTransport'taki flood mantığıyla aynı basitleştirmedir).
    const targetPeer = this.peers.get(packet.receiverId);
    const targets = targetPeer ? [targetPeer] : [...this.peers.values()];

    const line = JSON.stringify(packet) + '\n'; // newline-delimited JSON çerçeveleme
    const results = await Promise.allSettled(targets.map((peer) => this.writeTo(peer.ip, line)));
    return results.some((r) => r.status === 'fulfilled');
  }

  onPacket(handler: PacketHandler): void {
    this.packetHandlers.push(handler);
  }

  onAvailabilityChange(handler: ConnectivityHandler): void {
    this.availabilityHandlers.push(handler);
  }

  // ---------------- TCP: mesaj alışverişi ----------------

  private startTcpServer() {
    this.tcpServer = TcpSockets.createServer((socket: any) => {
      let buffer = '';
      socket.on('data', (data: any) => {
        buffer += data.toString('utf8');
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          this.handleIncomingLine(line);
        }
      });
      socket.on('error', () => {});
    });
    this.tcpServer.listen({ port: TCP_PORT, host: '0.0.0.0' });
  }

  private handleIncomingLine(line: string) {
    if (!line.trim()) return;
    try {
      const packet: MeshPacket = JSON.parse(line);
      for (const handler of this.packetHandlers) handler(packet);
    } catch {
      // bozuk satır, yok say
    }
  }

  private writeTo(ip: string, line: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = TcpSockets.createConnection({ port: TCP_PORT, host: ip }, () => {
        client.write(line, 'utf8', () => {
          client.destroy();
          resolve();
        });
      });
      client.on('error', (err: any) => reject(err));
    });
  }

  // ---------------- UDP: keşif (discovery) ----------------

  private startUdpDiscovery() {
    this.udpSocket = dgram.createSocket({ type: 'udp4', reusePort: true });
    this.udpSocket.bind(DISCOVERY_PORT, () => {
      try {
        this.udpSocket.setBroadcast(true);
      } catch {
        // bazı platformlarda broadcast izni/desteği farklı olabilir
      }
    });

    this.udpSocket.on('message', (msg: Buffer, rinfo: { address: string }) => {
      try {
        const data = JSON.parse(msg.toString('utf8'));
        if (data.type !== 'whatsmesh-beacon' || data.userId === this.currentUserId) return;

        const isNew = !this.peers.has(data.userId);
        this.peers.set(data.userId, { ip: rinfo.address, lastSeenAt: Date.now() });
        if (isNew && !this.wasAvailable) this.notifyAvailability(true);
      } catch {
        // whatsmesh dışı bir UDP paketi, yok say
      }
    });

    this.udpSocket.on('error', () => {});
  }

  private broadcastBeacon() {
    if (!this.udpSocket) return;
    const beacon = JSON.stringify({
      type: 'whatsmesh-beacon',
      userId: this.currentUserId,
      username: this.currentUsername,
    });
    const buf = Buffer.from(beacon, 'utf8');
    try {
      this.udpSocket.send(buf, 0, buf.length, DISCOVERY_PORT, '255.255.255.255');
    } catch {
      // ağ henüz hazır değilse sessizce geç, bir sonraki tick'te tekrar denenir
    }
  }

  private evictStalePeers() {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeenAt > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed && this.peers.size === 0) this.notifyAvailability(false);
  }

  private notifyAvailability(v: boolean) {
    this.wasAvailable = v;
    for (const h of this.availabilityHandlers) h(v);
  }
}

// GatewayBridge.ts — "İnternet Köprüsü (Proxy Gateway)" gereksinimini karşılar.
//
// Senaryo: A cihazının interneti yok, B cihazının interneti VAR ve ikisi Bluetooth
// menzilinde. A'nın gönderdiği (kendisine ait olmayan hedefe yönelik) mesh paketi
// B'ye TTL flood ile ulaşır. B, kendi NetworkRouter'ı üzerinden bu paketi tanır,
// "bana ait değil ama internetim var" der ve InternetTransport.bridgeForward() ile
// Render sunucusuna iletir. Böylece A, internetsiz olsa bile mesajı bulut ağına ulaştırmış olur.
//
// Aynı köprü ters yönde de çalışır: Render sunucusundan B'ye gelen ve hedefi mesh'te
// olan bir paket, B tarafından BluetoothMeshTransport.send() ile mesh'e enjekte edilir.

import { MeshPacket } from '../types/packet';
import { InternetTransport } from './InternetTransport';
import { ITransport } from './ITransport';

export class GatewayBridge {
  private active = false;

  constructor(
    private currentUserId: string,
    private internet: InternetTransport,
    private mesh: ITransport
  ) {}

  start() {
    this.active = true;

    // Mesh'ten gelen ve bana ait olmayan trafiği internete köprüle.
    this.mesh.onPacket((packet) => {
      if (!this.active) return;
      if (!this.internet.isAvailable()) return; // benim de internetim yoksa köprü kuramam
      if (this.isAddressedToMe(packet)) return; // zaten bana geldiyse köprülemeye gerek yok

      void this.internet.bridgeForward(packet);
    });

    // İnternetten gelen ve mesh'e (offline arkadaşlara) ulaşması gereken trafiği
    // mesh ağına enjekte et (örn. grup mesajında bazı üyeler offline olabilir).
    this.internet.onPacket((packet) => {
      if (!this.active) return;
      if (this.isAddressedToMe(packet)) return; // uygulama katmanı zaten işleyecek
      void this.mesh.send(packet);
    });
  }

  stop() {
    this.active = false;
  }

  private isAddressedToMe(packet: MeshPacket): boolean {
    return !packet.isGroup && packet.receiverId === this.currentUserId;
  }
}

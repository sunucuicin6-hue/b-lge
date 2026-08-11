// ChunkManager.ts — Fotoğraf/ses dosyalarını Bluetooth Mesh'in küçük paket boyutuna göre
// kayıpsız biçimde parçalara ayırır (Chunking) ve alıcı tarafta sıraya göre birleştirir
// (Reassembly). Kalite HİÇBİR aşamada düşürülmez: dosya ham baytlarıyla taşınır.
//
// - splitFileIntoChunks(): gönderen tarafta kullanılır.
// - ChunkReassembler: alıcı tarafta, aynı messageId'ye sahip chunk'ları biriktirir,
//   %kaç tamamlandığını raporlar (progress callback) ve son chunk gelince orijinal
//   dosyayı (Uint8Array) döndürür.

import {
  MeshPacket,
  PacketType,
  createBaseEnvelope,
  DEFAULT_CHUNK_SIZE_BYTES,
} from '../types/packet';
import { fromByteArray, toByteArray } from 'base64-js';

// Gerçek base64 <-> bayt dönüşümü (önceden bu iki fonksiyon `declare function` ile
// bırakılmıştı ve HİÇBİR implementasyonu yoktu — bu yüzden medya gönderimi derlense
// bile çalışma zamanında patlardı). Artık `base64-js` paketiyle gerçek implementasyon var.
function base64Encode(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}
function base64Decode(b64: string): Uint8Array {
  return toByteArray(b64);
}

export interface MediaMeta {
  mimeType: string;      // 'image/jpeg' | 'audio/m4a' ...
  fileName: string;
  totalBytes: number;
  checksum: string;      // basit bütünlük kontrolü (örn. CRC32/SHA-1 hex)
}

export interface ChunkProgressEvent {
  messageId: string;
  receivedChunks: number;
  totalChunks: number;
  percent: number; // 0-100
}

/**
 * Bir dosyayı (Uint8Array) tam kalite korunarak sabit boyutlu parçalara böler ve
 * her biri için gönderime hazır MeshPacket üretir. Sıra `chunkIndex` ile garanti edilir;
 * BLE mesh'te paketler farklı sıralarda ulaşabileceğinden bu index birleştirmede zorunludur.
 */
export function splitFileIntoChunks(params: {
  fileBytes: Uint8Array;
  senderId: string;
  receiverId: string;
  isGroup: boolean;
  meta: MediaMeta;
  chunkSizeBytes?: number;
  ttl?: number;
}): MeshPacket[] {
  const chunkSize = params.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES;
  const totalChunks = Math.max(1, Math.ceil(params.fileBytes.length / chunkSize));
  const base = createBaseEnvelope({
    packetType: PacketType.MEDIA_CHUNK,
    senderId: params.senderId,
    receiverId: params.receiverId,
    isGroup: params.isGroup,
    ttl: params.ttl,
  });

  const packets: MeshPacket[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, params.fileBytes.length);
    const chunkBytes = params.fileBytes.subarray(start, end);
    packets.push({
      ...base,
      chunkIndex: i,
      totalChunks,
      payload: base64Encode(chunkBytes),
      // İlk chunk'ta dosya meta verisini taşırız; alıcı bunu görünce reassembly buffer'ı açar.
      meta: i === 0 ? { ...params.meta, totalChunks } : { totalChunks },
    });
  }
  return packets;
}

interface ReassemblyBuffer {
  chunks: Map<number, Uint8Array>;
  totalChunks: number;
  meta?: MediaMeta;
  startedAt: number;
  senderId: string;
  receiverId: string;
  isGroup: boolean;
}

export type ProgressCallback = (event: ChunkProgressEvent) => void;
export type CompleteCallback = (result: {
  messageId: string;
  fileBytes: Uint8Array;
  meta?: MediaMeta;
  senderId: string;
  receiverId: string;
  isGroup: boolean;
}) => void;

/**
 * Alıcı cihazda çalışır. Gelen MEDIA_CHUNK paketlerini messageId bazında toplar,
 * progress bar için yüzde bilgisini yayınlar, tüm parçalar tamamlanınca orijinal
 * dosyayı bayt bayt (kalite kaybı olmadan) yeniden birleştirir.
 *
 * Not: BLE mesh'te paketler yinelenerek (duplicate) gelebilir; Map kullanımı
 * aynı chunkIndex'in birden fazla kez sayılmasını doğal olarak engeller.
 */
export class ChunkReassembler {
  private buffers = new Map<string, ReassemblyBuffer>();
  private staleTimeoutMs = 2 * 60 * 1000; // 2 dk içinde tamamlanmayan transferi at

  constructor(
    private onProgress: ProgressCallback,
    private onComplete: CompleteCallback
  ) {}

  /** Bir MEDIA_CHUNK paketi geldiğinde çağrılır. */
  ingest(packet: MeshPacket): void {
    if (packet.packetType !== PacketType.MEDIA_CHUNK) return;
    this.evictStaleBuffers();

    let buf = this.buffers.get(packet.messageId);
    if (!buf) {
      buf = {
        chunks: new Map(),
        totalChunks: packet.totalChunks,
        startedAt: Date.now(),
        senderId: packet.senderId,
        receiverId: packet.receiverId,
        isGroup: packet.isGroup,
      };
      this.buffers.set(packet.messageId, buf);
    }
    if (packet.meta && 'mimeType' in packet.meta) {
      buf.meta = packet.meta as unknown as MediaMeta;
    }

    buf.chunks.set(packet.chunkIndex, base64Decode(packet.payload));

    const percent = Math.round((buf.chunks.size / buf.totalChunks) * 100);
    this.onProgress({
      messageId: packet.messageId,
      receivedChunks: buf.chunks.size,
      totalChunks: buf.totalChunks,
      percent,
    });

    if (buf.chunks.size === buf.totalChunks) {
      const fileBytes = this.mergeChunks(buf);
      this.buffers.delete(packet.messageId);
      this.onComplete({
        messageId: packet.messageId,
        fileBytes,
        meta: buf.meta,
        senderId: buf.senderId,
        receiverId: buf.receiverId,
        isGroup: buf.isGroup,
      });
    }
  }

  /** Sıraya göre (chunkIndex artan) chunk'ları tek bir bayt dizisinde birleştirir. */
  private mergeChunks(buf: ReassemblyBuffer): Uint8Array {
    let totalLength = 0;
    for (let i = 0; i < buf.totalChunks; i++) {
      const chunk = buf.chunks.get(i);
      if (!chunk) throw new Error(`Eksik chunk: index ${i}`); // burada olmamalı, complete tetiklenmeden önce kontrol edildi
      totalLength += chunk.length;
    }
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < buf.totalChunks; i++) {
      const chunk = buf.chunks.get(i)!;
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  private evictStaleBuffers() {
    const now = Date.now();
    for (const [id, buf] of this.buffers) {
      if (now - buf.startedAt > this.staleTimeoutMs) this.buffers.delete(id);
    }
  }

  /** UI'da "transferi iptal et" gibi kullanım için. */
  getProgress(messageId: string): ChunkProgressEvent | null {
    const buf = this.buffers.get(messageId);
    if (!buf) return null;
    return {
      messageId,
      receivedChunks: buf.chunks.size,
      totalChunks: buf.totalChunks,
      percent: Math.round((buf.chunks.size / buf.totalChunks) * 100),
    };
  }
}

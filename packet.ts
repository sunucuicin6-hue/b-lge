// packet.ts — Sistemin TEK ortak veri paket yapısı.
// Bu şema hem İnternet (Socket.IO/JSON) hem de Bluetooth Mesh (binary) taşıyıcısında
// AYNI şekilde kullanılır. Böylece bir mesaj yarı yolda kanal değiştirse bile
// alıcı tarafta içerik/anlam kaybı olmaz.
//
// Kavramsal paket düzeni (görev tanımındaki ile birebir):
// [Paket Tipi] [Gönderen ID] [Alıcı ID / Grup ID] [Chunk Index / Total Chunks] [TTL] [Veri]

export enum PacketType {
  TEXT = 'TEXT',                     // düz metin mesajı
  MEDIA_CHUNK = 'MEDIA_CHUNK',       // fotoğraf/ses dosyasının bir parçası
  STICKER = 'STICKER',               // sadece sticker ID'si taşır, dosya taşımaz
  FRIEND_REQUEST = 'FRIEND_REQUEST', // Bluetooth üzerinden doğrudan arkadaşlık isteği
  FRIEND_ACCEPT = 'FRIEND_ACCEPT',
  GROUP_INVITE = 'GROUP_INVITE',     // BT üzerinden grup üyeliği duyurusu
  DISCOVERY = 'DISCOVERY',           // mesh cihaz/kimlik keşif beacon'ı
  ACK = 'ACK',                       // teslim onayı
}

export type TransportKind = 'internet' | 'bluetooth';

/**
 * Tüm sistemde dolaşan tek zarf (envelope).
 * `payload` içeriği packetType'a göre yorumlanır:
 *  - TEXT           -> UTF-8 şifreli metin (base64 string)
 *  - MEDIA_CHUNK     -> ilgili chunk'ın ham baytları (base64 string)
 *  - STICKER         -> ":sticker_101:" gibi bir ID string'i
 *  - FRIEND_REQUEST  -> { username, publicKey } JSON'ı
 *  - GROUP_INVITE    -> { groupId, name, memberIds } JSON'ı
 */
export interface MeshPacket {
  packetType: PacketType;
  senderId: string;           // gönderen kullanıcının UUID'si
  receiverId: string;         // hedef kullanıcı UUID'si YA DA groupId
  isGroup: boolean;           // receiverId bir Group_ID mi?
  messageId: string;          // bu mesaja ait TÜM chunk'larda AYNI kalan mantıksal kimlik
  chunkIndex: number;         // 0-based. Chunk olmayan paketlerde 0
  totalChunks: number;        // Chunk olmayan paketlerde 1
  ttl: number;                // Bluetooth mesh'te kaç sıçrama daha yapabilir (internet'te kullanılmaz)
  timestamp: number;          // epoch ms
  payload: string;            // base64 ya da JSON.stringify edilmiş veri
  meta?: Record<string, unknown>; // opsiyonel: mimeType, fileName, totalBytes, checksum...
}

/** Bluetooth mesh'in flood algoritmasında görülen mesajları takip etmek için anahtar üretir. */
export function packetSeenKey(p: Pick<MeshPacket, 'messageId' | 'chunkIndex'>): string {
  return `${p.messageId}:${p.chunkIndex}`;
}

/** Yeni bir mantıksal mesaj için ortak alanları üretir (chunk'lar bunun üstüne kurulur). */
export function createBaseEnvelope(params: {
  packetType: PacketType;
  senderId: string;
  receiverId: string;
  isGroup?: boolean;
  ttl?: number;
}): Omit<MeshPacket, 'chunkIndex' | 'totalChunks' | 'payload'> {
  return {
    packetType: params.packetType,
    senderId: params.senderId,
    receiverId: params.receiverId,
    isGroup: !!params.isGroup,
    messageId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    ttl: params.ttl ?? DEFAULT_MESH_TTL,
    timestamp: Date.now(),
  };
}

/** BLE'de bir mesajın kaç cihaz sıçrayabileceğinin varsayılan sınırı. */
export const DEFAULT_MESH_TTL = 6;

/** BLE karakteristik yazma limitine göre güvenli chunk payload boyutu (byte). */
export const DEFAULT_CHUNK_SIZE_BYTES = 500;

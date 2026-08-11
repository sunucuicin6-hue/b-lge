// session.ts — Giriş yapmış kullanıcının kimliğini cihazda saklar.
// Not: Bu basit bir "kullanıcı adı seç ve devam et" akışıdır, şifre/parola
// YOKTUR (backend'de de parola alanı yok — bkz. server.js POST /api/users).
// Gerçek bir üretim uygulamasında burada telefon numarası doğrulama veya
// parola tabanlı kimlik doğrulama eklenmelidir.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from './models';

const SESSION_KEY = 'whatsmesh:session';

/** Basit, kriptografik olmayan rastgele kimlik üreticisi (gerçek E2E anahtarı YERİNE geçmez). */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Gerçek uygulamada burada bir E2E şifreleme anahtar çifti üretilmeli (örn. libsodium). */
export function generatePlaceholderPublicKey(): string {
  return generateId();
}

export async function saveSession(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(profile));
}

export async function loadSession(): Promise<UserProfile | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

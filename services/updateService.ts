/**
 * In-app update (OTA): check a manifest URL for a new bundle, show "Update available",
 * then download and apply so the local bundle is updated without reinstalling the APK.
 * Only runs on Capacitor native (Android/iOS).
 */

import { Capacitor } from '@capacitor/core';
import { LiveUpdate } from '@capawesome/capacitor-live-update';

const MANIFEST_URL = import.meta.env.VITE_UPDATE_MANIFEST_URL as string | undefined;

export type UpdateCheckResult =
  | { available: true; version: string; url: string }
  | { available: false };

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function hasUpdateConfig(): boolean {
  return Boolean(MANIFEST_URL?.trim());
}

/**
 * Fetch manifest and compare with current bundle. Returns update info if a newer bundle exists.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isNativePlatform() || !MANIFEST_URL?.trim()) return { available: false };

  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) return { available: false };
    const data = (await res.json()) as { version?: string; url?: string };
    const remoteVersion = data.version?.trim();
    const downloadUrl = data.url?.trim();
    if (!remoteVersion || !downloadUrl) return { available: false };

    const current = await LiveUpdate.getCurrentBundle();
    const versionName = await LiveUpdate.getVersionName();
    const currentVersion = current?.bundleId ?? versionName ?? '0.0.0';
    if (compareVersions(remoteVersion, currentVersion) <= 0) return { available: false };

    return { available: true, version: remoteVersion, url: downloadUrl };
  } catch {
    return { available: false };
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/**
 * Download the bundle, set it as next, then reload the app so the local bundle is updated.
 */
export async function applyUpdate(bundleId: string, url: string): Promise<void> {
  if (!isNativePlatform()) return;
  await LiveUpdate.downloadBundle({ bundleId, url });
  await LiveUpdate.setNextBundle({ bundleId });
  await LiveUpdate.reload();
}

/**
 * Call when the app has finished loading so the plugin can avoid rolling back.
 */
export async function notifyAppReady(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await LiveUpdate.ready();
  } catch {
    // ignore
  }
}

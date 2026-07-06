/**
 * Resolves local asset URLs with per-file cache-bust query params.
 * Versions live in data/image-cache-versions.json (regenerate after replacing images).
 */

import staticManifest from "../data/image-cache-versions.json" with { type: "json" };

const ASSET_ROOT = new URL("../", import.meta.url);
const CACHE_DATA_URL = new URL("../data/image-cache-versions.json", import.meta.url);

/** @type {Record<string, string>} */
let imageCacheVersions = staticManifest?.versions ?? {};
/** @type {string} */
let imageCacheBuildId = staticManifest?.meta?.buildId ?? "";

/** Normalized `assets/...` path without query or hash. */
export function assetPathKey(url) {
  if (!url) return "";
  const decoded = decodeURIComponent(url);
  const assetsIdx = decoded.indexOf("assets/");
  let key = assetsIdx >= 0 ? decoded.slice(assetsIdx) : decoded;
  const queryIdx = key.indexOf("?");
  if (queryIdx >= 0) key = key.slice(0, queryIdx);
  const hashIdx = key.indexOf("#");
  if (hashIdx >= 0) key = key.slice(0, hashIdx);
  return key;
}

export function getImageCacheBuildId() {
  return imageCacheBuildId;
}

export function hasImageCacheManifest() {
  return Boolean(imageCacheBuildId || Object.keys(imageCacheVersions).length);
}

export async function loadImageCacheVersions() {
  try {
    const url = new URL(CACHE_DATA_URL);
    url.searchParams.set("_", String(Date.now()));
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    imageCacheVersions = data?.versions ?? imageCacheVersions;
    imageCacheBuildId = data?.meta?.buildId ?? imageCacheBuildId;
  } catch {
    // Static import fallback — enough when modules are fresh (e.g. after copy to submission PC).
  }
  return imageCacheVersions;
}

export function getImageCacheVersion(url) {
  const key = assetPathKey(url);
  return key && imageCacheVersions ? imageCacheVersions[key] ?? null : null;
}

export function resolveAssetImageUrl(url, root = ASSET_ROOT) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const pathOnly = url.split("?")[0].split("#")[0];
  let resolved;
  try {
    resolved = new URL(pathOnly, root).href;
  } catch {
    resolved = pathOnly;
  }
  const version = getImageCacheVersion(pathOnly);
  const params = new URLSearchParams();
  if (version) params.set("v", version);
  if (imageCacheBuildId) params.set("b", imageCacheBuildId);
  const query = params.toString();
  if (!query) return resolved;
  return `${resolved}?${query}`;
}

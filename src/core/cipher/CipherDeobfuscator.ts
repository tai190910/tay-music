// src/core/cipher/CipherDeobfuscator.ts

import { PlayerJsFetcher } from "./PlayerJsFetcher.ts";
import { SolverEngine } from "./SolverEngine.ts";

export class CipherDeobfuscator {
  private static parseQueryParams(query: string): Record<string, string> {
    const result: Record<string, string> = {};
    const pairs = query.split("&");
    for (const pair of pairs) {
      const idx = pair.indexOf("=");
      if (idx > 0) {
        const key = decodeURIComponent(pair.substring(0, idx));
        const val = decodeURIComponent(pair.substring(idx + 1));
        result[key] = val;
      }
    }
    return result;
  }

  static async deobfuscateStreamUrl(signatureCipher: string, videoId: string): Promise<string | null> {
    try {
      return await this.deobfuscateInternal(signatureCipher, videoId, false);
    } catch (err: any) {
      console.warn(`[CipherDeobfuscator] Cipher deobfuscation failed for ${videoId}, retrying with fresh JS:`, err.message);
      try {
        PlayerJsFetcher.invalidateCache();
        return await this.deobfuscateInternal(signatureCipher, videoId, true);
      } catch (retryErr: any) {
        console.error(`[CipherDeobfuscator] Retry failed for ${videoId}:`, retryErr.message);
        return null;
      }
    }
  }

  private static async deobfuscateInternal(signatureCipher: string, videoId: string, isRetry: boolean): Promise<string | null> {
    const params = this.parseQueryParams(signatureCipher);
    const obfuscatedSig = params["s"];
    const sigParam = params["sp"] || "signature";
    const baseUrl = params["url"];

    if (!obfuscatedSig || !baseUrl) {
      return null;
    }

    const playerJsRes = await PlayerJsFetcher.getPlayerJs(isRetry);
    if (!playerJsRes) {
      return null;
    }

    SolverEngine.initializeForPlayer(playerJsRes.playerJs, playerJsRes.hash);

    const deobfuscatedSig = SolverEngine.deobfuscateSig(obfuscatedSig);
    if (!deobfuscatedSig) {
      return null;
    }

    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}${sigParam}=${encodeURIComponent(deobfuscatedSig)}`;
  }

  static async transformNParamInUrl(url: string): Promise<string> {
    try {
      const nMatch = url.match(/[?&]n=([^&]+)/);
      if (!nMatch) {
        return url;
      }

      const nValue = decodeURIComponent(nMatch[1]);
      const playerJsRes = await PlayerJsFetcher.getPlayerJs(false);
      if (!playerJsRes) {
        return url;
      }

      SolverEngine.initializeForPlayer(playerJsRes.playerJs, playerJsRes.hash);

      const transformedN = SolverEngine.transformN(nValue);
      if (transformedN === nValue) {
        return url;
      }

      return url.replace(/([?&])n=[^&]+/, `$1n=${encodeURIComponent(transformedN)}`);
    } catch (err: any) {
      console.warn("[CipherDeobfuscator] N-transform failed:", err.message);
      return url;
    }
  }
}

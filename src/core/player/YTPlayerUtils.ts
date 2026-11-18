// src/core/player/YTPlayerUtils.ts

import { InnerTube } from "../innertube/InnerTube.ts";
import { YouTubeClient } from "../innertube/YouTubeClient.ts";
import { CipherDeobfuscator } from "../cipher/CipherDeobfuscator.ts";
import { PoTokenGenerator } from "../potoken/PoTokenGenerator.ts";
import type { Format, PlayerResponse } from "../innertube/types.ts";
import { AudioQuality, type PlaybackData } from "./types.ts";
import { withRnParam } from "./LocalStreamProxy.ts";

export class YTPlayerUtils {
  private static readonly MAIN_CLIENT: YouTubeClient = YouTubeClient.VISIONOS;
  private static readonly METADATA_CLIENT: YouTubeClient = YouTubeClient.WEB_REMIX;

  private static readonly ACCOUNT_CLIENTS: YouTubeClient[] = [
    YouTubeClient.TVHTML5_SAMSUNG,
    YouTubeClient.WEB_EMBEDDED_PLAYER,
    YouTubeClient.TVHTML5_DOWNGRADED,
  ];

  private static readonly STREAM_FALLBACK_CLIENTS: YouTubeClient[] = [
    YouTubeClient.VISIONOS,
    YouTubeClient.WEB_REMIX,
    YouTubeClient.WEB,
    YouTubeClient.WEB_CREATOR,
    YouTubeClient.IPADOS,
    YouTubeClient.ANDROID_VR_1_43_32,
    YouTubeClient.ANDROID_VR_1_61_48,
    YouTubeClient.ANDROID_VR_1_65_10,
    YouTubeClient.TVHTML5_SIMPLY_EMBEDDED_PLAYER,
    YouTubeClient.TVHTML5,
    YouTubeClient.ANDROID_CREATOR,
    YouTubeClient.MOBILE,
  ];

  private static readonly RESTRICTED_STATUSES = [
    "AGE_CHECK_REQUIRED",
    "AGE_VERIFICATION_REQUIRED",
    "LOGIN_REQUIRED",
    "CONTENT_CHECK_REQUIRED",
  ];

  private static readonly UNTOKENED_WINDOW_PROBE_BYTE = 1048576; // 1 MB
  private static readonly BOT_CHECK_REST_MS = 30 * 60 * 1000;

  private static visionOsRestingUntil = 0;
  private static poTokenGenerator = new PoTokenGenerator();

  static async resolvePlaybackData(
    innerTube: InnerTube,
    videoId: string,
    playlistId?: string | null,
    audioQuality: AudioQuality = AudioQuality.HIGH,
    networkMetered: boolean = false
  ): Promise<PlaybackData> {
    if (!videoId || typeof videoId !== "string" || videoId === "undefined" || videoId.trim().length !== 11) {
      throw new Error(`[YTPlayerUtils] Invalid 11-character videoId provided: "${videoId}"`);
    }
    videoId = videoId.trim();

    const isLoggedIn = !!innerTube.cookie;

    // 1. Ensure visitorData is set
    if (!isLoggedIn && !innerTube.visitorData) {
      await innerTube.mintVisitorId(YouTubeClient.WEB_REMIX);
    }

    const failures: string[] = [];
    let mainPlayerResponse: PlayerResponse | null = null;

    // 2. Query VISIONOS first (MAIN_CLIENT)
    try {
      let answer = await innerTube.player(this.MAIN_CLIENT, videoId, playlistId, null, null);
      if (this.isBotCheck(answer)) {
        await innerTube.mintVisitorId(this.MAIN_CLIENT);
        answer = await innerTube.player(this.MAIN_CLIENT, videoId, playlistId, null, null);
      }
      mainPlayerResponse = answer;
    } catch (err: any) {
      failures.push(`VISIONOS: ${err.message}`);
    }

    // 3. Build prioritized list of clients with VISIONOS as #1 priority
    const clientsToTry: YouTubeClient[] = [this.MAIN_CLIENT];

    if (isLoggedIn) {
      for (const ac of this.ACCOUNT_CLIENTS) {
        if (!clientsToTry.includes(ac)) clientsToTry.push(ac);
      }
    }

    for (const fc of this.STREAM_FALLBACK_CLIENTS) {
      if (!clientsToTry.includes(fc)) {
        clientsToTry.push(fc);
      }
    }

    let successClient: YouTubeClient | null = null;
    let chosenFormat: Format | null = null;
    let chosenStreamUrl: string | null = null;
    let streamExpiresInSeconds: number | null = null;
    let finalPlayerResponse: PlayerResponse | null = null;

    let poTokenResult: any = null;
    const sessionId = isLoggedIn ? innerTube.dataSyncId : innerTube.visitorData;

    for (const client of clientsToTry) {
      let streamPlayerResponse: PlayerResponse | null = null;

      // Use pre-fetched VISIONOS response if available and healthy
      if (client === this.MAIN_CLIENT && mainPlayerResponse?.playabilityStatus?.status === "OK") {
        streamPlayerResponse = mainPlayerResponse;
      } else {
        if (client.loginRequired && !isLoggedIn) {
          continue;
        }

        // Lazy PoToken generation for web clients
        if (client.useWebPoTokens && !poTokenResult && sessionId) {
          try {
            poTokenResult = await this.poTokenGenerator.poTokenFor(videoId, sessionId);
          } catch {}
        }

        try {
          const clientPoToken = client.useWebPoTokens ? poTokenResult?.playerRequestPoToken : null;
          streamPlayerResponse = await innerTube.player(client, videoId, playlistId, null, clientPoToken);
        } catch (e: any) {
          failures.push(`${client.clientName}: ${e.message}`);
          continue;
        }
      }

      if (streamPlayerResponse?.playabilityStatus?.status !== "OK") {
        const status = streamPlayerResponse?.playabilityStatus?.status || "Unknown";
        const reason = streamPlayerResponse?.playabilityStatus?.reason || "";
        failures.push(`${client.clientName}: ${status}${reason ? ` (${reason})` : ""}`);
        continue;
      }

      const formatCandidates = this.selectAudioFormatCandidates(streamPlayerResponse, audioQuality, networkMetered);
      if (formatCandidates.length === 0) {
        failures.push(`${client.clientName}: no audio formats`);
        continue;
      }

      for (const candidate of formatCandidates) {
        let candidateUrl = await this.resolveFormatUrl(candidate, videoId);
        if (!candidateUrl) continue;

        // Apply n-transform if URL contains n=
        if (candidateUrl.includes("n=") || candidateUrl.includes("?n=") || candidateUrl.includes("&n=")) {
          try {
            candidateUrl = await CipherDeobfuscator.transformNParamInUrl(candidateUrl);
          } catch (e: any) {
            console.warn(`[YTPlayerUtils] N-transform failed:`, e.message);
          }
        }

        // Attach &rn=0 parameter matching YouTube client behavior
        candidateUrl = withRnParam(candidateUrl, 0);

        // Append pot token if web client has one
        if (client.useWebPoTokens && poTokenResult?.streamingDataPoToken) {
          const separator = candidateUrl.includes("?") ? "&" : "?";
          candidateUrl = `${candidateUrl}${separator}pot=${encodeURIComponent(poTokenResult.streamingDataPoToken)}`;
        }

        const streamHeaders = client.streamHeaders();
        let isValid = await this.validateStatus(candidateUrl, streamHeaders, candidate.contentLength ? Number(candidate.contentLength) : null);

        // For VISIONOS, candidateUrl has direct streaming URL from Apple Vision Pro profile.
        // Even if the byte-probe returns non-200, it is our #1 primary source and passes through Chunked Proxy.
        if (!isValid && client === this.MAIN_CLIENT) {
          isValid = true;
        }

        if (isValid) {
          successClient = client;
          chosenFormat = candidate;
          chosenStreamUrl = candidateUrl;
          finalPlayerResponse = streamPlayerResponse;
          streamExpiresInSeconds = streamPlayerResponse.streamingData?.expiresInSeconds
            ? Number(streamPlayerResponse.streamingData.expiresInSeconds)
            : 21600;
          break;
        } else {
          // If candidate failed, retry fresh n-transform
          try {
            const nTransformed = await CipherDeobfuscator.transformNParamInUrl(candidateUrl);
            if (nTransformed !== candidateUrl) {
              const reValid = await this.validateStatus(nTransformed, streamHeaders, candidate.contentLength ? Number(candidate.contentLength) : null);
              if (reValid) {
                successClient = client;
                chosenFormat = candidate;
                chosenStreamUrl = nTransformed;
                finalPlayerResponse = streamPlayerResponse;
                streamExpiresInSeconds = streamPlayerResponse.streamingData?.expiresInSeconds
                  ? Number(streamPlayerResponse.streamingData.expiresInSeconds)
                  : 21600;
                break;
              }
            }
          } catch {}
        }
      }

      if (successClient && chosenStreamUrl && chosenFormat && finalPlayerResponse) {
        break;
      }
    }

    if (!successClient || !chosenStreamUrl || !chosenFormat || !finalPlayerResponse) {
      throw new Error(`All clients failed for video ${videoId}: ${failures.join(" | ")}`);
    }

    return {
      audioConfig: finalPlayerResponse.playerConfig?.audioConfig,
      videoDetails: finalPlayerResponse.videoDetails,
      playbackTracking: finalPlayerResponse.playbackTracking,
      format: chosenFormat,
      streamUrl: chosenStreamUrl,
      streamExpiresInSeconds: streamExpiresInSeconds || 21600,
      streamClient: successClient.clientName,
      streamHeaders: successClient.streamHeaders(),
    };
  }

  private static isBotCheck(resp: PlayerResponse): boolean {
    return resp.playabilityStatus?.status === "LOGIN_REQUIRED" &&
      !!resp.playabilityStatus?.reason?.toLowerCase().includes("bot");
  }

  private static async resolveFormatUrl(format: Format, videoId: string): Promise<string | null> {
    if (format.url && format.url.length > 0) {
      return format.url;
    }

    const cipher = format.signatureCipher || format.cipher;
    if (cipher) {
      const deobfuscated = await CipherDeobfuscator.deobfuscateStreamUrl(cipher, videoId);
      if (deobfuscated) {
        return deobfuscated;
      }
    }

    return null;
  }

  /**
   * Checks whether a stream URL serves the requested song without cutting off.
   * Performs a ranged GET at the end of the file (or 1MB offset) to detect 403 Forbidden.
   */
  static async validateStatus(
    url: string,
    headers: Record<string, string> = {},
    contentLength: number | null = null
  ): Promise<boolean> {
    const offset = contentLength && contentLength > 1 ? contentLength - 1 : this.UNTOKENED_WINDOW_PROBE_BYTE;
    const probeUrl = withRnParam(url, 0);
    try {
      const reqHeaders: Record<string, string> = {
        ...headers,
        "Range": `bytes=${offset}-${offset}`,
      };
      if (!reqHeaders["User-Agent"]) {
        reqHeaders["User-Agent"] = YouTubeClient.USER_AGENT_WEB;
      }

      const res = await fetch(probeUrl, {
        method: "GET",
        headers: reqHeaders,
      });

      const isSuccessful = res.ok || res.status === 206 || (res.status === 416 && contentLength == null);
      return isSuccessful;
    } catch {
      return false;
    }
  }

  /**
   * Orders usable audio formats best-first according to target audioQuality.
   */
  static selectAudioFormatCandidates(
    playerResponse: PlayerResponse,
    audioQuality: AudioQuality,
    networkMetered: boolean = false
  ): Format[] {
    const adaptive = playerResponse.streamingData?.adaptiveFormats || [];
    const audioFormats = adaptive.filter((f) => f.width == null && f.bitrate > 0 && (f.url || f.signatureCipher || f.cipher));

    if (audioFormats.length === 0) {
      return [];
    }

    // Prefer original non auto-dubbed track
    const originalFormats = audioFormats.filter((f) => f.audioTrack?.isAutoDubbed == null);
    const usableFormats = originalFormats.length > 0 ? originalFormats : audioFormats;

    const effectiveQuality = audioQuality === AudioQuality.AUTO
      ? (networkMetered ? AudioQuality.MEDIUM : AudioQuality.HIGH)
      : audioQuality;

    const targetBitrateBps = effectiveQuality === AudioQuality.LOW
      ? 70000
      : effectiveQuality === AudioQuality.MEDIUM
      ? 135000
      : null; // HIGH: best available

    const qualityRank = (f: Format): number => {
      switch (f.audioQuality) {
        case "AUDIO_QUALITY_HIGH": return 3;
        case "AUDIO_QUALITY_MEDIUM": return 2;
        case "AUDIO_QUALITY_LOW": return 1;
        default: return 0;
      }
    };

    const extractCodec = (mimeType: string): string | null => {
      const match = mimeType.match(/codecs="([^"]+)"/);
      return match ? match[1].split(",")[0].trim() : null;
    };

    const codecRank = (codec: string | null, mimeType: string = ""): number => {
      const lower = `${codec || ""} ${mimeType}`.toLowerCase();
      // On Windows/Chromium, audio/mp4 (mp4a / AAC, itag 140) has 100% hardware decoding support.
      // Prioritize mp4a/AAC over webm/opus!
      if (lower.includes("mp4a") || lower.includes("mp4") || lower.includes("aac")) return 3;
      if (lower.includes("opus") || lower.includes("webm")) return 2;
      return 1;
    };

    const comparator = (a: Format, b: Format): number => {
      // Direct URL preferred over cipher
      const aDirect = a.url ? 1 : 0;
      const bDirect = b.url ? 1 : 0;
      if (aDirect !== bDirect) return bDirect - aDirect;

      // Prioritize audio/mp4 (AAC itag 140) for 100% Windows hardware decoding compatibility
      const aIsMp4 = a.mimeType.toLowerCase().includes("mp4") ? 1 : 0;
      const bIsMp4 = b.mimeType.toLowerCase().includes("mp4") ? 1 : 0;
      if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;

      // Quality label rank
      const aQ = qualityRank(a);
      const bQ = qualityRank(b);
      if (aQ !== bQ) return bQ - aQ;

      // Audio channels
      const aCh = a.audioChannels ?? 2;
      const bCh = b.audioChannels ?? 2;
      if (aCh !== bCh) return bCh - aCh;

      // Bitrate
      if (a.bitrate !== b.bitrate) return b.bitrate - a.bitrate;

      // Codec rank
      const aCodec = codecRank(extractCodec(a.mimeType), a.mimeType);
      const bCodec = codecRank(extractCodec(b.mimeType), b.mimeType);
      if (aCodec !== bCodec) return bCodec - aCodec;

      // Audio sample rate
      const aRate = Number(a.audioSampleRate) || 0;
      const bRate = Number(b.audioSampleRate) || 0;
      return bRate - aRate;
    };

    if (targetBitrateBps == null) {
      return [...usableFormats].sort(comparator);
    } else {
      const belowOrEqual = usableFormats.filter((f) => f.bitrate <= targetBitrateBps).sort(comparator);
      const above = usableFormats
        .filter((f) => f.bitrate > targetBitrateBps)
        .sort((a, b) => a.bitrate - b.bitrate || comparator(a, b));
      return [...belowOrEqual, ...above];
    }
  }
}

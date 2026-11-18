// src/core/potoken/PoTokenGenerator.ts

import type { PoTokenResult } from "./PoTokenResult.ts";

export class PoTokenGenerator {
  private static readonly GOOGLE_API_KEY = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
  private static readonly REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
  private static readonly USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.3";
  private static readonly PREWARM_VIDEO_ID = "dQw4w9WgXcQ";
  private static readonly MINT_COOLDOWN_MS = 5 * 60 * 1000;

  private mintCooldownUntilMs = 0;
  private sessionTokens = new Map<string, { token: string; expiresAt: number }>();
  private videoTokens = new Map<string, { token: string; expiresAt: number }>();

  get hasSessionToken(): boolean {
    for (const [, val] of this.sessionTokens) {
      if (Date.now() < val.expiresAt) return true;
    }
    return false;
  }

  async preWarm(sessionId: string): Promise<void> {
    try {
      await this.poTokenFor(PoTokenGenerator.PREWARM_VIDEO_ID, sessionId);
    } catch {}
  }

  async poTokenFor(videoId: string, sessionId: string): Promise<PoTokenResult | null> {
    const now = Date.now();
    if (now < this.mintCooldownUntilMs) {
      return null;
    }

    try {
      // Check cached session token
      let sessionPot = this.sessionTokens.get(sessionId);
      if (!sessionPot || now >= sessionPot.expiresAt) {
        const minted = await this.mintToken(sessionId);
        if (minted) {
          sessionPot = { token: minted, expiresAt: now + 3600 * 1000 };
          this.sessionTokens.set(sessionId, sessionPot);
        }
      }

      // Check cached video token
      let videoPot = this.videoTokens.get(videoId);
      if (!videoPot || now >= videoPot.expiresAt) {
        const minted = await this.mintToken(videoId);
        if (minted) {
          videoPot = { token: minted, expiresAt: now + 3600 * 1000 };
          this.videoTokens.set(videoId, videoPot);
        }
      }

      if (sessionPot?.token && videoPot?.token) {
        return {
          playerRequestPoToken: sessionPot.token,
          streamingDataPoToken: videoPot.token,
        };
      }

      return null;
    } catch (err: any) {
      this.mintCooldownUntilMs = Date.now() + PoTokenGenerator.MINT_COOLDOWN_MS;
      return null;
    }
  }

  /**
   * Attempts to contact YouTube BotGuard endpoints to mint a token.
   */
  private async mintToken(identifier: string): Promise<string | null> {
    try {
      const createRes = await fetch("https://www.youtube.com/api/jnn/v1/Create", {
        method: "POST",
        headers: {
          "User-Agent": PoTokenGenerator.USER_AGENT,
          "Accept": "application/json",
          "Content-Type": "application/json+protobuf",
          "x-goog-api-key": PoTokenGenerator.GOOGLE_API_KEY,
          "x-user-agent": "grpc-web-javascript/0.1",
        },
        body: JSON.stringify([PoTokenGenerator.REQUEST_KEY]),
      });

      if (!createRes.ok) return null;
      const rawChallengeData = await createRes.json();
      if (!Array.isArray(rawChallengeData) || rawChallengeData.length === 0) return null;

      // When running in a headless backend without a DOM/WebView, BotGuard JS VM cannot fully execute.
      // In this scenario, we return null so the player resolver gracefully falls back to VISIONOS
      // (which does not require any PoToken).
      return null;
    } catch {
      return null;
    }
  }
}

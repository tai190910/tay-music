// src/core/innertube/InnerTube.ts

import * as crypto from "node:crypto";
import { YouTubeClient } from "./YouTubeClient.ts";
import { DEFAULT_LOCALE, ORIGIN_YOUTUBE_MUSIC, API_URL_YOUTUBE_MUSIC } from "./constants.ts";
import type { YouTubeLocale, PlayerResponse } from "./types.ts";

export class InnerTube {
  locale: YouTubeLocale = { ...DEFAULT_LOCALE };
  visitorData: string | null = null;
  dataSyncId: string | null = null;
  cookie: string | null = null;
  useLoginForBrowse: boolean = false;

  private cookieMap: Map<string, string> = new Map();
  private ownVisitorIds: Map<string, string> = new Map();

  setCookie(cookieStr: string | null): void {
    this.cookie = cookieStr;
    this.cookieMap.clear();
    if (cookieStr) {
      const parts = cookieStr.split(";");
      for (const part of parts) {
        const idx = part.indexOf("=");
        if (idx > 0) {
          const key = part.substring(0, idx).trim();
          const val = part.substring(idx + 1).trim();
          this.cookieMap.set(key, val);
        }
      }
    }
  }

  private getSapisidHash(origin: string): string | null {
    const sapisid = this.cookieMap.get("SAPISID") || this.cookieMap.get("__Secure-3PAPISID");
    if (!sapisid) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const hash = crypto.createHash("sha1").update(`${nowSec} ${sapisid} ${origin}`).digest("hex");
    return `SAPISIDHASH ${nowSec}_${hash}`;
  }

  private buildHeaders(client: YouTubeClient, setLogin: boolean = false, visitor?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Goog-Api-Format-Version": client.apiFormatVersion,
      "X-YouTube-Client-Name": client.clientId,
      "X-YouTube-Client-Version": client.clientVersion,
      "User-Agent": client.userAgent,
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    };

    if (!client.isNativeApp) {
      headers["X-Origin"] = client.apiOrigin;
      headers["Referer"] = `${client.apiOrigin}/`;
      headers["Origin"] = client.apiOrigin;
    }

    const effectiveVisitor = visitor ?? this.visitorData;
    if (effectiveVisitor) {
      headers["X-Goog-Visitor-Id"] = effectiveVisitor;
    }

    if (setLogin && client.loginSupported && this.cookie) {
      headers["Cookie"] = this.cookie;
      const auth = this.getSapisidHash(client.apiOrigin);
      if (auth) {
        headers["Authorization"] = auth;
      }
    }

    return headers;
  }

  async getVisitorDataForClient(client: YouTubeClient): Promise<string | null> {
    if (client.ownVisitorId) {
      const cached = this.ownVisitorIds.get(client.clientName);
      if (cached) return cached;
      return await this.mintVisitorId(client);
    }
    if (!this.visitorData) {
      this.visitorData = await this.mintVisitorId(client);
    }
    return this.visitorData;
  }

  async mintVisitorId(client: YouTubeClient): Promise<string | null> {
    try {
      const url = `${client.apiOrigin}/youtubei/v1/visitor_id`;
      const headers = this.buildHeaders(client, false, null);
      const body = {
        context: client.toContext(this.locale, null, null),
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      const visitor = data.responseContext?.visitorData;
      if (visitor) {
        if (client.ownVisitorId) {
          this.ownVisitorIds.set(client.clientName, visitor);
        } else {
          this.visitorData = visitor;
        }
        return visitor;
      }
      return null;
    } catch (err: any) {
      console.warn(`[InnerTube] Failed to mint visitorData for ${client.clientName}:`, err.message);
      return null;
    }
  }

  async search(
    client: YouTubeClient = YouTubeClient.WEB_REMIX,
    query?: string,
    params?: string,
    continuation?: string
  ): Promise<any> {
    const visitor = await this.getVisitorDataForClient(client);
    const url = `${client.apiOrigin}/youtubei/v1/search${continuation ? `?continuation=${encodeURIComponent(continuation)}&ctoken=${encodeURIComponent(continuation)}` : ""}`;
    const headers = this.buildHeaders(client, this.useLoginForBrowse, visitor);
    const body = {
      context: client.toContext(this.locale, visitor, this.useLoginForBrowse ? this.dataSyncId : null),
      query: query || undefined,
      params: params || undefined,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`YouTube search returned HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  }

  async getSearchSuggestions(client: YouTubeClient = YouTubeClient.WEB_REMIX, query: string): Promise<any> {
    const visitor = await this.getVisitorDataForClient(client);
    const url = `${client.apiOrigin}/youtubei/v1/music/get_search_suggestions`;
    const headers = this.buildHeaders(client, false, visitor);
    const body = {
      context: client.toContext(this.locale, visitor, null),
      input: query,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`YouTube getSearchSuggestions returned HTTP ${res.status}`);
    }
    return await res.json();
  }

  async browse(
    client: YouTubeClient = YouTubeClient.WEB_REMIX,
    browseId?: string,
    params?: string,
    continuation?: string,
    setLogin: boolean = false
  ): Promise<any> {
    const visitor = await this.getVisitorDataForClient(client);
    const url = `${client.apiOrigin}/youtubei/v1/browse${continuation ? `?continuation=${encodeURIComponent(continuation)}&ctoken=${encodeURIComponent(continuation)}` : ""}`;
    const headers = this.buildHeaders(client, setLogin || this.useLoginForBrowse, visitor);
    const body = {
      context: client.toContext(this.locale, visitor, (setLogin || this.useLoginForBrowse) ? this.dataSyncId : null),
      browseId: browseId || undefined,
      params: params || undefined,
      continuation: continuation || undefined,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`YouTube browse returned HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  }

  async player(
    client: YouTubeClient,
    videoId: string,
    playlistId?: string | null,
    signatureTimestamp?: number | null,
    poToken?: string | null
  ): Promise<PlayerResponse> {
    const visitor = await this.getVisitorDataForClient(client);
    const url = `${client.apiOrigin}/youtubei/v1/player`;
    const headers = this.buildHeaders(client, true, visitor);

    const body: Record<string, any> = {
      context: client.toContext(this.locale, visitor, this.dataSyncId),
      videoId,
      playlistId: playlistId || undefined,
      contentCheckOk: true,
      racyCheckOk: true,
    };

    if (client.useSignatureTimestamp && signatureTimestamp != null) {
      body.playbackContext = {
        contentPlaybackContext: {
          signatureTimestamp,
          html5Preference: "HTML5_PREF_WANTS",
        },
      };
    }

    if (client.useWebPoTokens && poToken) {
      body.serviceIntegrityDimensions = {
        poToken,
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`YouTube player API returned HTTP ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as PlayerResponse;
  }
}

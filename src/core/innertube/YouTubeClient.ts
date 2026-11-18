// src/core/innertube/YouTubeClient.ts

import { ORIGIN_YOUTUBE, ORIGIN_YOUTUBE_MUSIC, USER_AGENT_WEB } from "./constants.ts";
import type { YouTubeLocale } from "./types.ts";

export interface YouTubeClientConfig {
  clientName: string;
  clientVersion: string;
  clientId: string;
  userAgent: string;
  osName?: string;
  osVersion?: string;
  deviceMake?: string;
  deviceModel?: string;
  androidSdkVersion?: string;
  buildId?: string;
  cronetVersion?: string;
  packageName?: string;
  friendlyName?: string;
  loginSupported?: boolean;
  loginRequired?: boolean;
  useSignatureTimestamp?: boolean;
  isEmbedded?: boolean;
  useWebPoTokens?: boolean;
  apiOrigin?: string;
  apiFormatVersion?: string;
  clientScreen?: string;
  platform?: string;
  ownVisitorId?: boolean;
}

export class YouTubeClient {
  readonly clientName: string;
  readonly clientVersion: string;
  readonly clientId: string;
  readonly userAgent: string;
  readonly osName?: string;
  readonly osVersion?: string;
  readonly deviceMake?: string;
  readonly deviceModel?: string;
  readonly androidSdkVersion?: string;
  readonly buildId?: string;
  readonly cronetVersion?: string;
  readonly packageName?: string;
  readonly friendlyName?: string;
  readonly loginSupported: boolean;
  readonly loginRequired: boolean;
  readonly useSignatureTimestamp: boolean;
  readonly isEmbedded: boolean;
  readonly useWebPoTokens: boolean;
  readonly apiOrigin: string;
  readonly apiFormatVersion: string;
  readonly clientScreen?: string;
  readonly platform?: string;
  readonly ownVisitorId: boolean;

  constructor(config: YouTubeClientConfig) {
    this.clientName = config.clientName;
    this.clientVersion = config.clientVersion;
    this.clientId = config.clientId;
    this.userAgent = config.userAgent;
    this.osName = config.osName;
    this.osVersion = config.osVersion;
    this.deviceMake = config.deviceMake;
    this.deviceModel = config.deviceModel;
    this.androidSdkVersion = config.androidSdkVersion;
    this.buildId = config.buildId;
    this.cronetVersion = config.cronetVersion;
    this.packageName = config.packageName;
    this.friendlyName = config.friendlyName;
    this.loginSupported = config.loginSupported ?? false;
    this.loginRequired = config.loginRequired ?? false;
    this.useSignatureTimestamp = config.useSignatureTimestamp ?? false;
    this.isEmbedded = config.isEmbedded ?? false;
    this.useWebPoTokens = config.useWebPoTokens ?? false;
    this.apiOrigin = config.apiOrigin ?? ORIGIN_YOUTUBE_MUSIC;
    this.apiFormatVersion = config.apiFormatVersion ?? "1";
    this.clientScreen = config.clientScreen;
    this.platform = config.platform;
    this.ownVisitorId = config.ownVisitorId ?? false;
  }

  get isNativeApp(): boolean {
    return this.platform != null;
  }

  solvesN(): boolean {
    return this.useWebPoTokens || this === YouTubeClient.TVHTML5_SAMSUNG || this === YouTubeClient.TVHTML5_DOWNGRADED || this === YouTubeClient.WEB_EMBEDDED_PLAYER;
  }

  toContext(locale: YouTubeLocale, visitorData?: string | null, dataSyncId?: string | null) {
    return {
      client: {
        clientName: this.clientName,
        clientVersion: this.clientVersion,
        clientScreen: this.clientScreen,
        platform: this.platform,
        osName: this.osName,
        osVersion: this.osVersion,
        deviceMake: this.deviceMake,
        deviceModel: this.deviceModel,
        androidSdkVersion: this.androidSdkVersion,
        gl: locale.gl,
        hl: locale.hl,
        visitorData: visitorData || undefined,
        utcOffsetMinutes: this.clientScreen != null ? 0 : undefined,
      },
      user: {
        onBehalfOfUser: this.loginSupported && dataSyncId ? dataSyncId : undefined,
      },
      ...(this.isEmbedded ? {
        thirdParty: {
          embedUrl: "https://www.youtube.com",
        }
      } : {})
    };
  }

  /**
   * Headers that googlevideo expects alongside a stream url.
   * googlevideo validates Origin/Referer against the client named in the url's `c=` parameter.
   */
  streamHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };

    switch (this.clientName) {
      case "VISIONOS":
      case "ANDROID_VR":
      case "ANDROID_CREATOR":
      case "IOS":
      case "IPADOS":
      case "MOBILE":
        // Native clients MUST NOT send browser Origin or Referer
        break;
      case "WEB_REMIX":
        headers["Referer"] = "https://music.youtube.com/";
        headers["Origin"] = "https://music.youtube.com";
        break;
      case "WEB_CREATOR":
        headers["Referer"] = "https://studio.youtube.com/";
        headers["Origin"] = "https://studio.youtube.com";
        break;
      default:
        headers["Referer"] = "https://www.youtube.com/";
        headers["Origin"] = "https://www.youtube.com";
        break;
    }

    return headers;
  }

  // Predefined clients matching Android implementation

  /**
   * VISIONOS: Main stream client.
   * Direct non-ciphered URLs, serves full files (tested up to final byte), needs NO PoToken!
   */
  static readonly VISIONOS = new YouTubeClient({
    clientName: "VISIONOS",
    clientVersion: "1.04",
    clientId: "101",
    userAgent: "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)",
    osName: "visionOS",
    osVersion: "26.6.0.23O770",
    deviceMake: "Apple",
    deviceModel: "RealityDevice17,1",
    friendlyName: "visionOS",
    apiOrigin: ORIGIN_YOUTUBE,
    apiFormatVersion: "2",
    clientScreen: "WATCH",
    platform: "MOBILE",
    ownVisitorId: true,
    loginSupported: false,
    useSignatureTimestamp: false,
  });

  static readonly WEB = new YouTubeClient({
    clientName: "WEB",
    clientVersion: "2.20260708.00.00",
    clientId: "1",
    userAgent: USER_AGENT_WEB,
  });

  static readonly WEB_REMIX = new YouTubeClient({
    clientName: "WEB_REMIX",
    clientVersion: "1.20260707.12.00",
    clientId: "67",
    userAgent: USER_AGENT_WEB,
    loginSupported: true,
    useSignatureTimestamp: true,
    useWebPoTokens: true,
  });

  static readonly WEB_CREATOR = new YouTubeClient({
    clientName: "WEB_CREATOR",
    clientVersion: "1.20260708.06.00",
    clientId: "62",
    userAgent: USER_AGENT_WEB,
    loginSupported: true,
    loginRequired: true,
    useSignatureTimestamp: true,
  });

  static readonly TVHTML5 = new YouTubeClient({
    clientName: "TVHTML5",
    clientVersion: "7.20260707.07.00",
    clientId: "7",
    userAgent: "Mozilla/5.0(SMART-TV; Linux; Tizen 4.0.0.2) AppleWebkit/605.1.15 (KHTML, like Gecko) SamsungBrowser/9.2 TV Safari/605.1.15",
    loginSupported: true,
    loginRequired: true,
    useSignatureTimestamp: true,
    useWebPoTokens: true,
  });

  static readonly TVHTML5_SAMSUNG = new YouTubeClient({
    clientName: "TVHTML5",
    clientVersion: "5.20260707",
    clientId: "7",
    userAgent: "Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/2.4.0 TV Safari/538.1",
    osName: "Tizen",
    osVersion: "2.4.0",
    deviceMake: "Samsung",
    deviceModel: "UKS9800",
    friendlyName: "TV (Samsung)",
    apiOrigin: ORIGIN_YOUTUBE,
    loginSupported: true,
    loginRequired: true,
    useSignatureTimestamp: true,
  });

  static readonly TVHTML5_DOWNGRADED = new YouTubeClient({
    clientName: "TVHTML5",
    clientVersion: "5.20260707",
    clientId: "7",
    userAgent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
    friendlyName: "TV (older)",
    apiOrigin: ORIGIN_YOUTUBE,
    loginSupported: true,
    loginRequired: true,
    useSignatureTimestamp: true,
  });

  static readonly WEB_EMBEDDED_PLAYER = new YouTubeClient({
    clientName: "WEB_EMBEDDED_PLAYER",
    clientVersion: "2.20260708.00.00",
    clientId: "56",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)",
    friendlyName: "Embedded player",
    apiOrigin: ORIGIN_YOUTUBE,
    loginSupported: true,
    loginRequired: true,
    useSignatureTimestamp: true,
    isEmbedded: true,
  });

  static readonly TVHTML5_SIMPLY_EMBEDDED_PLAYER = new YouTubeClient({
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    clientId: "85",
    userAgent: "Mozilla/5.0 (PlayStation; PlayStation 4/12.02) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15",
    loginSupported: true,
    loginRequired: false,
    useSignatureTimestamp: true,
    isEmbedded: true,
  });

  static readonly IOS = new YouTubeClient({
    clientName: "IOS",
    clientVersion: "21.03.1",
    clientId: "5",
    userAgent: "com.google.ios.youtube/21.03.1 (iPhone16,2; U; CPU iOS 18_2 like Mac OS X;)",
    osVersion: "18.2.22C152",
  });

  static readonly IPADOS = new YouTubeClient({
    clientName: "IOS",
    clientVersion: "21.03.3",
    clientId: "5",
    userAgent: "com.google.ios.youtube/21.03.3 (iPad7,6; U; CPU iPadOS 17_7_10 like Mac OS X; en-US)",
    osName: "iPadOS",
    osVersion: "17.7.10.21H450",
    deviceMake: "Apple",
    deviceModel: "iPad7,6",
    friendlyName: "iPadOS",
    loginSupported: false,
    useSignatureTimestamp: false,
    packageName: "com.google.ios.youtube",
  });

  static readonly MOBILE = new YouTubeClient({
    clientName: "ANDROID",
    clientVersion: "21.26.364",
    clientId: "3",
    userAgent: "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
    osName: "Android",
    osVersion: "11",
    loginSupported: true,
    useSignatureTimestamp: true,
  });

  static readonly ANDROID_VR_1_61_48 = new YouTubeClient({
    clientName: "ANDROID_VR",
    clientVersion: "1.61.48",
    clientId: "28",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
    osName: "Android",
    osVersion: "12",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: "32",
    buildId: "SQ3A.220605.009.A1",
    cronetVersion: "132.0.6808.3",
    packageName: "com.google.android.apps.youtube.vr.oculus",
    friendlyName: "Android VR 1.61",
    loginSupported: false,
    useSignatureTimestamp: false,
  });

  static readonly ANDROID_VR_1_65_10 = new YouTubeClient({
    clientName: "ANDROID_VR",
    clientVersion: "1.65.10",
    clientId: "28",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
    osName: "Android",
    osVersion: "12L",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: "32",
    buildId: "SQ3A.220605.009.A1",
    packageName: "com.google.android.apps.youtube.vr.oculus",
    friendlyName: "Android VR 1.65",
    loginSupported: false,
    useSignatureTimestamp: false,
  });

  static readonly ANDROID_VR_1_43_32 = new YouTubeClient({
    clientName: "ANDROID_VR",
    clientVersion: "1.43.32",
    clientId: "28",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.43.32 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)",
    osName: "Android",
    osVersion: "12",
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: "32",
    buildId: "SQ3A.220605.009.A1",
    cronetVersion: "107.0.5284.2",
    packageName: "com.google.android.apps.youtube.vr.oculus",
    friendlyName: "Android VR 1.43",
    loginSupported: false,
    useSignatureTimestamp: false,
  });

  static readonly ANDROID_VR_NO_AUTH = new YouTubeClient({
    clientName: "ANDROID_VR",
    clientVersion: "1.61.48",
    clientId: "28",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Oculus Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
    loginSupported: false,
    useSignatureTimestamp: false,
  });

  static readonly ANDROID_CREATOR = new YouTubeClient({
    clientName: "ANDROID_CREATOR",
    clientVersion: "25.03.101",
    clientId: "14",
    userAgent: "com.google.android.apps.youtube.creator/25.03.101 (Linux; U; Android 15; en_US; Pixel 9 Pro Fold; Build/AP3A.241005.015.A2; Cronet/132.0.6779.0)",
    osName: "Android",
    osVersion: "15",
    deviceMake: "Google",
    deviceModel: "Pixel 9 Pro Fold",
    androidSdkVersion: "35",
    buildId: "AP3A.241005.015.A2",
    cronetVersion: "132.0.6779.0",
    packageName: "com.google.android.apps.youtube.creator",
    friendlyName: "Android Studio",
    loginSupported: true,
    useSignatureTimestamp: true,
  });
}

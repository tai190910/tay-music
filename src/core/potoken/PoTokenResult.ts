// src/core/potoken/PoTokenResult.ts

export interface PoTokenResult {
  /**
   * The session-bound PoToken passed in InnerTube player requests
   * (serviceIntegrityDimensions.poToken).
   */
  playerRequestPoToken: string;

  /**
   * The video-bound PoToken appended to stream URLs (&pot=...).
   */
  streamingDataPoToken: string;
}

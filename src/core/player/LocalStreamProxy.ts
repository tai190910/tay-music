// src/core/player/LocalStreamProxy.ts

import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";

export function withRnParam(url: string, rn: number): string {
  if (/[?&]rn=\d+/.test(url)) {
    return url.replace(/([?&])rn=\d+/, `$1rn=${rn}`);
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}rn=${rn}`;
}

export class LocalStreamProxy {
  private server: http.Server | null = null;
  private port: number = 0;
  private isRunning: boolean = false;

  // Chunk size: 512 KB (524,288 bytes) matching Android ExoPlayer / ChunkDataSource
  private static readonly CHUNK_SIZE = 512 * 1024;

  async start(preferredPort: number = 0): Promise<number> {
    if (this.isRunning && this.server) {
      return this.port;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(preferredPort, "127.0.0.1", () => {
        const addr = this.server?.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
          this.isRunning = true;
          console.log(`[StreamProxy] Chunked audio proxy listening on http://127.0.0.1:${this.port}`);
          resolve(this.port);
        } else {
          reject(new Error("Failed to get stream proxy port"));
        }
      });

      this.server.on("error", (err: any) => {
        console.error("[StreamProxy] Server error:", err.message);
        if (!this.isRunning) {
          reject(err);
        }
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  getProxyUrl(
    targetUrl: string,
    clientName: string = "VISIONOS",
    contentLength?: number | string | null,
    mimeType?: string | null
  ): string {
    if (!this.isRunning || this.port === 0) {
      return targetUrl;
    }
    const encoded = encodeURIComponent(targetUrl);
    let proxyUrl = `http://127.0.0.1:${this.port}/stream?url=${encoded}&c=${encodeURIComponent(clientName)}`;
    if (contentLength) {
      proxyUrl += `&clen=${contentLength}`;
    }
    if (mimeType) {
      proxyUrl += `&mime=${encodeURIComponent(mimeType)}`;
    }
    return proxyUrl;
  }

  private async probeMetadata(
    url: string,
    userAgent: string
  ): Promise<{ contentLength: number; contentType: string }> {
    return new Promise((resolve, reject) => {
      const probeUrl = withRnParam(url, 0);
      const req = https.request(
        probeUrl,
        {
          method: "GET",
          headers: {
            "User-Agent": userAgent,
            "Range": "bytes=0-1",
            "Accept": "*/*",
            "Accept-Encoding": "identity",
          },
        },
        (res) => {
          res.resume(); // discard body

          const contentType = (res.headers["content-type"] as string) || "audio/webm";
          let totalLength = 0;

          // Parse Content-Range: bytes 0-1/4518360
          const cr = res.headers["content-range"];
          if (cr) {
            const m = cr.match(/\/(\d+)/);
            if (m) {
              totalLength = parseInt(m[1], 10);
            }
          }

          if (!totalLength && res.headers["content-length"]) {
            totalLength = parseInt(res.headers["content-length"] as string, 10);
          }

          resolve({
            contentLength: totalLength || 5 * 1024 * 1024,
            contentType,
          });
        }
      );

      req.on("error", (err) => {
        reject(err);
      });

      req.end();
    });
  }

  private fetchSingleChunk(
    chunkUrl: string,
    chunkRange: string,
    userAgent: string,
    onReqCreated: (req: http.ClientRequest) => void
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doRequest = (currentUrlStr: string, redirectCount = 0) => {
        if (redirectCount > 4) {
          return reject(new Error("Too many redirects from Google Video"));
        }

        const clientReq = https.request(
          currentUrlStr,
          {
            method: "GET",
            headers: {
              "User-Agent": userAgent,
              "Range": chunkRange,
              "Accept": "*/*",
              "Accept-Encoding": "identity",
              "Connection": "keep-alive",
            },
          },
          (upstreamRes) => {
            // Handle redirects (301, 302, 307, 308)
            if (
              upstreamRes.statusCode &&
              [301, 302, 303, 307, 308].includes(upstreamRes.statusCode) &&
              upstreamRes.headers.location
            ) {
              const nextUrl = new URL(upstreamRes.headers.location, currentUrlStr).toString();
              upstreamRes.resume();
              return doRequest(nextUrl, redirectCount + 1);
            }

            if (upstreamRes.statusCode !== 200 && upstreamRes.statusCode !== 206) {
              upstreamRes.resume();
              return reject(new Error(`Google Video returned HTTP ${upstreamRes.statusCode} for ${chunkRange}`));
            }

            const buffers: Buffer[] = [];
            upstreamRes.on("data", (chunk: Buffer) => {
              buffers.push(chunk);
            });
            upstreamRes.on("end", () => {
              resolve(Buffer.concat(buffers));
            });
            upstreamRes.on("error", (err) => {
              reject(err);
            });
          }
        );

        onReqCreated(clientReq);

        clientReq.on("error", (err) => {
          reject(err);
        });

        clientReq.end();
      };

      doRequest(chunkUrl, 0);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers for HTML5 Audio
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Accept, Accept-Encoding");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    res.setHeader("Accept-Ranges", "bytes");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!req.url?.startsWith("/stream")) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    try {
      const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
      const targetUrl = parsedUrl.searchParams.get("url");
      const clientName = parsedUrl.searchParams.get("c") || "VISIONOS";
      const clenParam = parsedUrl.searchParams.get("clen");
      const mimeParam = parsedUrl.searchParams.get("mime");

      if (!targetUrl) {
        res.writeHead(400);
        res.end("Missing target url parameter");
        return;
      }

      // Enforce the client User-Agent
      const userAgent =
        clientName === "VISIONOS"
          ? "com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; US)"
          : clientName.startsWith("ANDROID_VR")
          ? "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; Quest 2) gzip"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

      let totalLength = clenParam ? parseInt(clenParam, 10) : 0;

      // Clean Content-Type to standard audio/webm or audio/mp4 for HTML5 Audio compatibility
      let contentType = "audio/webm";
      const rawMime =
        mimeParam ||
        (() => {
          try {
            return new URL(targetUrl).searchParams.get("mime");
          } catch {
            return null;
          }
        })();

      if (rawMime) {
        const decoded = decodeURIComponent(rawMime).toLowerCase();
        if (decoded.includes("mp4") || decoded.includes("m4a") || decoded.includes("aac")) {
          contentType = "audio/mp4";
        } else {
          contentType = "audio/webm";
        }
      }

      // If length is not in clen param, check if targetUrl already has clen
      if (!totalLength || totalLength <= 0) {
        try {
          const clenFromTarget = new URL(targetUrl).searchParams.get("clen");
          if (clenFromTarget) {
            totalLength = parseInt(clenFromTarget, 10);
          }
        } catch {}
      }

      // If length is still unknown, probe it
      if (!totalLength || totalLength <= 0) {
        try {
          const probed = await this.probeMetadata(targetUrl, userAgent);
          totalLength = probed.contentLength;
          if (!rawMime && probed.contentType) {
            contentType = probed.contentType.toLowerCase().includes("mp4") ? "audio/mp4" : "audio/webm";
          }
        } catch (err: any) {
          console.warn("[StreamProxy] Metadata probe failed, using default length:", err.message);
          totalLength = 5 * 1024 * 1024;
        }
      }

      // Parse requested range
      const rangeHeader = req.headers["range"];
      let startByte = 0;
      let endByte = totalLength - 1;

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
        if (match) {
          startByte = parseInt(match[1], 10);
          if (match[2]) {
            endByte = parseInt(match[2], 10);
          }
        }
      }

      // Constrain endByte
      if (endByte >= totalLength) {
        endByte = totalLength - 1;
      }
      if (startByte > endByte) {
        res.writeHead(416, {
          "Content-Range": `bytes */${totalLength}`,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
        });
        res.end();
        return;
      }

      const requestedLength = endByte - startByte + 1;

      // Handle HEAD request
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": totalLength,
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
        });
        res.end();
        return;
      }

      const isRanged = !!rangeHeader;
      const statusCode = isRanged ? 206 : 200;
      const responseHeaders: Record<string, string | number> = {
        "Content-Type": contentType,
        "Content-Length": requestedLength,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Accept, Accept-Encoding",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
      };

      if (isRanged) {
        responseHeaders["Content-Range"] = `bytes ${startByte}-${endByte}/${totalLength}`;
      }

      res.writeHead(statusCode, responseHeaders);
      res.flushHeaders();

      console.log(`[StreamProxy] New stream session: range=${startByte}-${endByte} (${requestedLength} bytes, total ${totalLength}, type=${contentType}, status=${statusCode})`);

      // ================== CHUNKED STREAMING LOOP ==================
      let currentOffset = startByte;
      let rn = Math.floor(startByte / LocalStreamProxy.CHUNK_SIZE);
      let isClientClosed = false;
      let activeReq: http.ClientRequest | null = null;

      req.on("close", () => {
        isClientClosed = true;
        if (activeReq) {
          activeReq.destroy();
        }
      });

      while (currentOffset <= endByte && !isClientClosed) {
        const chunkEnd = Math.min(currentOffset + LocalStreamProxy.CHUNK_SIZE - 1, endByte);
        const chunkRange = `bytes=${currentOffset}-${chunkEnd}`;
        const chunkUrl = withRnParam(targetUrl, rn);

        let chunkBuffer: Buffer | null = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && !chunkBuffer && !isClientClosed) {
          attempts++;
          try {
            chunkBuffer = await this.fetchSingleChunk(chunkUrl, chunkRange, userAgent, (r) => {
              activeReq = r;
            });
          } catch (err: any) {
            console.warn(`[StreamProxy] Chunk [rn=${rn}] attempt ${attempts} failed: ${err.message}`);
            if (attempts < maxAttempts && !isClientClosed) {
              await new Promise((resolve) => setTimeout(resolve, attempts * 300));
            }
          }
        }

        if (!chunkBuffer || isClientClosed) {
          if (!isClientClosed) {
            console.error(`[StreamProxy] Chunk [rn=${rn}] failed permanently after ${maxAttempts} attempts.`);
          }
          break;
        }

        const pct = Math.round((chunkEnd / totalLength) * 100);
        console.log(`[StreamProxy] Pumped chunk [rn=${rn}] (${chunkBuffer.length} bytes, offset ${currentOffset}-${chunkEnd}, ${pct}%)`);

        // Write chunk into the open response stream to <audio>
        const canWriteMore = res.write(chunkBuffer);
        if (!canWriteMore && !isClientClosed) {
          await new Promise<void>((resolve) => {
            res.once("drain", resolve);
          });
        }

        currentOffset = chunkEnd + 1;
        rn++;
      }

      if (!isClientClosed) {
        res.end();
        console.log(`[StreamProxy] Stream completed successfully (${totalLength} bytes transferred)`);
      }
    } catch (err: any) {
      console.error("[StreamProxy] Handler error:", err.message);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    }
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.isRunning = false;
    }
  }
}

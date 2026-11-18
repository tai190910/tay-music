// src/core/cipher/FunctionNameExtractor.ts

export interface SigFunctionInfo {
  name: string;
  constantArg?: number | null;
}

export interface NFunctionInfo {
  name: string;
  arrayIndex?: number | null;
}

export class FunctionNameExtractor {
  private static readonly SIG_FUNCTION_PATTERNS: RegExp[] = [
    /&&\s*\(\s*[a-zA-Z0-9$]+\s*=\s*([a-zA-Z0-9$]+)\s*\(\s*(\d+)\s*,\s*decodeURIComponent\s*\(\s*[a-zA-Z0-9$]+\s*\)/,
    /\b[cs]\s*&&\s*[adf]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
    /\b[a-zA-Z0-9]+\s*&&\s*[a-zA-Z0-9]+\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
    /\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)/,
    /\bc\s*&&\s*d\.set\([^,]+\s*,\s*(?:encodeURIComponent\s*\()([a-zA-Z0-9$]+)\(/,
    /\bc\s*&&\s*[a-z]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
    /(?:[\b;]|var\s+)([a-zA-Z0-9$]+)\s*=\s*function\(a\)\{a\s*=\s*a\.split\(""\);/,
    /function\s+([a-zA-Z0-9$]+)\(a\)\{a\s*=\s*a\.split\(""\);/,
    /([a-zA-Z0-9$]+)\s*=\s*function\([a-zA-Z0-9$]+\)\{[a-zA-Z0-9$]+\s*=\s*[a-zA-Z0-9$]+\.split\(""\);/,
  ];

  private static readonly N_FUNCTION_PATTERNS: RegExp[] = [
    /\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(([a-zA-Z0-9])\)/,
    /\.get\("n"\)\)\s*&&\s*\(([a-zA-Z0-9$]+)\s*=\s*([a-zA-Z0-9$]+)(?:\[(\d+)\])?\(\1\)/,
    /\(\s*([a-zA-Z0-9$]+)\s*=\s*String\.fromCharCode\(110\)/,
    /([a-zA-Z0-9$]+)\s*=\s*function\([a-zA-Z0-9]\)\s*\{[^}]*?enhanced_except_/,
  ];

  static extractSigFunctionInfo(playerJs: string): SigFunctionInfo | null {
    for (let i = 0; i < this.SIG_FUNCTION_PATTERNS.length; i++) {
      const match = playerJs.match(this.SIG_FUNCTION_PATTERNS[i]);
      if (match) {
        const name = match[1];
        const constArg = match[2] ? parseInt(match[2], 10) : null;
        return { name, constantArg: isNaN(constArg as any) ? null : constArg };
      }
    }
    return null;
  }

  static extractNFunctionInfo(playerJs: string): NFunctionInfo | null {
    for (let i = 0; i < this.N_FUNCTION_PATTERNS.length; i++) {
      const match = playerJs.match(this.N_FUNCTION_PATTERNS[i]);
      if (match) {
        if (i === 0) {
          const name = match[1];
          const arrayIdx = match[2] ? parseInt(match[2], 10) : null;
          return { name, arrayIndex: isNaN(arrayIdx as any) ? null : arrayIdx };
        } else if (i === 1) {
          const name = match[2];
          const arrayIdx = match[3] ? parseInt(match[3], 10) : null;
          return { name, arrayIndex: isNaN(arrayIdx as any) ? null : arrayIdx };
        } else {
          return { name: match[1], arrayIndex: null };
        }
      }
    }
    return null;
  }
}

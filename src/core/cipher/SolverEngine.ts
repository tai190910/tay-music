// src/core/cipher/SolverEngine.ts

import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { fileURLToPath } from "node:url";
import { FunctionNameExtractor, type SigFunctionInfo, type NFunctionInfo } from "./FunctionNameExtractor.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SolverEngine {
  private static jscFunction: any = null;
  private static cachedPlayerHash: string | null = null;
  private static cachedNSolver: ((n: string) => string) | null = null;
  private static cachedSigSolver: ((sig: string) => string) | null = null;

  private static getSolverDir(): string {
    // 1. Packaged extraResources: <exe_dir>/resources/solver
    if (process.resourcesPath) {
      const extraResDir = path.join(process.resourcesPath, "solver");
      if (fs.existsSync(path.join(extraResDir, "yt.solver.core.js"))) {
        return extraResDir;
      }
      // 2. asarUnpack location
      const unpackedDir = path.join(process.resourcesPath, "app.asar.unpacked", "dist-electron", "solver");
      if (fs.existsSync(path.join(unpackedDir, "yt.solver.core.js"))) {
        return unpackedDir;
      }
    }

    // 3. dist-electron/solver
    const distSolver = path.resolve(__dirname, "solver");
    if (fs.existsSync(path.join(distSolver, "yt.solver.core.js"))) {
      return distSolver;
    }

    // 4. Relative to current file: ../solver
    const relSolver = path.resolve(__dirname, "../solver");
    if (fs.existsSync(path.join(relSolver, "yt.solver.core.js"))) {
      return relSolver;
    }

    // 5. CWD fallback
    const cwdSolver = path.resolve(process.cwd(), "src/core/solver");
    if (fs.existsSync(path.join(cwdSolver, "yt.solver.core.js"))) {
      return cwdSolver;
    }

    return path.resolve(__dirname, "../solver");
  }

  private static initJsc(): any {
    if (this.jscFunction) return this.jscFunction;

    const solverDir = this.getSolverDir();
    const meriyahPath = path.join(solverDir, "meriyah.js");
    const astringPath = path.join(solverDir, "astring.js");
    const ytSolverPath = path.join(solverDir, "yt.solver.core.js");

    if (!fs.existsSync(meriyahPath) || !fs.existsSync(astringPath) || !fs.existsSync(ytSolverPath)) {
      console.warn("[SolverEngine] Solver JS files not found in:", solverDir);
      return null;
    }

    try {
      const meriyahCode = fs.readFileSync(meriyahPath, "utf-8");
      const astringCode = fs.readFileSync(astringPath, "utf-8");
      const ytSolverCode = fs.readFileSync(ytSolverPath, "utf-8");

      const sandbox: Record<string, any> = { console };
      vm.createContext(sandbox);
      vm.runInContext(meriyahCode, sandbox);
      vm.runInContext(astringCode, sandbox);
      vm.runInContext(ytSolverCode, sandbox);

      if (typeof sandbox.jsc === "function") {
        this.jscFunction = sandbox.jsc;
        return this.jscFunction;
      }
    } catch (err: any) {
      console.error("[SolverEngine] Failed to initialize jsc solver:", err.message);
    }
    return null;
  }

  static initializeForPlayer(playerJs: string, playerHash: string): boolean {
    if (this.cachedPlayerHash === playerHash && (this.cachedNSolver || this.cachedSigSolver)) {
      return true;
    }

    this.cachedPlayerHash = playerHash;
    this.cachedNSolver = null;
    this.cachedSigSolver = null;

    // 1. Try EJS / yt.solver.core.js preprocessing
    const jsc = this.initJsc();
    if (jsc) {
      try {
        const jscRes = jsc({
          type: "player",
          player: playerJs,
          requests: [],
          output_preprocessed: true,
        });

        if (jscRes && jscRes.type !== "error" && jscRes.preprocessed_player) {
          const resultObj: { n: any; sig: any } = { n: null, sig: null };
          const runner = new Function("_result", jscRes.preprocessed_player);
          runner(resultObj);

          if (typeof resultObj.n === "function") {
            this.cachedNSolver = resultObj.n;
          }
          if (typeof resultObj.sig === "function") {
            this.cachedSigSolver = resultObj.sig;
          }

          if (this.cachedNSolver || this.cachedSigSolver) {
            return true;
          }
        }
      } catch (err: any) {
        // Fallback to VM extraction
      }
    }

    // 2. Fallback: FunctionNameExtractor + VM sandbox
    try {
      const sigInfo = FunctionNameExtractor.extractSigFunctionInfo(playerJs);
      const nFuncInfo = FunctionNameExtractor.extractNFunctionInfo(playerJs);

      const exportsList: string[] = [];
      if (sigInfo?.name) {
        exportsList.push(`window._cipherSigFunc = typeof ${sigInfo.name} !== 'undefined' ? ${sigInfo.name} : null;`);
      }
      if (nFuncInfo?.name) {
        const nExpr = nFuncInfo.arrayIndex != null ? `${nFuncInfo.name}[${nFuncInfo.arrayIndex}]` : nFuncInfo.name;
        exportsList.push(`window._nTransformFunc = typeof ${nFuncInfo.name} !== 'undefined' ? ${nExpr} : null;`);
      }

      let modifiedJs = playerJs;
      if (exportsList.length > 0) {
        const exportCode = "; " + exportsList.join(" ");
        modifiedJs = playerJs.replace("})(_yt_player);", `${exportCode} })(_yt_player);`);
      }

      const sandbox: Record<string, any> = {
        window: {},
        document: {},
        console,
        location: { href: "https://www.youtube.com" },
      };
      sandbox.window = sandbox;

      vm.createContext(sandbox);
      vm.runInContext(modifiedJs, sandbox, { timeout: 5000 });

      if (sandbox.window._nTransformFunc && typeof sandbox.window._nTransformFunc === "function") {
        this.cachedNSolver = (n: string) => sandbox.window._nTransformFunc(n);
      }
      if (sandbox.window._cipherSigFunc && typeof sandbox.window._cipherSigFunc === "function") {
        this.cachedSigSolver = (sig: string) => {
          if (sigInfo?.constantArg != null) {
            return sandbox.window._cipherSigFunc(sigInfo.constantArg, sig);
          }
          return sandbox.window._cipherSigFunc(sig);
        };
      }
    } catch (err: any) {
      // Ignored
    }

    return this.cachedNSolver != null || this.cachedSigSolver != null;
  }

  static transformN(nValue: string): string {
    if (this.cachedNSolver) {
      try {
        const result = this.cachedNSolver(nValue);
        if (typeof result === "string" && result.length > 0) {
          return result;
        }
      } catch (err: any) {
        console.warn("[SolverEngine] n-transform threw:", err.message);
      }
    }
    return nValue;
  }

  static deobfuscateSig(obfuscatedSig: string): string | null {
    if (this.cachedSigSolver) {
      try {
        const result = this.cachedSigSolver(obfuscatedSig);
        if (typeof result === "string" && result.length > 0) {
          return result;
        }
      } catch (err: any) {
        console.warn("[SolverEngine] sig deobfuscation threw:", err.message);
      }
    }
    return null;
  }
}

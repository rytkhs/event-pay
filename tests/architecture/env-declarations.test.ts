import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 環境変数の3者（コードの参照 / env.d.ts の宣言 / .env.example の記載）が
 * 一致していることを検証する。
 *
 * `@types/node` の `interface ProcessEnv extends Dict<string>` により、未宣言の
 * 変数も `string | undefined` として通ってしまうため、宣言漏れは typecheck では
 * 検出できない。乖離の再発を止められるのはこのテストだけである。
 *
 * 変数の「値」は検証しない。ここで固定するのはキー名の集合だけで、必須性や
 * 形式の検証は各利用箇所の責務とする。
 *
 * 対象は `git ls-files` が返す追跡済みファイルに限る。`readdirSync` で再帰すると
 * ローカルにだけ存在する未追跡ファイルを拾い、CIとローカルで結果が変わる。
 *
 * 抽出には TypeScript の AST を使う。正規表現ではコメントや文字列に現れた
 * `process.env.X` を実際の参照と区別できず、誤検出と検出漏れの両方が起きる。
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 走査対象の拡張子。設定ファイル（next.config.mjs 等）も環境変数を読むため含める */
const SOURCE_EXTENSIONS = ["*.ts", "*.tsx", "*.mts", "*.cts", "*.js", "*.mjs", "*.cjs"];

/**
 * コードに直接の参照がないが宣言を残す変数。
 * 依存ライブラリが `process.env` から暗黙に読むものに限る。
 */
const INDIRECT_USE: Record<string, string> = {
  QSTASH_URL: "@upstash/qstash の Client が baseUrl の決定に使用する",
  QSTASH_REGION: "@upstash/qstash がリージョン別の資格情報を探索するために使用する",
};

/** `.env.example` に載せない変数と、その理由 */
const NOT_IN_ENV_EXAMPLE: Record<string, string> = {
  NODE_ENV: "実行環境（Next.js / Vitest）が供給するため、利用者が設定するものではない",
  SENTRY_RELEASE: "deploy スクリプトが --var で注入するため、利用者が設定するものではない",
  ANALYZE: "バンドル解析時にコマンドへ都度渡すトグルで、.env.local に置くものではない",
  LINT_NO_CYCLE: "循環参照チェック時にコマンドへ都度渡すトグルで、.env.local に置くものではない",
};

/** 追跡済みのソースと設定ファイルを列挙する */
function listSourceFiles(): string[] {
  const stdout = execFileSync("git", ["ls-files", "-z", "--", ...SOURCE_EXTENSIONS], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  return stdout.split("\0").filter((path) => path !== "");
}

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function scriptKindOf(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** `process.env` そのものを指す式か */
function isProcessEnv(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  );
}

interface RequireEnvCall {
  /** 第1引数の `process.env.X` から読んだ変数名 */
  readName: string;
  /** 第2引数に渡された文字列リテラル */
  declaredName: string;
}

interface FileAnalysis {
  path: string;
  /** `process.env.NAME` で参照された変数名 */
  names: Set<string>;
  /** 静的に追跡できない参照（`process.env[...]`、分割代入、別名への束縛）を含むか */
  hasOpaqueAccess: boolean;
  /** `requireEnv(process.env.X, "Y", ...)` の呼び出し */
  requireEnvCalls: RequireEnvCall[];
}

/** `requireEnv(process.env.X, "Y", ...)` から2つの名前を取り出す */
function readRequireEnvCall(node: ts.CallExpression): RequireEnvCall | null {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "requireEnv") return null;

  const [valueArgument, nameArgument] = node.arguments;
  if (!valueArgument || !nameArgument) return null;
  if (!ts.isPropertyAccessExpression(valueArgument) || !isProcessEnv(valueArgument.expression)) {
    return null;
  }
  if (!ts.isStringLiteral(nameArgument)) return null;

  return { readName: valueArgument.name.text, declaredName: nameArgument.text };
}

function analyze(path: string): FileAnalysis {
  const source = ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindOf(path)
  );

  const names = new Set<string>();
  const requireEnvCalls: RequireEnvCall[] = [];
  let hasOpaqueAccess = false;

  const visit = (node: ts.Node): void => {
    if (isProcessEnv(node)) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        names.add(parent.name.text);
      } else {
        // process.env[...] / const { X } = process.env / 別名への束縛
        hasOpaqueAccess = true;
      }
    }

    if (ts.isCallExpression(node)) {
      const call = readRequireEnvCall(node);
      if (call) requireEnvCalls.push(call);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return { path, names, hasOpaqueAccess, requireEnvCalls };
}

/** `.d.ts` の interface 本体からプロパティ名を集める */
function collectDeclaredNames(relativePath: string, interfaceName: string): Set<string> {
  const content = read(relativePath);
  const start = content.indexOf(`interface ${interfaceName} {`);
  if (start === -1) {
    throw new Error(`${relativePath} に interface ${interfaceName} が見つかりません`);
  }

  const body = content.slice(start);
  const names = new Set<string>();
  for (const [, name] of body.matchAll(/^\s{2,}([A-Z][A-Z0-9_]*)\??:/gm)) {
    if (name) names.add(name);
  }
  return names;
}

/** `.env.example` のキーを集める */
function collectEnvExampleNames(): Set<string> {
  const names = new Set<string>();
  for (const rawLine of read(".env.example").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    names.add(line.slice(0, separatorIndex).trim());
  }
  return names;
}

const SOURCE_FILES = listSourceFiles().map(analyze);

const referenced = new Set(SOURCE_FILES.flatMap((file) => [...file.names]));
const processEnvDeclared = collectDeclaredNames("env.d.ts", "ProcessEnv");
const cloudflareEnvDeclared = collectDeclaredNames("types/cloudflare.d.ts", "CloudflareEnv");
const envExample = collectEnvExampleNames();

const sorted = (names: Iterable<string>): string[] => [...names].sort();

describe("環境変数の宣言と実使用", () => {
  it("追跡済みのソースと設定ファイルを走査している", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    expect(referenced.size).toBeGreaterThan(0);

    // ディレクトリ配下だけでなく、ルート直下の設定ファイルも対象に含まれていること
    const paths = SOURCE_FILES.map((file) => file.path);
    expect(paths).toContain("next.config.mjs");
    expect(paths).toContain("sentry-worker.ts");
  });

  it("コードが読む変数はすべて env.d.ts に宣言されている", () => {
    const undeclared = sorted(referenced).filter((name) => !processEnvDeclared.has(name));

    expect(undeclared, `env.d.ts に宣言を追加してください: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("env.d.ts の宣言はコードから参照されている", () => {
    const unused = sorted(processEnvDeclared).filter(
      (name) => !referenced.has(name) && !(name in INDIRECT_USE)
    );

    expect(
      unused,
      `env.d.ts から削除するか、依存ライブラリが読むものなら INDIRECT_USE に理由付きで登録してください: ${unused.join(", ")}`
    ).toEqual([]);
  });

  it(".env.example の記載が宣言と一致している", () => {
    const expected = sorted(
      [...processEnvDeclared, ...cloudflareEnvDeclared].filter(
        (name) => !(name in NOT_IN_ENV_EXAMPLE)
      )
    );

    const missing = expected.filter((name) => !envExample.has(name));
    const extra = sorted(envExample).filter((name) => !expected.includes(name));

    expect(missing, `.env.example に追記してください: ${missing.join(", ")}`).toEqual([]);
    expect(extra, `.env.example から削除してください: ${extra.join(", ")}`).toEqual([]);
  });

  it("requireEnv に渡す変数名が読み出した変数と一致している", () => {
    // requireEnv は値と名前を別々の引数で受け取るため、型では一致を保証できない。
    // ずれると監査ログの variable_name が実際に欠けている変数と食い違う。
    const mismatched = SOURCE_FILES.flatMap((file) =>
      file.requireEnvCalls
        .filter((call) => call.readName !== call.declaredName)
        .map((call) => `${file.path}: process.env.${call.readName} に "${call.declaredName}"`)
    );

    expect(mismatched, `requireEnv の引数が食い違っています: ${mismatched.join(", ")}`).toEqual([]);
  });

  it("process.env への動的アクセスを含まない", () => {
    // 動的アクセスは抽出漏れになるだけでなく、Next.js が NEXT_PUBLIC_* を
    // ビルド時にインライン展開できずブラウザ側で undefined になる。
    //
    // この検査は本来 ESLint の責務だが、lint の対象がディレクトリ指定で
    // middleware.ts / sentry-worker.ts / *.mjs を含まないため暫定的にここに置く。
    // lint の対象拡張とあわせて移設する（#582）。
    const offenders = SOURCE_FILES.filter((file) => file.hasOpaqueAccess).map((file) => file.path);

    expect(
      offenders,
      `process.env[...] と分割代入は使えません。process.env.NAME の字面で参照してください: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});

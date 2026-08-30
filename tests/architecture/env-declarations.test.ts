import { readFileSync, readdirSync } from "node:fs";
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
 * 抽出には TypeScript の AST を使う。正規表現ではコメントや文字列に現れた
 * `process.env.X` を実際の参照と区別できず、誤検出と検出漏れの両方が起きる。
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 走査対象。Worker のエントリと middleware を含める */
const SOURCE_ROOTS = ["app", "core", "features", "types", "middleware.ts", "sentry-worker.ts"];

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

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
};

function listSourceFiles(): string[] {
  const files: string[] = [];

  const walk = (absolute: string, relative: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const childAbsolute = join(absolute, entry.name);
      const childRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(childAbsolute, childRelative);
      } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        files.push(childRelative);
      }
    }
  };

  for (const root of SOURCE_ROOTS) {
    if (SOURCE_EXTENSIONS.some((extension) => root.endsWith(extension))) {
      files.push(root);
      continue;
    }
    walk(join(REPO_ROOT, root), root);
  }

  return files;
}

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
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

interface FileAnalysis {
  path: string;
  /** `process.env.NAME` で参照された変数名 */
  names: Set<string>;
  /** 静的に追跡できない参照（`process.env[...]`、分割代入、別名への束縛）を含むか */
  hasOpaqueAccess: boolean;
}

function analyze(path: string): FileAnalysis {
  const source = ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const names = new Set<string>();
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
    ts.forEachChild(node, visit);
  };

  visit(source);
  return { path, names, hasOpaqueAccess };
}

const SOURCE_FILES = listSourceFiles().map(analyze);

function collectReferencedNames(): Set<string> {
  const names = new Set<string>();
  for (const file of SOURCE_FILES) {
    for (const name of file.names) {
      names.add(name);
    }
  }
  return names;
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

const referenced = collectReferencedNames();
const processEnvDeclared = collectDeclaredNames("env.d.ts", "ProcessEnv");
const cloudflareEnvDeclared = collectDeclaredNames("types/cloudflare.d.ts", "CloudflareEnv");
const envExample = collectEnvExampleNames();

const sorted = (names: Iterable<string>): string[] => [...names].sort();

describe("環境変数の宣言と実使用", () => {
  it("走査対象のソースを読み込めている", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    expect(referenced.size).toBeGreaterThan(0);
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

  it("process.env への動的アクセスを含まない", () => {
    // 動的アクセスは抽出漏れになるだけでなく、Next.js が NEXT_PUBLIC_* を
    // ビルド時にインライン展開できずブラウザ側で undefined になる。
    const offenders = SOURCE_FILES.filter((file) => file.hasOpaqueAccess).map((file) => file.path);

    expect(
      offenders,
      `process.env[...] と分割代入は使えません。process.env.NAME の字面で参照してください: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});

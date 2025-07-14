import { sanitizeHtml, sanitizeEventDescription } from '@/lib/utils/sanitize';

describe('sanitizeHtml', () => {
  it('HTMLタグを完全に除去する', () => {
    const input = '<script>alert("XSS")</script>Hello World';
    const result = sanitizeHtml(input);
    expect(result).toBe('Hello World');
  });

  it('複数のHTMLタグを除去する', () => {
    const input = '<div><p>Hello</p><span>World</span></div>';
    const result = sanitizeHtml(input);
    expect(result).toBe('HelloWorld');
  });

  it('自己終了タグを除去する', () => {
    const input = 'Hello<br/>World<img src="test.jpg"/>Test';
    const result = sanitizeHtml(input);
    expect(result).toBe('HelloWorldTest');
  });

  it('悪意のあるスクリプトタグを除去する', () => {
    const input = '<script>document.cookie</script>Safe Content';
    const result = sanitizeHtml(input);
    expect(result).toBe('Safe Content');
  });

  it('img onerror攻撃を防ぐ', () => {
    const input = '<img src="x" onerror="alert(1)">Content';
    const result = sanitizeHtml(input);
    expect(result).toBe('Content');
  });

  it('通常のテキストはそのまま返す', () => {
    const input = 'Hello World 123';
    const result = sanitizeHtml(input);
    expect(result).toBe('Hello World 123');
  });

  it('空文字列を適切に処理する', () => {
    const result = sanitizeHtml('');
    expect(result).toBe('');
  });

  it('null/undefinedを適切に処理する', () => {
    // @ts-ignore
    expect(sanitizeHtml(null)).toBe('');
    // @ts-ignore
    expect(sanitizeHtml(undefined)).toBe('');
  });
});

describe('sanitizeEventDescription', () => {
  it('改行を保持しながらHTMLタグを除去する', () => {
    const input = '<p>Hello</p>\n<div>World</div>';
    const result = sanitizeEventDescription(input);
    expect(result).toBe('Hello\nWorld');
  });

  it('XSS攻撃を防ぐ', () => {
    const input = '<script>alert("XSS")</script>\nイベントの説明です';
    const result = sanitizeEventDescription(input);
    expect(result).toBe('\nイベントの説明です');
  });

  it('通常のテキストはそのまま返す', () => {
    const input = 'イベントの説明です\n開催日時: 2024-01-01';
    const result = sanitizeEventDescription(input);
    expect(result).toBe('イベントの説明です\n開催日時: 2024-01-01');
  });

  it('空文字列を適切に処理する', () => {
    const result = sanitizeEventDescription('');
    expect(result).toBe('');
  });

  it('null/undefinedを適切に処理する', () => {
    // @ts-ignore
    expect(sanitizeEventDescription(null)).toBe('');
    // @ts-ignore
    expect(sanitizeEventDescription(undefined)).toBe('');
  });
});

describe('XSS攻撃パターンのテスト', () => {
  const xssPatterns = [
    '<script>alert("XSS")</script>',
    '<img src="x" onerror="alert(1)">',
    '<svg onload="alert(1)">',
    '<iframe src="javascript:alert(1)">',
    '<object data="javascript:alert(1)">',
    '<embed src="javascript:alert(1)">',
    '<link rel="stylesheet" href="javascript:alert(1)">',
    '<style>@import "javascript:alert(1)";</style>',
    '<div onclick="alert(1)">',
    '<a href="javascript:alert(1)">',
  ];

  xssPatterns.forEach((pattern, index) => {
    it(`XSS攻撃パターン ${index + 1} を防ぐ: ${pattern}`, () => {
      const input = `${pattern}Safe Content`;
      const result = sanitizeHtml(input);
      expect(result).toBe('Safe Content');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });
  });
});
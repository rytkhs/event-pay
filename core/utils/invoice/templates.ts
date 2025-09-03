/**
 * 請求書・レシートテンプレート
 * 将来の課税事業者対応のため、税額表示プレースホルダを含む
 */

/** 税額表示情報 */
export interface TaxDisplayInfo {
  /** 税率（%表示用）*/
  taxRatePercent: number;
  /** 税抜金額（円） */
  amountExcludingTax: number;
  /** 税額（円） */
  taxAmount: number;
  /** 内税かどうか */
  isTaxIncluded: boolean;
  /** 適格請求書発行事業者登録番号（T番号） */
  invoiceNumber?: string;
}

/** プラットフォーム手数料の請求書項目 */
export interface PlatformFeeInvoiceItem {
  /** 決済金額 */
  paymentAmount: number;
  /** プラットフォーム手数料（税込） */
  feeAmount: number;
  /** 税額情報 */
  taxInfo: TaxDisplayInfo;
  /** 決済日 */
  paymentDate: string;
  /** イベント名 */
  eventName: string;
  /** 参加者名 */
  participantName: string;
}

/** 請求書データ */
export interface InvoiceData {
  /** 請求書番号 */
  invoiceNumber: string;
  /** 発行日 */
  issueDate: string;
  /** 支払期限 */
  dueDate: string;
  /** 宛先情報 */
  billTo: {
    name: string;
    email: string;
    address?: string;
  };
  /** 発行者情報 */
  billFrom: {
    businessName: string;
    address: string;
    email: string;
    invoiceRegistrationNumber?: string; // T番号
  };
  /** 明細項目 */
  items: PlatformFeeInvoiceItem[];
  /** 合計情報 */
  totals: {
    subtotalExcludingTax: number;
    totalTaxAmount: number;
    totalAmount: number;
  };
}

/**
 * プラットフォーム手数料の請求書HTMLを生成
 * @param data 請求書データ
 * @returns HTML文字列
 */
export function generateInvoiceHTML(data: InvoiceData): string {
  const { billTo, billFrom, items, totals } = data;

  // MVP段階では税額は0円として表示
  const showTaxDetails = totals.totalTaxAmount > 0;

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>請求書 - ${data.invoiceNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .invoice-title { font-size: 28px; font-weight: bold; color: #333; }
    .invoice-number { font-size: 18px; color: #666; margin-top: 8px; }
    .bill-info { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .bill-section { width: 45%; }
    .bill-section h3 { font-size: 16px; font-weight: bold; margin-bottom: 8px; border-bottom: 2px solid #333; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items-table th, .items-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    .items-table th { background-color: #f8f9fa; font-weight: bold; }
    .amount { text-align: right; }
    .totals { width: 300px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .totals-row.total { font-weight: bold; font-size: 18px; border-top: 2px solid #333; }
    .tax-notice { margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #007bff; }
    .footer { margin-top: 40px; font-size: 12px; color: #666; }
    ${showTaxDetails ? "" : ".tax-hidden { display: none; }"}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="invoice-title">請求書</div>
      <div class="invoice-number">${data.invoiceNumber}</div>
    </div>
    <div>
      <div>発行日: ${data.issueDate}</div>
      <div>支払期限: ${data.dueDate}</div>
    </div>
  </div>

  <div class="bill-info">
    <div class="bill-section">
      <h3>請求先</h3>
      <div>${billTo.name}</div>
      <div>${billTo.email}</div>
      ${billTo.address ? `<div>${billTo.address}</div>` : ""}
    </div>
    <div class="bill-section">
      <h3>請求元</h3>
      <div>${billFrom.businessName}</div>
      <div>${billFrom.address}</div>
      <div>${billFrom.email}</div>
      ${billFrom.invoiceRegistrationNumber ? `<div class="tax-hidden">適格請求書発行事業者登録番号: ${billFrom.invoiceRegistrationNumber}</div>` : ""}
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>イベント名</th>
        <th>参加者</th>
        <th>決済日</th>
        <th class="amount">決済金額</th>
        <th class="amount">手数料${showTaxDetails ? "（税込）" : ""}</th>
        <th class="amount tax-hidden">税抜手数料</th>
        <th class="amount tax-hidden">消費税</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item) => `
        <tr>
          <td>${item.eventName}</td>
          <td>${item.participantName}</td>
          <td>${item.paymentDate}</td>
          <td class="amount">¥${item.paymentAmount.toLocaleString()}</td>
          <td class="amount">¥${item.feeAmount.toLocaleString()}</td>
          <td class="amount tax-hidden">¥${item.taxInfo.amountExcludingTax.toLocaleString()}</td>
          <td class="amount tax-hidden">¥${item.taxInfo.taxAmount.toLocaleString()}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row tax-hidden">
      <span>小計（税抜）:</span>
      <span>¥${totals.subtotalExcludingTax.toLocaleString()}</span>
    </div>
    <div class="totals-row tax-hidden">
      <span>消費税:</span>
      <span>¥${totals.totalTaxAmount.toLocaleString()}</span>
    </div>
    <div class="totals-row total">
      <span>合計:</span>
      <span>¥${totals.totalAmount.toLocaleString()}</span>
    </div>
  </div>

  ${
    showTaxDetails
      ? `
  <div class="tax-notice">
    <strong>消費税について</strong><br>
    当請求書は消費税法に基づく適格請求書です。内税方式で計算されており、消費税額は上記の通りです。
  </div>
  `
      : `
  <div class="tax-notice">
    <strong>消費税について</strong><br>
    現在、当サービスは免税事業者として運営しており、消費税は請求いたしません。
  </div>
  `
  }

  <div class="footer">
    この請求書は EventPay システムにより自動生成されました。<br>
    お問い合わせ: ${billFrom.email}
  </div>
</body>
</html>
  `.trim();
}

/**
 * レシート用の簡易HTML生成
 * @param item 手数料項目
 * @param companyInfo 会社情報
 * @returns HTML文字列
 */
export function generateReceiptHTML(
  item: PlatformFeeInvoiceItem,
  companyInfo: InvoiceData["billFrom"]
): string {
  const showTaxDetails = item.taxInfo.taxAmount > 0;

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>領収書</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; max-width: 400px; }
    .receipt-title { font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; }
    .receipt-info { margin-bottom: 20px; }
    .receipt-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .receipt-row.total { font-weight: bold; font-size: 18px; border-top: 1px solid #333; padding-top: 8px; }
    .company-info { margin-top: 30px; font-size: 12px; }
    ${showTaxDetails ? "" : ".tax-hidden { display: none; }"}
  </style>
</head>
<body>
  <div class="receipt-title">領収書</div>

  <div class="receipt-info">
    <div class="receipt-row">
      <span>イベント:</span>
      <span>${item.eventName}</span>
    </div>
    <div class="receipt-row">
      <span>参加者:</span>
      <span>${item.participantName}</span>
    </div>
    <div class="receipt-row">
      <span>決済日:</span>
      <span>${item.paymentDate}</span>
    </div>
    <div class="receipt-row">
      <span>決済金額:</span>
      <span>¥${item.paymentAmount.toLocaleString()}</span>
    </div>
  </div>

  <div class="receipt-info">
    <div class="receipt-row tax-hidden">
      <span>手数料（税抜）:</span>
      <span>¥${item.taxInfo.amountExcludingTax.toLocaleString()}</span>
    </div>
    <div class="receipt-row tax-hidden">
      <span>消費税（${item.taxInfo.taxRatePercent}%）:</span>
      <span>¥${item.taxInfo.taxAmount.toLocaleString()}</span>
    </div>
    <div class="receipt-row total">
      <span>手数料合計:</span>
      <span>¥${item.feeAmount.toLocaleString()}</span>
    </div>
  </div>

  <div class="company-info">
    <div>${companyInfo.businessName}</div>
    <div>${companyInfo.address}</div>
    <div>${companyInfo.email}</div>
    ${companyInfo.invoiceRegistrationNumber ? `<div class="tax-hidden">適格請求書発行事業者登録番号: ${companyInfo.invoiceRegistrationNumber}</div>` : ""}
  </div>
</body>
</html>
  `.trim();
}

/**
 * ApplicationFeeCalculationから税額表示情報を生成
 * @param calculation 手数料計算結果
 * @returns 税額表示情報
 */
export function createTaxDisplayInfo(calculation: {
  taxCalculation: any;
  config: any;
}): TaxDisplayInfo {
  return {
    taxRatePercent: Math.round(calculation.taxCalculation.taxRate * 100),
    amountExcludingTax: calculation.taxCalculation.feeExcludingTax,
    taxAmount: calculation.taxCalculation.taxAmount,
    isTaxIncluded: calculation.taxCalculation.isTaxIncluded,
    // T番号は環境変数から取得（将来実装）
    invoiceNumber: process.env.INVOICE_REGISTRATION_NUMBER,
  };
}

/** MVP段階のデフォルト会社情報 */
export const DEFAULT_COMPANY_INFO: InvoiceData["billFrom"] = {
  businessName: "EventPay",
  address: "",
  email: "support@eventpay.jp",
  // 課税事業者になったら設定
  invoiceRegistrationNumber: process.env.INVOICE_REGISTRATION_NUMBER,
};

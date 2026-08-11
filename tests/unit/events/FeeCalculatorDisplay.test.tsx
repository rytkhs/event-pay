import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PlatformFeeConfig } from "@core/stripe/fee-config/service";

import { FeeCalculatorDisplay } from "@features/events";

/**
 * 参加費に対する受取予定額の表示。
 *
 * 手数料の計算そのものは `calculateApplicationFeeEstimate` の責務のため、
 * ここでは「計算結果が主催者に見える形で提示される」ことだけを検証する。
 * DOM の後始末は `tests/setup/unit-jsdom.ts` の `afterEach(cleanup)` が行う。
 */

// seed の fee_config と同じ水準の設定（rate 1.3% / 上限下限なし）
const platformFeeConfig: PlatformFeeConfig = {
  rate: 0.013,
  fixedFee: 0,
  minimumFee: 0,
  maximumFee: 0,
  taxRate: 0.1,
  isTaxIncluded: true,
};

describe("FeeCalculatorDisplay", () => {
  it("参加費、手数料、受取予定額を表示する", () => {
    render(<FeeCalculatorDisplay fee={10000} platformFeeConfig={platformFeeConfig} />);

    // 10,000 * 1.3% = 130
    expect(screen.getByText("10,000円")).toBeInTheDocument();
    expect(screen.getByText("−130円")).toBeInTheDocument();
    expect(screen.getByText("9,870円")).toBeInTheDocument();
  });

  it("手数料の下限が設定されていれば、その額が差し引かれる", () => {
    render(
      <FeeCalculatorDisplay
        fee={1000}
        platformFeeConfig={{ ...platformFeeConfig, minimumFee: 100 }}
      />
    );

    // 1,000 * 1.3% = 13 だが、下限 100 まで引き上げられる
    expect(screen.getByText("−100円")).toBeInTheDocument();
    expect(screen.getByText("900円")).toBeInTheDocument();
  });

  it("手数料設定が取得できていない場合は表示しない", () => {
    const { container } = render(<FeeCalculatorDisplay fee={10000} platformFeeConfig={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("オンライン集金の下限額に満たない参加費では表示しない", () => {
    const { container } = render(
      <FeeCalculatorDisplay fee={99} platformFeeConfig={platformFeeConfig} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

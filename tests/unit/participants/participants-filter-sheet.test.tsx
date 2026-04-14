/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";

import type { EventManagementQuery } from "@/app/(app)/events/[id]/query-params";
import { ParticipantsFilterSheet } from "@/app/(app)/events/[id]/participants/components/ParticipantsFilterSheet";

jest.mock("@/components/ui/sheet", () => {
  const React = require("react");

  const SheetContext = React.createContext({
    open: false,
    onOpenChange: (_open: boolean) => {},
  });

  const Sheet = ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) => <SheetContext.Provider value={{ open, onOpenChange }}>{children}</SheetContext.Provider>;

  const SheetTrigger = ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children: React.ReactNode;
  }) => {
    const { open, onOpenChange } = React.useContext(SheetContext);
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        onClick: () => onOpenChange(!open),
      });
    }
    return <button onClick={() => onOpenChange(!open)}>{children}</button>;
  };

  const SheetContent = ({ children }: { children: React.ReactNode }) => {
    const { open, onOpenChange } = React.useContext(SheetContext);
    if (!open) return null;

    return (
      <div>
        <button type="button" aria-label="Close" onClick={() => onOpenChange(false)}>
          Close
        </button>
        {children}
      </div>
    );
  };

  const passthrough = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  return {
    Sheet,
    SheetTrigger,
    SheetContent,
    SheetHeader: passthrough,
    SheetDescription: passthrough,
    SheetFooter: passthrough,
    SheetTitle: passthrough,
  };
});

jest.mock("@/components/ui/select", () => {
  const React = require("react");

  const MockSelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => (
    <mock-select-item value={value}>{children}</mock-select-item>
  );

  const collectOptions = (
    children: React.ReactNode,
    options: Array<{ value: string; label: string }> = []
  ) => {
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;

      if (child.type === MockSelectItem) {
        options.push({
          value: child.props.value,
          label: React.Children.toArray(child.props.children).join(""),
        });
        return;
      }

      if (child.props?.children) {
        collectOptions(child.props.children, options);
      }
    });

    return options;
  };

  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }) => {
    const options = collectOptions(children);

    return (
      <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };

  const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

  return {
    Select,
    SelectTrigger: passthrough,
    SelectContent: passthrough,
    SelectItem: MockSelectItem,
    SelectValue: () => null,
  };
});

function buildQuery(overrides: Partial<EventManagementQuery> = {}): EventManagementQuery {
  return {
    tab: "participants",
    search: "",
    attendance: "all",
    smart: false,
    page: 1,
    limit: 150,
    ...overrides,
  };
}

describe("ParticipantsFilterSheet", () => {
  it("payment filter のみ変更した Apply では smart sort を維持する", async () => {
    const user = userEvent.setup();
    const onFiltersChange = jest.fn();

    render(
      <ParticipantsFilterSheet
        query={buildQuery()}
        onFiltersChange={onFiltersChange}
        isFreeEvent={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /フィルター/ }));

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "cash");
    await user.click(screen.getByRole("button", { name: "フィルターを適用" }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      paymentMethod: "cash",
      paymentStatus: undefined,
      smart: false,
      sort: undefined,
      order: undefined,
    });
  });

  it("sort を変更した Apply では smart sort を OFF にして manual sort を送る", async () => {
    const user = userEvent.setup();
    const onFiltersChange = jest.fn();

    render(
      <ParticipantsFilterSheet
        query={buildQuery()}
        onFiltersChange={onFiltersChange}
        isFreeEvent={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /フィルター/ }));

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[2], "nickname");
    await user.click(screen.getByRole("button", { name: "フィルターを適用" }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      paymentMethod: undefined,
      paymentStatus: undefined,
      smart: false,
      sort: "nickname",
      order: "desc",
    });
  });

  it("Apply せずに閉じた draft は破棄される", async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsFilterSheet
        query={buildQuery()}
        onFiltersChange={jest.fn()}
        isFreeEvent={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /フィルター/ }));
    let selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "cash");

    expect(screen.queryByRole("button", { name: "すべてクリア" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: /フィルター/ }));

    selects = screen.getAllByRole("combobox");
    expect(selects[0]).toHaveValue("all");
  });

  it("free event の manual sort 状態では Clear All が表示される", async () => {
    const user = userEvent.setup();
    const onFiltersChange = jest.fn();

    render(
      <ParticipantsFilterSheet
        query={buildQuery({
          smart: false,
          sort: "nickname",
          order: "asc",
        })}
        onFiltersChange={onFiltersChange}
        isFreeEvent={true}
      />
    );

    await user.click(screen.getByRole("button", { name: /フィルター/ }));

    const clearButton = screen.getByRole("button", { name: "すべてクリア" });
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);

    expect(onFiltersChange).toHaveBeenCalledWith({
      paymentMethod: undefined,
      paymentStatus: undefined,
      smart: false,
      sort: undefined,
      order: undefined,
    });
  });

  it("smart が OFF でも明示的な sort がなければ badge は表示しない", () => {
    render(
      <ParticipantsFilterSheet
        query={buildQuery({
          smart: false,
        })}
        onFiltersChange={jest.fn()}
        isFreeEvent={true}
      />
    );

    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("変更がない Apply は URL 更新コールを発生させない", async () => {
    const user = userEvent.setup();
    const onFiltersChange = jest.fn();

    render(
      <ParticipantsFilterSheet
        query={buildQuery({
          smart: false,
          sort: "nickname",
          order: "asc",
          paymentMethod: "cash",
        })}
        onFiltersChange={onFiltersChange}
        isFreeEvent={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /フィルター/ }));
    await user.click(screen.getByRole("button", { name: "フィルターを適用" }));

    expect(onFiltersChange).not.toHaveBeenCalled();
  });
});

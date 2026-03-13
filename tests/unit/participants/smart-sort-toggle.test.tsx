/** @jest-environment jsdom */

import React from "react";

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { SmartSortToggle } from "@/app/(app)/events/[id]/participants/components/SmartSortToggle";
import { TooltipProvider } from "@/components/ui/tooltip";

describe("SmartSortToggle", () => {
  it("複数描画しても switch の id が重複しない", () => {
    render(
      <TooltipProvider>
        <>
          <SmartSortToggle isActive={true} onToggle={jest.fn()} showLabel={true} />
          <SmartSortToggle isActive={false} onToggle={jest.fn()} showLabel={false} />
        </>
      </TooltipProvider>
    );

    const switches = screen.getAllByRole("switch");
    const ids = switches.map((element) => element.getAttribute("id"));

    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });
});

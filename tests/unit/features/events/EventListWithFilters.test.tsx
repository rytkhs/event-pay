/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Filters } from "@features/events/hooks/useEventFilter";

import { EventListWithFilters } from "@features/events/components/EventListWithFilters";

const replaceMock = jest.fn();
const usePaginationMock = jest.fn();
const useEventFilterMock = jest.fn();
const clearFiltersMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

jest.mock("@core/hooks/usePagination", () => ({
  usePagination: () => usePaginationMock(),
}));

jest.mock("@features/events/hooks/useEventFilter", () => ({
  useEventFilter: () => useEventFilterMock(),
}));

jest.mock("@features/events/components/EventFilters", () => ({
  EventFilters: ({
    isFiltered,
    searchQuery,
    onSearchQueryChange,
    onClearFilters,
    onClearSearchQuery,
  }: {
    isFiltered?: boolean;
    searchQuery?: string;
    onSearchQueryChange?: (query: string) => void;
    onClearFilters: () => void;
    onClearSearchQuery?: () => void;
  }) => (
    <div>
      <div data-testid="is-filtered">{String(isFiltered)}</div>
      <div data-testid="search-query">{searchQuery}</div>
      <button type="button" onClick={() => onSearchQueryChange?.("交流会")}>
        set-search
      </button>
      <button
        type="button"
        onClick={() => {
          onClearFilters();
          onClearSearchQuery?.();
        }}
      >
        clear-all
      </button>
    </div>
  ),
}));

jest.mock("@features/events/components/EventList", () => ({
  EventList: ({
    events,
    isFiltered,
  }: {
    events: Array<{ title: string }>;
    isFiltered?: boolean;
  }) => (
    <div>
      <div data-testid="event-list-filtered">{String(isFiltered)}</div>
      <div data-testid="event-titles">{events.map((event) => event.title).join(",")}</div>
    </div>
  ),
}));

jest.mock("@features/events/components/Pagination", () => ({
  Pagination: () => null,
}));

describe("EventListWithFilters", () => {
  const events = [
    { id: "event-1", title: "交流会", location: "渋谷" },
    { id: "event-2", title: "勉強会", location: "新宿" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    usePaginationMock.mockReturnValue({
      currentPage: 1,
      pageSize: 24,
      setPage: jest.fn(),
    });
    useEventFilterMock.mockReturnValue({
      filters: {
        status: "all",
        payment: "all",
        dateRange: {},
      } satisfies Filters,
      setStatusFilter: jest.fn(),
      setPaymentFilter: jest.fn(),
      setDateRangeFilter: jest.fn(),
      clearFilters: clearFiltersMock,
    });
  });

  it("検索語だけでも filtered 状態として扱う", () => {
    render(<EventListWithFilters events={events} totalCount={events.length} />);

    expect(screen.getByTestId("is-filtered")).toHaveTextContent("false");
    expect(screen.getByTestId("event-list-filtered")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "set-search" }));

    expect(screen.getByTestId("is-filtered")).toHaveTextContent("true");
    expect(screen.getByTestId("event-list-filtered")).toHaveTextContent("true");
    expect(screen.getByTestId("event-titles")).toHaveTextContent("交流会");
  });

  it("CLEAR ALL で検索語もリセットする", () => {
    render(<EventListWithFilters events={events} totalCount={events.length} />);

    fireEvent.click(screen.getByRole("button", { name: "set-search" }));
    expect(screen.getByTestId("search-query")).toHaveTextContent("交流会");

    fireEvent.click(screen.getByRole("button", { name: "clear-all" }));

    expect(clearFiltersMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("search-query")).toHaveTextContent("");
    expect(screen.getByTestId("is-filtered")).toHaveTextContent("false");
    expect(screen.getByTestId("event-titles")).toHaveTextContent("交流会,勉強会");
  });
});

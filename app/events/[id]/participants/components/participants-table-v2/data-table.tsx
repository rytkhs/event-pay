"use client";

import * as React from "react";

import {
  ColumnDef,
  Row,
  flexRender,
  getCoreRowModel,
  SortingState,
  useReactTable,
  OnChangeFn,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageIndex: number; // 0-based
  pageSize: number;
  pageCount: number; // total pages
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  getRowClassName?: (row: Row<TData>) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageIndex,
  pageSize,
  pageCount,
  sorting,
  onSortingChange,
  getRowClassName,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination: { pageIndex, pageSize } },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount,
  });

  return (
    <div className="rounded-lg border border-gray-200 overflow-x-auto shadow-sm -mx-4 sm:mx-0">
      <Table role="table" aria-label="参加者一覧テーブル">
        <TableHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="min-h-[30px]">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="px-3 sm:px-4 py-4"
                  aria-sort={
                    header.column.getCanSort()
                      ? header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : "none"
                      : undefined
                  }
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 data-[state=open]:bg-accent hover:bg-gray-100 justify-start"
                      onClick={header.column.getToggleSortingHandler()}
                      aria-label={`${flexRender(header.column.columnDef.header, header.getContext())}でソート`}
                    >
                      <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {{
                        asc: <ChevronUp className="ml-2 h-4 w-4 text-gray-600" />,
                        desc: <ChevronDown className="ml-2 h-4 w-4 text-gray-600" />,
                      }[header.column.getIsSorted() as string] ?? (
                        <ChevronsUpDown className="ml-2 h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                  ) : (
                    <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="bg-white divide-y divide-gray-200">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const baseClassName =
                "min-h-[30px] transition-all duration-200 hover:bg-blue-50 hover:shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-opacity-50";
              const customClassName = getRowClassName?.(row) || "";
              const combinedClassName = customClassName
                ? `${baseClassName} ${customClassName}`
                : baseClassName;

              return (
                <TableRow key={row.id} className={combinedClassName} tabIndex={0} role="row">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-2 sm:px-4 py-3 sm:py-4 whitespace-nowrap text-sm sm:text-base"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-gray-500">
                参加者が見つかりません
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

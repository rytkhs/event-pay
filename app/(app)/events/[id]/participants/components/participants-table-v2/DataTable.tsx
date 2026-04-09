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
    <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm -mx-1 sm:mx-0 bg-background">
      <Table role="table" aria-label="参加者一覧テーブル">
        <TableHeader className="border-b border-border/60 bg-muted/30">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent border-none">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="px-3 sm:px-4 py-3"
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
                      className="-ml-3 h-8 data-[state=open]:bg-accent hover:bg-muted/60 justify-start"
                      onClick={header.column.getToggleSortingHandler()}
                      aria-label={`${flexRender(header.column.columnDef.header, header.getContext())}でソート`}
                    >
                      <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-[0.14em]">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {{
                        asc: <ChevronUp className="ml-2 h-3.5 w-3.5 text-primary" />,
                        desc: <ChevronDown className="ml-2 h-3.5 w-3.5 text-primary" />,
                      }[header.column.getIsSorted() as string] ?? (
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/30" />
                      )}
                    </Button>
                  ) : (
                    <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-[0.14em]">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="bg-transparent divide-y divide-border/40">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const baseClassName =
                "group min-h-[30px] transition-colors duration-200 focus-within:bg-sidebar-accent/40";
              const customClassName = getRowClassName?.(row) || "";
              const combinedClassName = customClassName
                ? `${baseClassName} ${customClassName}`
                : baseClassName;

              return (
                <TableRow key={row.id} className={combinedClassName} tabIndex={0} role="row">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-3 sm:px-4 py-3.5 whitespace-nowrap text-[14px] leading-snug"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground/60"
              >
                参加者が見つかりません
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

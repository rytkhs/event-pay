import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface UsePaginationOptions {
  defaultPage?: number;
  defaultPageSize?: number;
}

interface UsePaginationResult {
  currentPage: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
}

export function usePagination(options: UsePaginationOptions = {}): UsePaginationResult {
  const { defaultPage = 1, defaultPageSize = 10 } = options;
  const router = useRouter();
  const searchParams = useSearchParams();

  // URLパラメータから現在のページ番号を取得
  const currentPage = Math.max(1, parseInt(searchParams.get("page") || defaultPage.toString(), 10));

  // URLパラメータからページサイズを取得
  const pageSize = Math.max(
    1,
    parseInt(searchParams.get("limit") || defaultPageSize.toString(), 10)
  );

  // ページ番号を更新する関数
  const setPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());

      if (page <= 1) {
        params.delete("page");
      } else {
        params.set("page", page.toString());
      }

      router.push(`${window.location.pathname}?${params.toString()}`);
    },
    [router, searchParams]
  );

  // ページサイズを更新する関数
  const setPageSize = useCallback(
    (size: number) => {
      const params = new URLSearchParams(searchParams.toString());

      if (size === defaultPageSize) {
        params.delete("limit");
      } else {
        params.set("limit", size.toString());
      }

      // ページサイズ変更時は1ページ目に戻る
      params.delete("page");

      router.push(`${window.location.pathname}?${params.toString()}`);
    },
    [router, searchParams, defaultPageSize]
  );

  return {
    currentPage,
    pageSize,
    setPage,
    setPageSize,
  };
}

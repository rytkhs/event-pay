'use client';

import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { StatusFilter, PaymentFilter, DateFilter } from '@/app/events/actions/get-events';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EventFiltersProps {
  statusFilter: StatusFilter;
  dateFilter: DateFilter;
  paymentFilter: PaymentFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  onDateFilterChange: (dateFilter: DateFilter) => void;
  onPaymentFilterChange: (payment: PaymentFilter) => void;
  onClearFilters: () => void;
  isFiltered?: boolean;
}

export function EventFilters({
  statusFilter,
  dateFilter,
  paymentFilter,
  onStatusFilterChange,
  onDateFilterChange,
  onPaymentFilterChange,
  onClearFilters,
  isFiltered = false,
}: EventFiltersProps) {
  const [dateError, setDateError] = useState<string>('');
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  // Zodスキーマによる日付バリデーション
  const dateSchema = z.object({
    start: z.string().optional(),
    end: z.string().optional()
  }).refine((data) => {
    if (data.start && data.end) {
      const startDate = new Date(data.start);
      const endDate = new Date(data.end);
      return endDate > startDate;
    }
    return true;
  }, {
    message: '終了日は開始日より後の日付を選択してください'
  });

  // 初期レンダリング時のバリデーション
  useEffect(() => {
    // 日付フィルターの初期バリデーション
    const validation = dateSchema.safeParse(dateFilter);
    if (!validation.success) {
      setDateError(validation.error.issues[0]?.message || '日付の形式が正しくありません');
    } else {
      setDateError('');
    }
  }, [dateFilter]);

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const newDateFilter = { ...dateFilter, [field]: value };
    
    // Zodによるバリデーション
    const validation = dateSchema.safeParse(newDateFilter);
    if (!validation.success) {
      setDateError(validation.error.issues[0]?.message || '日付の形式が正しくありません');
      
      // バリデーションエラー時は入力値を元の値にロールバック
      if (field === 'start' && startDateRef.current) {
        startDateRef.current.value = dateFilter.start || '';
      }
      if (field === 'end' && endDateRef.current) {
        endDateRef.current.value = dateFilter.end || '';
      }
      return;
    }
    
    setDateError('');
    onDateFilterChange(newDateFilter);
  };

  const handleStatusChange = (value: string) => {
    // Selectコンポーネントでは事前定義された値のみ選択可能なため、直接変換
    onStatusFilterChange(value as StatusFilter);
  };

  const handlePaymentChange = (value: string) => {
    // Selectコンポーネントでは事前定義された値のみ選択可能なため、直接変換
    onPaymentFilterChange(value as PaymentFilter);
  };

  const handleClearFilters = () => {
    setDateError('');
    onClearFilters();
  };

  return (
    <Card data-testid="event-filters">
      <CardHeader>
        <CardTitle>フィルター</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ステータスフィルター */}
        <div className="space-y-2">
          <Label htmlFor="status-filter">ステータス</Label>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger data-testid="status-filter" aria-label="イベントステータスでフィルター">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て表示</SelectItem>
              <SelectItem value="upcoming">開催予定</SelectItem>
              <SelectItem value="ongoing">開催中</SelectItem>
              <SelectItem value="past">終了済み</SelectItem>
              <SelectItem value="cancelled">キャンセル</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 決済状況フィルター */}
        <div className="space-y-2">
          <Label htmlFor="payment-filter">料金</Label>
          <Select value={paymentFilter} onValueChange={handlePaymentChange}>
            <SelectTrigger data-testid="payment-filter" aria-label="料金設定でフィルター">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              <SelectItem value="free">無料</SelectItem>
              <SelectItem value="paid">有料</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 日付範囲フィルター */}
        <div className="space-y-2">
          <Label>開催日</Label>
          <div className="space-y-2">
            <div>
              <Label htmlFor="start-date" className="text-xs text-muted-foreground">
                開始日
              </Label>
              <Input
                ref={startDateRef}
                id="start-date"
                type="date"
                value={dateFilter.start || ''}
                onChange={(e) => handleDateChange('start', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end-date" className="text-xs text-muted-foreground">
                終了日
              </Label>
              <Input
                ref={endDateRef}
                id="end-date"
                type="date"
                value={dateFilter.end || ''}
                onChange={(e) => handleDateChange('end', e.target.value)}
              />
            </div>
            {dateError && (
              <p className="text-destructive text-sm mt-1">{dateError}</p>
            )}
          </div>
        </div>


        {/* フィルター解除 */}
        <Button
          variant="outline"
          onClick={handleClearFilters}
          disabled={!isFiltered}
          className="w-full"
          aria-label={isFiltered ? "フィルターをクリア" : "フィルターが設定されていません"}
        >
          フィルターをクリア
        </Button>
      </CardContent>
    </Card>
  );
}
"use client";

import * as React from "react";

import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock } from "lucide-react";

import { cn } from "./_lib/cn";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

interface DateTimePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  className?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "日時を選択",
  disabled = false,
  minDate,
  className,
}: DateTimePickerProps) {
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(value);
  const [isOpen, setIsOpen] = React.useState(false);

  // 時間の選択肢を生成（0-23時）
  const hours = Array.from({ length: 24 }, (_, i) => i);
  // 分の選択肢を生成（0, 15, 30, 45）
  const minutes = [0, 15, 30, 45];

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined);
      onChange?.(undefined);
      return;
    }

    // 既存の時刻を保持、なければデフォルト値を設定
    const newDate = new Date(date);
    if (selectedDate) {
      newDate.setHours(selectedDate.getHours());
      newDate.setMinutes(selectedDate.getMinutes());
    } else {
      newDate.setHours(12); // デフォルト12:00
      newDate.setMinutes(0);
    }

    setSelectedDate(newDate);
    onChange?.(newDate);
  };

  const handleTimeChange = (type: "hour" | "minute", value: string) => {
    const newDate = selectedDate ? new Date(selectedDate) : new Date();

    if (type === "hour") {
      newDate.setHours(parseInt(value));
    } else {
      newDate.setMinutes(parseInt(value));
    }

    setSelectedDate(newDate);
    onChange?.(newDate);
  };

  const formatDisplayDate = (date: Date) => {
    return format(date, "yyyy年M月d日(E) HH:mm", { locale: ja });
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal h-12",
              !selectedDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? formatDisplayDate(selectedDate) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(date) => {
                if (minDate) {
                  return date < minDate;
                }
                return false;
              }}
              locale={ja}
              initialFocus
            />
            <div className="border-t p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">時刻を選択</span>
              </div>
              <div className="flex gap-2">
                <Select
                  value={selectedDate ? selectedDate.getHours().toString() : "19"}
                  onValueChange={(value) => handleTimeChange("hour", value)}
                  disabled={!selectedDate}
                >
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((hour) => (
                      <SelectItem key={hour} value={hour.toString()}>
                        {hour.toString().padStart(2, "0")}時
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedDate ? selectedDate.getMinutes().toString() : "0"}
                  onValueChange={(value) => handleTimeChange("minute", value)}
                  disabled={!selectedDate}
                >
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {minutes.map((minute) => (
                      <SelectItem key={minute} value={minute.toString()}>
                        {minute.toString().padStart(2, "0")}分
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => setIsOpen(false)}
              >
                完了
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {selectedDate && (
        <p className="text-sm text-muted-foreground">選択中: {formatDisplayDate(selectedDate)}</p>
      )}
    </div>
  );
}

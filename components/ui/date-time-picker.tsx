"use client";

import * as React from "react";

import { format, isBefore, isSameDay, startOfDay } from "date-fns";
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

const TIME_MINUTES = [0, 15, 30, 45];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function normalizeDateTime(date: Date): Date {
  const normalized = new Date(date);
  normalized.setSeconds(0, 0);
  return normalized;
}

function getLastSelectableSlot(date: Date): Date {
  const lastSlot = new Date(date);
  lastSlot.setHours(23, 45, 0, 0);
  return lastSlot;
}

function roundUpToSelectableTime(date: Date): Date {
  const rounded = normalizeDateTime(date);
  const nextMinute = TIME_MINUTES.find((minute) => minute >= rounded.getMinutes());

  if (nextMinute !== undefined) {
    rounded.setMinutes(nextMinute, 0, 0);
    return rounded;
  }

  rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  return rounded;
}

function isDateDisabled(date: Date, minDate?: Date): boolean {
  if (!minDate) return false;

  const calendarDate = startOfDay(date);
  const minCalendarDate = startOfDay(minDate);

  if (isBefore(calendarDate, minCalendarDate)) {
    return true;
  }

  if (!isSameDay(calendarDate, minCalendarDate)) {
    return false;
  }

  return isBefore(getLastSelectableSlot(calendarDate), normalizeDateTime(minDate));
}

function getValidHours(date: Date | undefined, minDate?: Date): number[] {
  if (!date || !minDate || !isSameDay(date, minDate)) {
    return HOURS;
  }

  return HOURS.filter((hour) =>
    TIME_MINUTES.some((minute) => {
      const candidate = new Date(date);
      candidate.setHours(hour, minute, 0, 0);
      return !isBefore(candidate, normalizeDateTime(minDate));
    })
  );
}

function getValidMinutes(date: Date | undefined, minDate?: Date): number[] {
  if (!date) return TIME_MINUTES;
  if (!minDate || !isSameDay(date, minDate)) {
    return TIME_MINUTES;
  }

  return TIME_MINUTES.filter((minute) => {
    const candidate = new Date(date);
    candidate.setMinutes(minute, 0, 0);
    return !isBefore(candidate, normalizeDateTime(minDate));
  });
}

function ensureSelectedOption(options: number[], selectedValue: number | undefined): number[] {
  if (selectedValue === undefined || options.includes(selectedValue)) {
    return options;
  }

  return [...options, selectedValue].sort((a, b) => a - b);
}

function clampToMinDate(date: Date, minDate?: Date): Date {
  const normalized = normalizeDateTime(date);

  if (!minDate) {
    return normalized;
  }

  const normalizedMinDate = normalizeDateTime(minDate);
  if (!isBefore(normalized, normalizedMinDate)) {
    return normalized;
  }

  return roundUpToSelectableTime(normalizedMinDate);
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

  React.useEffect(() => {
    setSelectedDate(value ? clampToMinDate(value, minDate) : undefined);
  }, [value, minDate]);

  const hourOptions = ensureSelectedOption(
    getValidHours(selectedDate, minDate),
    selectedDate?.getHours()
  );
  const minuteOptions = ensureSelectedOption(
    getValidMinutes(selectedDate, minDate),
    selectedDate?.getMinutes()
  );

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

    const clampedDate = clampToMinDate(newDate, minDate);
    setSelectedDate(clampedDate);
    onChange?.(clampedDate);
  };

  const handleTimeChange = (type: "hour" | "minute", nextValue: string) => {
    const newDate = selectedDate ? new Date(selectedDate) : new Date();

    if (type === "hour") {
      newDate.setHours(parseInt(nextValue));
    } else {
      newDate.setMinutes(parseInt(nextValue));
    }

    const clampedDate = clampToMinDate(newDate, minDate);
    setSelectedDate(clampedDate);
    onChange?.(clampedDate);
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
              disabled={(date) => isDateDisabled(date, minDate)}
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
                    {hourOptions.map((hour) => (
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
                    {minuteOptions.map((minute) => (
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
    </div>
  );
}

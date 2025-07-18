"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EventEditBasicFieldsProps {
  formData: {
    title: string;
    location: string;
    date: string;
    description: string;
  };
  errors: {
    title?: string;
    location?: string;
    date?: string;
    description?: string;
  };
  onInputChange: (field: string, value: string) => void;
  isFieldRestricted: (field: string) => boolean;
}

export function EventEditBasicFields({
  formData,
  errors,
  onInputChange,
  isFieldRestricted,
}: EventEditBasicFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900">基本情報</h3>
        <p className="text-sm text-gray-500">イベントの基本的な情報を編集してください</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">
            タイトル <span className="text-red-500">*</span>
            {isFieldRestricted("title") && (
              <span className="text-yellow-600 text-sm ml-2">(参加者がいるため編集不可)</span>
            )}
          </Label>
          <Input
            id="title"
            type="text"
            value={formData.title}
            onChange={(e) => onInputChange("title", e.target.value)}
            disabled={isFieldRestricted("title")}
            aria-disabled={isFieldRestricted("title")}
            aria-describedby={
              isFieldRestricted("title")
                ? "title-restriction"
                : errors.title
                  ? "title-error"
                  : undefined
            }
            className={isFieldRestricted("title") ? "bg-gray-100" : ""}
            maxLength={50}
          />
          {isFieldRestricted("title") && (
            <p id="title-restriction" className="text-sm text-yellow-600">
              参加者がいるため編集できません
            </p>
          )}
          {errors.title && (
            <p id="title-error" className="text-sm text-red-600">
              {errors.title}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">場所</Label>
          <Input
            id="location"
            type="text"
            value={formData.location}
            onChange={(e) => onInputChange("location", e.target.value)}
            aria-describedby={errors.location ? "location-error" : undefined}
          />
          {errors.location && (
            <p id="location-error" className="text-sm text-red-600">
              {errors.location}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">
            開催日時 <span className="text-red-500">*</span>
          </Label>
          <Input
            id="date"
            type="datetime-local"
            value={formData.date}
            onChange={(e) => onInputChange("date", e.target.value)}
            aria-describedby={errors.date ? "date-error" : undefined}
          />
          {errors.date && (
            <p id="date-error" className="text-sm text-red-600">
              {errors.date}
            </p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">説明</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => onInputChange("description", e.target.value)}
            rows={3}
            maxLength={1000}
            aria-describedby={errors.description ? "description-error" : undefined}
          />
          {errors.description && (
            <p id="description-error" className="text-sm text-red-600">
              {errors.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

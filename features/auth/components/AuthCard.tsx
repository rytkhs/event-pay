import type { ReactNode } from "react";

import { cn } from "@core/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  className?: string;
  cardClassName?: string;
  contentClassName?: string;
  titleAs?: "h1" | "h2";
}

const maxWidthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
};

export function AuthCard({
  title,
  description,
  children,
  footer,
  maxWidth = "md",
  className,
  cardClassName,
  contentClassName,
  titleAs = "h1",
}: AuthCardProps) {
  return (
    <div className={cn("flex w-full justify-center px-4 py-10 sm:px-6 lg:px-8", className)}>
      <div className={cn("w-full", maxWidthClasses[maxWidth])}>
        <Card className={cardClassName}>
          <CardHeader className="text-center">
            <CardTitle as={titleAs} className="text-2xl font-bold sm:text-3xl">
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className={contentClassName}>{children}</CardContent>
          {footer}
        </Card>
      </div>
    </div>
  );
}

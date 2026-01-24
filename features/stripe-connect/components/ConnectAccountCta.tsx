import Link from "next/link";

import { AlertCircle, CreditCard, RefreshCw, Clock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { DetailedAccountStatus } from "../types";

interface ConnectAccountCtaProps {
  status: DetailedAccountStatus;
}

/**
 * Stripe入金設定を促すCTAコンポーネント
 */
export function ConnectAccountCta({ status }: ConnectAccountCtaProps) {
  const getIcon = () => {
    switch (status.statusType) {
      case "no_account":
        return <CreditCard className="h-5 w-5" />;
      case "unverified":
        return <RefreshCw className="h-5 w-5" />;
      case "requirements_due":
        return <AlertCircle className="h-5 w-5" />;
      case "pending_review":
        return <Clock className="h-5 w-5" />;
      default:
        return <CreditCard className="h-5 w-5" />;
    }
  };

  const getVariantClasses = () => {
    switch (status.severity) {
      case "error":
        return {
          container: "bg-red-50 border-red-200",
          icon: "text-red-600",
          title: "text-red-900",
          description: "text-red-800",
          button: "bg-red-600 hover:bg-red-700 text-white",
        };
      case "warning":
        return {
          container: "bg-amber-50 border-amber-200",
          icon: "text-amber-600",
          title: "text-amber-900",
          description: "text-amber-800",
          button: "bg-amber-600 hover:bg-amber-700 text-white",
        };
      case "info":
      default:
        return {
          container: "bg-blue-50 border-blue-200",
          icon: "text-blue-600",
          title: "text-blue-900",
          description: "text-blue-800",
          button: "bg-blue-600 hover:bg-blue-700 text-white",
        };
    }
  };

  const classes = getVariantClasses();

  return (
    <Alert className={`${classes.container} mb-6 shadow-sm`}>
      <div className="flex items-start space-x-4">
        <div className={`flex-shrink-0 ${classes.icon}`}>{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <AlertTitle className={`${classes.title} text-base font-semibold mb-2`}>
            {status.title}
          </AlertTitle>
          <AlertDescription className={`${classes.description} mb-4 text-sm leading-relaxed`}>
            {status.description}
          </AlertDescription>
          <div className="flex items-center gap-3">
            <Button asChild className={`${classes.button} shadow-sm`} size="sm">
              <Link href={status.actionUrl}>{status.actionText}</Link>
            </Button>
            {status.statusType === "requirements_due" && (
              <p className={`text-xs ${classes.description} opacity-75`}>
                今すぐ対応することをお勧めします
              </p>
            )}
          </div>
        </div>
      </div>
    </Alert>
  );
}

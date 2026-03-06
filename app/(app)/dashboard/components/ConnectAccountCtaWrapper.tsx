import { ConnectAccountCta } from "@features/stripe-connect";

import type { DashboardDataResource } from "../_lib/dashboard-data";

export async function ConnectAccountCtaWrapper({
  dashboardDataResource,
}: {
  dashboardDataResource: Promise<DashboardDataResource>;
}) {
  try {
    const { stripeSummary } = await dashboardDataResource;
    const resolvedStripeSummary = await stripeSummary;

    if (!resolvedStripeSummary.ctaStatus) {
      return null;
    }

    return <ConnectAccountCta status={resolvedStripeSummary.ctaStatus} />;
  } catch {
    return null;
  }
}

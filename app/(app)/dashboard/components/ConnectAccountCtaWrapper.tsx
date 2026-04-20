import { ConnectAccountCta } from "@features/stripe-connect";

import type { DashboardDataResource } from "../_lib/dashboard-data";

import { OnboardingToastNotifier } from "./OnboardingToastNotifier";

export async function ConnectAccountCtaWrapper({
  dashboardDataResource,
}: {
  dashboardDataResource: Promise<DashboardDataResource>;
}) {
  try {
    const { stripeCtaStatus } = await dashboardDataResource;
    const resolvedStripeCtaStatus = await stripeCtaStatus;

    return (
      <>
        <OnboardingToastNotifier status={resolvedStripeCtaStatus} statusResolved={true} />
        {resolvedStripeCtaStatus && <ConnectAccountCta status={resolvedStripeCtaStatus} />}
      </>
    );
  } catch {
    return <OnboardingToastNotifier statusResolved={false} />;
  }
}

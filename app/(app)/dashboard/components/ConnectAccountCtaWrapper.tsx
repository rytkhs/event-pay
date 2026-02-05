import { ConnectAccountCta } from "@features/stripe-connect";
import { getDetailedAccountStatusAction } from "@features/stripe-connect/server";

export async function ConnectAccountCtaWrapper() {
  const result = await getDetailedAccountStatusAction();

  if (!result.success || !result.data?.status) {
    return null;
  }

  return <ConnectAccountCta status={result.data.status} />;
}

import { ConnectAccountCta, getDetailedAccountStatusAction } from "@features/stripe-connect";

export async function ConnectAccountCtaWrapper() {
  const result = await getDetailedAccountStatusAction();

  if (!result.success || !result.status) {
    return null;
  }

  return <ConnectAccountCta status={result.status} />;
}

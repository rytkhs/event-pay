import type {
  CollectionProgressSummary,
  ParticipantView,
} from "@core/validation/participant-management";

function resolveAmount(participant: ParticipantView, eventFee: number): number {
  return participant.amount ?? eventFee;
}

export function buildCollectionProgressSummary(
  participants: ParticipantView[],
  eventFee: number
): CollectionProgressSummary {
  const summary: CollectionProgressSummary = {
    targetAmount: 0,
    collectedAmount: 0,
    outstandingAmount: 0,
    exemptAmount: 0,
    targetCount: 0,
    collectedCount: 0,
    outstandingCount: 0,
    exemptCount: 0,
    exceptionCount: 0,
  };

  participants.forEach((participant) => {
    const amount = resolveAmount(participant, eventFee);
    const { payment_status: paymentStatus, status } = participant;

    if (status === "attending") {
      switch (paymentStatus) {
        case "paid":
        case "received":
          summary.targetAmount += amount;
          summary.collectedAmount += amount;
          summary.targetCount += 1;
          summary.collectedCount += 1;
          return;
        case "pending":
        case "failed":
          summary.targetAmount += amount;
          summary.outstandingAmount += amount;
          summary.targetCount += 1;
          summary.outstandingCount += 1;
          return;
        case "waived":
          summary.exemptAmount += amount;
          summary.exemptCount += 1;
          return;
        case "refunded":
        case "canceled":
          summary.exceptionCount += 1;
          return;
        case null:
          summary.targetAmount += amount;
          summary.outstandingAmount += amount;
          summary.targetCount += 1;
          summary.outstandingCount += 1;
          summary.exceptionCount += 1;
          return;
        default: {
          // Exhaustiveness check
          const _: never = paymentStatus;
          return;
        }
      }
    }

    if (
      paymentStatus === "paid" ||
      paymentStatus === "received" ||
      paymentStatus === "waived" ||
      paymentStatus === "refunded"
    ) {
      summary.exceptionCount += 1;
    }
  });

  return summary;
}

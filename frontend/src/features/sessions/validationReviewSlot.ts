import type { ReactNode } from "react";

/** Data owned by the sessions lane for a future Road validation review. */
export interface ValidationReviewSlot {
  readonly workflowId: string;
  readonly onReturnToTune: () => void;
}

/** Coordinator/D may provide the actual review surface without a sessions import. */
export type ValidationReviewSlotRenderer = (slot: ValidationReviewSlot) => ReactNode;

export interface ValidationReviewSlotHostProps {
  readonly reviewSlot?: ValidationReviewSlot | null;
  readonly renderReviewSlot?: ValidationReviewSlotRenderer;
}

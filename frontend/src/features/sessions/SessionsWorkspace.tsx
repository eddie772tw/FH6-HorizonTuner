import React from "react";
import type { WorkspaceProps } from "../../app/AppShell";
import AnalysisView from "../analysis/AnalysisView";
import type { ValidationReviewSlotHostProps } from "./validationReviewSlot";

/** The Road library attaches here in W3; it never shares analysis filenames. */
export const SessionsWorkspace: React.FC<WorkspaceProps & ValidationReviewSlotHostProps> = ({
  reviewSlot,
  renderReviewSlot,
  onOpenSessions,
}) => (
  <>
    <AnalysisView onLatestAnalysis={() => onOpenSessions({ kind: 'latest-analysis' })} />
    {reviewSlot && renderReviewSlot ? renderReviewSlot(reviewSlot) : null}
  </>
);

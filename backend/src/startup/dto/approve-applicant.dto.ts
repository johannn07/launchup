import { IsBoolean, IsOptional } from 'class-validator';

export class ApproveApplicantDto {
  /**
   * SO 4.4 — set only when the Manager has confirmed they reviewed a
   * predominantly-positive summary. Optional so an unflagged approval needs no
   * body; the service decides whether it is required.
   */
  @IsOptional()
  @IsBoolean()
  acknowledgedFlaggedSummary?: boolean;
}

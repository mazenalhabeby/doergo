import { OptNumber, OptString } from '../../../common/dto/body-fields';

/*
  The service report's part bodies (CODE_AUDIT.md B3). Only the TYPES are checked; the
  required fields keep their TypeScript `!` and reach the service as before when missing.
*/

/** POST /reports/:id/parts */
export class AddPartDto {
  @OptString() name!: string;
  @OptString() partNumber?: string;
  @OptNumber() quantity!: number;
  @OptNumber() unitCost?: number;
  @OptString() notes?: string;
}

/** PATCH /reports/:id/parts/:partId */
export class UpdatePartDto {
  @OptString() name?: string;
  @OptString() partNumber?: string;
  @OptNumber() quantity?: number;
  @OptNumber() unitCost?: number;
  @OptString() notes?: string;
}

import { OptBoolean, OptString } from '../../../common/dto/body-fields';

/*
  Space-sharing bodies (CODE_AUDIT.md B3). Clients: the web's Sharing tab and shared-spaces
  page (lib/api/space-sharing.ts) and the approvals inbox ({ approve }). Only TYPES are checked;
  the share service decides levels, codes and who may act.
*/

class ShareVisibilityDto {
  @OptString() level?: string;
  @OptBoolean() showWorkers?: boolean;
  @OptBoolean() showAttendance?: boolean;
  @OptBoolean() showTracking?: boolean;
  @OptBoolean() showReports?: boolean;
  @OptBoolean() allowRequests?: boolean;
}

/** POST /locations/:spaceId/shares */
export class CreateShareDto extends ShareVisibilityDto {
  @OptString() guestOrgCode?: string;
}

/** PATCH /locations/:spaceId/shares/:shareId */
export class UpdateShareDto extends ShareVisibilityDto {}

/** PATCH /share-requests/:requestId/resolve */
export class ResolveShareRequestDto {
  @OptBoolean() approve!: boolean;
}

/** POST /shared-spaces/:shareId/respond */
export class RespondToShareDto {
  @OptBoolean() accept!: boolean;
}

/** POST /shared-spaces/:shareId/requests */
export class CreateShareRequestDto {
  @OptString() type?: string;
  @OptString() title?: string;
  @OptString() note?: string;
}

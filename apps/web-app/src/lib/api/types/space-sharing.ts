

// ─────────────────────────────────────────────────────────────────────────────
// Space Sharing — cross-org sharing of a space (board) with a guest org.
// ─────────────────────────────────────────────────────────────────────────────
export type SpaceShareLevel = 'VIEW' | 'CONTRIBUTE' | 'CONTROL';

export type SpaceShareStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'DECLINED';

export type SpaceShareRequestType = 'TASK' | 'WORKER';

export type SpaceShareRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';


/** A share as seen by the OWNER of the space. */
export interface SpaceShare {
  id: string;
  spaceId: string;
  guestOrgName: string;
  level: SpaceShareLevel;
  status: SpaceShareStatus;
  showWorkers: boolean;
  showAttendance: boolean;
  showTracking: boolean;
  showReports: boolean;
  allowRequests: boolean;
  createdAt?: string;
  updatedAt?: string;
}


/** A share as seen by the GUEST org (adds space + owner naming). */
export interface SharedSpace extends SpaceShare {
  spaceName: string;
  ownerOrgName: string;
}


export interface SpaceShareRequest {
  id: string;
  spaceId: string;
  type: SpaceShareRequestType;
  title: string;
  note?: string | null;
  status: SpaceShareRequestStatus;
  createdAt: string;
}


export interface CreateSpaceShareInput {
  guestOrgCode: string;
  level: SpaceShareLevel;
  showWorkers: boolean;
  showAttendance: boolean;
  showTracking: boolean;
  showReports: boolean;
  allowRequests: boolean;
}


export interface UpdateSpaceShareInput {
  level?: SpaceShareLevel;
  showWorkers?: boolean;
  showAttendance?: boolean;
  showTracking?: boolean;
  showReports?: boolean;
  allowRequests?: boolean;
}

import type { CustomerAddress } from './customers';

export interface SpaceUnit extends CustomerAddress {
  customer?: { id: string; name: string; email?: string | null; phone?: string | null } | null;
  residentUserId?: string | null;
  residentUser?: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } | null;
  spaceId?: string | null;
  details?: { label: string; value: string }[] | null;
  createdAt?: string;
}

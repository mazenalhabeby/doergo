import { HttpStatus } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { invitationTargetFields, targetRoleRefusal, type CreateInvitationInput } from '../invitation-create';

const base: CreateInvitationInput = {
  targetRole: Role.EMPLOYEE,
  organizationId: 'org',
  createdById: 'me',
  creatorRole: Role.ADMIN,
};

describe('createInvitation steps', () => {
  it('refuses an ADMIN target and an unknown role, allows employee and customer', () => {
    expect(targetRoleRefusal({ ...base, targetRole: Role.ADMIN })?.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(targetRoleRefusal({ ...base, targetRole: 'NOPE' })?.message).toBe(
      'Target role must be EMPLOYEE or CUSTOMER',
    );
    expect(targetRoleRefusal(base)).toBeNull();
    expect(targetRoleRefusal({ ...base, targetRole: Role.CUSTOMER })).toBeNull();
  });

  it('a non-admin may only invite employees', () => {
    const r = targetRoleRefusal({ ...base, creatorRole: Role.EMPLOYEE, targetRole: Role.CUSTOMER });
    expect(r?.statusCode).toBe(HttpStatus.FORBIDDEN);
  });

  const ctx = {
    inviteIsExternal: false,
    validMemberRoleId: 'r1',
    externalSpacePermissions: null,
    accessProfile: { a: 1 },
  };

  it('an external member gets no schedule', () => {
    const data = {
      ...base,
      scheduleType: 'FIXED',
      schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '16:00', isActive: true }],
    };
    expect(invitationTargetFields(data, ctx).schedule).toHaveLength(1);
    const ext = invitationTargetFields(data, { ...ctx, inviteIsExternal: true });
    expect(ext.schedule).toBeUndefined();
    expect(ext.scheduleType).toBeNull();
    expect(ext.isExternal).toBe(true);
  });

  it('a customer invite keeps only the customer target', () => {
    const f = invitationTargetFields(
      { ...base, targetRole: Role.CUSTOMER, customerId: 'c', position: 'Plumber', spaceId: 's' },
      ctx,
    );
    expect(f).toMatchObject({ customerId: 'c', position: null, spaceId: null, memberRoleId: null, isExternal: false });
    expect(f.accessProfile).toBeUndefined();
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MemberOffboarding } from '../member-offboarding.service';

/*
  Deleting an account: each service erases what IT owns (docs/data-ownership.md, group A).
  auth-service used to delete push tokens, positions and comments itself; now it asks — and
  must refuse to go on if any owner did not answer, or the account is anonymized while
  another service still holds the person's data.
*/
const client = (reply = of({ success: true })) => ({ send: jest.fn(() => reply) });

describe('MemberOffboarding.eraseEverywhere', () => {
  it('asks task, tracking and notification to erase the member', async () => {
    const task = client(),
      tracking = client(),
      notification = client();
    await new MemberOffboarding(task as never, tracking as never, notification as never).eraseEverywhere('u1');
    expect(task.send).toHaveBeenCalledWith({ cmd: 'task_erase_member' }, { userId: 'u1' });
    expect(tracking.send).toHaveBeenCalledWith({ cmd: 'tracking_erase_member' }, { userId: 'u1' });
    expect(notification.send).toHaveBeenCalledWith({ cmd: 'notification_erase_member' }, { userId: 'u1' });
  });

  it('refuses when one owner fails — the account must not be anonymized half-erased', async () => {
    const down = client(throwError(() => new Error('tracking down')));
    const p = new MemberOffboarding(client() as never, down as never, client() as never).eraseEverywhere('u1');
    await expect(p).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

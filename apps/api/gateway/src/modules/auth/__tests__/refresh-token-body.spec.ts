import { isBrowserClient, withoutRefreshTokenForBrowser } from '../auth.controller';

/*
  The web keeps its refresh token ONLY in the httpOnly cookie. The gateway used
  to return it in the JSON body as well, which handed a 30-day credential to
  any script on the page. The phone has no cookie jar and must keep getting it.
*/
describe('refresh token in the response body', () => {
  const answer = { success: true, data: { accessToken: 'a', refreshToken: 'r', user: { id: 'u' } } };
  const req = (platform?: string) => ({ headers: platform ? { 'x-client-platform': platform } : {} }) as any;

  it('is stripped for the web (header or the sign-in body says so)', () => {
    expect(isBrowserClient(req('web'))).toBe(true);
    expect(isBrowserClient(req(), { client: 'web' })).toBe(true);
    const out: any = withoutRefreshTokenForBrowser(answer, true);
    expect(out.data).not.toHaveProperty('refreshToken');
    expect(out.data.accessToken).toBe('a');
    expect(out.data.user).toEqual({ id: 'u' });
  });

  it('is kept for the phone — including old builds that send no header', () => {
    expect(isBrowserClient(req('mobile'))).toBe(false);
    expect(isBrowserClient(req())).toBe(false);
    expect((withoutRefreshTokenForBrowser(answer, false) as any).data.refreshToken).toBe('r');
  });

  it('does not mutate the answer it was given', () => {
    withoutRefreshTokenForBrowser(answer, true);
    expect(answer.data.refreshToken).toBe('r');
  });
});

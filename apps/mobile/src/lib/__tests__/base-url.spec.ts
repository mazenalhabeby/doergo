/**
 * ⚠️ A release build never talks plain HTTP — one resolver for the API and the socket.
 */
import { RELEASE_API_URL, RELEASE_ORIGIN, resolveApiUrl, resolveSocketUrl, resolveWebOrigin } from '../api/base-url';
import * as fs from 'fs';
import * as path from 'path';
import { readSource } from '@/test-utils/read-source';

describe('the API address', () => {
  it('release: an https env URL is used; http is refused for the shipped address', () => {
    expect(resolveApiUrl({ apiUrl: 'https://staging.hbcfield.com/api/v1', dev: false })).toBe(
      'https://staging.hbcfield.com/api/v1',
    );
    expect(resolveApiUrl({ apiUrl: 'http://hbcfield.com/api/v1', dev: false })).toBe(RELEASE_API_URL);
    expect(resolveApiUrl({ apiUrl: 'http://192.168.1.4:4000/api/v1', dev: false })).toBe(RELEASE_API_URL);
    expect(resolveApiUrl({ apiUrl: 'hbcfield.com', dev: false })).toBe(RELEASE_API_URL);
  });
  it('release: a dev host is never used; nothing set means the shipped address, never localhost', () => {
    expect(resolveApiUrl({ debuggerHost: '192.168.1.4:8081', dev: false })).toBe(RELEASE_API_URL);
    expect(resolveApiUrl({ dev: false })).toBe(RELEASE_API_URL);
  });
  it('development keeps http: the env, the LAN dev host, localhost', () => {
    expect(resolveApiUrl({ apiUrl: 'http://localhost:4000/api/v1', dev: true })).toBe('http://localhost:4000/api/v1');
    expect(resolveApiUrl({ debuggerHost: '192.168.1.4:8081', dev: true })).toBe('http://192.168.1.4:4000/api/v1');
    expect(resolveApiUrl({ dev: true })).toBe('http://localhost:4000/api/v1');
  });
});

describe('the socket address', () => {
  it("release: the https API's origin, never http", () => {
    expect(resolveSocketUrl({ apiUrl: 'https://hbcfield.com/api/v1', dev: false })).toBe('https://hbcfield.com');
    expect(
      resolveSocketUrl({ socketUrl: 'http://hbcfield.com', apiUrl: 'https://hbcfield.com/api/v1', dev: false }),
    ).toBe('https://hbcfield.com');
    expect(resolveSocketUrl({ apiUrl: 'http://x.com/api/v1', dev: false })).toBe(RELEASE_ORIGIN);
    expect(resolveSocketUrl({ debuggerHost: '10.0.0.2:8081', dev: false })).toBe(RELEASE_ORIGIN);
  });
  it('development: the notification service beside the API', () => {
    expect(resolveSocketUrl({ debuggerHost: '10.0.0.2:8081', dev: true })).toBe('http://10.0.0.2:4001');
    expect(resolveSocketUrl({ apiUrl: 'http://localhost:4000/api/v1', dev: true })).toBe('http://localhost:4001');
    expect(resolveSocketUrl({ dev: true })).toBe('http://localhost:4001');
  });
  it('both read the one resolver', () => {
    const ROOT = path.resolve(__dirname, '../../..');
    expect(fs.readFileSync(path.join(ROOT, 'src/lib/socket.ts'), 'utf8')).toMatch(
      /resolveSocketUrl\(urlEnvironment\(\)\)/,
    );
    // client.ts reads with the parts moved out of it (test-utils/read-source.ts).
    expect(readSource(path.join(ROOT, 'src/lib/api/client.ts'), 'utf8')).toMatch(/resolveApiUrl\(urlEnvironment\(\)\)/);
  });
});

describe('resolveWebOrigin', () => {
  it('is the https API origin', () => {
    expect(resolveWebOrigin({ apiUrl: 'https://hbcfield.com/api/v1', dev: false })).toBe(RELEASE_ORIGIN);
    expect(resolveWebOrigin({ dev: false })).toBe(RELEASE_ORIGIN);
  });
  it('is nothing for a local http API', () => {
    expect(resolveWebOrigin({ apiUrl: 'http://192.168.1.20:4000/api/v1', dev: true })).toBeNull();
  });
});

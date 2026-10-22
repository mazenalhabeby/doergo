import { ServiceCalls } from '../microservices/service-calls';

type FakeClient = { send?: unknown; emit?: unknown };
const idle = (): FakeClient => ({ send: jest.fn(), emit: jest.fn() });

/** ServiceCalls over fake clients — what a controller spec passes where the app injects the real one. */
export function fakeServiceCalls(
  clients: { auth?: FakeClient; task?: FakeClient; tracking?: FakeClient; notification?: FakeClient } = {},
) {
  return new ServiceCalls(
    (clients.auth ?? idle()) as never,
    (clients.task ?? idle()) as never,
    (clients.tracking ?? idle()) as never,
    (clients.notification ?? idle()) as never,
  );
}

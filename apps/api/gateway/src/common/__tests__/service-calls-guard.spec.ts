import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/*
  One way for a controller to call a microservice: ServiceCalls (common/microservices/service-calls.ts)
  — a timeout on every call, refusals passed through unchanged to the global filter. A controller that
  injects a ClientProxy again, or calls sendRpc / emitEvent / client.send itself, bypasses both
  (code-structure-fix 4.5). Gateway *services* (BaseGatewayService) are their own, older path.
*/
describe('gateway controllers call services through ServiceCalls', () => {
  const root = join(__dirname, '..', '..');
  const controllers = (readdirSync(root, { recursive: true, encoding: 'utf8' }) as string[]).filter(
    (f) => (f.endsWith('.controller.ts') || f.endsWith('controller.base.ts')) && !f.includes('__tests__'),
  );

  it('finds the controllers', () => {
    expect(controllers.length).toBeGreaterThan(50);
  });

  it('no controller injects a ClientProxy or calls a client itself', () => {
    const offenders = controllers.filter((f) => {
      const src = readFileSync(join(root, f), 'utf8');
      return /:\s*ClientProxy\b|\bsendRpc\(|\bemitEvent\(|Client\.send\(/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

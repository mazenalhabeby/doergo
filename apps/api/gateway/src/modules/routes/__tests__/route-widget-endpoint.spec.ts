/**
 * POST /routes/optimize — the one request the home's Today's route card makes.
 *
 * Billed per request (Google Routes), so every refusal here is money: an
 * external member, a member with no tracking, a malformed or absurd body, a
 * script. The throttle is exercised against an app instance of its OWN — the
 * live gateway's limit is per IP, and every tester on this machine shares one.
 */
import 'reflect-metadata';
import { Controller, INestApplication, Post, ValidationPipe, Body, Request } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule, Throttle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import request from 'supertest';
import { DENY_EXTERNAL_KEY } from '../../../common/decorators/deny-external.decorator';
import { OptimizeRouteDto } from '../dto/optimize-route.dto';
import { RoutesController } from '../routes.controller';
import { RoutesService } from '../routes.service';

const START = { lat: 48.105, lng: 16.335 };
const VIENNA = [
  { id: 'billa', lat: 48.2015, lng: 16.3905 },
  { id: 'hofer', lat: 48.1702, lng: 16.421 },
  { id: 'spar', lat: 48.1928, lng: 16.4122 },
  { id: 'rewe', lat: 48.079, lng: 16.316 },
];
const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, lat: 48.1 + i / 1000, lng: 16.3 + i / 2000 }));

/** The gateway's own pipe options (main.ts). */
async function errorsOf(body: unknown) {
  const dto = plainToInstance(OptimizeRouteDto, body, { enableImplicitConversion: true });
  const errors = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true });
  return errors;
}

describe('route widget — the request body', () => {
  it('accepts what the phone sends', async () => {
    expect(await errorsOf({ start: START, stops: VIENNA.map((s) => ({ ...s, label: s.id, address: 'Wien' })) })).toHaveLength(0);
  });

  it('refuses a request with no start (it was a 500)', async () => {
    expect((await errorsOf({ stops: VIENNA })).map((e) => e.property)).toContain('start');
  });

  it.each([
    ['start lat 999', { start: { lat: 999, lng: 16 }, stops: VIENNA }],
    ['start lng -181', { start: { lat: 48, lng: -181 }, stops: VIENNA }],
    ['stop lat 91', { start: START, stops: [{ id: 'x', lat: 91, lng: 16 }] }],
    ['stop lng 180.5', { start: START, stops: [{ id: 'x', lat: 48, lng: 180.5 }] }],
    ['NaN', { start: { lat: NaN, lng: 16 }, stops: VIENNA }],
    ['Infinity', { start: START, stops: [{ id: 'x', lat: Infinity, lng: 16 }] }],
    ['a word for a number', { start: { lat: 'north', lng: 16 }, stops: VIENNA }],
    ['no stops', { start: START, stops: [] }],
    ['51 stops', { start: START, stops: many(51) }],
    ['a field the route API does not take', { start: START, stops: [{ ...VIENNA[0], at: '09:00' }] }],
    ['a stop with no id', { start: START, stops: [{ lat: 48, lng: 16 }] }],
    ['an id longer than 64', { start: START, stops: [{ id: 'x'.repeat(65), lat: 48, lng: 16 }] }],
    ['a label longer than 200', { start: START, stops: [{ id: 'x', lat: 48, lng: 16, label: 'l'.repeat(201) }] }],
    ['a profile other than driving', { start: START, stops: VIENNA, profile: 'flying' }],
  ])('refuses %s', async (_name, body) => {
    expect((await errorsOf(body)).length).toBeGreaterThan(0);
  });

  it('accepts the edges of the world and exactly 50 stops', async () => {
    expect(await errorsOf({ start: { lat: -90, lng: -180 }, stops: [{ id: 'x', lat: 90, lng: 180 }] })).toHaveLength(0);
    expect(await errorsOf({ start: START, stops: many(50) })).toHaveLength(0);
  });
});

describe('route widget — the answer', () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  const key = process.env.GOOGLE_PLACES_API_KEY;
  afterEach(() => {
    fetchSpy.mockReset();
    if (key === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = key;
  });
  afterAll(() => fetchSpy.mockRestore());

  async function service(googleKey?: string) {
    jest.resetModules();
    delete process.env.OSRM_URL;
    if (googleKey) process.env.GOOGLE_PLACES_API_KEY = googleKey; else delete process.env.GOOGLE_PLACES_API_KEY;
    const { RoutesService: S } = await import('../routes.service');
    return new S();
  }

  it('orders the Vienna day from where the driver is — the nearest stop first, a city-sized total', async () => {
    const r = await (await service()).optimize({ start: START, stops: VIENNA } as never);
    expect(r.order).toEqual(['rewe', 'hofer', 'spar', 'billa']);
    expect(r.totalMeters).toBeLessThan(40_000);
    expect(r.waypoints[0]).toMatchObject(START);
  });

  it('NEVER drops a stop: over the engine limit every stop is still ordered, and no engine is billed', async () => {
    const r = await (await service('test-key')).optimize({ start: START, stops: many(30) } as never);
    expect(r.order).toHaveLength(30);
    expect(new Set(r.order).size).toBe(30);
    expect(r.engine).toBe('nearest-neighbour');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('50 stops answer quickly without an engine', async () => {
    const svc = await service();
    const t0 = Date.now();
    const r = await svc.optimize({ start: START, stops: many(50) } as never);
    expect(r.order).toHaveLength(50);
    expect(r.legs).toHaveLength(50);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('route widget — who may ask', () => {
  it('is closed to external members', () => {
    expect(Reflect.getMetadata(DENY_EXTERNAL_KEY, RoutesController.prototype.optimize)).toBe(true);
  });

  it('is throttled at 20 a minute under the throttler named default (the only name @Throttle overrides)', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', RoutesController.prototype.optimize)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', RoutesController.prototype.optimize)).toBe(60000);
  });

  const svc = { optimize: jest.fn().mockResolvedValue({ order: [] }) } as unknown as RoutesService;
  const ctl = new RoutesController(svc);
  const body = { start: START, stops: VIENNA } as never;

  it.each([
    ['tracking in an assigned workspace', { spaceModules: ['tracking'] }, true],
    ['tracking only org-wide, workspaces resolved without it', { spaceModules: ['crm'], orgModules: ['tracking'] }, false],
    ['an older session with no workspace list — the org list decides', { orgModules: ['tracking'] }, true],
    ['no tracking anywhere', { spaceModules: [], orgModules: [] }, false],
    ['no modules at all', {}, false],
  ])('%s', async (_n, user, allowed) => {
    const call = () => ctl.optimize(body, { user });
    if (allowed) await expect(call()).resolves.toBeDefined();
    else {
      try { await call(); throw new Error('allowed'); } catch (e: any) { expect(e.getStatus?.()).toBe(402); }
    }
  });
});

describe('route widget — the throttle, on an app of its own', () => {
  let app: INestApplication;

  @Controller('routes')
  class ThrottledRoutes {
    @Post('optimize')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    optimize(@Body() dto: OptimizeRouteDto, @Request() req: any) { return new RoutesController({ optimize: async () => ({ order: dto.stops.map((s) => s.id) }) } as never).optimize(dto, req); }
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 200 }])],
      controllers: [ThrottledRoutes],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = mod.createNestApplication();
    app.use((req: any, _res: unknown, next: () => void) => { req.user = { spaceModules: ['tracking'] }; next(); });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('answers 20 plans a minute and refuses the 21st', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) {
      codes.push((await request(app.getHttpServer()).post('/routes/optimize').send({ start: START, stops: VIENNA })).status);
    }
    expect(codes.slice(0, 20)).toEqual(Array(20).fill(201));
    expect(codes[20]).toBe(429);
  });
});

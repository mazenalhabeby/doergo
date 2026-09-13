import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { createPublicKey, createVerify, randomBytes } from 'crypto';
/*
  ⚠️ The LOCAL PrismaService, not the one in @hbcfield/shared.

  auth-service has its own, and Nest resolves providers by class identity — two
  classes with the same name from different modules are two different DI tokens.
  Importing the shared one compiles perfectly and then fails at BOOT with
  "can't resolve dependency PrismaService", which takes the whole service down.
  Every other provider here imports this path; so does this one.
*/
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService, type AuthResult } from './auth.service';
import { BiometricChallengeStore } from './biometric-challenge.store';

/**
 * Signing in with a key that cannot leave the phone.
 *
 * The device holds a P-256 private key generated inside its Secure Enclave /
 * StrongBox; we hold only the public half. Signing in is: ask for a nonce, sign
 * it there, verify it here. No shared secret exists, so there is nothing in this
 * table worth stealing and nothing for a database dump to leak.
 *
 * ⚠️ Three rules this service exists to hold, each of which turns the whole
 * scheme into theatre if broken:
 *
 * 1. THE NONCE IS OURS, SINGLE-USE AND SHORT-LIVED. A client-supplied or
 *    reusable challenge means one captured signature is a permanent key.
 * 2. ENROLMENT REQUIRES A LIVE SESSION. Otherwise anyone who reaches the
 *    endpoint binds their own key to somebody else's account — which is not a
 *    login bypass, it is account takeover.
 * 3. A REVOKED KEY STAYS REVOKED. Rows are marked, never deleted, so a
 *    re-enrolment cannot silently inherit a retired device's history.
 */
@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly challenges: BiometricChallengeStore,
  ) {}

  /**
   * Bind a phone. `userId` comes from the VERIFIED access token, never the body
   * — see rule 2. The controller is responsible for that and nothing else.
   */
  async enroll(
    userId: string,
    body: { deviceId: string; publicKey: string; label: string; platform: string; secureHardware?: boolean },
  ): Promise<AuthResult> {
    if (!body?.deviceId || !body?.publicKey) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'deviceId and publicKey are required' };
    }

    // Reject a key we could never verify with, at the door rather than on the
    // member's next sign-in attempt.
    if (!this.readPublicKey(body.publicKey)) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'Unreadable public key' };
    }

    /*
      Re-enrolling the same phone REPLACES its key rather than adding one.
      Several live keys for one device means a key the member believes they
      removed still opens the account.
    */
    /*
      ⚠️ One device belongs to ONE member at a time.

      The unique index is (userId, deviceId), so without this a phone enrolled
      by a second member keeps the first member's row alive too — and `verify`
      then has two keys for one device. Re-enrolling hands the phone over
      rather than sharing it.
    */
    await this.prisma.deviceKey.updateMany({
      where: { deviceId: body.deviceId, userId: { not: userId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.deviceKey.upsert({
      where: { userId_deviceId: { userId, deviceId: body.deviceId } },
      create: {
        userId,
        deviceId: body.deviceId,
        publicKey: body.publicKey,
        label: (body.label || 'Phone').slice(0, 64),
        platform: body.platform === 'ios' ? 'ios' : 'android',
        secureHardware: body.secureHardware ?? true,
      },
      update: {
        publicKey: body.publicKey,
        label: (body.label || 'Phone').slice(0, 64),
        secureHardware: body.secureHardware ?? true,
        // A fresh binding is a live device again.
        revokedAt: null,
        lastUsedAt: null,
      },
    });

    this.logger.log(`Device key enrolled for user ${userId} (${body.platform})`);
    return { success: true, data: { enrolled: true } };
  }

  /**
   * Hand out a nonce to sign.
   *
   * ⚠️ Deliberately says nothing about whether the device is known. Answering
   * "no such device" here turns this into an oracle for which phones belong to
   * which accounts, and the signature check is the real gate regardless.
   */
  async challenge(deviceId: string): Promise<AuthResult> {
    if (!deviceId) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: 'deviceId is required' };
    }
    const challenge = randomBytes(32).toString('base64');
    await this.challenges.issue(deviceId, challenge);
    return { success: true, data: { challenge } };
  }

  /** Verify the signature and mint the same session a password login would. */
  async verify(
    body: { deviceId: string; signature: string },
    deviceInfo: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const refused: AuthResult = {
      success: false,
      statusCode: HttpStatus.UNAUTHORIZED,
      message: 'Biometric sign-in failed',
    };
    if (!body?.deviceId || !body?.signature) return refused;

    // ⚠️ Burn the nonce BEFORE verifying. Consuming it only on success lets a
    // captured signature be replayed until the TTL expires.
    const challenge = await this.challenges.consume(body.deviceId);
    if (!challenge) return refused;

    /*
      ⚠️ EXACTLY ONE live key per deviceId, or refuse.

      `findFirst` silently picked the oldest when a phone had been enrolled by
      two different members — so unlocking signed you in as whoever got there
      first, regardless of who was expected. The client now clears its key on
      logout, but the server must not depend on a client behaving: two live rows
      for one device is an ambiguous answer, and the only safe answer to an
      ambiguous credential is no.
    */
    const keys = await this.prisma.deviceKey.findMany({
      where: { deviceId: body.deviceId, revokedAt: null },
      take: 2,
    });
    if (keys.length !== 1) {
      if (keys.length > 1) {
        this.logger.warn(`Device ${body.deviceId} has ${keys.length} live keys — refusing`);
      }
      return refused;
    }
    const key = keys[0];

    if (!this.verifySignature(key.publicKey, challenge, body.signature)) {
      this.logger.warn(`Bad biometric signature for device ${body.deviceId}`);
      return refused;
    }

    const user = await this.prisma.user.findUnique({ where: { id: key.userId } });
    if (!user || !user.isActive) return refused;

    await this.prisma.deviceKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    /*
      ⚠️ The SAME session a password login produces, from the same code.

      `buildSession` was extracted from `login()` for exactly this: two
      hand-written copies of the auth payload is how one door quietly grants a
      permission the other does not, and the symptom is a member whose screens
      differ depending on how they signed in.
    */
    return this.auth.buildSessionForUser(user.id, {
      ...deviceInfo,
      clientPlatform: 'mobile',
    });
  }

  /** The lost-phone button. Marks, never deletes — rule 3. */
  async revoke(userId: string, deviceId: string): Promise<AuthResult> {
    await this.prisma.deviceKey.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, data: { revoked: true } };
  }

  /** What the member sees under Devices. Never returns a public key. */
  async list(userId: string): Promise<AuthResult> {
    const rows = await this.prisma.deviceKey.findMany({
      where: { userId, revokedAt: null },
      select: { deviceId: true, label: true, platform: true, createdAt: true, lastUsedAt: true, secureHardware: true },
      orderBy: { lastUsedAt: 'desc' },
    });
    return { success: true, data: rows };
  }

  /**
   * Every device key for a member, revoked at once.
   *
   * ⚠️ Called on password change. "I think someone has my phone" must have ONE
   * answer that works, and it cannot depend on the member still holding the
   * phone they are trying to cut off.
   */
  async revokeAllFor(userId: string): Promise<void> {
    await this.prisma.deviceKey.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── crypto ──────────────────────────────────────────────────────────────

  /** base64 X.509 SubjectPublicKeyInfo DER — what both platforms emit. */
  private readPublicKey(b64: string) {
    try {
      return createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
    } catch {
      return null;
    }
  }

  private verifySignature(publicKeyB64: string, challengeB64: string, signatureB64: string): boolean {
    const key = this.readPublicKey(publicKeyB64);
    if (!key) return false;
    try {
      /*
        ⚠️ Verify over the DECODED nonce bytes, because that is what the device
        signed — it is told `inputEncoding: Base64`. Verify over the base64
        CHARACTERS instead and every signature is rejected while both sides look
        correct, which is a genuinely miserable thing to debug.
      */
      return createVerify('SHA256')
        .update(Buffer.from(challengeB64, 'base64'))
        .verify(key, Buffer.from(signatureB64, 'base64'));
    } catch {
      return false;
    }
  }
}

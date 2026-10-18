import { OptBoolean, OptString } from '../../../common/dto/body-fields';

/*
  Biometric sign-in bodies (CODE_AUDIT.md B3). Client: the phone's device-key credential
  (lib/biometrics/device-key-credential.ts). Only TYPES are checked; the signature and the
  device binding are verified in auth-service.
*/

/** POST /auth/biometric/enroll — { deviceId, publicKey, label, platform }. */
export class BiometricEnrollDto {
  @OptString() deviceId!: string;
  @OptString() publicKey!: string;
  @OptString() label!: string;
  @OptString() platform!: string;
  @OptBoolean() secureHardware?: boolean;
}

/** POST /auth/biometric/challenge */
export class BiometricChallengeDto {
  @OptString() deviceId!: string;
}

/** POST /auth/biometric/verify */
export class BiometricVerifyDto {
  @OptString() deviceId!: string;
  @OptString() signature!: string;
}

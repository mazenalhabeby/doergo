
export {
  ENVELOPE,
  type PlainStorage,
  type KeyVault,
  type SecureBufferDeps,
  KeyUnavailableError,
  createSecureBuffer,
  type SecureBuffer,
} from './secure-buffer/buffer';
export {
  toBase64,
  fromBase64,
  utf8Encode,
  utf8Decode,
  toBase64Js,
  fromBase64Js,
  utf8EncodeJs,
  utf8DecodeJs,
} from './secure-buffer/encoding';
export { writeSecure, readSecure, forgetSecure, secureStorage, sealPlaintext } from './secure-buffer/phone';

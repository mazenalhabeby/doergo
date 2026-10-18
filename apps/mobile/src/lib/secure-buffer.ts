
export {
  ENVELOPE,
  type PlainStorage,
  type KeyVault,
  KeyUnavailableError,
  createSecureBuffer,
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
export { readSecure, forgetSecure, secureStorage, sealPlaintext } from './secure-buffer/phone';

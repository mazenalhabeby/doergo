import type { CustomerDto } from './dto/customer-bodies.dto';
import { BadRequestException } from '@nestjs/common';
import {
  parseClientLocale,
  CLIENT_LOCALE_INVALID_MESSAGE,
  parseCurrency,
  CURRENCY_INVALID_MESSAGE,
} from '@hbcfield/shared';

/**
 * Refuse a language that is not on the list before anything is forwarded.
 *
 * auth-service refuses it too — it is the boundary, and the phone's offline
 * sync reaches it by another route — but a request that can only fail should
 * fail here, without a round trip and without a module check on the way.
 */
function assertClientLocale(dto: CustomerDto): void {
  if (dto.locale !== undefined && !parseClientLocale(dto.locale).ok) {
    throw new BadRequestException(CLIENT_LOCALE_INVALID_MESSAGE);
  }
  if (dto.currency !== undefined && !parseCurrency(dto.currency, { optional: true }).ok) {
    throw new BadRequestException(CURRENCY_INVALID_MESSAGE);
  }
}

export { assertClientLocale };
export { CustomerDto } from './dto/customer-bodies.dto';

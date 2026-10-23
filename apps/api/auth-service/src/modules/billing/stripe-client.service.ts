import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * The ONE Stripe SDK client in this service, built lazily so auth-service still
 * boots when the keys are absent (billing reports "not configured" until they
 * are set). Every Stripe service asks this owner rather than building its own.
 */
@Injectable()
export class StripeClientService {
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('STRIPE_SECRET_KEY');
  }

  get api(): Stripe {
    if (!this.client) {
      const key = this.config.get<string>('STRIPE_SECRET_KEY');
      if (!key) {
        throw new InternalServerErrorException('Stripe is not configured (STRIPE_SECRET_KEY missing)');
      }
      this.client = new Stripe(key, { typescript: true, maxNetworkRetries: 2 });
    }
    return this.client;
  }
}

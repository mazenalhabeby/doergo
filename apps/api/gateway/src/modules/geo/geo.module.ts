import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { GeoController } from './geo.controller';

/**
 * Server-side geocoding proxy.
 *
 * Two providers, both optional: Google (worldwide, metered) and a self-hosted
 * Photon (free, only as wide as its index). Either alone is enough.
 */
@Module({
  controllers: [GeoController],
})
export class GeoModule implements OnModuleInit {
  private readonly logger = new Logger(GeoModule.name);

  /**
   * Say which geocoders are live, at boot.
   *
   * Every way this can be misconfigured fails the same silent way: an address
   * field that stops auto-filling, a clock-in with no city on it. Nothing
   * errors, nothing is thrown, and the first report comes from a customer.
   *
   * That matters most while Photon is being decommissioned — deleting the
   * container before enabling Google's Geocoding API leaves reverse geocoding
   * with nowhere to go, and no other sign of it. One line in `docker logs`
   * turns that into something an operator can see before a user does.
   */
  onModuleInit(): void {
    const google = !!process.env.GOOGLE_PLACES_API_KEY?.trim();
    const photon = !!process.env.PHOTON_URL?.trim();

    if (!google && !photon) {
      this.logger.error(
        'No geocoder configured. Address search and reverse geocoding will return nothing — ' +
          'set GOOGLE_PLACES_API_KEY, or PHOTON_URL at a running Photon.',
      );
      return;
    }

    this.logger.log(
      `Geocoding: google=${google ? 'on' : 'off'} photon=${photon ? 'on' : 'off'}` +
        (google
          ? ' (Google needs BOTH Places API and Geocoding API enabled on the key — Places serves search, Geocoding serves reverse)'
          : ''),
    );

    if (!google && photon) {
      this.logger.warn(
        'Photon is the only geocoder: coverage is limited to its index, and it is a single point of failure.',
      );
    }
  }
}

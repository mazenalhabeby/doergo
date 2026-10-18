import { combinedServices } from '../../../common/testing/combined-services';
import { AssetProposalService } from '../asset-proposal.service';
import { ProposalReviewService } from '../proposal-review.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of AssetProposalService, as ONE object — the tests were written against the single class. */
export type AssetProposalServiceParts = Public<AssetProposalService> & Public<ProposalReviewService>;

/** The same, from a Nest test module that registered them all. */
export function assetProposalServicesOf(mod: { get<T>(cls: new (...a: never[]) => T): T }): AssetProposalServiceParts {
  // Only the services this test module registered — a test that provides one of them still works.
  const parts = [AssetProposalService, ProposalReviewService].flatMap((C) => {
    try {
      return [mod.get(C as unknown as new (...a: never[]) => object)];
    } catch {
      return [];
    }
  });
  return combinedServices<AssetProposalServiceParts>(...parts);
}

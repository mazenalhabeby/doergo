import { combinedServices } from '../../../common/testing/combined-services';
import { CustomFieldsService } from '../custom-fields.service';
import { CustomFieldValuesService } from '../custom-field-values.service';

/** The public face of a class (an intersection of classes with private members is `never`). */
type Public<T> = { [K in keyof T]: T[K] };

/** Every service split out of CustomFieldsService, as ONE object — the tests were written against the single class. */
export type CustomFieldsServiceParts = Public<CustomFieldsService> & Public<CustomFieldValuesService>;

export function customFieldsParts(...args: unknown[]): CustomFieldsServiceParts {
  const customFieldsService = new (CustomFieldsService as unknown as new (...a: unknown[]) => object)(...args) as any;
  const customFieldValuesService = new (CustomFieldValuesService as unknown as new (...a: unknown[]) => object)(...args) as any;
  return combinedServices<CustomFieldsServiceParts>(customFieldsService, customFieldValuesService);
}

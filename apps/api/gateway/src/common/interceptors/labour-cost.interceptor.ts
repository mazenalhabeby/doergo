import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { mayViewLabourCost, stripCostRates } from '@hbcfield/shared';

/**
 * What labour COSTS reaches only the people allowed to see it — on the way in
 * AND on the way out.
 *
 * ⚠️ Applied to whole controllers whose records carry a cost rate (workspaces,
 * workspace members). A cost rate rides on a record, so it turns up inside
 * lists, details, create and update responses alike; one interceptor at the
 * boundary covers every route a controller has now and every route it gains
 * later, where a per-route strip is one forgotten route away from a leak.
 *
 * In: a body that tries to SET a cost (`costRateCents`) without the permission
 * is refused — writing a cost must not be a way to learn or move one.
 */
@Injectable()
export class LabourCostInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const may = mayViewLabourCost(req?.user);
    const body = req?.body;
    if (!may && body && typeof body === 'object' && !Array.isArray(body) && (body.costRateCents !== undefined || body.costDayCents !== undefined)) {
      throw new ForbiddenException('You cannot set what labour costs');
    }
    return next.handle().pipe(map((res) => stripCostRates(res, may)));
  }
}


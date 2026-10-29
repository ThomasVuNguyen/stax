/**
 * Port of feature/controller/FeatureGateController.
 * `@PreAuthorize("@membershipAuthorizer.isMemberOf('TODO_GROUP_ID')")` is kept literally: the
 * caller must be a (transitive) member of the Google group "TODO_GROUP_ID"; denial is rendered like
 * the other @PreAuthorize failures (see lib/permissions.ts).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono } from "../../lib/ctx";
import { UnauthorizedException } from "../../lib/errors";
import * as MembershipAuthorizer from "../../domain/authentication/service/MembershipAuthorizer";
import * as FeatureGateService from "../service/FeatureGateService";
import type { FeatureStateDTO } from "../dto/FeatureStateDTO";

const app = new Hono<AppEnv>();

app.get("/internal/feature-gate", async (c) => {
  const ctx = ctxFromHono(c);
  if (!(await MembershipAuthorizer.isMemberOf(ctx, "TODO_GROUP_ID"))) {
    throw new UnauthorizedException("Access Denied");
  }
  const response: FeatureStateDTO = {
    metadata: FeatureGateService.getCurrentMetadata(),
    features: FeatureGateService.getFeatures(),
  };
  return c.json(response);
});

export default app;

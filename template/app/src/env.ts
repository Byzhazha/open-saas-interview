import { defineEnvValidationSchema } from "wasp/env";

import * as z from "zod";
import { googleAnalyticsEnvSchema, plausibleEnvSchema } from "./analytics/env";
import { authEnvSchema } from "./auth/env";
import { animationVideoEnvSchema } from "./animation/env";
import { demoAiAppEnvSchema } from "./demo-ai-app/env";
import { cmsEnvSchema } from "./admin/content/env";
import { fileUploadEnvSchema } from "./file-upload/env";
import { lemonSqueezyEnvSchema } from "./payment/lemonSqueezy/env";
import { polarEnvSchema } from "./payment/polar/env";
import { stripeEnvSchema } from "./payment/stripe/env";

// Wasp merges this schema with its built-in env var validations and uses it
// to validate `process.env` at server startup. Access the validated env vars
// with `import { env } from 'wasp/server'` instead of using `process.env` directly.
// https://wasp.sh/docs/project/env-vars#custom-env-var-validations
//
// If you remove a feature (e.g. an analytics or payment provider), make sure
// to also remove its env schema import and `...schema.shape` below.
export const serverEnvValidationSchema = defineEnvValidationSchema(
  z.object({
    ...authEnvSchema.shape,
    ...animationVideoEnvSchema.shape,
    ...stripeEnvSchema.shape,
    ...lemonSqueezyEnvSchema.shape,
    ...polarEnvSchema.shape,
    ...demoAiAppEnvSchema.shape,
    ...cmsEnvSchema.shape,
    ...fileUploadEnvSchema.shape,
    ...plausibleEnvSchema.shape,
    ...googleAnalyticsEnvSchema.shape,
  }),
);

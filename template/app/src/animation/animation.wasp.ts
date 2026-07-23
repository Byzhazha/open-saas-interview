import { action, job, page, query, route, type Spec } from "@wasp.sh/spec";

import { AnimationPage } from "./AnimationPage" with { type: "ref" };
import {
  createAnimation,
  getAnimationVideoDownloadURL,
  getAnimationVideoJobs,
  getAnimations,
  retryAnimationVideo,
  requestAnimationVideo,
} from "./operations" with { type: "ref" };
import { convertAnimationToVideoJob } from "./workers" with { type: "ref" };

export const animationSpec: Spec = [
  route(
    "AnimationRoute",
    "/animations",
    page(AnimationPage, { authRequired: true }),
  ),
  query(getAnimations, { entities: ["Animation"] }),
  query(getAnimationVideoJobs, {
    entities: ["AnimationVideoJob", "Animation"],
  }),
  query(getAnimationVideoDownloadURL, {
    entities: ["AnimationVideoJob", "Animation"],
  }),
  action(createAnimation, { entities: ["Animation", "User"] }),
  action(requestAnimationVideo, {
    entities: ["Animation", "AnimationVideoJob", "User"],
  }),
  action(retryAnimationVideo, { entities: ["AnimationVideoJob", "User"] }),
  job(convertAnimationToVideoJob, {
    executor: "PgBoss",
    entities: ["AnimationVideoJob", "Animation"],
  }),
];

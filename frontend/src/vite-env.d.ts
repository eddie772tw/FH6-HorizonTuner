/// <reference types="vite/client" />

interface AppBuildInfo {
  version: string;
  gitCommit: string;
  gitBranch: string;
  releaseTag: string | null;
  isDirty: boolean;
  isReleaseBuild: boolean;
  buildTime: string;
}

declare const __APP_BUILD_INFO__: AppBuildInfo;
declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;



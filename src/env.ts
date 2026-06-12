// Consumers' bundlers inline NODE_ENV; node types are not loaded here.
declare const process: { env: { NODE_ENV?: string } };

/** True outside production builds. */
export const isDevEnv = process.env.NODE_ENV !== "production";

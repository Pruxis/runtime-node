import type { APIGatewayProxyHandler } from "aws-lambda";
import { getPackageVersion } from "../helpers/getPackageVersion";
import { satisfiesVersion } from "../helpers/satisfiesVersion";
import { Agent } from "./Agent";
import { getInstance, setInstance } from "./AgentSingleton";
import { API, APIFetch, APIThrottled, Token } from "./API";
import { createLambdaWrapper } from "../sources/Lambda";
import { MongoDB } from "../sinks/MongoDB";

import { Express } from "../sources/Express";
import { Postgres } from "../sinks/Postgres";
import { Mysql2 } from "../sinks/Mysql2";

import * as shimmer from "shimmer";
import { Logger, LoggerConsole, LoggerNoop } from "./Logger";
import { Wrapper } from "./Wrapper";
import { Options, getOptions } from "../helpers/getOptions";

function wrapInstalledPackages() {
  const packages = [new Postgres(), new MongoDB(), new Express(), new Mysql2()];

  const wrapped: Record<string, { version: string; supported: boolean }> = {};
  for (const wrapper of packages) {
    const version = getPackageVersion(wrapper.packageName);
    wrapped[wrapper.packageName] = {
      version,
      supported: version
        ? satisfiesVersion(wrapper.versionRange, version)
        : false,
    };

    if (wrapped[wrapper.packageName].supported) {
      wrapper.wrap();
    }
  }

  return wrapped;
}

function getLogger(options: Options): Logger {
  if (options.debug) {
    return new LoggerConsole();
  }

  return new LoggerNoop();
}

function throttle(api: API) {
  return new APIThrottled(api, {
    maxEventsPerInterval: 200,
    intervalInMs: 60 * 60 * 1000,
  });
}

function getAPI(): API {
  if (process.env.AIKIDO_URL) {
    return throttle(new APIFetch(new URL(process.env.AIKIDO_URL)));
  }

  return throttle(
    new APIFetch(new URL("https://guard.aikido.dev/api/runtime/events"))
  );
}

function getTokenFromEnv(): Token | undefined {
  return process.env.AIKIDO_TOKEN
    ? new Token(process.env.AIKIDO_TOKEN)
    : undefined;
}

function getAgent({
  options,
  serverless,
}: {
  options: Options;
  serverless: boolean;
}) {
  const current = getInstance();

  if (current) {
    return current;
  }

  const installed = wrapInstalledPackages();
  const agent = new Agent(
    options.block,
    getLogger(options),
    getAPI(),
    getTokenFromEnv(),
    serverless,
    installed
  );

  setInstance(agent);

  return agent;
}
/**
 * This function **disables** logging from the "shimer" package - this avoid logs whenever a function doesn't exist
 */
function disableShimmerLogging() {
  shimmer({ logger: () => {} });
}

/**
 * Creates an {@link Agent} and starts it. This function is used directly by the end-user.
 * @param options Options to pass along to the protect function (See type definition)
 */
export function protect(options?: Partial<Options>) {
  disableShimmerLogging();

  const agent = getAgent({
    options: getOptions(options),
    serverless: false,
  });

  agent.start();
}

/**
 * Creates an {@link Agent} and starts it. This function is used directly by the end-user.
 * @param options Options to pass along to the protect function (See type definition)
 * @returns Function that allows creation of lambda wrapper
 */
export function lambda(
  options?: Partial<Options>
): (handler: APIGatewayProxyHandler) => APIGatewayProxyHandler {
  disableShimmerLogging();

  const agent = getAgent({
    options: getOptions(options),
    serverless: true,
  });

  agent.start();

  return createLambdaWrapper;
}

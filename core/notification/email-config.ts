import { logger } from "@core/logging/app-logger";

export interface EmailServiceConfig {
  fromEmail: string;
  fromName: string;
  adminEmail: string;
}

function isDevelopmentEnv(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "development";
}

function resolveEnvValue(options: {
  value: string | undefined;
  envName: "FROM_EMAIL" | "FROM_NAME" | "ADMIN_EMAIL";
  defaultValue: string;
}): string {
  if (options.value) {
    return options.value;
  }

  logger.warn(`${options.envName} not set, using default`, {
    category: "email",
    action: "email_config_validation",
    default_value: options.defaultValue,
    outcome: "success",
  });

  return options.defaultValue;
}

export function resolveEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailServiceConfig {
  const fromEmail = env.FROM_EMAIL;
  const fromName = env.FROM_NAME;
  const adminEmail = env.ADMIN_EMAIL;

  if (!isDevelopmentEnv(env)) {
    if (!fromEmail) {
      throw new Error(
        "FROM_EMAIL environment variable is required in production. Please set it in your environment variables."
      );
    }

    if (!adminEmail) {
      throw new Error(
        "ADMIN_EMAIL environment variable is required in production. Please set it in your environment variables."
      );
    }
  }

  return {
    fromEmail: resolveEnvValue({
      value: fromEmail,
      envName: "FROM_EMAIL",
      defaultValue: "noreply@eventpay.jp",
    }),
    fromName: resolveEnvValue({
      value: fromName,
      envName: "FROM_NAME",
      defaultValue: "みんなの集金",
    }),
    adminEmail: resolveEnvValue({
      value: adminEmail,
      envName: "ADMIN_EMAIL",
      defaultValue: "admin@eventpay.jp",
    }),
  };
}

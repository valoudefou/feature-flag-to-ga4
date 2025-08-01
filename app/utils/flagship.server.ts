import {
  Flagship,
  FSSdkStatus,
  DecisionMode,
  LogLevel,
  Visitor,
} from "@flagship.io/react-sdk";

// Array to store Flagship logs for debug display
const flagshipLogs: {
  timestamp: string;
  level: string;
  message: string;
}[] = [];

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

// Custom LogManager that captures logs into the flagshipLogs array
const customLogManager = {
  emergency(message: string, tag?: string) {
    this.log(LogLevel.EMERGENCY, message, tag);
  },
  alert(message: string, tag?: string) {
    this.log(LogLevel.ALERT, message, tag);
  },
  critical(message: string, tag?: string) {
    this.log(LogLevel.CRITICAL, message, tag);
  },
  error(message: string, tag?: string) {
    this.log(LogLevel.ERROR, message, tag);
  },
  warning(message: string, tag?: string) {
    this.log(LogLevel.WARNING, message, tag);
  },
  notice(message: string, tag?: string) {
    this.log(LogLevel.NOTICE, message, tag);
  },
  info(message: string, tag?: string) {
    this.log(LogLevel.INFO, message, tag);
  },
  debug(message: string, tag?: string) {
    this.log(LogLevel.DEBUG, message, tag);
  },
  log(level: LogLevel, message: string, tag?: string) {
    const timestamp = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    flagshipLogs.push({
      timestamp,
      level: LogLevel[level],
      message: tag ? `[${tag}] ${message}` : message,
    });
  },
};


type VisitorData = {
  id: string;
  hasConsented: boolean;
  context: Record<string, any>;
};

let flagshipInstance: Flagship | null = null;
let flagshipPromise: Promise<Flagship> | null = null;

// Helper to require environment variables
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

// Initializes a Flagship SDK instance
async function initializeFlagship(
  envId: string,
  apiKey: string
): Promise<Flagship> {
  return Flagship.start(envId, apiKey, {
    fetchNow: false,
    decisionMode: DecisionMode.DECISION_API,
    logLevel: LogLevel.ALL,
    logManager: customLogManager
  });
}

// Gets or creates the singleton Flagship instance with race-safe promise caching
async function getSingletonFlagship(): Promise<Flagship> {
  if (
    flagshipInstance &&
    flagshipInstance.getStatus() !== FSSdkStatus.SDK_NOT_INITIALIZED
  ) {
    return flagshipInstance;
  }

  if (!flagshipPromise) {
    const envId = requireEnv("FS_ENV_ID");
    const apiKey = requireEnv("FS_API_KEY");
    flagshipPromise = initializeFlagship(envId, apiKey).then((fs) => {
      flagshipInstance = fs;
      return fs;
    });
  }

  return flagshipPromise;
}

// Creates and fetches visitor flags from a given Flagship instance
async function createVisitorAndFetchFlags(
  flagship: Flagship,
  data: VisitorData
): Promise<Visitor> {
  const visitor = flagship.newVisitor({
    visitorId: data.id,
    hasConsented: data.hasConsented,
    context: data.context,
  });

  await visitor.fetchFlags();
  return visitor;
}

// Main: uses the shared singleton instance
export async function getFsVisitorData(data: VisitorData): Promise<Visitor> {
  const flagship = await getSingletonFlagship();
  return createVisitorAndFetchFlags(flagship, data);
}

// Alternate: uses a fresh instance with fallback env vars
export async function getFsVisitorData2(data: VisitorData): Promise<Visitor> {
  const envId = requireEnv("FS_ENV_ID_DAVID");
  const apiKey = requireEnv("FS_API_KEY_DAVID");
  const freshInstance = await initializeFlagship(envId, apiKey);
  return createVisitorAndFetchFlags(freshInstance, data);
}

// Alternate: uses a fresh instance with ED env vars
export async function getFsVisitorData3(data: VisitorData): Promise<Visitor> {
  const envId = requireEnv("FS_ENV_ID_ED");
  const apiKey = requireEnv("FS_API_KEY_ED");
  const freshInstance = await initializeFlagship(envId, apiKey);
  return createVisitorAndFetchFlags(freshInstance, data);
}

// Helper to get the string name of a log level (e.g., "ALL")
export const logLevelName = (level: LogLevel) => LogLevel[level];

// In flagship.server.ts
export function getFlagshipLogs(): LogEntry[] {
  return flagshipLogs; // Your existing logs array
}


// Never 0.0.0.0: the cockpit must be unreachable from the network.
export function bindConfig(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  hostname: string;
} {
  return { port: Number(env.PORT ?? 3000), hostname: "127.0.0.1" };
}

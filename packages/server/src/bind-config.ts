export function bindConfig(env: NodeJS.ProcessEnv): {
  port: number;
  hostname: string;
} {
  return { port: Number(env.PORT ?? 3000), hostname: "127.0.0.1" };
}

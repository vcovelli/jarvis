export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionEnvironment } = await import("@/lib/env");
    assertProductionEnvironment();
  }
}

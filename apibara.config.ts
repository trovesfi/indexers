import 'dotenv/config'
import { defineConfig } from "apibara/config";

export default defineConfig({
  runtimeConfig: {
    connectionString: process.env.POSTGRES_CONNECTION_STRING!,
    streamUrl: process.env.STREAM_URL!,
    startingBlock: process.env.STARTING_BLOCK!,
  },
});

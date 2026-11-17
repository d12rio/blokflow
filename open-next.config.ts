import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page reads the Storyblok session at request time, so there is nothing to cache between requests.
export default defineCloudflareConfig({});

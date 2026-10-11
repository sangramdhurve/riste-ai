import { existsSync } from "node:fs";

// The web server loads .env on its own; the worker is a plain Node process, so
// it must load .env before any module reads process.env at import time (the
// queue's Redis URL, the email transport). Must stay the first import in
// index.ts. Variables already set (Docker env_file) win over the file, and in
// the container there is no .env file at all.
if (existsSync(".env")) process.loadEnvFile(".env");

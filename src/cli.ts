#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { retrofitCommand } from "./commands/retrofit.js";
import { doctorCommand } from "./commands/doctor.js";
import { indexCommand } from "./commands/index.js";
import { searchCommand } from "./commands/search.js";

const program = new Command();
program.name("ai-harness").description("Scaffold Codex+Claude repo workflows").version("0.1.0");
program.command("init").action(initCommand);
program.command("retrofit").option("--dry-run", "show changes without writing").action((opts) => retrofitCommand(Boolean(opts.dryRun)));
program.command("doctor").action(doctorCommand);
program.command("index").action(indexCommand);
program.command("search").argument("<query>").action(searchCommand);
program.parseAsync(process.argv);

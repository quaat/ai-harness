#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { retrofitCommand } from "./commands/retrofit.js";
import { doctorCommand } from "./commands/doctor.js";
import { indexCommand } from "./commands/index.js";
import { searchCommand } from "./commands/search.js";
import { taskCommand } from "./commands/task.js";

const program = new Command();
program.name("ai-harness").description("Scaffold Codex+Claude repo workflows").version("0.1.0");
program.command("init").action(initCommand);
program.command("retrofit").option("--dry-run").option("--merge").option("--force").action((opts) => retrofitCommand(opts));
program.command("doctor").action(doctorCommand);
program.command("index").action(indexCommand);
program.command("search").argument("<query>").option("--json").option("--top-k <n>").action((q, opts) => searchCommand(q, opts));
program.addCommand(taskCommand());
program.parseAsync(process.argv);

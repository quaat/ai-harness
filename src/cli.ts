#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { retrofitCommand } from "./commands/retrofit.js";
import { doctorCommand } from "./commands/doctor.js";
import { indexCommand } from "./commands/index.js";
import { searchCommand } from "./commands/search.js";
import { taskCommand } from "./commands/task.js";

const program = new Command();
program
  .name("ai-harness")
  .description("Scaffold and validate a retrieval-first Claude + Codex workflow using Git-native task artifacts.")
  .version("0.1.0")
  .addHelpText("after", `\nExamples:\n  ai-harness init\n  ai-harness doctor\n  ai-harness index\n  ai-harness task create user-auth --prompt "Add email/password authentication"\n  ai-harness task context user-auth\n  ai-harness task claude user-auth`);

program.command("init").description("Initialize ai-harness files in a fresh repository").action(initCommand);
program.command("retrofit").description("Add ai-harness files to an existing repository").option("--dry-run").option("--merge").option("--force").action((opts) => retrofitCommand(opts));
program.command("doctor").description("Validate harness files, hooks, skills, and tooling").option("--json", "Machine-readable doctor output").action((opts) => doctorCommand(opts));
program.command("index").description("Build or refresh the local lexical RAG index").action(indexCommand);
program.command("search").description("Search the lexical RAG index for relevant code chunks").argument("<query>").option("--json").option("--top-k <n>").action((q, opts) => searchCommand(q, opts));
program.addCommand(taskCommand());
program.parseAsync(process.argv);

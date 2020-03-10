/**
 * Drake drakefile.
 */

import { readFile } from "./lib/utils.ts";
import { abort, desc, env, glob, quote, run, sh, task } from "./mod.ts";

env["--default-task"] = "test";
const TS_FILES = glob("**/*.ts").filter(p => !p.endsWith(".d.ts"));

desc("Run tests");
task("test", ["fmt"], async function() {
  await sh("deno test -A tests");
});

desc("Format source files");
task("fmt", [], async function() {
  await sh(`deno fmt ${quote(TS_FILES)}`);
});

desc("Install drake executable CLI wrapper");
task("install", ["test"], async function() {
  await sh("deno install -A -f drake ./drake.ts");
});

desc("Run examples drakefile");
task("run", ["test"], async function() {
  await sh(`
    cd ./examples
    deno run -A ./Drakefile.ts prereqs pause "qux=Foo Bar" noop
  `);
});

desc(
  "Create Git version tag e.g. 'drake tag vers=1.0.0' creates tag 'v1.0.0'"
);
task("tag", ["test"], async function() {
  if (!env.vers) {
    abort("'vers' command-line variable not set e.g. drake tag vers=1.0.0");
  }
  if (!/^\d+\.\d+\.\d+/.test(env.vers)) {
    abort(`illegal semantic version number: ${env.vers}`);
  }
  let match = readFile("mod.ts").match(/^const vers: string = "(.+)"/m);
  if (!match) {
    abort(`missing 'vers' declaration in mod.ts`);
  }
  if (match[1] !== env.vers) {
    abort(`${env.vers} does not match version ${match[1]} in mod.ts`);
  }
  const tag = `v${env.vers}`;
  console.log(`tag: ${tag}`);
  await sh(`git tag -a -m ${tag} ${tag}`);
});

desc("Push changes to Github");
task("push", ["test"], async function() {
  await sh("git push -u --tags origin master");
});

run();

import { existsSync } from "https://deno.land/std@v1.0.0-rc1/fs/exists.ts";
import * as path from "https://deno.land/std@v1.0.0-rc1/path/mod.ts";
import {
  assert,
  assertEquals,
  assertNotEquals,
  assertStrContains,
  assertThrows,
  assertThrowsAsync,
} from "https://deno.land/std@v1.0.0-rc1/testing/asserts.ts";
import {
  abort,
  DrakeError,
  env,
  glob,
  isFileTask,
  isNormalTask,
  newEnvFunction,
  normalizePath,
  normalizeTaskName,
  outOfDate,
  quote,
  readFile,
  sh,
  shCapture,
  sleep,
  touch,
  updateFile,
  writeFile,
} from "../lib/utils.ts";

env("--abort-exits", false);

Deno.test("abortTest", function () {
  assertThrows(
    () => abort("Abort test"),
    DrakeError,
    "Abort test",
  );
});

Deno.test("envTest", function () {
  const boolOpts = [
    "--abort-exits",
    "--always-make",
    "--debug",
    "--dry-run",
    "--help",
    "--list-all",
    "--list-tasks",
    "--quiet",
    "--version",
  ];
  const strOpts = [
    "--default-task",
    "--directory",
    "--drakefile",
  ];
  const env = newEnvFunction({});
  for (const opt of boolOpts) {
    assertEquals(env(opt), undefined);
    env(opt, true);
    assertEquals(env(opt), true);
  }
  for (const opt of strOpts) {
    env(opt, "some-value");
    assertEquals(env(opt), "some-value");
    assertThrows(
      () => env(opt, 42),
      DrakeError,
      `${opt} must be a string`,
    );
  }
  assertThrows(
    () => env("-foobar", "quux"),
    DrakeError,
    "illegal option: -foobar",
  );
  assertThrows(
    () => env("foo-bar", "quux"),
    DrakeError,
    "illegal variable name: foo-bar",
  );
  env("--tasks", []);
  assertEquals(env("--tasks"), []);
  assertThrows(
    () => env("--tasks", "quux"),
    DrakeError,
    "--tasks must be a string array",
  );
});

Deno.test("fileFunctionsTest", function () {
  const dir = Deno.makeTempDirSync();
  try {
    // Read, write update tests.
    let file = path.join(dir, "fileTest");
    const text = "foobar";
    writeFile(file, text);
    assertEquals(readFile(file), text);
    assertEquals(updateFile(file, /o/g, "O!"), true);
    assertEquals(readFile(file), "fO!O!bar");
    assertEquals(updateFile(file, /o/g, "O!"), false);
    assertEquals(updateFile(file, /zzz/g, "O!"), false);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("touchTest", async function () {
  const dir = Deno.makeTempDirSync();
  try {
    const file = path.join(dir, "a/b/foobar");
    touch(file);
    assert(existsSync(file), "touched file and directories should exist");
    assertEquals(
      Deno.statSync(file).size,
      0,
      "new touched file should have zero length",
    );
    await touchAndCheck(file);
    writeFile(file, "foobar");
    await touchAndCheck(file);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

async function touchAndCheck(file: string) {
  const oldTime = Deno.statSync(file).mtime!.getTime();
  const oldSize = Deno.statSync(file).size;
  await sleep(10); // File system timestamp uncertainty.
  touch(file);
  assert(existsSync(file), "touched file should exist");
  assertEquals(
    Deno.statSync(file).size,
    oldSize,
    "touched file size should not change",
  );
  assert(
    Deno.statSync(file).mtime!.getTime() > oldTime,
    "touched file timestamp should be newer",
  );
}

Deno.test("outOfDateTest", async function () {
  const dir = Deno.makeTempDirSync();
  try {
    const prereqs = ["a/b/z.ts", "a/y.ts", "u"].map((f) => path.join(dir, f));
    const target = path.join(dir, "target.ts");
    touch(target, ...prereqs);
    assertThrows(
      () => outOfDate(target, [path.join(dir, "non-existent-file")]),
      DrakeError,
      "outOfDate: missing prerequisite file:",
    );
    // Touch target to ensure up to date.
    await touchAndCheck(target);
    assert(!outOfDate(target, prereqs), "touched target: should be up to date");

    // Touch prerequisite to ensure out of date.
    await sleep(10);
    await touchAndCheck(prereqs[0]);
    assert(
      outOfDate(target, prereqs),
      "touched prerequisite: should be out of date",
    );
    // Delete target to ensure out of date.
    Deno.removeSync(target);
    assert(outOfDate(target, prereqs), "missing target: should be out of date");
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("globTest", function () {
  let files = glob("./mod.ts", "./lib/*.ts");
  assertEquals(
    files,
    ["lib/graph.ts", "lib/help.ts", "lib/tasks.ts", "lib/utils.ts", "mod.ts"]
      .map((p) => normalizePath(p)),
  );
  files = glob("./mod.ts", "./lib/!(graph|utils).ts");
  assertEquals(
    files,
    ["lib/help.ts", "lib/tasks.ts", "mod.ts"].map((p) => normalizePath(p)),
  );
  const dir = Deno.makeTempDirSync();
  try {
    const fixtures = ["a/b/z.ts", "a/y.ts", "u", "x.ts"].map((f) =>
      path.join(dir, f)
    ).sort();
    touch(...fixtures);
    files = glob(...["**/*.ts", "u"].map((f) => path.join(dir, f)));
    assertEquals(files, fixtures);
    assertEquals(glob(path.join(dir, "non-existent-file")), []);
    const saved = Deno.cwd();
    try {
      Deno.chdir(dir);
      files = glob("./**/*.ts", "u");
      assertEquals(
        files,
        ["./u", "a/b/z.ts", "a/y.ts", "x.ts"].map((p) => normalizePath(p)),
      );
      files = glob("./**/@(x|y).ts");
      assertEquals(files, ["a/y.ts", "x.ts"].map((p) => normalizePath(p)));
      Deno.chdir("a");
      files = glob("../**/*.ts");
      assertEquals(
        files,
        ["../a/b/z.ts", "../a/y.ts", "../x.ts"].map((p) => normalizePath(p)),
      );
    } finally {
      Deno.chdir(saved);
    }
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});

Deno.test("isTasksTest", function () {
  const tests: [string, boolean][] = [
    ["foobar", true],
    ["--foobar", false],
    ["_foo_bar_", true],
    ["42-foobar", true],
    ["./foobar", false],
    ["foobar.ts", false],
    ["/tmp/foobar", false],
    ["../foobar/", false],
    ["./foobar/quux", false],
    [".foobar", false],
  ];
  for (let [name, expected] of tests) {
    assertEquals(isNormalTask(name), expected);
    assertEquals(isFileTask(name), !expected);
  }
});

Deno.test("normalizePathTest", function () {
  const tests: [string, string][] = [
    ["foobar", "./foobar"],
    ["lib/io.ts", "lib/io.ts"],
    ["/tmp//foobar", "/tmp/foobar"],
    ["/tmp/./foobar", "/tmp/foobar"],
    ["/tmp/../foobar", "/foobar"],
  ];
  for (let [name, expected] of tests) {
    assertEquals(normalizePath(name), normalizePath(expected));
  }
});

Deno.test("normalizeTaskNameTest", function () {
  const tests = [
    [" foobar", "foobar"],
    ["lib/io.ts", "lib/io.ts"].map((p) => normalizePath(p)),
  ];
  for (let [name, expected] of tests) {
    assertEquals(normalizeTaskName(name), expected);
  }
  assertThrows(
    () => normalizeTaskName(" "),
    DrakeError,
    "blank task name",
  );
  const name = "**/*.ts";
  assertThrows(
    () => normalizeTaskName(name),
    DrakeError,
    `wildcard task name not allowed: "${name}"`,
  );
});

Deno.test("quoteTest", function () {
  assertEquals(quote(["foo", '"bar"']), '"foo" "\\"bar\\""');
});

Deno.test("shTest", async function () {
  await sh("echo Hello", { stdout: "null" });
  await assertThrowsAsync(
    async () => await sh("non-existent-command", { stderr: "null" }),
    DrakeError,
    "sh: non-existent-command: error code:",
  );
  await sh(
    ["echo Hello 1", "echo Hello 2", "echo Hello 3"],
    { stdout: "null" },
  );
});

Deno.test("shCaptureTest", async function () {
  let { code, output, error } = await shCapture("echo Hello");
  assertEquals([code, output.trimRight(), error], [0, "Hello", ""]);

  ({ code, output, error } = await shCapture(
    "a-nonexistent-command",
    { stderr: "piped" },
  ));
  assertNotEquals(code, 0);
  assertEquals(output, "");
  assertStrContains(error, "a-nonexistent-command");

  const cat: string = `deno eval "Deno.copy(Deno.stdin, Deno.stdout)"`;
  ({ code, output, error } = await shCapture(cat, { input: "Hello" }));
  assertEquals([code, output, error], [0, "Hello", ""]);

  ({ code, output, error } = await shCapture(cat, { input: "" }));
  assertEquals([code, output, error], [0, "", ""]);

  const text = readFile("Drakefile.ts");
  ({ code, output, error } = await shCapture(cat, { input: text }));
  assertEquals([code, output, error], [0, text, ""]);

  ({ code, output, error } = await shCapture(
    `deno eval "console.log(Deno.cwd())"`,
    { cwd: "lib" },
  ));
  assertEquals(
    [code, output.trimRight(), error],
    [0, path.join(Deno.cwd(), "lib"), ""],
  );

  ({ code, output, error } = await shCapture(
    `deno eval "console.log(Deno.env.get('FOO')+Deno.env.get('BAR'))"`,
    { env: { FOO: "foo", BAR: "bar" } },
  ));
  assertEquals([code, output.trimRight(), error], [0, "foobar", ""]);

  ({ code, output, error } = await shCapture(
    "echo Hello",
    { stdout: "null", stderr: "null" },
  ));
  assertEquals([code, output, error], [0, "", ""]);

  ({ code, output, error } = await shCapture(
    cat,
    { input: "", stdout: "inherit", stderr: "inherit" },
  ));
  assertEquals([code, output, error], [0, "", ""]);

  ({ code, output, error } = await shCapture(
    `cd examples
       deno eval "console.log(Deno.cwd())"`,
  ));
  assertEquals(
    [code, output.trimRight(), error],
    [0, path.join(Deno.cwd(), "examples"), ""],
  );
});

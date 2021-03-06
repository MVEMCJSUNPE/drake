import { shCapture, vers } from "../lib/utils.ts";
import { assertEquals, assertStringContains, path } from "./deps.ts";

Deno.test("cliTest", async function () {
  const denoRun = "deno run -A --quiet";
  const drake = `${denoRun} Drakefile.ts`;

  let { code, output, error } = await shCapture(
    `${drake} --version`,
  );
  assertEquals(code, 0);
  assertEquals(output.trimRight(), vers());

  ({ code, output, error } = await shCapture(
    `${denoRun} --unstable Drakefile.ts --version`,
  ));
  assertEquals(code, 0);
  assertEquals(output.trimRight(), vers());

  ({ code, output } = await shCapture(
    `${drake} --help`,
  ));
  assertEquals(code, 0);
  assertStringContains(output, "drake - a make-like task runner for Deno.");

  ({ code, output } = await shCapture(
    `${drake} --list-tasks`,
    { env: { "NO_COLOR": "true" } },
  ));
  assertEquals(code, 0);
  assertStringContains(output, "Push changes to Github");

  ({ code, output } = await shCapture(
    `${drake} -L`,
    { env: { "NO_COLOR": "true" } },
  ));
  assertEquals(code, 0);
  assertStringContains(output, "     test\n");

  ({ code, error } = await shCapture(
    `${drake} --foobar`,
    { stderr: "piped" },
  ));
  assertEquals(code, 1);
  assertStringContains(error, "illegal option: --foobar");

  ({ code, error } = await shCapture(
    `${drake} nonexistent-task`,
    { stderr: "piped" },
  ));
  assertEquals(code, 1);
  assertStringContains(error, "missing task: nonexistent-task");

  ({ code, error } = await shCapture(
    `${drake} --cache ${path.join("non-existent-dir", "cache.json")}`,
    { stderr: "piped" },
  ));
  assertEquals(code, 1);
  assertStringContains(
    error,
    "--cache file directory missing or not a directory",
  );

  ({ code, error } = await shCapture(
    `${drake} -d missing-directory`,
    { stderr: "piped" },
  ));
  assertEquals(code, 1);
  assertStringContains(error, "--directory missing or not a directory");

  ({ code, output } = await shCapture(
    `${denoRun} examples/examples-drakefile.ts cwd --quiet`,
  ));
  assertEquals(code, 0);
  assertEquals(output.trimRight(), Deno.cwd());

  ({ code, output } = await shCapture(
    `${denoRun} examples/examples-drakefile.ts cwd --quiet --directory .`,
  ));
  assertEquals(code, 0);
  assertEquals(output.trimRight(), Deno.cwd());

  ({ code, output } = await shCapture(
    `${denoRun} examples/examples-drakefile.ts cwd --quiet --directory examples`,
  ));
  assertEquals(code, 0);
  assertEquals(output.trimRight(), path.join(Deno.cwd(), "examples"));

  ({ code, error } = await shCapture(
    `${denoRun} examples/examples-drakefile.ts abort`,
    { stderr: "piped", env: { "NO_COLOR": "true" } },
  ));
  assertEquals(code, 1);
  assertStringContains(error, "drake error: abort message");

  ({ code, error } = await shCapture(
    `${denoRun} examples/examples-drakefile.ts abort --debug`,
    { stderr: "piped", env: { "NO_COLOR": "true" } },
  ));
  assertEquals(code, 1);
  assertStringContains(error, "at async run");
});

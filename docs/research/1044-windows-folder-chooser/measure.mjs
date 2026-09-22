// One-off measurement for #1044 / ADR-0032 §4: runs the designed Windows
// chooser invocation exactly as the adapter would (execFile, args array, start
// folder in MAESTRO_CHOOSER_START), then drives the dialog from a second
// process: screenshot, window list, foreground window, then Enter or Escape.
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const POWERSHELL = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

const CHOOSER_OWNED = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "if ($env:MAESTRO_CHOOSER_START) { $dialog.SelectedPath = $env:MAESTRO_CHOOSER_START }",
  "$owner = New-Object System.Windows.Forms.Form",
  "$owner.TopMost = $true",
  "if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath); exit 0 }",
  "exit 2",
].join("\n");

const CHOOSER_BARE = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms",
  "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "if ($env:MAESTRO_CHOOSER_START) { $dialog.SelectedPath = $env:MAESTRO_CHOOSER_START }",
  "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath); exit 0 }",
  "exit 2",
].join("\n");

const probeScript = (shot, key) =>
  [
    "Add-Type -AssemblyName System.Windows.Forms, System.Drawing",
    'Add-Type -Namespace W -Name U -MemberDefinition \'[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);\'',
    "$sb = New-Object System.Text.StringBuilder 256",
    "[void][W.U]::GetWindowText([W.U]::GetForegroundWindow(), $sb, 256)",
    '$titles = @(Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { "$($_.ProcessName): $($_.MainWindowTitle)" })',
    "$b = [System.Windows.Forms.SystemInformation]::VirtualScreen",
    "$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)",
    `$bmp.Save('${shot}')`,
    key === ""
      ? "$activated = $null"
      : `$ws = New-Object -ComObject WScript.Shell; $activated = $ws.AppActivate('Browse For Folder'); Start-Sleep -Milliseconds 500; $ws.SendKeys('${key}')`,
    "@{ foreground = $sb.ToString(); windows = $titles; activated = $activated } | ConvertTo-Json -Compress",
  ].join("\n");

function run(file, args, options) {
  return new Promise((resolve) => {
    const started = Date.now();
    execFile(file, args, options, (error, stdout, stderr) => {
      resolve({
        exitCode: error?.code ?? 0,
        killed: error?.killed ?? false,
        signal: error?.signal ?? null,
        ms: Date.now() - started,
        stdout,
        stdoutHex: Buffer.from(stdout, "utf8").toString("hex"),
        stderr,
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(name, { script, start, key, windowsHide, timeout }) {
  const shot = join(process.cwd(), "shots", `${name}.png`);
  const chooser = run(
    POWERSHELL,
    ["-NoProfile", "-NonInteractive", "-STA", "-Command", script],
    {
      env: { ...process.env, MAESTRO_CHOOSER_START: start },
      windowsHide,
      timeout,
      encoding: "utf8",
    },
  );
  await sleep(8000);
  const probe = await run(
    POWERSHELL,
    ["-NoProfile", "-NonInteractive", "-Command", probeScript(shot, key)],
    { encoding: "utf8" },
  );
  const result = await chooser;
  // After a kill, is any chooser window still up?
  const after = await run(
    POWERSHELL,
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      '@(Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { "$($_.ProcessName): $($_.MainWindowTitle)" }) | ConvertTo-Json -Compress',
    ],
    { encoding: "utf8" },
  );
  return {
    name,
    start,
    key,
    windowsHide,
    timeout,
    result,
    probe: probe.stdout.trim(),
    probeErr: probe.stderr.trim(),
    windowsAfter: after.stdout.trim(),
  };
}

mkdirSync("shots", { recursive: true });
const home = process.env.USERPROFILE;
const unicode = join(home, "maestro-chooser-ümlaut 日本");
mkdirSync(unicode, { recursive: true });

console.log("powershell:", POWERSHELL);
const results = [];
results.push(
  await measure("picked-owned-shown", {
    script: CHOOSER_OWNED,
    start: unicode,
    key: "{ENTER}",
    windowsHide: false,
    timeout: 60_000,
  }),
);
results.push(
  await measure("cancel-owned-shown", {
    script: CHOOSER_OWNED,
    start: unicode,
    key: "{ESC}",
    windowsHide: false,
    timeout: 60_000,
  }),
);
results.push(
  await measure("picked-owned-hidden", {
    script: CHOOSER_OWNED,
    start: unicode,
    key: "{ENTER}",
    windowsHide: true,
    timeout: 60_000,
  }),
);
results.push(
  await measure("picked-bare-hidden", {
    script: CHOOSER_BARE,
    start: unicode,
    key: "{ENTER}",
    windowsHide: true,
    timeout: 60_000,
  }),
);
results.push(
  await measure("missing-start-owned", {
    script: CHOOSER_OWNED,
    start: join(home, "does-not-exist"),
    key: "{ENTER}",
    windowsHide: true,
    timeout: 60_000,
  }),
);
results.push(
  await measure("timeout-owned", {
    script: CHOOSER_OWNED,
    start: unicode,
    key: "",
    windowsHide: true,
    timeout: 12_000,
  }),
);
writeFileSync("shots/results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

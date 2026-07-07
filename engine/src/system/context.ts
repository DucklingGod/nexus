// System environment context — detected once at startup, cached.
// Injected into the system prompt so the agent knows its environment
// without wasting tool calls on exploration.

import { execSync } from "node:child_process";
import { homedir, platform, type } from "node:os";
import { join } from "node:path";

interface EnvContext {
  os: string;
  home: string;
  desktop: string;
  shell: string;
  python: string;
  pythonVersion: string;
  nodeVersion: string;
  installedPackages: string[];
  pathSep: string;
}

let _cache: EnvContext | null = null;

function tryExec(cmd: string, fallback = ""): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return fallback;
  }
}

function detect(): EnvContext {
  const os = platform(); // win32, darwin, linux
  const home = homedir();
  const desktop = join(home, "Desktop");
  const pathSep = os === "win32" ? "\\" : "/";

  // Detect shell
  let shell = "unknown";
  if (os === "win32") {
    // Check if git-bash (MSYS) or PowerShell
    const shellPath = process.env.SHELL || process.env.ComSpec || "";
    if (shellPath.includes("bash") || process.env.MSYSTEM) {
      shell = "git-bash (MSYS/POSIX)";
    } else {
      shell = "PowerShell/cmd";
    }
  } else {
    shell = process.env.SHELL || "/bin/sh";
  }

  // Detect Python — try multiple candidates
  let python = "not found";
  let pythonVersion = "";
  for (const candidate of ["python3", "python", "py"]) {
    const ver = tryExec(`${candidate} --version 2>&1`);
    if (ver && ver.includes("Python")) {
      python = tryExec(`where ${candidate} 2>nul`, candidate);
      pythonVersion = ver.replace("Python ", "");
      break;
    }
  }

  // Detect Node
  const nodeVersion = tryExec("node --version 2>&1", "not found");

  // Detect key installed Python packages (common ones for report/data tasks)
  const installedPackages: string[] = [];
  if (python !== "not found") {
    const pkgCheck = tryExec(`${python} -c "import importlib; [print(p) for p in ['fpdf2','openpyxl','reportlab','pandas','matplotlib','Pillow','requests','beautifulsoup4','numpy'] if importlib.util.find_spec(p.replace('fpdf2','fpdf').replace('beautifulsoup4','bs4').replace('Pillow','PIL'))]" 2>&1`);
    if (pkgCheck) {
      installedPackages.push(...pkgCheck.split("\n").filter(Boolean));
    }
  }

  return { os, home, desktop, shell, python, pythonVersion, nodeVersion, installedPackages, pathSep };
}

/** Get cached environment context. Detects once, returns cached result. */
export function getEnvContext(): EnvContext {
  if (!_cache) _cache = detect();
  return _cache;
}

/** Format environment context as a concise system prompt section. */
export function formatEnvContext(): string {
  const e = getEnvContext();
  const lines: string[] = [
    `## Your Environment (auto-detected — do NOT re-check these)`,
    ``,
    `- OS: ${e.os === "win32" ? "Windows" : e.os === "darwin" ? "macOS" : "Linux"}`,
    `- Home: ${e.home}`,
    `- Desktop: ${e.desktop}`,
    `- Shell: ${e.shell}${e.os === "win32" ? " — use POSIX syntax (ls, cat, grep, &&), NOT PowerShell/cmd" : ""}`,
    `- Python: ${e.python} (v${e.pythonVersion || "unknown"})`,
    `- Node: ${e.nodeVersion}`,
  ];

  if (e.installedPackages.length > 0) {
    lines.push(`- Python packages available: ${e.installedPackages.join(", ")}`);
  }

  // Current date/time — the agent needs this to answer time/date questions
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Bangkok" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  lines.push(
    `- Current date/time: ${dateStr}, ${timeStr} (Bangkok time, UTC+7)`,
  );

  lines.push(
    ``,
    `Use these paths directly — do NOT waste tool calls detecting them again.`,
    `When creating files for the user, save to: ${e.desktop}`,
    `When running Python, use: ${e.python}`,
  );

  return lines.join("\n");
}

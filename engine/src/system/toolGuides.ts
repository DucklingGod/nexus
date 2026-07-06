// Detailed per-tool usage guides — injected into the system prompt alongside
// the tool inventory so the agent knows HOW to use each tool correctly.
// Pattern: Hermes-style (20-50 lines per tool) with edge cases, pitfalls, examples.
// These are static — update when tool behavior changes.

export const TOOL_GUIDES: Record<string, string> = {

  file_read: `## file_read
Read a text file and return its contents with line numbers.
- **Paths:** accepts absolute paths (C:\\Users\\...\\file.txt) or relative (resolved from working dir).
- **Line limits:** returns up to 500 lines by default. Use \`offset\` and \`limit\` params for large files. Files over 100K chars are rejected — use offset/limit to page through.
- **Binary files:** cannot read images or binary files. For images, use vision_analyze. For .ipynb/.docx/.xlsx, auto-extracts to readable text.
- **Common mistake:** reading a file that doesn't exist returns a "not found" error with similar filename suggestions — check the suggestions before giving up.
- **Windows paths:** both C:\\Users\\... and /c/Users/... work. Prefer the native Windows style for clarity.
- **When to use vs search_files:** use file_read when you know the exact file and want its content. Use search_files when you need to find files by name or search content across multiple files.`,

  file_write: `## file_write
Write text content to a file, completely replacing existing content. Creates parent directories automatically.
- **OVERWRITES:** this replaces the ENTIRE file. For targeted edits, use \`patch\` instead.
- **Syntax checks:** auto-runs syntax checks on .py, .json, .yaml, .toml files after writing. Only NEW errors introduced by your write are surfaced.
- **Large files:** no hard limit, but prefer writing focused content. For generating large files (reports, data), consider using terminal_exec to run a script instead.
- **Common mistake:** writing a file without reading it first — if the file exists, always read it first to understand its structure, then write the complete updated version.
- **Binary files:** cannot write binary files. For images/PDFs, use Python scripts via terminal_exec.
- **After creating ANY file for the user:** you MUST call \`send_file\` to deliver it. The user cannot see files on disk.`,

  patch: `## patch
Targeted find-and-replace edits in files. Uses fuzzy matching (9 strategies) so minor whitespace/indentation differences won't break it.
- **REPLACE MODE (default):** find a unique string and replace it. Requires path + old_string + new_string.
- **old_string must be unique** in the file unless replace_all=true. Include surrounding context (2-3 lines) to ensure uniqueness.
- **For deleting text:** set new_string to empty string ''.
- **When to use vs file_write:** use patch for small, targeted changes (1-5 edits). Use file_write when rewriting large portions of a file.
- **After editing code:** auto-runs syntax checks. Only new errors from your edit are shown.
- **Common mistake:** using patch for a complete rewrite — if you're changing more than 30% of a file, use file_write instead.
- **Multi-file patches:** use mode='patch' with a V4A format patch string for bulk changes across multiple files.`,

  search_files: `## search_files
Search file contents (regex) or find files by name (glob). Ripgrep-backed, faster than shell equivalents.
- **Content search (target='content'):** regex search inside files. Supports full matches with line numbers, file paths only, or match counts per file.
- **File search (target='files'):** find files by glob pattern (e.g., '*.py', '*config*'). Results sorted by modification time.
- **Use this INSTEAD of grep/rg/find/ls** in terminal — it's faster and returns structured data.
- **Context lines:** use context param to get surrounding lines (like grep -C).
- **File glob:** use file_glob to filter by extension (e.g., '*.py' to only search Python files).
- **Limit:** returns up to 50 results by default. Use offset for pagination.
- **Common mistake:** searching for a very common term without file_glob — this returns 50 irrelevant results. Always narrow with file_glob or path.
- **Performance:** searching large directories (node_modules, .git) is slow — always specify a path to narrow the search.`,

  terminal: `## terminal
Execute shell commands on the host machine. Returns output, exit code.
- **Foreground (default):** commands return instantly when done. Use timeout=300 for long builds.
- **Background:** set background=true for long-running processes (servers, builds, tests). ALWAYS pair with notify_on_complete=true — without it, the process runs silently and you have no way to know when it finishes.
- **Shell:** on Windows, uses git-bash (POSIX syntax: ls, cat, grep, &&, |). Do NOT use PowerShell/cmd syntax (Get-ChildItem, $env:FOO, Select-String).
- **Working directory:** use workdir param for per-command cwd. Defaults to session working dir.
- **Timeout:** default 180s foreground. Set timeout=600 for very long builds. Background processes have no timeout.
- **NEVER use for:** reading files (use read_file), searching (use search_files), editing (use patch). Reserve terminal for: builds, installs, git, processes, network, package managers.
- **After running commands that create files:** check the output for the file path, then call \`send_file\` to deliver it to the user.
- **Common mistake:** forgetting notify_on_complete on background tasks — you'll never know when they finish.
- **Environment:** exported env vars persist between calls. Activate virtualenvs or export setup vars once per session.`,

  web_search: `## web_search
Search the web for information. Returns titles, URLs, and descriptions.
- **Default:** returns up to 5 results. Use limit param for more (max 100).
- **Operators:** the backend may support site:example.com, filetype:pdf, intitle:word, -term, "exact phrase".
- **When to use:** general information lookup, finding URLs to fetch, checking current facts.
- **When NOT to use:** don't search for things you already know. Don't search when the user gave you a specific URL — use web_fetch instead.
- **Follow up:** after searching, use web_extract on the most relevant URLs to get full content.
- **Common mistake:** searching too broadly — be specific in your query for better results.
- **Multiple searches:** if the first search doesn't find what you need, try different keywords or more specific queries.`,

  web_extract: `## web_extract
Extract content from web page URLs. Returns clean markdown text. Also works with PDF URLs.
- **Char limit:** pages under 15K chars return whole. Larger pages are head+tail truncated with full text saved to disk.
- **Max 5 URLs** per call. Batch independent fetches together.
- **PDF support:** pass arxiv PDF URLs directly — extracts text content.
- **When to use:** after web_search finds relevant URLs, use this to get the actual content.
- **When NOT to use:** don't extract pages you don't need. Don't extract when the search snippet already answers the question.
- **Common mistake:** extracting too many pages at once — start with the most relevant 2-3 URLs, extract more only if needed.
- **For interactive pages:** web_extract can't handle JavaScript-rendered content. Use browser_* tools instead for dynamic pages.`,

  send_file: `## send_file
MANDATORY after creating any file. Delivers a file to the user as a clickable attachment in the chat.
- **When to call:** immediately after file_write, terminal_exec (that creates a file), or any tool that produces an output file (PDF, Excel, image, document, code file).
- **Required params:** path (absolute path to the file), label (friendly name for the user).
- **Size limit:** max 10MB. Larger files will return an error.
- **The user CANNOT see files on disk.** They need this to get the result. Never just create a file without sending it.
- **Common workflow:** write_file/terminal_exec → send_file. Always chain these together.
- **Common mistake:** forgetting to send the file after creating it — the user has no idea the file exists.
- **If the file is on Desktop:** still send it! The user wants a clickable link in chat, not a file hidden on their Desktop.
- **After sending:** tell the user what the file contains and any instructions (e.g., "Open with Excel").`,

  delegate_task: `## delegate_task
Spawn sub-agent(s) to work on tasks in isolated contexts. Each subagent gets its own conversation, terminal session, and toolset.
- **SINGLE TASK:** provide goal + optional context + toolsets. Runs in background, returns summary when done.
- **BATCH (parallel):** provide tasks array (up to 3 concurrent). Each runs independently.
- **When to use:** reasoning-heavy tasks, tasks that would flood your context with data, parallel independent workstreams.
- **When NOT to use:** single tool calls (just call the tool), mechanical multi-step work (use execute_code), tasks needing user interaction (subagents can't use clarify).
- **Context is critical:** subagents have NO memory of your conversation. Pass ALL relevant info (file paths, error messages, constraints) via the context field.
- **Subagents CANNOT:** delegate further, use clarify, memory, send_message, or execute_code.
- **Common mistake:** not providing enough context — the subagent knows nothing about your conversation.
- **Don't wait:** delegate_task returns immediately. Continue working on other things. The result arrives as a new message when done.`,

  ssh_exec: `## ssh_exec
Run a command on a configured remote host over SSH.
- **First call ssh_hosts** to see what hosts are configured. Don't guess hostnames.
- **Authentication:** uses key-file auth (configured in Settings → SSH Hosts).
- **Use cases:** managing remote servers, running commands on other machines on your Tailscale network.
- **When the user says "my mac", "my pc", or a device name:** check ssh_hosts and use SSH.
- **Output:** returns stdout + stderr + exit code, same as terminal.
- **Common mistake:** trying to SSH without checking ssh_hosts first — you need to know the exact hostname.
- **File transfer:** use ssh_upload/ssh_download for transferring files to/from remote hosts.`,

  ask_user: `## ask_user
Present a set of choices to the user and wait for their selection. The agent loop pauses until the user picks one.
- **When to use:** when you genuinely need the user to make a decision (e.g., "Which template?", "Which style?").
- **When NOT to use:** don't ask for confirmation to proceed — just proceed. Don't ask questions you can answer yourself with tools.
- **Options:** provide clear, distinct choices. Each option should be meaningful and different.
- **The agent loop blocks** until the user responds — don't use this for optional questions.
- **Common mistake:** asking too many questions — prefer acting over asking. Only ask when the decision genuinely requires user input.`,
};

/** Get tool guides for the active tools, formatted as a system prompt section. */
export function getToolGuides(activeToolNames: string[]): string {
  const guides: string[] = [];
  for (const name of activeToolNames) {
    const guide = TOOL_GUIDES[name];
    if (guide) guides.push(guide);
  }
  if (guides.length === 0) return "";
  return "\n\n# Tool Usage Guides\n\n" + guides.join("\n\n");
}

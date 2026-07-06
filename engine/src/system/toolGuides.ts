// Detailed per-tool usage guides — injected into the system prompt alongside
// the tool inventory so the agent knows HOW to use each tool correctly.
// Pattern: Hermes-style (20-50 lines per tool) with edge cases, pitfalls, examples.
// These are static — update when tool behavior changes.

export const TOOL_GUIDES: Record<string, string> = {

  // ═══════════════════════════════════════════════════════════════
  // FILE TOOLS
  // ═══════════════════════════════════════════════════════════════

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

  file_list: `## file_list
List files and directories at a path. Returns file sizes and modification times.
- **Paths:** accepts absolute or relative paths anywhere on the host.
- **Use for:** checking if a file exists, seeing what's in a directory, finding recent files.
- **When to use vs search_files:** use file_list when you know the exact directory. Use search_files when you need to find files by name pattern or content.
- **Common mistake:** using ls in terminal instead of file_list — file_list returns structured data that's easier to work with.`,

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

  // ═══════════════════════════════════════════════════════════════
  // EXECUTION TOOLS
  // ═══════════════════════════════════════════════════════════════

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

  execute_code: `## execute_code
Run a Python or Node.js script in an isolated temp directory. Returns stdout, exit_code.
- **Languages:** 'python' or 'node'. Python uses the system Python detected in environment context.
- **Use for:** complex multi-step logic that would need many terminal calls (data processing, file generation, calculations).
- **Timeout:** default 30s. Set timeout param for longer scripts.
- **File access:** scripts can read/write files using absolute paths. The working directory is a temp dir, but you can access any path on the host.
- **When to use vs terminal:** use execute_code for self-contained scripts. Use terminal for git, installs, system commands, or when you need the output interactively.
- **Common mistake:** using execute_code for simple one-liners — just use terminal instead. execute_code is for scripts with multiple steps and logic.
- **After execution:** if the script creates files, use send_file to deliver them.`,

  // ═══════════════════════════════════════════════════════════════
  // WEB TOOLS
  // ═══════════════════════════════════════════════════════════════

  web_search: `## web_search
Search the web for information. Returns titles, URLs, and descriptions.
- **Default:** returns up to 5 results. Use limit param for more (max 100).
- **Operators:** the backend may support site:example.com, filetype:pdf, intitle:word, -term, "exact phrase".
- **When to use:** general information lookup, finding URLs to fetch, checking current facts.
- **When NOT to use:** don't search for things you already know. Don't search when the user gave you a specific URL — use web_extract instead.
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

  // ═══════════════════════════════════════════════════════════════
  // BROWSER TOOLS
  // ═══════════════════════════════════════════════════════════════

  browser_navigate: `## browser_navigate
Navigate the embedded browser to a URL. Initializes the session and loads the page.
- **Must be called first** before any other browser_* tools — they require a loaded page.
- **Returns:** a compact page snapshot with interactive elements and ref IDs (like @e1, @e2).
- **When to use:** for interactive pages that web_extract can't handle (JavaScript-rendered content, SPAs, forms).
- **When NOT to use:** for simple page content — use web_extract instead (faster, cheaper).
- **For plain-text endpoints** (.md, .txt, .json, .csv): use web_extract or terminal curl instead — browser is overkill.`,

  browser_click: `## browser_click
Click on an element identified by its ref ID from the snapshot (e.g., @e5).
- **Ref IDs** are shown in square brackets in the snapshot output from browser_navigate or browser_snapshot.
- **Must call browser_navigate first** to get a page with ref IDs.
- **Common mistake:** clicking without checking the snapshot first — always read the snapshot to find the correct ref ID.`,

  browser_type: `## browser_type
Type text into an input field identified by its ref ID.
- **Clears the field first**, then types the new text.
- **Must call browser_navigate first** to get a page with ref IDs.
- **For submitting forms:** type the text, then use browser_press with key='Enter'.`,

  browser_screenshot: `## browser_screenshot
Take a screenshot of the current page for visual inspection.
- **Use for:** CAPTCHAs, visual verification, complex layouts, or when the text snapshot misses important visual information.
- **Must call browser_navigate first.**
- **Returns:** screenshot path that can be shared with the user.`,

  // ═══════════════════════════════════════════════════════════════
  // FILE DELIVERY
  // ═══════════════════════════════════════════════════════════════

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

  ask_user: `## ask_user
Present a set of choices to the user and wait for their selection. The agent loop pauses until the user picks one.
- **When to use:** when you genuinely need the user to make a decision (e.g., "Which template?", "Which style?").
- **When NOT to use:** don't ask for confirmation to proceed — just proceed. Don't ask questions you can answer yourself with tools.
- **Options:** provide clear, distinct choices. Each option should be meaningful and different.
- **The agent loop blocks** until the user responds — don't use this for optional questions.
- **Common mistake:** asking too many questions — prefer acting over asking. Only ask when the decision genuinely requires user input.`,

  // ═══════════════════════════════════════════════════════════════
  // DELEGATION TOOLS
  // ═══════════════════════════════════════════════════════════════

  delegate_task: `## delegate_task
Spawn sub-agent(s) to work on tasks in isolated contexts. Each subagent gets its own conversation, terminal session, and toolset.
- **SINGLE TASK:** provide goal + optional context + toolset. Runs in background, returns summary when done.
- **When to use:** reasoning-heavy tasks, tasks that would flood your context with data, parallel independent workstreams.
- **When NOT to use:** single tool calls (just call the tool), mechanical multi-step work (use execute_code), tasks needing user interaction (subagents can't ask questions).
- **Context is critical:** subagents have NO memory of your conversation. Pass ALL relevant info (file paths, error messages, constraints) via the context field.
- **Subagents CANNOT:** delegate further, ask questions, use memory, or send messages.
- **Common mistake:** not providing enough context — the subagent knows nothing about your conversation.
- **Don't wait:** delegate_task returns immediately. Continue working on other things. The result arrives as a new message when done.
- **Toolset presets:** 'safe' (file+web+terminal, no dangerous), 'research' (web+knowledge), 'code' (file+terminal+code), 'web' (web only), 'full' (everything including dangerous tools).`,

  delegate_batch: `## delegate_batch
Run multiple independent tasks in parallel (up to 3-5 concurrent sub-agents).
- **When to use:** several independent research tasks, processing multiple files, comparing approaches.
- **When NOT to use:** sequential tasks where each depends on the previous result — just do those yourself.
- **Each task** gets its own goal, context, toolset, and model override.
- **Concurrency:** default 3, max 5. More concurrent = faster but more expensive.
- **Common mistake:** batching tasks that share dependencies — they'll fail or produce inconsistent results.`,

  // ═══════════════════════════════════════════════════════════════
  // MEMORY & KNOWLEDGE TOOLS
  // ═══════════════════════════════════════════════════════════════

  remember: `## remember
Save durable facts to persistent context files that survive across sessions.
- **Targets:** 'user' (who the user is: name, role, preferences), 'memory' (your notes: environment, conventions, tool quirks).
- **SAVE:** user preferences, environment facts, stable conventions, recurring corrections.
- **DO NOT SAVE:** task progress, completed work logs, temporary TODO state, things easily re-discovered.
- **Format:** write as declarative facts, not instructions. Good: "User prefers concise Thai responses." Bad: "Always respond concisely."
- **When to save:** proactively when the user states a preference, correction, or personal detail.
- **When NOT to save:** trivial/obvious info, easily re-discovered facts, raw data dumps, task progress.
- **Operations:** use the operations array for batch changes (add, replace, remove) — more efficient than multiple calls.
- **Char limit:** if the add is rejected (full), reissue as ONE batch that removes stale entries and adds the new one together.
- **Common mistake:** saving too much — keep entries compact and high-signal. One-line facts are better than paragraphs.`,

  knowledge_save: `## knowledge_save
Save a fact, preference, or piece of information about the user to persistent memory.
- **Categories:** preference, fact, context, relationship, goal.
- **Key:** short label (e.g., 'favorite_language', 'timezone', 'coding_style').
- **Value:** the actual fact or preference.
- **When to use vs remember:** knowledge_save is for structured key-value facts. remember is for longer context files (user.md, memory.md).
- **Use both:** knowledge_save for quick facts, remember for detailed context.`,

  knowledge_search: `## knowledge_search
Search saved knowledge by keyword. Returns matching facts with their categories.
- **When to use:** when you need to recall a specific fact about the user before answering.
- **Common mistake:** not checking knowledge before asking the user something you should already know.`,

  // ═══════════════════════════════════════════════════════════════
  // KANBAN TOOLS
  // ═══════════════════════════════════════════════════════════════

  kanban_list_boards: `## kanban_list_boards
List all kanban boards. Use this first to see what boards exist before creating new ones.
- **When to use:** when the user asks about tasks, boards, or project management.`,

  kanban_create_board: `## kanban_create_board
Create a new kanban board with a title and optional description.
- **Common mistake:** creating duplicate boards — always check kanban_list_boards first.`,

  kanban_add_card: `## kanban_add_card
Add a task card to a kanban board.
- **Required:** board ID, title. Optional: description, priority (low/medium/high/urgent), assignee.
- **When to use:** when the user wants to track a task, create a to-do item, or manage a project.`,

  kanban_move_card: `## kanban_move_card
Move a card between columns (e.g., To Do → In Progress → Done).
- **Required:** card ID, target column ID.
- **When to use:** when a task's status changes (started, completed, blocked).`,

  // ═══════════════════════════════════════════════════════════════
  // SCHEDULING TOOLS
  // ═══════════════════════════════════════════════════════════════

  schedule_task: `## schedule_task
Create a scheduled/recurring task that runs automatically.
- **Schedule formats:** '30m' (every 30 min), 'every 2h', '0 9 * * *' (cron), ISO timestamp (one-shot).
- **Required:** name, prompt (what to do), schedule (when to run).
- **Self-contained:** the prompt must be complete and self-contained — the task runs in a fresh session with no conversation context.
- **When to use:** recurring reports, monitoring, periodic checks, automated workflows.
- **When NOT to use:** one-time tasks — just do them now. Don't schedule things you can do immediately.
- **Common mistake:** scheduling without testing — always run the task manually first to make sure it works.`,

  // ═══════════════════════════════════════════════════════════════
  // SKILL TOOLS
  // ═══════════════════════════════════════════════════════════════

  search_skills: `## search_skills
Search for agent skills on GitHub (agentskills.io open standard).
- **When to use:** when the user asks for a capability you don't have, or when you need a specialized workflow.
- **Follow up:** use install_skills to install any relevant skills you find.`,

  install_skills: `## install_skills
Install a skill from a GitHub repository. Downloads SKILL.md and linked files.
- **Requires:** GitHub URL or repo name.
- **After installation:** the skill is available immediately — you can follow its instructions.
- **Common mistake:** installing skills you don't need — only install when the user asks or you genuinely need the capability.`,

  // ═══════════════════════════════════════════════════════════════
  // MEDIA TOOLS
  // ═══════════════════════════════════════════════════════════════

  image_generate: `## image_generate
Generate images from text prompts (text-to-image) or edit existing images (image-to-image).
- **Text-to-image:** just provide a detailed prompt.
- **Image-to-image:** pass image_url to edit an existing image.
- **Aspect ratios:** 'landscape' (16:9), 'portrait' (16:9 tall), 'square' (1:1).
- **When to use:** when the user asks for an image, illustration, diagram, or visual content.
- **Common mistake:** vague prompts — be descriptive and specific about what you want.`,

  text_to_speech: `## text_to_speech
Convert text to speech audio. Returns a file path that can be shared with the user.
- **Character limits:** provider-specific (OpenAI 4096, xAI 15000, etc.). Over-long input is truncated.
- **When to use:** when the user asks for audio, voice, narration, or pronunciation.
- **After generating:** the audio file is automatically delivered to the user.`,

  // ═══════════════════════════════════════════════════════════════
  // SSH TOOLS
  // ═══════════════════════════════════════════════════════════════

  ssh_exec: `## ssh_exec
Run a command on a configured remote host over SSH.
- **First call ssh_hosts** to see what hosts are configured. Don't guess hostnames.
- **Authentication:** uses key-file auth (configured in Settings → SSH Hosts).
- **Use cases:** managing remote servers, running commands on other machines on your Tailscale network.
- **When the user says "my mac", "my pc", or a device name:** check ssh_hosts and use SSH.
- **Output:** returns stdout + stderr + exit code, same as terminal.
- **Common mistake:** trying to SSH without checking ssh_hosts first — you need to know the exact hostname.
- **File transfer:** use ssh_upload/ssh_download for transferring files to/from remote hosts.`,

  // ═══════════════════════════════════════════════════════════════
  // SKILL MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  skill_manage: `## skill_manage
Manage custom skills (procedural memory). Create, edit, delete, or list skills.
- **CREATE:** after completing a complex task (5+ tool calls), create a skill to remember the procedure. Include: trigger conditions, numbered steps, pitfalls section, verification steps.
- **EDIT:** update existing skill instructions when you discover better approaches or when instructions become stale.
- **DELETE:** remove skills that are no longer relevant or were created by mistake.
- **LIST:** show all available skills (built-in + custom).
- **When to create:** complex multi-step tasks that you'll likely repeat, workflows with tricky edge cases, procedures that took multiple attempts to get right.
- **When NOT to create:** simple one-off tasks, things that are obvious, tasks that are too specific to reuse.
- **Skill format:** name (lowercase, hyphens), description (one line), instructions (markdown with numbered steps), category, triggers (keywords for auto-loading).
- **Common mistake:** creating too many skills for trivial tasks — only create when the procedure is genuinely complex and reusable.
- **Auto-loading:** skills with triggers are automatically loaded when the user's request matches the trigger keywords.`,

  // ═══════════════════════════════════════════════════════════════
  // TODO
  // ═══════════════════════════════════════════════════════════════

  todo: `## todo
Manage your task list for the current session. Use for complex tasks with 3+ steps.
- **WRITE:** provide todos array to create/update items. Each has id, content, status (pending/in_progress/completed/cancelled).
- **READ:** call with no params to see current list.
- **MERGE:** set merge=true to update existing items by id and add new ones (default: replace entire list).
- **When to use:** complex multi-step tasks where you need to track progress, tasks the user gives as a numbered list.
- **When NOT to use:** simple tasks with 1-2 steps, tasks you can complete immediately.
- **One in_progress at a time:** only ONE item should be in_progress at any time.
- **Mark completed immediately** when done. If something fails, cancel it and add a revised item.
- **Common mistake:** creating a todo list for a simple task — just do it directly.`,

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

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const COMMAND_ID = 'codexCommitMessage.generate';
const DEFAULT_PROMPT = 'Describe the staged changes accurately and choose the most useful commit subject for a reviewer.';

function resolveCodexCommand(configuredCommand) {
  if (configuredCommand && configuredCommand.trim()) return configuredCommand.trim();
  if (process.platform === 'darwin') {
    const appCodex = '/Applications/ChatGPT.app/Contents/Resources/codex';
    if (fs.existsSync(appCodex)) return appCodex;
    const userAppCodex = path.join(os.homedir(), 'Applications/ChatGPT.app/Contents/Resources/codex');
    if (fs.existsSync(userAppCodex)) return userAppCodex;
  }
  return 'codex';
}

function getGitApi() {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  if (!gitExtension) {
    throw new Error('The built-in Git extension is not available.');
  }
  return gitExtension.activate().then(() => gitExtension.exports.getAPI(1));
}

function workspaceRoots() {
  return (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
}

function chooseRepository(repositories) {
  const selected = repositories.find(repository => repository.ui && repository.ui.selected);
  if (selected) return selected;

  const roots = workspaceRoots();
  return repositories.find(repository => roots.some(root =>
    repository.rootUri.fsPath === root || repository.rootUri.fsPath.startsWith(`${root}${path.sep}`)
  )) || repositories[0];
}

function buildPrompt(config) {
  const language = config.get('language', 'English');
  const conventional = config.get('conventional', true);
  const customPrompt = config.get('prompt', DEFAULT_PROMPT).trim() || DEFAULT_PROMPT;
  const format = conventional
    ? 'Use Conventional Commits when appropriate (for example feat:, fix:, refactor:, docs:, test:, chore:).'
    : 'Do not force a Conventional Commits prefix.';

  return [
    'You are generating a Git commit subject from staged changes.',
    'Inspect only the staged changes in this Git repository using git diff --cached.',
    customPrompt,
    `Write the subject in ${language}.`,
    format,
    'Use imperative mood and keep it at 72 characters or fewer.',
    'Return exactly one plain-text line: no quotes, Markdown, bullets, explanation, or body.',
    'If there are no staged changes, return exactly NO_STAGED_CHANGES.'
  ].join(' ');
}

function runCodex(command, model, reasoningEffort, repositoryRoot, prompt) {
  const outputFile = path.join(os.tmpdir(), `codex-commit-message-${process.pid}-${Date.now()}.txt`);
  const args = [
    'exec',
    ...(model ? ['--model', model] : []),
    ...(reasoningEffort ? ['--config', `model_reasoning_effort="${reasoningEffort}"`] : []),
    '--sandbox', 'read-only',
    '--color', 'never',
    '--ephemeral',
    '--cd', repositoryRoot,
    '--output-last-message', outputFile,
    prompt
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      try { fs.unlinkSync(outputFile); } catch {}
      reject(error);
    });
    child.on('close', code => {
      let output = '';
      try {
        if (fs.existsSync(outputFile)) output = fs.readFileSync(outputFile, 'utf8');
      } finally {
        try { fs.unlinkSync(outputFile); } catch {}
      }

      if (code !== 0) {
        reject(new Error(stderr.trim() || `Codex exited with code ${code}.`));
        return;
      }
      resolve(output);
    });
  });
}

function cleanMessage(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const message = lines[0] || '';
  if (message === 'NO_STAGED_CHANGES') return message;
  return message
    .replace(/^```(?:text|txt|[a-z-]+)?\s*/i, '')
    .replace(/```$/g, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

async function generateCommitMessage() {
  const git = await getGitApi();
  const repository = chooseRepository(git.repositories);
  if (!repository) {
    vscode.window.showErrorMessage('Codex Commit Message: no Git repository is open.');
    return;
  }
  if (!repository.state.indexChanges.length) {
    vscode.window.showWarningMessage('Stage at least one change before generating a commit message.');
    return;
  }

  const config = vscode.workspace.getConfiguration('codexCommitMessage');
  const command = resolveCodexCommand(config.get('commandPath', ''));
  const model = config.get('model', 'gpt-6-astra');
  const reasoningEffort = config.get('reasoningEffort', 'low');
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.SourceControl,
      title: 'Codex is writing a commit message…',
      cancellable: false
    },
    async () => {
      try {
        const raw = await runCodex(command, model, reasoningEffort, repository.rootUri.fsPath, buildPrompt(config));
        const message = cleanMessage(raw);
        if (!message || message === 'NO_STAGED_CHANGES') {
          throw new Error('Codex did not return a commit message.');
        }
        repository.inputBox.value = message;
        vscode.window.showInformationMessage('Commit message generated from staged changes.');
      } catch (error) {
        const detail = error && error.message ? error.message : String(error);
        vscode.window.showErrorMessage(`Codex Commit Message failed: ${detail}`);
      }
    }
  );
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_ID, generateCommitMessage));
}

function deactivate() {}

module.exports = { activate, deactivate };

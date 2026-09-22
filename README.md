# Codex Commit Message

This VS Code extension adds **Codex: Generate Commit Message** to the Git Source Control title bar.

It reads the selected repository's staged changes through VS Code's built-in Git API, runs the Codex CLI in read-only mode, and puts the generated subject into Git's commit input box. It never commits automatically.

## Install locally

From this folder:

```sh
code --install-extension . --force
```

Reload VS Code, open a Git repository, stage changes, and click the sparkle button in Source Control.

## Commit input placement

The Marketplace-compatible build places the sparkle action in the Source Control title bar. VS Code's `scm/inputBox` menu, which would place the action directly inside the commit input, is a Proposed API and cannot be used by published Marketplace extensions.

For local development with VS Code Insiders, you can enable that menu by adding `enabledApiProposals` and the `scm/inputBox` contribution from the development branch, then launch:

```sh
code-insiders --enable-proposed-api hamedyosefian.codex-commit-message .
```

The stable Marketplace build keeps the title-bar fallback and the Command Palette command.

The default command is the Codex bundled inside `/Applications/ChatGPT.app`, so the extension can use the same signed-in Codex installation as the ChatGPT macOS app. You can override it with `codexCommitMessage.commandPath`.

Settings include `codexCommitMessage.model`, `codexCommitMessage.reasoningEffort`, and `codexCommitMessage.prompt`. Defaults are `gpt-6-astra`, `low`, and a short reviewer-focused instruction. The staged-only and one-line output rules remain enforced by the extension.

## Publish to the Visual Studio Marketplace

Publishing requires a Visual Studio Marketplace publisher account. Create a publisher whose identifier matches the `publisher` field (`hamedyosefian`), then create an Azure DevOps Personal Access Token with Marketplace management scope.

Install the packaging tool and package the extension:

```sh
npm install --global @vscode/vsce
vsce package
```

Log in once and publish:

```sh
vsce login hamedyosefian
vsce publish
```

The commands run from this extension directory. You can also upload the generated `.vsix` manually from the Marketplace publisher management page. Do not publish a build that contains `enabledApiProposals` or the `scm/inputBox` contribution; VS Code documents Proposed APIs as local or Insiders-only.

## License

MIT

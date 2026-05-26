.\node_modules\.bin\vsce.cmd package --no-dependencies --allow-missing-repository --out .\asymptote-build-extension.vsix

vsce package --no-dependencies --allow-missing-repository --out .\asymptote-build-extension.vsix

vsce package --no-dependencies --allow-missing-repository --out .\asymptote-build-extension.vsix

vsce package --no-dependencies --allow-missing-repository --out .\asy-vscode-extension.vsix

npm run compile; npx @vscode/vsce package --no-dependencies
npm run compile; npx @vscode/vsce package --no-dependencies --allow-missing-repository
npm run compile; npx @vscode/vsce package --no-dependencies --allow-m
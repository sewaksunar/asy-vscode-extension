# Asymptote Extension for VS Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/YOUR-PUBLISHER.asymptote-extension?style=flat-square)](#)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/YOUR-PUBLISHER.asymptote-extension?style=flat-square)](#)
[![License](https://img.shields.io/github/license/YOUR-USERNAME/YOUR-REPO?style=flat-square)](#)

A powerful Visual Studio Code extension that streamlines your workflow by providing seamless integration with the Asymptote CLI. Easily build, preview, and export active `.asy` files directly from your editor.

## ✨ How It Works

At its core, this extension simplifies the rendering pipeline for Asymptote:
* **Targeted Execution:** Automatically detects and targets the active editor file when it has the `.asy` extension.
* **CLI Integration:** Runs the Asymptote executable (`asy`) against your active file.
* **Real-time Logs:** Writes all build logs and export output directly to a dedicated Output channel in VS Code.

---

## 📸 Preview

*(Add a GIF or screenshot here demonstrating the extension in action)*
![Extension Preview](images/preview.gif)

---

## 🛠 Features & Commands

Access commands quickly via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`), the editor title bar, or the status bar.

### Core Commands
* **`Asymptote: Render JPG`** - Compiles the current `.asy` file to JPG and instantly opens the preview inside VS Code.
* **`Asymptote: Detailed Export`** - Opens an interactive Quick Pick menu offering a variety of preview/export formats and render presets.

### User Interface Enhancements
* **Editor Title Bar:** Provides quick-action icons for immediate rendering when an `.asy` file is open.
* **Status Bar:** A dedicated **`Asymptote Render JPG`** button appears dynamically when an `.asy` file is active.

### Detailed Export Options
The `Detailed Export` command provides the following built-in workflows and quality presets:

| Export Option | Description / CLI Command |
| :--- | :--- |
| **Preview PDF** | Compiles to PDF and opens the preview inside VS Code. |
| **Standard Export** | Export to **JPG**, **PDF**, **SVG**, or **EPS** (without opening a preview). |
| **Low-Res JPG** | `asy -f jpg -noV -render=8 test.asy` |
| **Ultra-HD Images** | `asy -f pdf -noV -render=4 test.asy` |
| **Maximum Crispness** | Optimized for Printing: `asy -f pdf -noV -render=8 test.asy` |
| **Pure Vector** | Pure Mathematical Vector: `asy -f pdf -noV -render=0 test.asy` |

---

## 🗂 Asymptote Sidebar

The Activity Bar features a dedicated Asymptote sidebar to manage your entire workflow from a single view. 

* **Build Status:** Tracks and displays the result of your most recent render.
* **Workspace Files:** A file tree that lists all `.asy` files discovered in your current workspace.
* **Quick Build:** Groups the primary render actions for fast access.
* **Export Presets:** Offers one-click shortcuts to your favorite format and render-quality configurations.
* **Tools:** Contains helpful output utilities such as *Reveal in File Explorer*, *Open Folder*, and *Copy Path*.

---

## ⚙️ Configuration Settings

Customize the extension's behavior via your VS Code `settings.json` or the Settings UI.

| Setting | Default | Description |
| :--- | :--- | :--- |
| `asymptoteBuild.executablePath` | `"asy"` | The path to the Asymptote executable. |
| `asymptoteBuild.outputFormat` | `"jpg"` | The default output format (value passed to the `-f` flag). |
| `asymptoteBuild.extraArgs` | `""` | Additional CLI arguments passed to the `asy` command. |

---

## 💻 Development & Contributing

Want to contribute or modify the extension locally? Follow these steps to set up your development environment:

1. Install dependencies:
   ```bash
   npm install

2. Compile the source code:
	```bash
	npm run compile

	```

3. Launch the Extension Development Host:
* Press `F5` in VS Code to open a new window with the extension loaded.

4. Test the extension:
* Open any `.asy` file in the Development Host window.
* Run the `Asymptote: Render JPG` command.
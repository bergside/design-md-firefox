# TypeUI DESIGN.md Extractor (Firefox Extension)

This Firefox extension extracts styles and information from a given site and generates a `DESIGN.md` or `SKILL.md` file that you can use with tools such as Google Stitch, Claude Code, Codex, and others to build websites with a given design system blueprint. The file is based on the open-source [TypeUI DESIGN.md](https://www.typeui.sh/design-md) format.

<img width="1200" height="630" alt="designmdfirefox" src="https://github.com/user-attachments/assets/2b3b9b53-ccc7-4121-9a31-ff512c82c229" />

## Getting started

Load the extension in Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select this project's `manifest.json`
4. Pin the extension and open the popup on any regular website tab

To distribute publicly, package and sign the add-on through AMO.

## Curated design skills

Check out curated design systems at [typeui.sh/design-skills](https://www.typeui.sh/design-skills).

## Available actions

| Action | Description |
| --- | --- |
| Auto-extract | Reads styles from the active tab (typography, colors, spacing, radius, shadows, motion). |
| Generate `DESIGN.md` | Produces design-system documentation markdown from extracted signals. |
| Generate `SKILL.md` | Produces agent-ready skill markdown from extracted signals. |
| Refresh | Re-runs extraction for the current page state. |
| Download | Saves generated output as `DESIGN.md` or `SKILL.md`. |
| Explain (`?`) | Shows how the file was generated, with TypeUI reference. |

## Generated file structure

The generated markdown follows this structure:

| Section | What it does |
| --- | --- |
| `Mission` | Defines the design-system objective for the extracted site. |
| `Brand` | Captures product/brand context, URL, audience, and product surface. |
| `Style Foundations` | Lists inferred visual tokens and foundations. |
| `Accessibility` | Applies WCAG 2.2 AA requirements and interaction constraints. |
| `Writing Tone` | Sets guidance tone for implementation-ready output. |
| `Rules: Do` | Lists required implementation practices. |
| `Rules: Don't` | Lists anti-patterns and prohibited behavior. |
| `Guideline Authoring Workflow` | Defines ordered guideline authoring steps. |
| `Required Output Structure` | Enforces consistent output sections. |
| `Component Rule Expectations` | Defines required interaction/state details. |
| `Quality Gates` | Adds testable quality and consistency checks. |

## Local development

Run tests locally:

```bash
node tests/run-tests.mjs
```

## License

This project is open-source under the MIT License.

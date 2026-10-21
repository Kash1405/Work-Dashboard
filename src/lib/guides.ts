import { useStored } from "./store";

// Guidelines & Shortcuts: one section per app. Everything is editable on the page; these are only
// the starting lists (fixed IDs, so every device seeds the same rows and Drive sync lines them up).

export type GuideApp = "Word" | "PowerPoint" | "Excel";
export const GUIDE_APPS: { app: GuideApp; letter: string; blurb: string }[] = [
  { app: "Word", letter: "W", blurb: "Reports, memos and long-form documents" },
  { app: "PowerPoint", letter: "P", blurb: "Decks, storylines and slide formatting" },
  { app: "Excel", letter: "X", blurb: "Models, analysis and data work" },
];

export type Shortcut = { id: string; app: GuideApp; task: string; keys: string; description: string };
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Checklist = { id: string; app: GuideApp; title: string; items: ChecklistItem[] };
export type GuideLink = { id: string; app: GuideApp; name: string; url: string };

const shortcutSeed: Record<GuideApp, [string, string, string][]> = {
  Word: [
    ["Apply Heading 1 / 2 / 3", "Ctrl+Alt+1 / 2 / 3", "Use real heading styles so the navigation pane and table of contents pick them up."],
    ["Back to Normal style", "Ctrl+Shift+N", "Resets a paragraph to the template's body style."],
    ["Open the Styles pane", "Ctrl+Alt+Shift+S", "See and apply every style in the template."],
    ["Clear character formatting", "Ctrl+Space", "Removes manual bold, font and size changes from the selection."],
    ["Clear paragraph formatting", "Ctrl+Q", "Removes manual indents and spacing, keeping the style."],
    ["Copy / paste formatting", "Ctrl+Shift+C / Ctrl+Shift+V", "Format painter from the keyboard."],
    ["Paste special (text only)", "Ctrl+Alt+V", "Paste without bringing in someone else's formatting."],
    ["Track changes on / off", "Ctrl+Shift+E", "Turn on before editing a document someone else owns."],
    ["Insert comment", "Ctrl+Alt+M", "Leave a review comment on the selection."],
    ["Find / navigation pane", "Ctrl+F", "Search and jump between headings."],
    ["Find and replace", "Ctrl+H", "Bulk-fix terms, spacing and naming."],
    ["Go to page / section", "Ctrl+G", "Jump straight to a page, section, comment or table."],
    ["Update fields (TOC, cross-references)", "Ctrl+A, F9", "Refresh the table of contents, captions and references before sending."],
    ["Insert footnote", "Ctrl+Alt+F", "Add a source or clarification at the foot of the page."],
    ["Page break", "Ctrl+Enter", "Start a new page without stacking empty lines."],
    ["Non-breaking space", "Ctrl+Shift+Space", "Keep things like “10 m” or “Q3 2026” on one line."],
    ["Show / hide formatting marks", "Ctrl+Shift+8", "Spot stray spaces, breaks and empty paragraphs."],
    ["Bulleted list", "Ctrl+Shift+L", "Apply the List Bullet style."],
    ["Increase / decrease indent", "Ctrl+M / Ctrl+Shift+M", "Indent a paragraph by one step."],
    ["Insert hyperlink", "Ctrl+K", "Link the selected text."],
    ["Word count", "Ctrl+Shift+G", "Check against page or word limits."],
    ["Spelling and grammar", "F7", "Run a full proofing pass."],
    ["Repeat last action", "F4", "Re-apply the last style or format to a new selection."],
    ["Save as", "F12", "Save a new version with the right file name."],
  ],
  PowerPoint: [
    ["New slide", "Ctrl+M", "Adds a slide with the next layout."],
    ["Duplicate slide or object", "Ctrl+D", "Copies in place; faster than copy and paste."],
    ["Group / ungroup", "Ctrl+G / Ctrl+Shift+G", "Keep related shapes together when moving them."],
    ["Bring forward / to front", "Ctrl+] / Ctrl+Shift+]", "Change the layer order of the selected object."],
    ["Send backward / to back", "Ctrl+[ / Ctrl+Shift+[", "Push an object behind others."],
    ["Selection pane", "Alt+F10", "Name, hide and reorder objects on busy slides."],
    ["Align left (ribbon keys)", "Alt+H, G, A, L", "Same path for the other options: C centre, R right, T top, M middle, B bottom."],
    ["Distribute horizontally", "Alt+H, G, A, H", "Even spacing across selected objects (V for vertical)."],
    ["Nudge / fine nudge", "Arrow / Ctrl+Arrow", "Move objects in small or very small steps."],
    ["Copy while dragging", "Ctrl+Drag", "Drop a copy of the object where you release."],
    ["Keep straight / proportional", "Shift+Drag", "Lock lines straight and resize without stretching."],
    ["Copy / paste formatting", "Ctrl+Shift+C / Ctrl+Shift+V", "Match fonts, fills and lines across objects."],
    ["Paste special", "Ctrl+Alt+V", "Paste as picture, unformatted text or a linked object."],
    ["Bigger / smaller font", "Ctrl+Shift+> / Ctrl+Shift+<", "Step the font size of the selected text."],
    ["Cycle through objects", "Tab / Shift+Tab", "Select hidden or stacked objects one by one."],
    ["Show gridlines / guides", "Shift+F9 / Alt+F9", "Line objects up against the slide grid."],
    ["Insert hyperlink", "Ctrl+K", "Link text or a shape to a slide or URL."],
    ["Start slide show / from current", "F5 / Shift+F5", "Present from the beginning or this slide."],
    ["Black or white screen in show", "B / W", "Pause the audience's attention on you."],
    ["Repeat last action", "F4", "Repeat a format, alignment or insert."],
  ],
  Excel: [
    ["Jump to edge of data", "Ctrl+Arrow", "Move to the last filled cell in that direction."],
    ["Select to edge of data", "Ctrl+Shift+Arrow", "Select a whole block of data quickly."],
    ["Select column / row", "Ctrl+Space / Shift+Space", "Select the entire column or row."],
    ["Insert / delete cells", "Ctrl+Shift+= / Ctrl+-", "Insert or delete rows, columns or cells."],
    ["Fill down / right", "Ctrl+D / Ctrl+R", "Copy the top or left cell's formula across the selection."],
    ["Fill selection with entry", "Ctrl+Enter", "Enter the same value or formula in every selected cell."],
    ["Edit cell", "F2", "Edit in place and see the formula's precedents highlighted."],
    ["Toggle absolute / relative", "F4", "Cycle $A$1 → A$1 → $A1 → A1 while editing a formula."],
    ["AutoSum", "Alt+=", "Insert a SUM of the range above or to the left."],
    ["Format cells", "Ctrl+1", "Number formats, borders, alignment."],
    ["Number / date / % format", "Ctrl+Shift+1 / 3 / 5", "Quick number formats."],
    ["Create table", "Ctrl+T", "Structured table with filters and banding."],
    ["Toggle filters", "Ctrl+Shift+L", "Turn AutoFilter on or off for the current range."],
    ["Paste values", "Ctrl+Alt+V, V, Enter", "Paste results only, without formulas or formats."],
    ["Flash Fill", "Ctrl+E", "Split or combine text by example."],
    ["Show formulas", "Ctrl+`", "Check formulas are consistent across a row or column."],
    ["Trace precedents / dependents", "Alt+M, P / Alt+M, D", "Follow where a number comes from and where it goes."],
    ["Go To Special", "F5, Alt+S", "Select blanks, constants, formulas or errors."],
    ["Insert today's date / time", "Ctrl+; / Ctrl+Shift+;", "Stamp a static date or time."],
    ["New line in a cell", "Alt+Enter", "Line break inside a cell."],
    ["Next / previous sheet", "Ctrl+PgDn / Ctrl+PgUp", "Move between tabs."],
    ["Group / ungroup rows or columns", "Alt+Shift+→ / Alt+Shift+←", "Collapse detail instead of hiding it."],
    ["Name Manager", "Ctrl+F3", "Review and clean up named ranges."],
    ["Insert PivotTable", "Alt+N, V", "Summarise a table or range."],
    ["Recalculate", "F9", "Recalculate all open workbooks (manual calculation mode)."],
    ["Go to A1 / last used cell", "Ctrl+Home / Ctrl+End", "Jump to the start or the end of the used range."],
  ],
};

const checklistSeed: Record<GuideApp, [string, string[]][]> = {
  Word: [
    ["Document formatting", [
      "Built on the current template; no fonts or colours outside it",
      "All headings use Heading styles (no manually bolded headings)",
      "Body text uses Normal / template styles; Ctrl+Space cleared stray formatting",
      "Bullets and numbering are consistent, with the same indents throughout",
      "Tables use the template table style, and header rows repeat across pages",
      "Figures and tables have captions and a source line",
      "Table of contents, captions and cross-references updated (Ctrl+A, F9)",
      "Headers, footers and page numbers correct; cover shows date, version and classification",
      "No double spaces, empty paragraphs or manual page breaks used for spacing",
      "Spelling and grammar pass done (F7), language set to the client's variant",
    ]],
    ["Before sending", [
      "All tracked changes accepted or rejected and comments resolved",
      "Inspect Document run (File → Info → Check for Issues) to remove personal info",
      "Reviewed by the owner / manager",
      "File name follows the convention (Client_Project_Document_vX.X_YYYYMMDD)",
      "Saved as PDF for external distribution",
    ]],
  ],
  PowerPoint: [
    ["Slide formatting", [
      "Every slide uses a master layout; nothing placed outside the margins",
      "Action titles: one or two lines stating the so-what",
      "Titles sit in the same position on every slide",
      "Fonts, sizes and colours come from the theme",
      "Objects aligned and evenly distributed (Align / Distribute, not by eye)",
      "Charts and tables carry a source and, where needed, footnotes",
      "Images and logos not stretched; pictures compressed",
      "Trackers / breadcrumbs and page numbers consistent",
      "No stray text boxes or objects hidden off-slide (check the Selection pane)",
      "Spell check done",
    ]],
    ["Storyline", [
      "Executive summary up front",
      "Reading only the titles tells the full story (horizontal logic)",
      "One message per slide; the body supports the title",
      "Next steps / asks slide at the end",
    ]],
    ["Before sending", [
      "Reviewed in Slide Sorter for flow and consistency",
      "Hidden slides, speaker notes and comments removed for external versions",
      "File size reasonable; linked objects broken or embedded",
      "File name follows the convention, with a PDF saved alongside",
    ]],
  ],
  Excel: [
    ["Model standards", [
      "Inputs, calculations and outputs kept on separate sheets or clearly separated blocks",
      "Colour code: blue font hard-coded inputs, black formulas, green links to other sheets",
      "No hard-coded numbers inside formulas",
      "Formulas consistent across each row or column (check with Ctrl+`)",
      "Units, currency and sources labelled on every table",
      "Checks sheet in place and all checks return 0 / TRUE",
      "No #REF!, #N/A or #DIV/0! errors (F5 → Special → Formulas → Errors)",
      "Number formats consistent; negatives and percentages formatted the same way",
      "Unused named ranges and sheets removed (Ctrl+F3)",
    ]],
    ["Before sending", [
      "Calculation set to Automatic",
      "External links checked or broken (Data → Edit Links)",
      "Freeze panes and print areas set where useful",
      "Cursor at A1 on every sheet, with the cover / first sheet selected",
      "Hidden sheets and rows reviewed; nothing confidential left in them",
      "File name follows the convention",
    ]],
  ],
};

const seedId = (prefix: string, app: GuideApp, i: number, j?: number) => `${prefix}-${app.toLowerCase()}-${i + 1}${j === undefined ? "" : `-${j + 1}`}`;

export const defaultShortcuts: Shortcut[] = GUIDE_APPS.flatMap(({ app }) =>
  shortcutSeed[app].map(([task, keys, description], i) => ({ id: seedId("sc", app, i), app, task, keys, description })),
);

export const defaultChecklists: Checklist[] = GUIDE_APPS.flatMap(({ app }) =>
  checklistSeed[app].map(([title, items], i) => ({
    id: seedId("cl", app, i),
    app,
    title,
    items: items.map((text, j) => ({ id: seedId("ci", app, i, j), text, done: false })),
  })),
);

export const useShortcuts = () => useStored<Shortcut[]>("guide.shortcuts", defaultShortcuts);
export const useChecklists = () => useStored<Checklist[]>("guide.checklists", defaultChecklists);
export const useGuideLinks = () => useStored<GuideLink[]>("guide.links", []);

export const asGuideApp = (s: string): GuideApp => GUIDE_APPS.find(({ app }) => app.toLowerCase() === s.trim().toLowerCase())?.app ?? "Word";

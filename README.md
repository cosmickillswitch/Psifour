# Psi Phi Studio (tablet)

A scientist's animation studio that combines **Animath** (Manim-style 2D: LaTeX maths, graphs, logic, nodes, geometry, stickers, drawing, values, camera, sound, Manim code export) with **Psi Phi Studio** (3D: proteins from the PDB, molecules, lipid bilayers, tight junctions, paper stacks), plus new anatomy and cell-biology models. Everything sits on one CapCut-style timeline.

## Layout (iPad / tablet)
- **Menu bar:** File (new blank canvas, demos, projects, export), Edit, **Insert** (every category, plus Molecule by name, Protein by PDB ID, Search PDB), View.
- **Preview** in the middle. Drag an object to move it. Drag empty space to orbit the 3D world, and pinch or scroll to move the 3D camera closer.
- **Right panel**, always open. With something selected it shows Edit · Animate · Effects · Style · Keys · Rig, plus quick actions. With nothing selected it shows Layers · Scene · Camera · Values · Sound · Library · Code.
- **Timeline**, then the **tool dock**: Draw, Sketch, Text, Shapes, Graphs, Logic, Physics, Maths, Nodes, Geometry, 3D, Stickers, Media, Library, Values, Camera, Sounds, Scene, Code, Molecules, PDBs, Anatomy, Cell biology. Categories open a tray of things to add at the playhead.

## 3D objects
3D things are ordinary clips. They get Animath's entrance and exit animations (Create draws a protein along its chain or grows a membrane from the middle; Fade, Grow, Pop, Spin and the rest work too), keyframed position, scale and rotation, and parenting. The **3D** section of the Edit tab has their own keyable values, each with a ◇ key button, plus one-tap moves:
- **Protein:** cartoon, atoms, atom size, sticks, ligands. Includes Cartoon → atoms.
- **Molecule:** atom size, sticks. Find by name (PubChem 3D) or SMILES; about 50 common molecules also work offline.
- **Membrane:** curvature (flat → vesicle), jiggle, pore. **Tight junction:** gap, strands, leak.
- **Paper stack (PDF or image):** spread, fan, focus page, lift.
- **Bio models:** BBB capillary (cut-away), capillary, neuron (fire a signal), red blood cell, cell, mitochondrion, DNA (unzip), virus.
- **3D shapes:** sphere, cube, torus, knot and more, in glossy, matte, metal, glass, toon or wireframe.
- Every 3D object also has **Spin**, **Tilt** and **Depth**. The **Camera** tab has a keyable 3D camera (orbit, tilt, distance, lens) with Turntable and Dolly moves.

3D always draws behind the 2D layer, in one shared 3D space, so a protein can sit inside a membrane. Objects are fitted to a similar size unless you tick **True size** (1 unit = 10 Å).

## Sculpting and rigging (ClayForm)
3D → **Sculpt a clay head**, **Sculpt from scratch** or **Rigged clay character**, or a **puppet**: biped, quadruped, hexapod, octopod (spider) or octopod (octopus). Each puppet comes rigged and skinned with a looping two-second walk or swim cycle (also in Insert → Sculpt, and in ClayForm’s ⋯ menu) opens ClayForm full screen. It has sculpt brushes, objects, Rig (bones and skin weights), Pose, Stage (puppeteering with a controller or your face), shape keys and a timeline. **Use in scene** brings the result back as a clip that keeps its rig, shape keys and animation. The animation plays from the start of the clip, and you can set its speed and looping. **Edit in ClayForm** on a sculpt clip reopens the same ClayForm project, and **Update in scene** swaps the new version in.

### One app, not two
`clayform.html` is the final ClayForm (version 7: the Professor, the view gizmo, axis lock and face puppeteering), built into Psi Phi Studio. It opens inside Psi Phi Studio, says when it’s ready, and hands the sculpt back as a GLB with its rig, shape keys and animation. Psi Phi Studio keeps asking until ClayForm answers, so a slow first load can’t leave **Use in scene** stuck. ClayForm has no offline worker of its own here: Psi Phi Studio’s worker caches it, and an old ClayForm worker left over from an earlier install is removed on start. You can still open `clayform.html` on its own, and it shares the same projects.

Starters (Insert → Sculpt, the 3D tray, or ClayForm’s ⋯ menu): clay head, sculpt from scratch, rigged clay character, the Professor, and the biped, quadruped, hexapod, spider and octopus puppets.

## Labels that follow 3D
Any 2D object (text, maths, arrows, stickers, diagrams) can be **pinned to a 3D object or residue** from the **Pin to 3D** section of its Edit tab. It follows the object as the 3D camera moves, and its own position becomes an offset. An optional **leader line** grows in with the entrance animation. 3D objects have a **＋ Label pinned to it** button, and proteins and molecules also have **＋ Label a residue…**: tap a residue on the preview and the label takes its name.

## Transporters and channels
In Cell biology: **GLUT1**, **P-glycoprotein**, **aquaporin** and a **K⁺ ion channel**. Each carries its cargo across: glucose by alternating access, a drug pumped out with ATP, water in single file, and ions through an open gate. Speed, cargo and gate are all keyable. **Seat it in a membrane** puts the protein and a bilayer at the same true scale and opens a pore for it.

## Diffusion and data
- **Physics → Diffusion:** particles on a random walk, starting as a gradient, a drop or spread out, with an optional membrane barrier of adjustable permeability. Shows left/right counts and a live concentration profile.
- **Graphs → charts from CSV:** bar, line, scatter and **forest plots** (meta-analysis style, with a log scale, a line of no effect and a pooled diamond). Paste data or import a CSV file. Charts draw on with Create like any Manim object.

## Diagrams (2D, drawable with Create)
Neurovascular unit, capillary, brain, neuron, red blood cell, animal cell, mitochondrion, synapse, each with optional labels. **Hand over to 3D** crossfades a diagram into its matching 3D model (for example, the neurovascular unit becomes the BBB capillary).

Sculpts and 3D shapes can use a **clay** or **glazed clay** look (matcaps, as in ClayForm).

## Files
- `core.js`: Animath engine, with a small hook that draws the 3D layer.
- `sci2d.js`: diffusion and CSV charts (2D Animath types).
- `bio3d.js`: the 3D layer (three.js r128): structures, molecules, membranes, junctions, papers, bio models, 2D diagrams, PubChem and RCSB fetching.
- `editor.js`: the editor (Animath's, extended with the menu bar, dock trays, tablet panel, 3D inspector and gestures).
- `export.js`: Manim code export. 3D objects become placeholders.
- `clayform.html`: the whole ClayForm sculpt, rig and animate app in one file, opened by Studio in a full-screen frame.
- `home.html`: the Home page (all apps and recent files from every app). The installed app now starts here.
- `home.js`: the Home page's file browser.
- `shelf.html` and `shelf.js`: Shelf, the bookshelf app.
- `hub.js`: shared by every app: the Home button and **⇪ Send to** between apps.
- `notes.html` and `notes.js`: Psi Phi Notes (notebooks, whiteboards, PDFs, side-by-side panes).
- `app.css`, `index.html`, the five `lm-*.woff` fonts, `manifest.webmanifest`, `sw.js` (bump `VERSION` after changes).

There are no folders: every file sits at the top level, so uploading from an iPad (which drops folders) works.

## Notes
- Fetching from PubChem and the RCSB needs the internet. It works on GitHub Pages but not inside the Claude preview.
- Projects are stored in this browser, and structure files, PDFs and images in IndexedDB. File → Projects → Save project file carries them with it.
- Storage is separate from Animath's, so both apps can live on the same GitHub Pages site.

## The Add tray

The first button in the dock, **＋ Add**, gathers the import tools in one place (they're also under Insert → Add):

- **Record voice…** records from the microphone, starting at the playhead, and puts it on the sound track.
- **3D model (OBJ / GLB)…** brings in models from Blender. GLB (File → Export → glTF 2.0, "glTF Binary") keeps materials, textures, rigs and animation; OBJ keeps the shape only. `.blend` files can't be opened directly.
- **PDB file / PDB by ID / Search the PDB**, **Molecule by name / from SMILES / SDF or MOL file**.
- **Atom…** picks an element from a periodic table; styles are Bohr model, 3D orbits, electron cloud and CG sphere, and any atom can be made an ion.
- **Periodic table** (2D), in five looks (classic, solid, by block, line, neon), with highlights such as `Na, Cl`, `halogens`, `group 1`, `period 3` or `d-block`.
- **PDF / image / document…** turns PDFs, images, Word (.docx), text and Markdown into a stack of pages. Several images or documents together become one PDF.

Molecules have styles too: CG (glossy, two-tone bonds, outlined), ball and stick, space-filling, sticks and toon.

You can also **drag files onto the app**: models, structures, molecules, PDFs, images, documents and sound go to the right place.

`elements.js` holds the data for all 118 elements (names, atomic weights, families, positions and electron shells).

## Tabula and 8-Bit studios

*Renamed:* Biostage is now **Psi Phi Studio**, Clayframe is **ClayForm**, Artwork is **Tabula** and Pixel Art is **8-Bit**. The files are `clayform.html`, `tabula.html` and `8bit.html`; projects made under the old names still open.

Like ClayForm, these open full-screen from **Insert → Tabula** / **Insert → 8-Bit** (and from the ＋ Add tray). **✓ Use in scene** brings the result back as an artwork object you can move, scale, keyframe and style like anything else. Its panel adds **Animate**, **Frames per second**, **Speed**, **Playback** (loop, ping-pong, once) and **Frame to show**. **Edit in Tabula / 8-Bit** reopens the original.

- `tabula.html` is a painting studio in the spirit of Procreate. It has 17 brushes with Pencil pressure and tilt (pencils, inks, paints, airbrushes, watercolour, charcoal, pastel, calligraphy, texture), plus smudge and eraser using any brush. Layers support blend modes, opacity, alpha lock, clipping masks and background layers. Other features:
  - QuickShape: hold at the end of a stroke to snap it to a shape.
  - Symmetry and grid guides, transform, hue/saturation/brightness and blur.
  - ColorDrop: drag the colour circle onto the canvas to fill.
  - Gestures: two-finger tap undoes, three-finger tap redoes, pinch zooms and rotates, touch-and-hold picks a colour, four-finger tap hides the interface.
  - Frame-by-frame animation with onion skin. Background layers stay the same on every frame, and "leave the background out" makes the asset transparent.
- `8bit.html` is a pixel editor in the spirit of Pixquare. Tools: pencil (pixel-perfect), eraser, fill, line, rectangle, ellipse, picker, select/move, dither and shade. It also has mirror drawing, palettes (PICO-8, Sweetie 16, Endesga 32, Game Boy and more), layers, animation frames with onion skin, and PNG, sprite sheet and GIF export.

Both keep their own projects on the device (IndexedDB) and also work on their own if you open the file directly.

## Logos and Calsheet

**Insert → Logos** is a document and script writer: styles (title, headings, quote, code), fonts including Latin Modern, sizes, bold, italic, underline, colours, highlight, alignment, line spacing, bullet, numbered and check lists, tables, pictures, links, find and replace, word count with reading time, and import or export (.docx, .txt, .md, .html, PDF). **Script mode** formats a screenplay: Tab changes the line type, and Return moves to the next natural one.

**Insert → Calsheet** is a spreadsheet: A1 formulas (tap cells to point at them), around 100 functions (SUM, AVERAGE, IF, VLOOKUP, XLOOKUP, COUNTIF, STDEV, SEM, T.TEST, CORREL, SLOPE, NORM.DIST, text and date functions), number formats, fill, sort, insert and delete rows and columns, several sheets, CSV and Excel import, CSV export, and live column, line, scatter, pie and donut charts.

**✓ Use in scene** in each studio offers:
- Logos: the selection as text, the selection as a picture (it keeps the look), a table, or the whole document beside the stage.
- Calsheet: the selected cells as a table, as an animated chart, or the whole sheet beside the stage.

Objects remember where they came from. **Edit in Logos / Calsheet** reopens the original and updates the object.

**The reader** shows a document or sheet in a floating panel beside the stage, so you can read a script while recording. Drag its top bar to move it and its corner to resize it. A− and A+ change the text size. Choose **Scroll by hand**, **Auto-scroll** (with a speed slider) or **Follow the timeline** (the page keeps pace with the playhead). In ⚙ you can make it start with ▶ Play and 🎙 Record. While the reader is open, the voice recorder stays small, and it can play the scene as you speak. The reader never appears in exported videos.

## Final Stage (video editor)

**File → Final Stage**, or **🎬 Send to Final Stage** after exporting a video from Psi Phi Studio or ClayForm. It is a CapCut-style editor:
- **Tracks:** a magnetic main track, two overlay tracks (picture-in-picture, with blend modes), a text track and two sound tracks.
- **Editing:** split, trim with the yellow handles, copy, delete, freeze frame, speed (0.25–4×), volume and fades.
- **Animation:** keyframes (◇) for position, size, angle and opacity.
- **Transitions:** cross-fade, dip to black or white, slide, push, wipe, circle and zoom.
- **Looks and effects:** brightness, contrast, saturation, warmth, tint, vignette, blur and grain.
- **Titles:** presets with pop, rise, slide, wipe and typewriter animations.
- **Export:** 720p to 4K, at 24, 25, 30 or 60 fps.

## Smooth exports

Videos are now rendered frame by frame with WebCodecs and written as MP4 (H.264 with AAC or Opus sound), so slow scenes no longer drop or skip frames. Older browsers fall back to real-time recording. The encoder is `videnc.js`.

## ClayForm additions

- **Model mode:** a low-poly cage of quads, smoothed with Catmull–Clark subdivision. Pick points, edges or faces, then Extrude, Inset, Loop cut, Merge or Delete. Mirror X is available, and Smooth ± changes the subdivision level.
- **Quads:** the wireframe and OBJ export use quads.
- **Puppet:** a wooden mannequin built from rigid pieces with ball joints. Sliders set its height, build and proportions, and there are presets.
- **Joints:** a Tight ↔ Soft setting for how far a bend spreads into neighbouring parts. Automatic weights now account for each bone's thickness and keep chest skin on the chest.
- **Brush Falloff slider:** sets how gently a brush fades out at its edge.

### Topology tools (ClayForm → Sculpt)
- **◇ Subdivision:** a non-destructive Subdivision Surface modifier (Catmull–Clark), levels 1–4. You sculpt, rig and pose the mesh underneath, and exports and Use in scene get the smooth version. **Apply** makes it the real mesh.
- **◈ Remesh** opens Remesh & topology:
  - Voxel remesh (an even grid of quads)
  - Quad remesh (a target face count)
  - Decimate (quadric edge collapse to a target triangle count)
  - Fill holes (patches made of quad rings)
- **Rebuilding the mesh** with Subdivide or any of the remesh tools carries skin weights, paint and shapes across from the nearest old points, so painted weights and a Puppet's solid pieces survive.

### Ready-made models, textures, skies and space (ClayForm → ＋ Add)
- **Buildings:** house, shed, tower block, brick wall, stone wall, fence.
- **Ground & roads:** grass, wooden, tiled and marble floors, road, zebra crossing, pavement with kerb, cobbled path, pond.
- **Furniture:** table, chair, sofa, bed, bookshelf, desk, floor lamp, rug, park bench, street lamp, bin, pot plant.
- **Nature:** tree, pine, bush, rock, flowers.
- **Space:** the Sun, the eight planets, the Moon and Pluto, plus a whole Solar System line-up with squeezed sizes.
- **Sky:** clear day, overcast, sunset, dawn, night or space, behind the scene and in exported videos.
- **Look → Texture:** gives any shape one of these procedural textures:
  - building and ground surfaces: brick, planks, wood grain, tiles, paving, cobbles, roof tiles, asphalt
  - natural surfaces: grass, leaves, bark, water
  - fabric and marble
  - the planet surfaces
  - Pattern size and second-colour controls

  Textures are drawn by ClayForm's renderer, so they show in ClayForm and in its video exports. When a model goes to Psi Phi Studio through Use in scene, it keeps its colours but not its textures.

### Tabula brushes
- **Brushes:** 41 brushes in 9 sets, with smooth tips and paper, canvas or rough textures fixed to the page.
- **Paint behaviour:** wet paints pick up and carry colour. Foliage, grass, clouds and stars vary their colour.
- **Blend tool (💧, key N):** Soft Blender, Paper Stump and Water Blend soften and mix colours without dragging them.

### Logic and Probability
- **Logic → Inference rules** has a folder for each system:
  - classical rules of inference
  - natural deduction (Gentzen)
  - first-order quantifiers and identity
  - sequent calculus (LK)
  - modal logic, intuitionistic logic and Aristotle's syllogisms
  - Hoare logic
- **Logic → Axioms** has:
  - propositional (Hilbert/Łukasiewicz), intuitionistic (Heyting), first-order and modal logic (K, T, 4, 5, B, D, GL, and S4/S5)
  - ZFC, plus naive set theory, Russell, NBG, NF and the continuum hypothesis
  - Peano arithmetic, groups, fields, Boolean algebra, Euclid and Kolmogorov
- **Probability** (new tab):
  - basics, conditional probability, and Bayesian formulas with their popular variants
  - frequentist methods, and other approaches: Dempster–Shafer, Jeffrey conditioning, imprecise probability, quantum, fuzzy and Cox–Jaynes
  - distributions, expectation and limit theorems, and information theory

  Bayes' theorem and the bell curve moved here from Maths.

## Psi Phi Notes (`notes.html`)
A GoodNotes-style notebook app on the same site. It opens from Psi Phi Studio's File menu, or go straight to `notes.html` and add it to the Home Screen.

- **Library.** Nested folders, notebooks with covers, endless whiteboards and imported PDFs. You can search, sort, rename, move, duplicate and export to PDF. Deleting moves things to Recently deleted, where you can put them back.
- **Paper.** Blank, lined, narrow, squared, dotted, Cornell, music, isometric, to-do and storyboard pages, in eight colours (including dark and chalkboard). Sizes are A4 (portrait or landscape), Letter, A5, square and 16:9. You can change one page or all of them.
- **Writing tools:**
  - **Pens:** ballpoint, fountain, brush, pencil and fineliner. They respond to Apple Pencil pressure.
  - **Highlighter:** sits under the ink.
  - **Eraser:** whole strokes or partial, with a highlighter-only option.
  - **Lasso:** freehand or rectangle. Move, resize, rotate, recolour, copy, cut, paste, duplicate, reorder or delete.
  - **Shapes:** draw-and-snap, line, arrow, rectangle, ellipse, triangle, diamond, star and axes, with fill and dashes. With any pen, hold still at the end of a stroke to snap it.
- **Text.** Text boxes with fonts (including LaTeX's Latin Modern and handwriting), sizes and colours. Also bold, italic, underline, strike, super- and subscript, highlight, alignment, bullets, numbers, tick-box checklists, indents, headings, quotes, code, tables, links and lines. Sticky notes come in six colours.
- **Pages.** A thumbnail sidebar where you can add pages before or after, duplicate, reorder, change the paper, export one page or delete it. Pages scroll up and down or sideways.
- **Gestures:**
  - Pinch to zoom and drag with two fingers to scroll.
  - Tap with two fingers to undo, three to redo.
  - The first time an Apple Pencil touches the page, fingers switch to scrolling; this is an option under ⋯.
  - Keys: P, H, E, L, S, T, space, ⌘Z, ⌘C, ⌘X, ⌘V, ⌘D and Delete.
- **PDFs.** Import a PDF as a new notebook or into an open one, then write on it. PDF reading uses pdf.js from cdnjs and needs the internet the first time. Pages are kept as pictures, and they re-render sharper when you zoom in. Export any notebook or whiteboard as a PDF (with the Share sheet on iPad), or print it.
- **Side by side.** ◫ opens up to three panes: notes, PDFs, whiteboards or any Psi Phi app (Studio, Logos, Calsheet, Tabula, ClayForm, 8-Bit, Final Stage). Drag the bar between panes to resize them; ⇄ swaps them. On phones, panes become tabs. The panes you had open come back next time.
- **Insert ＋.**
  - Photos, the camera, text, stickies, tables, shapes and PDF pages.
  - **Anything from Psi Phi Studio.** Notes opens Studio in *figure mode* (`index.html?embed=1&figure=1`) with the right tray ready: maths, logic, inference rules, axioms, probability, physics, graphs, nodes, geometry, 3D, molecules, PDBs, anatomy, cell biology, stickers, media or your library. Build the figure, then tap **✓ Add to note**.
    - It arrives as a picture with its background removed. Tick **With animation** to bring a video too; ▶ plays it on the page.
    - Select a figure and tap **✎ Edit figure** to reopen it in Studio.
    - Figure mode doesn't add anything to your Studio project list.
  - **Studios.** ClayForm sculpts and puppets (through figure mode), Tabula drawings and animations, 8-Bit pixel art, Logos text, tables and pictures, and Calsheet tables and charts. A Calsheet chart goes through figure mode so it renders like Studio's charts. Linked items have **↗ Open beside** to open the source document in a pane.
- **Storage.** Everything is kept on the device in IndexedDB (`psiphi-notes`), separately from Studio's projects.

## Home and Send to
- **Home (`home.html`).** Shows all eight apps (with **＋ New** where it makes sense) and your recent files from every app, newest first. You can filter by app and search names. Each app has a ⌂ button back here, which is hidden when the app is shown inside another one. Installing from now on starts at Home. If the app is already on your Home Screen it still opens in Studio, so use ⌂ from there, or remove and re-add it.
- **⇪ Send to** is in every app's top bar. It offers only what makes sense for what you have open or selected:
  - **Studio:**
    - Selection or frame → Notes, as a figure that stays editable.
    - Molecule or protein → **ClayForm, as sculptable clay**: the atoms are fused into one smooth surface coloured by element, opened as a new sculpt.
    - A ClayForm sculpt → back to ClayForm.
    - Tables and charts → Calsheet or Logos; text → Logos.
    - Frame → Tabula or 8-Bit.
    - Record → Final Stage.
  - **ClayForm:** a picture of the view → Notes or Tabula. The animation as a video → Notes or Final Stage. The model with its rig and animation → Studio.
  - **Notes:** the selection or page → Studio, Tabula or Final Stage. Typed text → Logos; a table → Calsheet. A figure → Studio, opened as a project.
  - **Tabula:** the picture or animation → Notes or Studio; the frame → 8-Bit (pixelated) or Final Stage.
  - **8-Bit:** crisp pixels or the animation → Notes or Studio; the frame → Tabula or Final Stage.
  - **Logos:** the selection or document → Notes (editable or as a picture); a table → Calsheet or Studio; text → Studio.
  - **Calsheet:** the selection, or all filled cells → Notes, Logos or Studio as a table; selected numbers → Studio as an animated chart.
  - **Final Stage:** the finished video → Notes.
- **Received items:**
  - Logos and Calsheet open them as a new document or spreadsheet.
  - Tabula opens a canvas sized to the picture, with the picture on its own layer.
  - 8-Bit pixelates it onto a layer.
  - Final Stage adds it to the end of the film.
  - Studio adds it to the open project.
  - Notes adds it to the note you had open.
- **Side by side.** Sending from an app shown in a Notes pane drops the item straight onto your note, or opens the target app in that pane.
- Transfers wait in a small shared database (`psiphi-hub`) until they're opened, and are cleared after a day.

## Handwriting engine (Notes)
- Strokes keep the raw Pencil samples and are drawn as smooth outlines, the approach used by perfect-freehand and tldraw:
  1. **Variable stabilisation.** Slow, careful movement is smoothed most; fast writing barely at all, so it never lags. The **Steadiness** slider sets the overall amount.
  2. A light relaxation pass removes hand tremor.
  3. Pressure sets the width; fingers get width from speed on the expressive pens. The **Pressure** slider scales it.
  4. Fountain and brush pens taper at both ends, and the fountain pen has an angled nib.
  5. Sharp corners split the outline so they stay crisp, and tight loops never leave holes.
  6. Edges are drawn with curves through midpoints, so ink is smooth at any zoom.
- **Speed and latency:**
  - The live stroke is drawn once per screen frame, not once per pen event.
  - Long strokes freeze their older part, so each frame only rebuilds the tail.
  - All coalesced 240 Hz samples are used.
  - On Safari 18.2+ the line is drawn slightly ahead of the pen using predicted points; there is an option under ⋯.
  - Touch gestures are blocked on the page, so iPadOS Scribble and callouts can't grab the Pencil. If strokes still go missing, turn off Settings → Apple Pencil → Scribble.
  - Saving waits until the pen is lifted, and thumbnails are only made when you open the library, so nothing interrupts writing.

## Files and folders (Home)
- **Recent** shows the latest ten files from every app. **Files** below it is a browser across all the apps.
- **Folders:** make folders and nest them, colour them, rename them, and move them into each other.
  - Deleting a folder moves its contents up a level.
  - These are Home's own folders, shared across apps; Notes keeps its own folders inside Notes.
- **Filing files:**
  - Use ⋯ › Move to folder on any file. On a computer you can also drag files onto a folder or a breadcrumb.
  - Use **Select** to move or pin several files at once.
  - Pinned files sit at the top of their folder.
- **＋ New here** (and the ＋ on an app tile while you're inside a folder) makes a new file in that app and files it in the current folder when you come back.
- **Search and sorting:** search looks through file names and Logos text. Filter by app, or sort by date, name or app.
- **On iPad:** a tip shows how to add Psi Phi to the Home Screen (Share › Add to Home Screen). It then opens straight into Home.

## Shelf (`shelf.html`)
- **Shelves:** orderable shelves in oak, walnut, white, metal or glass.
  - Name a shelf by tapping its title.
  - Use its ⋯ menu to change the finish, move it up or down, sort it, or remove it.
  - **Spines** shows everything spine-out; **Covers** shows everything face-out.
- **Kinds:** books (cloth or leather spines with gilt bands), magazines and comics (thin glossy spines), binders (rings and a spine label), notebooks (a spiral coil) and **paper stacks** (sheets lying flat, top page visible). Spine thickness follows the page count; height follows the page shape.
- **Moving things:** drag with a mouse, or press and hold with a finger and then drag, to reorder along a shelf or onto another. Rows scroll at the edges as you drag. Press and hold without moving for the item's menu (details, move to shelf, write on it in Notes, remove).
- **Adding things:**
  - Any PDF, as any kind; the title and author come from the PDF where it has them.
  - Photos or scans, as a paper stack or a book.
  - Drag files onto the room.
  - From Notes (⇪ Send to › Shelf, a notebook becomes a readable book) or from Logos (a document is paginated into a book).
  - Pages are kept on the device.
- **Reading:**
  - **Books, notebooks, binders, magazines and comics:**
    - Open as a two-page spread in landscape (the cover alone, like a real book) or one page in portrait.
    - Turn pages by dragging the corner, with a 3D page turn and shading, or by tapping the edges, using the arrow keys or the slider.
    - Hardbacks show their cover boards and page edges that thin as you read. Magazines are glossy.
  - **Paper stacks:** sheets lie on a desk; swipe the top sheet away to read the next, and swipe back to return.
  - **Zoom and layout:** double-tap or pinch to zoom, and tap the middle to hide the controls.
  - **Other tools:** ▦ shows every page, 🔖 bookmarks the page, and ⋯ has bookmarks, right-to-left reading (manga, Arabic, Hebrew) and "write on it in Notes".
  - **Your place:** where you got to is remembered, and shown as a thin bar on the spine.

## Read aloud (Shelf)
- **Where the text comes from:**
  - PDFs added from now on keep their text, with the position of every word.
  - Items already on the shelf can get their words from the same PDF (⋯ › Find the words…, exact and instant) or by recognising the page pictures (OCR, Tesseract, needs the internet once).
  - Notebooks from Notes and documents from Logos bring their typed text, but not handwriting.
- **Player:** 🔊 in the reader opens it. It uses the iPad's own voices; pick one from the list (Enhanced or Premium voices sound best; download more in Settings › Accessibility › Spoken Content › Voices).
- **Following along:** the spoken word is highlighted on the page and its sentence lightly tinted. The caption shows the sentence, and pages turn by themselves. Tap any word on the page, or in the caption, to read from there.
- **Moving around:**
  - **Scrubber:** moves word by word across the whole item. While you drag, it previews the page, time and sentence, and reading resumes where you let go.
  - **⏪ ⏩:** a tap jumps 10 seconds. Hold to scrub, starting slowly and speeding up to about a page a second. Release to resume at the start of that sentence.
  - **⏮ ⏭:** go back or forward a sentence. Pressing ⏮ just after a sentence starts goes to the one before.
- **Speed:** 0.5× to 3× in 0.05 steps, with the slider, − and ＋, or presets (tap the speed label). Changes take effect at the current word.
- **Keys:** space plays or pauses, comma and full stop move by sentence, and shift with the arrows moves 10 seconds.
- **Lock screen:** the controls show there where the system allows it.
- **Your place:** where you got to is remembered for each item.

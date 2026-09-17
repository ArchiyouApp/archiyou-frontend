# Brep kernel wiring, hidden-line removal and exact SVG/DXF

| | |
|---|---|
| Dates | 2026-08-02 → 2026-08-05 |
| Model | Claude Opus 4.6, Claude Opus 5 |
| Tool | Claude Code as an agent, in a terminal |
| Human | Mark van der Net: wrote the prompts below, directed the work, reviewed the code and tested the result in the browser |
| Branch | `develop` |
| Session transcript | not kept; the prompts below come from the local Claude Code prompt history (122 for this unit) |

## How this record was made

This record is **retroactive**. The work it describes was done between 2026-08-02 and 2026-08-05, before Archiyou disclosed AI use per commit, and the record was written afterwards from what was still available:

- The **prompts** are verbatim from the Claude Code prompt history on the author's machine. Only the author's own words were kept; pasted file contents appear as the placeholders the tool itself writes (`[Pasted text #1 +203 lines]`).
- The **models** are reconstructed by the author from memory. Claude Code records that a model was switched but not which model was chosen, so for this period the rule is: Claude Sonnet 4.6 before July 2026, Claude Opus 4.6 from July 2026. Where a commit trailer or a session transcript named the model, that name was used instead.
- The **agent output** is the code in the commits listed at the bottom. No agent transcripts from this period were kept.

Known limits of the prompt history: it starts on 2026-04-23, and it has holes where prompts were not recorded — 2026-04-23 → 2026-05-07, 2026-05-07 → 2026-05-18, 2026-06-17 → 2026-06-29. Commits inside those holes carry `Prompt: not retained` instead of a quote.

## Prompts (verbatim, local time)

```
2026-07-30 19:45 +0200  Please place the description next to the param label to the right (in configurator)

2026-07-30 20:05 +0200  Just a question. I want to scale horizontally the server (to enable more execution workers later): is this possible with sqlite DB?

2026-07-30 20:54 +0200  continue

2026-07-30 21:43 +0200  Please remove the thumbnail preview in the publish as configurator menu - doestn matter since the user cant change it. Make it automatic please. Do add the thumbnail in the file-manager (when opening a file) to the right please

2026-07-30 21:51 +0200  Can you visually check if the thumbnails are visible in the published scripts tab of file-manager ?

2026-07-31 12:08 +0200  There were some changes to meshup SVG output I think. If I open this script: "http://localhost:5173/editor/archiyou/pubtest2:0.6" and view the document, the lines of isometry are too thick. Also the hidden lines are visible (they are dashed, but scale is wrong). Can you research why and come up with some solution options?

2026-07-31 12:18 +0200  It renders black. Indeed do A + C

2026-07-31 12:20 +0200  Can you please remove the count chip on the presets header? Its ugly. Only make sure that if the user makes a preset, the presets menu is expanded automatically (so it shows the result of the users input)

2026-07-31 12:35 +0200  The line thickness is OK now. But the dashed lines are not stable. First, the dashed should not be shown anyway. This is the problem. but it resides in the meshup Mesh.iso() function. If I do this in the script itself I get the same wrong result. Maybe they are not dashed lines but artefacts from edge hiding algoritm. This script: [Pasted text #1 +7 lines] ==> the iso collection should have 11 edges, not 13. Please test, debug and propose a solution

2026-07-31 12:42 +0200  I want to fix it on the rust layer. So please fix that first

2026-07-31 13:12 +0200  I got a real horror test for isometric view. See script at "/archiyou/housetest:0.1" (shared script). The last line contains the iso() command. It's slow (but thats not the biggest problem). A lot of weird stuff happens. For example that is generates lines that are not on the XY plane. The other errors are for later. Can you create a test for this and start debugging?

2026-07-31 13:25 +0200  [Pasted text #1 +9 lines]

2026-07-31 13:31 +0200  Yes please wire it up. Just use the Runner for it. Make it into a test 'house.production.test.ts'. Then please try to debug towards a fix.

2026-07-31 13:31 +0200  There is a weird bug in the file info menu. Where a message is shown "already exists" below the name (but i am not renaming anything - this only goes for the header). Please fix this.

2026-07-31 14:25 +0200  Keep debugging the planarity bug - check the scale-back loop

2026-07-31 14:51 +0200  yes, continue with Phase 1

2026-07-31 15:33 +0200  Now fix the multi-mesh contact-face residual

2026-07-31 15:34 +0200  The file manager (Open file) needs some work. With alls scripts (My Scripts, Public Shared, Shared with me) I want to add the latest version (as a small pill next to name). For shared/public script please add "by" to the author (so by Archiyou for example) - the latest version pill should be to the right of that. Also please validate if any thumbsnail is working? I cant see them.

2026-07-31 15:41 +0200  There exist a collection of (old) cadscripts inside tests/cadscripts. I want you to go through them and see if you can make them work on the meshup kernel. Use the run.cadscripts.test.ts code to run them. First I want you to refactor them (if not alraedy) into the pure JS version (so with params defintions inline, not external as data structure. Omit name, author etc.). Then just run the scripts one by one and see if you can make them run. If you encounter a problem, see if you can rewrite the problematic statement (for example _copy() => copy().tmp(), clone => copy()). If you encounter functionality that is simple not in the mesh kernel (for example fillets on solids) make a note for it and skip the script for now. In the end give me a report of the scripts that you fixed and the others that still fail and why.

2026-07-31 16:01 +0200  The pill is not vertically aligned with the name. This is ugly. please fix. Also the thumbnail should be left, replacing the icon if its present. Also make the svg lines dark gray, not black.

2026-07-31 16:10 +0200  yes, continue with Phase 3

2026-07-31 16:28 +0200  continue

2026-07-31 17:00 +0200  continue with Phase 5

2026-08-01 16:51 +0200  Oke lets do a best effort to fix these blocking issues. First, just forget about the fillets for now (i fix this by hand). Just remove them. For make timberwall can use make.wall() exists already. For boarding and fitRectStruc please check this old make source code: "https://github.com/ArchiyouApp/archiyou-core/blob/main/src/Make.ts#L204" - review its code and implement in the current make. Polygon.loft() you can simply implement right? Planar boolean intersection => Just convert to (closed) Curve. I think the booleans are there. The vertex/line/face extrude is also easy to implement.

2026-08-02 11:41 +0200  I want to commit these changes but git is blocked. Can you fix it?

2026-08-03 09:34 +0200  When I switch to brep kernel mode I get this error: "ERROR: "Failed to fetch dynamically imported module: http://localhost:5173/wasm/archiyou-opencascade.js?import"" ==> Probably because the editor app does not ship the OC wasm? Please debug and propose fix

2026-08-03 09:36 +0200  Can you make the switch between mesh a bit nicer in the execution options menu. Its very ugly now. It should have geometry kernel, then nextline a pill switch: mesh|brep (make it look a bit like the metric/imperatial pill switch but smaller).

2026-08-03 09:53 +0200  Can you move the warm/ dir back to brep/wasm/ please ?

2026-08-03 10:02 +0200  Ok thats nice. Only one small thing. When I run a simple script "b = box();" - In mesh the entire box is red (fill and line) - in brep mode only the lines are red. The surface is gray. Please fix.

2026-08-03 10:14 +0200  I want to have a robust mesh <==> brep conversion. Please can you create a test script (mesh-vs-brep-parity.test.ts) that loads all latest script versions in the (local) database and first runs the script in mesh mode (use Runner of course) - if it works - then run it in brep mode. Run this script and fix any problems incrementally

2026-08-03 10:44 +0200  Please clean up the "-ed" methods like  mirrored, moved, rotated in the brep classes. Then introduce the missing methods from meshup.

2026-08-03 11:05 +0200  Also fix fromPolygons in the meshup submodule

2026-08-03 11:12 +0200  yes fix the Polygon shape too

2026-08-03 12:23 +0200  I try to run a doc pipeline (and SVG export) in brep mode. This is the script: "[Pasted text #1 +19 lines]" ==> I get this error: "ERROR: "View::resolveShapeNameToSVG(): Variable "iso" for view "isometry" is not a Shape or ShapeCollection (got _ShapeCollection). Return a Shape/ShapeCollection from your pipeline, e.g. `iso = myMainBox.iso()`.""

2026-08-03 12:37 +0200  In the same script the isometry on the doc page is black (and thin lines) for mesh, and thick+red for brep. I think isometry() should not take over the styling of the object. Its really a different thing. Can you make this consistent too?

2026-08-03 12:42 +0200  Can you get the cadscripts from core/tests into the database? Please check if a file already exist with the same name, then skip. Make them owned by the archiyou archiyou please. Make the filename the name of the script please.

2026-08-03 12:44 +0200  please continue

2026-08-03 12:51 +0200  yes fix that box.moved() thing

2026-08-03 13:44 +0200  Well now i dont see anything on the doc (where isometry should be) in script: "[Pasted text #2 +30 lines]" - Please check and fix

2026-08-03 13:49 +0200  It looks like the server is malfunctioning. I get a "can't fetch" when i log in. The browser gives a "Access to fetch at 'http://localhost:4100/auth/login' from origin 'http://localhost:5174' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource". Error. Can you debug and fix. When you found it. Instead of cant fetch error message. Say something like "Can't reach server. Please check it or your internet connection"

2026-08-03 13:55 +0200  That workerd. But the isometry on the doc is rotated 180 deg for brep. I checked the output of iso() in the script on the scene itself. And here its good. I think it has something to do with the specific svg output. Probably the y-flip?

2026-08-03 14:13 +0200  All of sudden the important cadscripts are gone. What happened?

2026-08-03 14:23 +0200  There is a bug in Doc.page.titleblock. See script: [Pasted text #1 +31 lines] ==> If I run titleblock nothing is shown on the page. Can you debug and fix?

2026-08-03 14:58 +0200  There is something wrong with side selector. In this script: box(10,10,100).rotateX(-10).rotateY(10)
                          .select('F||front') the front face of a bbox is returned. But it needs to return the polygon facing that side of the boundingbox. Can you debug and fix please? Add as test too. Side selectors should always return at least on face/polygon

2026-08-03 15:00 +0200  Please do it first for the mesh kernel

2026-08-03 15:05 +0200  I want to implement a method on Curve/Edge/Wire that finds the point on the curve that makes a line that is  perpendicular to that curve, from another point. Can you implement something like this in meshup.Curve and in the brep.Edge and Wire?

2026-08-03 15:14 +0200  First I want you to fix the select(..) adding to the scene. This is not really logic. Selecting should not directly copy it, it just selects it. So select(..).copy() should add to scene, not select alone.

2026-08-03 15:26 +0200  Not really useful. Just test the generating of a SVG from a doc (user previous script). I tested in the browser and it is really show (15s+) which suggest the SVG image in the titleblock is parsed or something. Please start from this. Then fix. Not earlier.

2026-08-03 15:49 +0200  Can you check that document and titleblock in the browser? The logo renders OK. But all text seems cut off. Please check and debug

2026-08-03 16:00 +0200  Can you check if, and how autoDim() is no implemented - on mesh mode. I try to do meshup.Polygon.dim() I expected to get autoDim() - but instead I get bbox dimensions

2026-08-03 16:05 +0200  Yes please do

2026-08-03 16:26 +0200  In meshup lofting a rectangle towards another rect results in 66 polygons. That should be 6! Please debug and fix. Add to test

2026-08-03 16:39 +0200  I still in this script: "[Pasted text #1 +64 lines]" - for legCutFrontFace.dim() I get Cannot read properties of null (reading edges). Please fix

2026-08-03 16:41 +0200  Try again. I resetted chrome

2026-08-03 17:05 +0200  scale does not seam to automatically take center of current shape (Curve) - This script in mesh mode: "r1 = rect(30,40).moveY(1000)
                          r2 = r1.copy().scale(2);" - Can you check how scale pivot works in mesh and brep. If not pivot given scale pivot should be center of shape.

2026-08-03 17:06 +0200  Can you implement in meshup.Mesh and meshup.Curve rotateToOrthoXY() just like in brep Shape?

2026-08-03 17:14 +0200  Can you check whats wrong with layflat in this example: r1 = rect(500,500).moveY(1000)
                        r2 = r1.copy().move(100,30,1000);
                        r1.loft(r2).layflat(); ==> We would at least expect that the solid shares one face with the XY plane

2026-08-03 17:17 +0200  fix the 3-point align mutation bug too

2026-08-03 17:26 +0200  In test can you make a directory called kernels where all the tests for testing mesh/brep kernel parity go in to? See if any tests are better placed there. Also make a new test file that tests solids (Mesh/Solid) and linear (Curve/Edge/Wire) shapes consistenty. For this I want you to start from the modeler modeling methods (box(),rect()) etc and compute them side by side in mesh and brep mode. Then apply the operations one by one and for every step check consistency of results between mesh and brep. standard things to test after operation is length(), bbox(), area(), size() etc (and come up with some others). Of course add some tolerance in there. If any result is very far off, just exit.

2026-08-03 17:31 +0200  Still not working. I try this: [Pasted text #1 +4 lines]

2026-08-03 17:33 +0200  I meant this script: [Pasted text #2 +5 lines]

2026-08-03 17:43 +0200  Please just call this rotateToOrtho() on brep and mesh

2026-08-03 17:47 +0200  We fixed the meshup Mesh side selector. Can you fix the brep one too? Look at the meshup one for the way

2026-08-03 17:52 +0200  Can you implement Obbox().shape() to get real shape in both meshup.Curve/Mesh and brep.Shape ?

2026-08-03 18:13 +0200  Can you make for each toString() for Shape (meshup and brep) also a attribute that shows if its in the scene: < ... node={ name: 'myShape', id='...' > This is handy for debugging if something is added to scene or not. If not in scene node=<no in scene>

2026-08-03 18:50 +0200  We fixed the meshup Mesh side selector. Can you fix the brep one too? Look at the meshup one for the way ===> Why does it take so long. Its pretty trivial right?

2026-08-03 19:44 +0200  Whats happening here. Takes too long.

2026-08-03 19:44 +0200  [Pasted text #1 +4 lines]

2026-08-03 19:55 +0200  Please move the directory tests/unit/kernels to directory tests/unit/modeler/kernels ? Its better there.

2026-08-03 19:56 +0200  If have this script in mesh: [Pasted text #1 +4 lines] -- the resulting obbox() would be more orthogonal. Is this result correct?

2026-08-03 20:09 +0200  Yes implement this improvement for Curve please

2026-08-03 20:10 +0200  yes fix the brep one too

2026-08-03 21:42 +0200  Yes do polygon.obbox() too, based on curve

2026-08-04 13:53 +0200  For the brep mode in Modeler. Can you fix the Shape.dim() and Shape.autoDim() ?

2026-08-04 13:56 +0200  Please like in Obbox please implement meshup/brep.Obbox() shape() - returning a shape: solid, rectangle, line of vertex

2026-08-04 13:58 +0200  Is there already already something in brep/meshup that convert solids to wireframe?

2026-08-04 14:11 +0200  The meshup hidden line removal algoritm doesnt always generate great results. For example things it works pretty nice. But complex models have problems like lines dont reach where they should end (this belongs to the incremental intersection finding probably). Also with overlapping/touching/crossing big-versus-small shapes this generates problems. I wonder if there are algoritms available without these problems. Maybe precedents are in Blender or other CAD mesh like solutions? Can the current algoritm be improved, for example finding exact intersections of project edges (while keeping performance of course). Also for our applications most of the complex models still contain just box-like shapes that never intersect. Could this help to find a strong and stable path? For example building the isometry per box? If you dont need hidden lines (which is often) there might be a optimized path. Maybe in combination with per-shape to SVG groups that are stacked in order of camera z depth. Please research and come up with ideas

2026-08-04 14:12 +0200  continue

2026-08-04 14:15 +0200  Its just plain wireframe() that converts any solid to edges/curves, without any HLR. Please implement in meshup.Mesh/Polygon and brep.Shape. Keep it very simple. Its just convenience method

2026-08-04 14:27 +0200  The meshup module is based on cgsrs and recently hypercurve for Curves. In the past a lot of tesselation took place to get it working. In the new hypercurve most of the ops work (fillet, offset, bools), on native Curves (and CurveStrings). Can you review the current tesselated parts, check if the current hypercurve (please do a pull for the latest version) has a native version and deprecrate the tesselation path. If you see no way but to tesselate please report back.

2026-08-04 14:33 +0200  wireframe should replace the shape. So bx = box(100,20,50);
                        
                        bx.wireframe(); ==> should show the wireframe in the scene. Not the original box;

2026-08-04 14:36 +0200  Nice. Can you also name the group of lines "<<orig_node_name>>_wireframe" ?

2026-08-04 15:13 +0200  Can you make sure meshup.Polygon/Curve has .rotateToOrtho() and brep.Shape too

2026-08-04 15:29 +0200  In the core directory i see files test.artcrate.gltf and so on - I think these are generated output files from cadscripts run? These should be in tests/outputs/ - Can you see what test script generates these and fix it so it doesnt delute the workspace?

2026-08-04 16:32 +0200  Can you tell something about the performance for these methods? maybe write down a test for it. In the database I have script called isotest. Get the latest version and make it into a test run please. Use it to test 3 methods for these different geometries and come back with a performance overview (also the output of isometry as SVG please in the local dir ./svgs/)

2026-08-04 16:43 +0200  Please dont add the isotest script to cadscripts. This is more for application-like scripts. This is a test script, so add to the test file please

2026-08-04 16:43 +0200  continue with stage 3

2026-08-04 16:43 +0200  Where are your changes now?

2026-08-04 16:45 +0200  Ok nice. Where is the work now of the isometry HLR ?

2026-08-04 16:49 +0200  Yes please create an 'iso' branch in meshup module with this work, commit and push so i can later merge it into develop. For the core commit it to 'iso' branch if not already done too

2026-08-04 19:19 +0200  continue with stage 4

2026-08-04 19:24 +0200  Since we are doing isometric views with HLR I like to include Linear Shapes (meshup Curves, and brep Edge/Wires) in there too. I think its already in brep. So that leaves meshup. Also i like to include the styling from the parents shapes (if possible - maybe its not possible in brep). Please research and implement. This in a an example: [Pasted text #1 +5 lines] ==> In meshup the wireframe box should be visible in the iso, and take the styling. For management of styles include Shape.resetStyle()

2026-08-04 20:12 +0200  We setup a test earlier to compare HLR / iso straties. I said make it SVG to visualize, but its hard to debug. Can you use GLTF for it. So place the model and the isometry next to it. Keep the SVG output, but add GLTF please

2026-08-04 20:17 +0200  Come on, the svgs/ and gltfs/ are in the root folder. Not good. Please put them relative to test

2026-08-04 20:20 +0200  These tests are for meshup right? Why not add to meshup tests? Also I dont like the seperate outputs/<testname> - For all meshup tests, can you make sure the outputs for into a folder relative to the test file ?

2026-08-04 20:26 +0200  continue

2026-08-04 20:28 +0200  What would you say is the best HLR solution?

2026-08-04 22:33 +0200  Can you give me an explaination of each HLR algoritm. How it works

2026-08-04 22:33 +0200  Do 6 and 8

2026-08-04 22:39 +0200  Can you write these explaination on top of the rust source code?

2026-08-04 22:45 +0200  do 10 as well

2026-08-04 22:45 +0200  On what branch is meshup and core now?

2026-08-04 22:48 +0200  Commit both for me and push

2026-08-04 22:48 +0200  Finish all tasks now, then commit it

2026-08-04 22:51 +0200  agreed on the push

2026-08-04 22:58 +0200  What tasks are still open?

2026-08-04 23:00 +0200  Just go from lower to higher tasks.

2026-08-04 23:05 +0200  Looks all tasks are then? Commit?

2026-08-04 23:09 +0200  To finish it can you implement the new isometry() methods on meshup.Mesh/Curve/Collection ? Make it this structure: isometry(cam, method, { method options })

2026-08-04 23:26 +0200  exit

2026-08-04 23:29 +0200  Ok can you merge all the previous work and the iso (on meshup and core) into the develop branch?

2026-08-04 23:40 +0200  Can you set 'exact' as default HLR method in isometry() - Is that a setting somewhere? Please make it a setting if not

2026-08-04 23:43 +0200  After all the work the timberwall script (get latest from db by archiyou) broke:"Null pointer in rust". Can you debug?

2026-08-04 23:48 +0200  No i get this error when starting the app: ERROR: "Archiyou core failed during initialization: WebAssembly.instantiate(): Import #3 "wbg" "__wbg_curve3djs_unwrap": function import requires a callable"

2026-08-04 23:59 +0200  Please call the setting ISOMETRY_HLR_STRATEGY_DEFAULT and set it to exect now. Then do a commit

2026-08-05 00:09 +0200  I think that the new Curve non-tesslated approach is really a lot slower than the previous. Can you profile debug the script urroof and check it this is true? Come up with solutions?

2026-08-05 00:15 +0200  re-run the house profile

2026-08-05 09:26 +0200  yes commit etc

2026-08-05 09:31 +0200  push it

2026-08-05 09:33 +0200  While you checked performance for the house already. Can you profile it more performance gains ?

2026-08-05 12:06 +0200  Can you fix the importer/exporters after native curves: SVG (if not already done) and DXG

2026-08-05 18:05 +0200  Can you create or download some basic SVG test files to import? Are there collections of simple svg files somewhere to download? Should not be very advanced. Mostly focussed on line work.

```

The prompts were scanned for credentials and third-party e-mail addresses; none were found.

## Plan

No agent plans from this period were kept. The prompts above stand in for them: they show what was asked for, in what order, and how it was corrected.

## Review and decisions by the author

The author wrote every prompt above, reviewed the generated code, and tested the result in the browser. Their own words are the record of that review — these are the prompts in which they report what they saw, tested or decided:

- *2026-07-31 13:31 +0200* — There is a weird bug in the file info menu. Where a message is shown "already exists" below the name (but i am not renaming anything - this only goes for the header). Please fix this.
- *2026-07-31 14:25 +0200* — Keep debugging the planarity bug - check the scale-back loop
- *2026-08-03 09:34 +0200* — When I switch to brep kernel mode I get this error: "ERROR: "Failed to fetch dynamically imported module: http://localhost:5173/wasm/archiyou-opencascade.js?import"" ==> Probably because the editor ap
- *2026-08-03 09:36 +0200* — Can you make the switch between mesh a bit nicer in the execution options menu. Its very ugly now. It should have geometry kernel, then nextline a pill switch: mesh|brep (make it look a bit like the m
- *2026-08-03 14:23 +0200* — There is a bug in Doc.page.titleblock. See script: [Pasted text #1 +31 lines] ==> If I run titleblock nothing is shown on the page. Can you debug and fix?
- *2026-08-03 15:26 +0200* — Not really useful. Just test the generating of a SVG from a doc (user previous script). I tested in the browser and it is really show (15s+) which suggest the SVG image in the titleblock is parsed or 
- *2026-08-03 16:39 +0200* — I still in this script: "[Pasted text #1 +64 lines]" - for legCutFrontFace.dim() I get Cannot read properties of null (reading edges). Please fix
- *2026-08-03 17:05 +0200* — scale does not seam to automatically take center of current shape (Curve) - This script in mesh mode: "r1 = rect(30,40).moveY(1000)
  r2 = r1.copy().scale(2);" - Can you check how scale pivot works in
- *2026-08-03 17:14 +0200* — Can you check whats wrong with layflat in this example: r1 = rect(500,500).moveY(1000)
r2 = r1.copy().move(100,30,1000);
r1.loft(r2).layflat(); ==> We would at least expect that the solid shares one f
- *2026-08-03 17:17 +0200* — fix the 3-point align mutation bug too
- *2026-08-03 17:31 +0200* — Still not working. I try this: [Pasted text #1 +4 lines]
- *2026-08-03 17:47 +0200* — We fixed the meshup Mesh side selector. Can you fix the brep one too? Look at the meshup one for the way
- *2026-08-03 18:50 +0200* — We fixed the meshup Mesh side selector. Can you fix the brep one too? Look at the meshup one for the way ===> Why does it take so long. Its pretty trivial right?
- *2026-08-03 19:55 +0200* — Please move the directory tests/unit/kernels to directory tests/unit/modeler/kernels ? Its better there.
- *2026-08-04 15:29 +0200* — In the core directory i see files test.artcrate.gltf and so on - I think these are generated output files from cadscripts run? These should be in tests/outputs/ - Can you see what test script generate

## Commits

| Commit | Date | Author | Subject |
|---|---|---|---|
| `4d85d5115` | 2026-08-02 | Mark van der Net with Claude Opus 4.6 | Wired up brep kernel |
| `d3185521d` | 2026-08-04 | Mark van der Net with Claude Opus 5 | feat(core): expose the HLR strategy option and benchmark it with isotest |
| `75e423217` | 2026-08-04 | Mark van der Net with Claude Opus 5 | chore(meshup): bump submodule to iso @ dd62974 (linear shapes + style inheritance) |
| `558107c34` | 2026-08-04 | Mark van der Net with Claude Opus 5 | test(core): emit glTF debug scenes from the HLR benchmark, and fix its timing |
| `adc582ba3` | 2026-08-04 | Mark van der Net with Claude Opus 5 | test(core): write benchmark output under tests/outputs, not the repo root |
| `eb2801461` | 2026-08-04 | Mark van der Net with Claude Opus 5 | test(core): move the HLR benchmark to meshup, keep only the script run here |
| `d4fca99c3` | 2026-08-04 | Mark van der Net with Claude Opus 5 | chore(meshup): bump submodule to iso @ 6204d6c (HLR algorithm docs) |
| `4ef85d852` | 2026-08-04 | Mark van der Net with Claude Opus 5 | chore(meshup): bump submodule to iso @ 84d65db (isometry(cam, method, options)) |
| `d45170c37` | 2026-08-04 | Mark van der Net with Claude Opus 4.6 | New isometry |
| `11cf6b71f` | 2026-08-04 | Mark van der Net with Claude Opus 5 | build(meshup): bump submodule to the rebuilt de-tessellation kernel |
| `edf1f38b2` | 2026-08-05 | Mark van der Net with Claude Opus 5 | build(meshup): bump submodule to the relative chord-tolerance fix |
| `81a953791` | 2026-08-05 | Mark van der Net with Claude Opus 5 | test(dxf): pin the exporter's exact-geometry defects |
| `4e8145f88` | 2026-08-05 | Mark van der Net with Claude Opus 5 | fix(dxf): write exact arcs, bulges and ellipses instead of a broken SPLINE |
| `4a0d9b41b` | 2026-08-05 | Mark van der Net with Claude Opus 5 | build(meshup): bump submodule to exact SVG/DXF import and export |
| `e40f5c800` | 2026-08-05 | Mark van der Net with Claude Opus 5 | build(meshup): bump submodule to SVG line-work fixtures + arc-length fix |

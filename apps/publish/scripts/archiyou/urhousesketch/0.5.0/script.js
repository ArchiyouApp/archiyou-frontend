export default {
  id: "archiyou/urhousesketch/0.5.0",
  name: "urhousesketch",
  author: "archiyou",
  description: "Sketch design for URHOUSE",
  tags: [],
  created: "2025-10-10T12:51:31.645Z",
  updated: "2025-10-10T12:51:31.645Z",
  code: `// Archiyou 0.6.5

units('cm')

WIDTH = $WIDTH; // outside width of house (excluding overhangs)
HEIGHT = $HEIGHT; // total outside height of house in cm
DEPTH = $DEPTH; // outside depth of house (excluding overhangs)


ROOF_TYPE = $ROOF_TYPE;
ROOF_ANGLE = $ROOF_ANGLE; // angle of left slope

ROOF_RIDGE_AT_PERC = $ROOF_RIDGE_AT_PERC; // from left
ROOF_RIDGE_SLOPES_SAME = $ROOF_RIDGE_SLOPES_SAME; // or height

OVERHANGS_SAME = $OVERHANGS_SAME;
OVERHANG_SIZE = $OVERHANG_SIZE; // parallel to ground plane
OVERHANG_FRONT = $OVERHANG_FRONT;
OVERHANG_BACK = $OVERHANG_BACK;
OVERHANG_LEFT = $OVERHANG_LEFT;
OVERHANG_RIGHT = $OVERHANG_RIGHT;

//// PARAM BEHAVIOURS ////
$PARAMS.ROOF_RIDGE_AT_PERC.visibleIf(ROOF_TYPE === 'gable');
$PARAMS.ROOF_RIDGE_SLOPES_SAME.visibleIf(ROOF_TYPE === 'gable');

$PARAMS.OVERHANG_SIZE.visibleIf(OVERHANGS_SAME);
$PARAMS.OVERHANG_FRONT.visibleIf(!OVERHANGS_SAME);
$PARAMS.OVERHANG_BACK.visibleIf(!OVERHANGS_SAME);
$PARAMS.OVERHANG_LEFT.visibleIf(!OVERHANGS_SAME);
$PARAMS.OVERHANG_RIGHT.visibleIf(!OVERHANGS_SAME);


//// SETTINGS ////
MIN_WALL_HEIGHT = 100;
WALL_THICKNESS = 25;
ROOF_THICKNESS = 25;
ROOF_MINIMUM_HEIGHT = 50;
GROUNDFLOOR_HEIGHT = 270;
FLOOR_THICKNESS = 30;
FIRST_FLOOR_START = GROUNDFLOOR_HEIGHT + FLOOR_THICKNESS;
STOREY_HEIGHT = 150;

//// CALCULATED ////

NUM_FLOORS = (HEIGHT > 500) ? 2 : 1;

//// MODEL ////

layer('diagram').color('blue');

// shed: one side pitch
if(ROOF_TYPE === 'shed')
{
    roofLineOutside = line([0,0,0],[WIDTH,0,Math.tan(toRad(ROOF_ANGLE))*WIDTH])
}
else {

    roofLineRidgePoint = point(
        [WIDTH*ROOF_RIDGE_AT_PERC/100,
        0,
        Math.tan(toRad(ROOF_ANGLE))*WIDTH*ROOF_RIDGE_AT_PERC/100]);

    roofLineOutside = polyline(
            [0,0,0],
            roofLineRidgePoint,
            [WIDTH,0,
                (ROOF_RIDGE_SLOPES_SAME === 'angle')
                ? roofLineRidgePoint.z - (WIDTH*(100-ROOF_RIDGE_AT_PERC)/100) * Math.tan(toRad(ROOF_ANGLE))
                : 0]
            )
}

// We got a roof line. Now position it to achieve total height (if possible)
roofLineOutside.moveZ(-roofLineOutside.bbox().minZ());

// Test if roof already exceeds maximum height
if(roofLineOutside.bbox().maxZ() > (HEIGHT - MIN_WALL_HEIGHT))
{
    print(\`Your roof already exceeds given total height of \${HEIGHT} cm (and minimal wall height of \${MIN_WALL_HEIGHT}).
    Please lower roof angle if you want to stay under that height!\`);
    // Higher roof line to realize min wall height
    roofLineOutside.moveZ(MIN_WALL_HEIGHT)
}
else {
    // move roof line up to get to maximum height
    roofLineOutside.moveZ(HEIGHT - roofLineOutside.bbox().maxZ());
}

// Make roofLineInside
roofLineOutsideOffsetted = roofLineOutside
                        .offsetted(-ROOF_THICKNESS, null, [0,-1,0]) // Make sure we set plane normal for offset for shed
                        .hide();

roofLineInsideLeft = roofLineOutsideOffsetted
                        .edges().first()
                        .extendedTo(line([0,0,-10000],[0,0,15000]).hide())

roofLineInsideRightEdgeTmp = roofLineOutsideOffsetted.edges().last().copy().hide();

if(ROOF_TYPE === 'gable')
{
    roofLineInsideRight = roofLineInsideRightEdgeTmp
                                /*.extendedTo(
                                        line([WIDTH,0,-10000],[WIDTH,0,15000])
                                            .extrude(100, [0,1,0]).moveY(-50)
                                        ) // BUG in intersection for large roof angles
                                */
                                // math solution
                                .extended(
                                    roofLineInsideRightEdgeTmp.direction().scaled(1/roofLineInsideRightEdgeTmp.bbox().width())
                                        .scaled(WIDTH-roofLineInsideRightEdgeTmp.end().x)
                                        .length()
                                    ,
                                    'end'
                                )
}
else {
    // Shed, there is no right, but left needs to be cut
    roofLineInsideLeft = roofLineInsideLeft.cutoff('x', WIDTH).copy();
}

// Make wall lines (if any height available) - to full height of roof for cutting
wallLeftLine = (roofLineOutside.distance([0,0,0]) > 0 )
                    ? line([0,0,0],roofLineOutside.start())
                    : null;
wallRightLine = (roofLineOutside.distance([WIDTH,0,0]) > 0 )
                    ? line([WIDTH,0,0],roofLineOutside.end())
                    : null;




//// ROOF OVERHANGS ////

// NOTE: We don't include overhangs in house width/depth

ROOF_ANGLE_LEFT = ROOF_ANGLE;

ROOF_ANGLE_RIGHT = (ROOF_TYPE === 'gable')
                        ? (ROOF_RIDGE_SLOPES_SAME === 'angle')
                             ? ROOF_ANGLE_LEFT
                             : roofLineInsideRight.direction().angle([1,0,0]) // in degrees
                        : -ROOF_ANGLE_LEFT;

if(OVERHANGS_SAME)
{
    OVERHANG_FRONT = OVERHANG_LEFT = OVERHANG_RIGHT = OVERHANG_BACK = OVERHANG_SIZE;
}

// Special case: if overhang is zero we set facia flush with facade (special details)
roofLineInsideLeftOverhang = (OVERHANG_LEFT === 0)
                                ? roofLineInsideLeft.copy()
                                : roofLineInsideLeft
                                    .copy()
                                    .extend(OVERHANG_LEFT/Math.cos(toRad(ROOF_ANGLE_LEFT)), 'start');

if(ROOF_TYPE === 'gable')
{
    roofLineInsideRightOverhang = (OVERHANG_RIGHT === 0)
                                ? roofLineInsideRight.copy()
                                : roofLineInsideRight
                                    .copy()
                                    .extend(OVERHANG_RIGHT/Math.cos(toRad(ROOF_ANGLE_RIGHT)), 'end')
}
else if(ROOF_TYPE === 'shed')
{
    // no right side, extend left roof line to end
    roofLineInsideRightOverhang = null;
    if(OVERHANG_RIGHT > 0)
    {
        roofLineInsideLeftOverhang.extend(Math.cos(toRad(ROOF_ANGLE_RIGHT))*OVERHANG_RIGHT, 'end')
    }
}

layer('diagram').shapes().hide();


//// ROOF 3D ////

layer('roof').color('red');

roofLineInsideOverhangsSingle = (ROOF_TYPE === 'gable')
                ? polyline(
                        roofLineInsideLeftOverhang.start(),
                        roofLineInsideLeftOverhang.end(),
                        roofLineInsideRightOverhang.end()
                        )
                : roofLineInsideLeftOverhang._copy();

if(ROOF_TYPE === 'gable')
{
    roofLineOutsideOverhangs = roofLineInsideOverhangsSingle
        .offsetted( ROOF_THICKNESS, null, [0,1,0])
    //.hide()
}
else {
    // offsetted for (Line) Edge is instable - TODO: Fix in Core
    roofLineOutsideOverhangs = roofLineInsideOverhangsSingle
        .moved(roofLineInsideOverhangsSingle.direction(true).rotateY(-90).scaled(ROOF_THICKNESS))
}

if(ROOF_TYPE == 'gable')
{
    roofLineOutsideOverhangsVerts = new ShapeCollection();
    // BUG: disordered wire after offset
    // Get Vertices and sort
    // TODO: FIX IN CORE
    roofLineOutsideOverhangs.edges().forEach((e,i) =>
    {
        roofLineOutsideOverhangsVerts.add(e.start(),e.end());
    })
    roofLineOutsideOverhangsVerts =
    roofLineOutsideOverhangsVerts.unique().sort((v1,v2) => v1.x - v2.x)

    roofLineOutsideOverhangs = polyline(roofLineOutsideOverhangsVerts)
                            .hide();

}

// If any overhang is zero, make flush with facade
if(OVERHANG_LEFT === 0 || OVERHANG_RIGHT)
{
    if(ROOF_TYPE === 'shed')
    {
        roofLineOutsideOverhangsChecked = line(
            OVERHANG_LEFT === 0 ? roofLineOutside.start() : roofLineOutsideOverhangs.start(),
            OVERHANG_RIGHT === 0 ? roofLineOutside.end() : roofLineOutsideOverhangs.end()
        )
    }
    else if(ROOF_TYPE === 'gable')
    {
        roofLineOutsideOverhangsChecked = polyline(
            OVERHANG_LEFT === 0 ? roofLineOutside.start() : roofLineOutsideOverhangs.start(),
            roofLineOutside.vertices()[1],
            OVERHANG_RIGHT === 0 ? roofLineOutside.end() : roofLineOutsideOverhangs.end()
        )
    }
    roofLineOutsideOverhangsChecked.hide();
}

roofSolids = collection(
                roofLineInsideOverhangsSingle // NOTE: 2 Solids if gable, 1 if shed - make into collection always
                .lofted(roofLineOutsideOverhangsChecked, true)
                .extrude(DEPTH+OVERHANG_FRONT+OVERHANG_BACK, [0,1,0])
                .moveY(-OVERHANG_FRONT)
                .color('#544412'));

roofSolids
    .forEach(
        s =>
        {
            if(s.bbox().minZ() < ROOF_MINIMUM_HEIGHT)
            {
                print(\`A roof overhang is lower than the minimum "\${ROOF_MINIMUM_HEIGHT}". Cut off!\`)
                s.cutoff('z', ROOF_MINIMUM_HEIGHT)
            }
        });



// Make sure roofs is minimal from ground plane
//roofSolid.cutOff('z', ROOF_MINIMUM_HEIGHT)

//// 3D WALLS ///

// first front/back then sides

layer('walls').color('#f1c232')

frontWallVerts = [wallLeftLine.start(),
                roofLineInsideLeft.start(),
                roofLineInsideLeft.end()]
if(ROOF_TYPE == 'gable')
{
    frontWallVerts.push(roofLineInsideRight.end())
}
frontWallVerts.push(wallRightLine.start().copy())

wallFrontFace = polyline(frontWallVerts)
            .toFace();
wallFront = wallFrontFace
            .extrude(WALL_THICKNESS, [0,1,0])

wallBack = wallFront.copy().moveY(DEPTH-WALL_THICKNESS)
wallLeft = wallLeftLine
            .extruded(DEPTH-WALL_THICKNESS*2, [0,1,0])
            .moveY(WALL_THICKNESS)
            .extrude(WALL_THICKNESS, [1,0,0])
            .subtract(roofSolids)

wallRight = ((ROOF_TYPE === 'gable') ? wallRightLine : line([WIDTH,0,0],roofLineInsideLeft.end()))
            .extruded(DEPTH-WALL_THICKNESS*2, [0,1,0])
            .moveY(WALL_THICKNESS)
            .extrude(WALL_THICKNESS, [-1,0,0])
            .subtract(roofSolids)

//// OPENINGS ////

// TODO: more facade opening scenarios. Now only basic

const windows = []; // To keep track of windows

if($GENERATE_OPENINGS)
{

  layer('openings').color('brown');
  openingsGroundFloor = collection(); // keep track for floor plan

  // Make a simple opening with frame
  function makeOpeningFrame(w,h,pivot,sill,zRot)
  {
      const FRAME_SIZE = 10;
      const BBOX_DEPTH = 200;
      pivot = pivot || [0,0];
      const b = box(w,FRAME_SIZE, h);
      const window = {
              frame:
                  b.subtract(box(w-2*FRAME_SIZE, FRAME_SIZE, h-2*FRAME_SIZE).hide())
                  .moveTo(pivot)
                  .rotateZ(zRot || 0)
                  .moveZ(h/2 + (sill || 0))
                  .color('brown'),
              bbox:
                  box(w, BBOX_DEPTH, h)
                  .moveTo(pivot)
                  .rotateZ(zRot || 0)
                  .moveZ(h/2 + (sill || 0))
                  .hide(),
              plane:
                  plane(w, h)
                  .rotateX(90)
                  .moveTo(pivot)
                  .rotateZ(zRot || 0)
                  .moveZ(h/2 + (sill || 0))
                  .hide()
      }
      windows.push(window);
      return window;
  }

  FACADE_TO_WALL = {
      Front: { wall: wallFront, opposite: wallBack },
      Left: { wall: wallLeft, opposite: wallRight },
      Right: { wall: wallRight, opposite: wallLeft },
      Back: { wall: wallBack, opposite: wallFront },
  }

  // x,y coord along wall, where +x is from left (-x is from right) and y is height => world z
  // start of wall is point most (left, front)
  function wallXPositionToWorld(wall,x)
  {
      // only x or y walls: can be generalized for any wall along vector later
      const wallBbox = wall.bbox();
      const wallLengthAxis = (wallBbox.width() > wallBbox.depth()) ? 'x' : 'y';
      const wallDirection = (wallLengthAxis === 'x') ? vector(1,0,0) : vector(0,1,0);
      const wallStartWorld = vector(wallBbox.minX()+WALL_THICKNESS/2,wallBbox.minY()+WALL_THICKNESS/2)

      const wallLength = (wallLengthAxis === 'x') ? wallBbox.width() : wallBbox.depth();
      const wallX = (x >= 0 && x <= 1)
                  ? x*wallLength // perc
                  : (x > 1) ? x : wallLength + x;
      return wallDirection.scaled(wallX)
              .move(wallStartWorld);
  }


  // ---- Main facade: front door, some windows ----
  mainFacadeWall = FACADE_TO_WALL[$MAIN_FACADE].wall;
  mainFacadeWallBbox = mainFacadeWall.bbox();
  mainFacadeWallRotZ = mainFacadeWallBbox.width() > mainFacadeWallBbox.depth()
                          ? 0 : 90;
  mainFacadeWallLength = mainFacadeWallRotZ === 90 ? WIDTH : DEPTH;

  if(mainFacadeWallBbox.height() < 250)
  {
      print(\`Can't place a main facade on side "{$MAIN_FACADE}" : It's wall is too low!\`)
  }
  else
  {
      // front door
      frontDoor = makeOpeningFrame(100,200,wallXPositionToWorld(mainFacadeWall, -100-20), 0, mainFacadeWallRotZ);
      frontDoorCentered = false;

      if(!roofSolids.toArray().find(r => r.intersects(frontDoor.frame))) // intersects is more stable than distance
      {
          mainFacadeWall.subtract(frontDoor.bbox);
          openingsGroundFloor.add(frontDoor.frame);
      }
      else {
          frontDoorCentered = true;
          // try moving door to center
          if(mainFacadeWallRotZ === 0)
          {
              frontDoor.frame.moveToX(WIDTH/2-50);
              frontDoor.bbox.moveToX(WIDTH/2-50);
          }
          else {
              frontDoor.frame.moveToY(DEPTH/2-50);
              frontDoor.bbox.moveToY(DEPTH/2-50);
          }
          // OC BUG in distance between roof solids
          if(roofSolids.toArray().every(r => !r.intersects(frontDoor.frame)))
          {
              mainFacadeWall.subtract(frontDoor.bbox)
          }
          else {
              frontDoorCentered = false;
              frontDoor.frame.hide();
          }
      }

      // kitchen window (if width is large enough)
      if(mainFacadeWallLength > 300 && !frontDoorCentered)
      {
          kitchenWindow = makeOpeningFrame(150,100,wallXPositionToWorld(mainFacadeWall,-100-20-100-60), 100, mainFacadeWallRotZ);

          if(roofLineOutsideOverhangsChecked.distance(kitchenWindow.frame) <= 40
              || !mainFacadeWallBbox._containsBbox(kitchenWindow.frame.bbox()))
          {
              kitchenWindow.frame.hide();
          }
          else {
              mainFacadeWall.subtract(kitchenWindow.bbox)
              openingsGroundFloor.add(kitchenWindow.frame);
          }
      }

      // Add floor window in center below ridge (if gable) or to right (shed)
      if(mainFacadeWallBbox.height() > 400)
      {
          mainFacadeTopWindow = makeOpeningFrame(80,100,
              wallXPositionToWorld(mainFacadeWall,
                  ((['Front','Back']).includes($MAIN_FACADE) && (ROOF_TYPE === 'gable')) ? (roofLineRidgePoint.x-WALL_THICKNESS/2)/WIDTH : 0.5), 290+70,
                  mainFacadeWallRotZ);

          if(mainFacadeTopWindow.frame.bbox().maxZ() > mainFacadeWallBbox.maxZ() - 40 || roofLineOutsideOverhangsChecked.distance(mainFacadeTopWindow.frame) <= 30
              || mainFacadeTopWindow.frame.distance(wallRight) < 15)
          {
              mainFacadeTopWindow.frame.hide();
          }
          else {
              mainFacadeWall.subtract(mainFacadeTopWindow.bbox)
          }

      }
  }

  // ---- back facade ----
  backFacadeWall = FACADE_TO_WALL[$MAIN_FACADE].opposite;
  backFacadeWallBbox = mainFacadeWall.bbox();
  backFacadeWallRotZ = mainFacadeWallBbox.width() > mainFacadeWallBbox.depth()
                          ? 0 : 90;

  // One big back centered opening for now
  backOpeningSize = ((backFacadeWallRotZ === 0) ?  WIDTH : DEPTH) - (WALL_THICKNESS+10)*2;
  if(backOpeningSize > 240) backOpeningSize = 240; // max width
  backFacadeOpeningFrame = makeOpeningFrame(backOpeningSize, 200, wallXPositionToWorld(backFacadeWall,0.5), 0, backFacadeWallRotZ)
  if(!roofSolids.find(s => backFacadeOpeningFrame.frame.distance(s) <= 5))
  {
      backFacadeWall.subtract(backFacadeOpeningFrame.bbox);
      openingsGroundFloor.add(backFacadeOpeningFrame.frame);
  }
  else {
      backFacadeOpeningFrame.frame.hide();
  }

  // ---- side facades ----

  // simple repeating grid of rows of windows
  function fillFacade(wall)
  {
      const WINDOW_WIDTH = 80;
      const WINDOW_HEIGHT_GROUNDFLOOR = 200;
      const WINDOW_HEIGHT_TOPFLOOR = 100;
      const DISTANCE_BETWEEN_WINDOWS = WINDOW_WIDTH*1.8;
      const WINDOW_RANDOMNESS = DISTANCE_BETWEEN_WINDOWS*1.1;

      const wallBbox = wall.bbox();
      const wallLength = (wallBbox.width() > wallBbox.depth()) ? wallBbox.width() : wallBbox.depth();
      const wallRotZ = (wallBbox.width() > wallBbox.depth()) ? 0 : 90;
      const numCols =  Math.floor((wallLength - 2*WALL_THICKNESS) / (WINDOW_WIDTH+DISTANCE_BETWEEN_WINDOWS));
      const startLeft = (wallLength - 2*WALL_THICKNESS)
                      -numCols*(WINDOW_WIDTH+DISTANCE_BETWEEN_WINDOWS)
                      + WALL_THICKNESS + DISTANCE_BETWEEN_WINDOWS;
      if(startLeft < WALL_THICKNESS) startLeft = WALL_THICKNESS

      for(let fl = 0; fl < NUM_FLOORS; fl++)
      {
          for(let col = 0; col < numCols; col++)
          {
              const windowFrame = makeOpeningFrame(
                      WINDOW_WIDTH // +WINDOW_RANDOMNESS*Math.random()
                      ,
                      ((fl == 0) ? WINDOW_HEIGHT_GROUNDFLOOR : WINDOW_HEIGHT_TOPFLOOR) //* WINDOW_RANDOMNESS*Math.random()
                      ,
                      wallXPositionToWorld(wall,
                          WINDOW_RANDOMNESS*Math.random()-WINDOW_RANDOMNESS/2 + col*(WINDOW_WIDTH+DISTANCE_BETWEEN_WINDOWS)+startLeft),
                      (fl === 0) ? 0 : FIRST_FLOOR_START+70, wallRotZ
                      )

              // test if windowFrame is contained by wall and underneath roof
              if(wall.bbox().maxZ() > windowFrame.frame.bbox().maxZ() + 40 &&
                      !roofSolids.toArray().find(s => s.overlaps(windowFrame.frame))
                  )
              {
                  wall.subtract(windowFrame.bbox);
                  if(fl === 0)
                  {
                      openingsGroundFloor.add(windowFrame.frame);
                  }
              }
              else {
                  windowFrame.frame.hide();
              }

          }
      }

  }

  sideFacades = (['Front','Back'].includes($MAIN_FACADE))
                      ? ['Left', 'Right']
                      : ['Front','Back'];



  sideFacades.forEach(f =>
  {
      // needs const, otherwise global
      const sideFacadeWall = FACADE_TO_WALL[f].wall;
      fillFacade(sideFacadeWall);
  })
} // End if GENERATE_OPENINGS


//// FLOOR AND GROUND PLANE

groundPlane = planebetween([0,0,0],[WIDTH, DEPTH, 0])
                .color('#444');
lowestWallHeight = [wallLeft, wallRight, wallFront, wallBack]
                    .map(w => w.bbox().maxZ())
                    .sort()[0]
if(lowestWallHeight < GROUNDFLOOR_HEIGHT+FLOOR_THICKNESS+STOREY_HEIGHT
    && NUM_FLOORS > 1)
{
    boxbetween(
        [WALL_THICKNESS,WALL_THICKNESS,0],
        [WIDTH-WALL_THICKNESS, DEPTH-WALL_THICKNESS,FLOOR_THICKNESS])
        .moveZ(GROUNDFLOOR_HEIGHT)
        .color('#222')
}


//// ORGANIZE ////

layer('diagram').shapes().hide();

layer('walls');
wallsCombined = wallLeft.hide().unioned(wallFront.hide())
            .union(wallRight.hide())
            .union(wallBack.hide())
            .color('#f1c232')


//// STATS TABLE ////

gutterHeightMax = Math.round([roofLineOutsideOverhangsChecked.start().z,roofLineOutsideOverhangsChecked.end().z].sort()[1]);
gutterHeightMin = Math.round(roofLineOutsideOverhangsChecked.bbox().minZ());
floorAreaGross = Math.round((WIDTH*DEPTH)*1e-4) * NUM_FLOORS;
floorAreaNet = Math.round(((WIDTH-2*WALL_THICKNESS)*(DEPTH-2*WALL_THICKNESS))*1e-4) * NUM_FLOORS;
volumeNet = Math.round(wallFrontFace.extruded(DEPTH,[0,1,0]).color('blue').hide()
                .subtract(wallsCombined).volume() * 1e-6); // cm3 => m3


calc.table(
'stats',
[
    ['Width','from outside', WIDTH, 'cm' ],
    ['Depth','from outside', DEPTH, 'cm' ],
    ['Height','~ maximum height', HEIGHT, 'cm' ],
    ['Gutter height max', '', gutterHeightMax, 'cm'],
    ['Gutter height min', '', gutterHeightMin, 'cm'],
    ['Ground floor area', 'gross', floorAreaGross , 'm2' ],
    ['Ground floor area', 'net', floorAreaNet, 'm2' ],
    ['Number of levels', 'including groundfloor', (NUM_FLOORS), '#'],
],
['what', 'description', 'value', 'unit'])

//// METRICS ////

calc.metric('area (net)', floorAreaNet, { unit: 'm2', icon: 'shape-rectangle-plus' });
calc.metric('volume (net)', volumeNet, { unit: 'm3', icon:'cube' });


//// AREAS TABLE ////

areaWalls = Math.round((wallFrontFace.area()*2 + wallLeftLine._extruded(DEPTH).area()+wallRightLine._extruded(DEPTH).area())*1e-4);
areaFacade = areaWalls * 1.1; // a little bigger
areaRoof = Math.round((roofLineOutsideOverhangsChecked._extruded(DEPTH).area()*1e-4));

calc.table(
    'areas',
    [

        ['Total floor area', 'gross, estimation', Math.round(NUM_FLOORS*(WIDTH*DEPTH)*1e-4), 'm2' ],
        ['Total floor area', 'net, estimation', Math.round(NUM_FLOORS*((WIDTH-2*WALL_THICKNESS)*(DEPTH-2*WALL_THICKNESS))*1e-4), 'm2' ],
        ['Total wall length', '', Math.round((2*WIDTH+2*DEPTH)*1e-2), 'm'],
        ['Facade surface', 'estimation without openings',
            areaFacade,
            'm2'
        ],
        ['Roof surface', 'top surface', areaRoof , 'm2']
    ],
    ['area', 'description', 'value', 'unit']
)

//// OFFER GSHEET PIPELINE ////

areaWindows = ($GENERATE_OPENINGS)
    ? windows.reduce((sum,w) => sum + Math.round(w.plane.area()*1e-4),0)
    : 0;
numDoors = ($GENERATE_OPENINGS) ? 1 : 0; // TODO
numSlidingDoors = ($GENERATE_OPENINGS) ? 1 : 0; // TODO
projectId = $PROJECT_ID || 'PROJECTXYZ';

$pipeline('offer', 
          async function(scope) 
          {
              print('***** PIPELINE OFFER DEBUG *****');
              print(scope.WIDTH);
              print(scope.DEPTH);
              print(scope.HEIGHT);
              print('********************************');

              await calc.gsheets.connect('0AH85c2Bl1KO3Uk9PVA');
              await calc.gsheets.fromTemplate(
                      './db/URBUILD_OFFER_TEMPLATE', 
                      './exports/URBUILD_OFFER_' + projectId,
                  { 
                      projectid: projectId,
                      width: scope.WIDTH, 
                      depth: scope.DEPTH, 
                      height: scope.HEIGHT,
                      wallsurface: scope.areaWalls, 
                      roofsurface: scope.areaRoof,
                      facadesurface: scope.areaFacade,
                      windowssurface: (scope.areaWindows > 2) ? scope.areaWindows - 2 : 0, // remove door from it
                      doors: scope.numDoors,
                      // slidedoor: scope.numSlidingDoors, // Use glass surface total
                      storeys: scope.NUM_FLOORS - 1, // excluding groundfloor
                      floorarea_gross: scope.floorAreaGross,
                      floorarea_net: scope.floorAreaNet,
                      volume_net: scope.volumeNet, 
                      gutter_min: scope.gutterHeightMin,
                      gutter_max: scope.gutterHeightMax,
                  }
              );
          }    
      )


//// SPEC SHEET DOCUMENT ////

function docPipeline()
{

    layer('doc').color('black');

    layer('iso').color('black')
    allVisible = all().visible().solids();

    // isometries
    isoLeftFront = allVisible.iso([-1,-1,1]).move(WIDTH*5); // main isometry


    // base floorplan
    FLOOR_PLAN_PIVOT_POINT = [0,-DEPTH*2]

    wallsCombinedSection = wallsCombined
        .subtracted(box(WIDTH*2,DEPTH*2,HEIGHT).moveZ(HEIGHT/2+150).hide())

    floorplan = collection(wallsCombinedSection,openingsGroundFloor)
        .project([0,0,1], true)
        .moveTo(FLOOR_PLAN_PIVOT_POINT);

    wallsCombinedSection.hide(); // don't show in model

    // elevations
    elevationFront = allVisible.elevation('front') // elevation placed on origin
            .moveTo(FLOOR_PLAN_PIVOT_POINT)
                .moveY(-HEIGHT/2-DEPTH/2-200);

    elevationLeft = allVisible
            .elevation('left')
            .moveTo(FLOOR_PLAN_PIVOT_POINT)
                .rotateZ(-90)
                .move(-WIDTH-HEIGHT/2);

    elevationRight = allVisible
            .elevation('right')
            .moveTo(FLOOR_PLAN_PIVOT_POINT)
                .rotateZ(90)
                .move(WIDTH+HEIGHT/2);

    elevationBack = allVisible.elevation('back') // elevation placed on origin
            .moveTo(FLOOR_PLAN_PIVOT_POINT)
                .rotateZ(180)
                .moveY(+HEIGHT/2+DEPTH/2+200);

    // add isometries to elevations
    isoRightFront = allVisible.iso([1,-1,1])
                        .moveTo(FLOOR_PLAN_PIVOT_POINT)
                        .move(-DEPTH*1.5, -HEIGHT/2-DEPTH/2-200)
                        .rotateZ(-120);

    isoRightBack = allVisible.iso([1,1,1])
                    .moveTo(FLOOR_PLAN_PIVOT_POINT)
                    .move(DEPTH*1.5, -HEIGHT/2-DEPTH/2-200)
                    .rotateZ(180);

    floorplanRect = floorplan.bbox().rect()
    floorplanRect.autoDim();
    floorplanWithDrawings = collection(
        floorplan, floorplanRect,
        elevationFront, elevationLeft, elevationRight, elevationBack,
        isoRightFront, isoRightBack
        );
}

//docPipeline();

$pipeline('techdraw', 
  function()
  {
    docPipeline();
  }
);

doc
    .create('spec')
    .page('spec')
    .pipeline(docPipeline)
    .titleblock({
        title: 'URHOUSE',
        designer: 'URBUILD'
    })
    .text('Your own URHOUSE', { size: '1.2cm'})
    .position(0,1)
    .text('Sketch design', { size: '0.7cm'})
    .position(0,0.92)
    .view('isobig')
    .shapes('isoLeftFront')
    .width(0.4)
    .height(0.7)
    .pivot([0,1])
    .position(0,0.86)
    .text('Specifications', { size: '0.7cm' })
    .position(0,0.26)
    .table('stats', { fontsize: 7 })
    .width(0.3)
    .height(0.3)
    .position(0,0.2)
    .table('areas', { fontsize: 7 })
    .width(0.3)
    .height(0.3)
    .position(0.35,0.2)
    // floor plan and elevations
    .view('floorplanWithDrawings')
    .shapes('floorplanWithDrawings')
    .width(0.6)
    .height(0.75)
    .pivot(1,1)
    .position(1,1)














`,
  params: {
    WIDTH: {
      name: "WIDTH",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Width",
      default: 400,
      _value: undefined,
      min: 200,
      max: 1000,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
      order: 0,
      iterable: true,
      description: null
    },
    HEIGHT: {
      name: "HEIGHT",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Height",
      default: 500,
      _value: undefined,
      min: 200,
      max: 1000,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
      order: 0,
      iterable: true,
      description: null
    },
    DEPTH: {
      name: "DEPTH",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Depth",
      default: 500,
      _value: undefined,
      min: 200,
      max: 3000,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
      order: 0,
      iterable: true,
      description: null
    },
    ROOF_TYPE: {
      name: "ROOF_TYPE",
      id: undefined,
      type: "options",
      enabled: true,
      visible: undefined,
      label: "Roof Type",
      default: "gable",
      _value: undefined,
      min: undefined,
      max: undefined,
      step: undefined,
      options: [
        "gable",
        "shed"
      ],
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    ROOF_ANGLE: {
      name: "ROOF_ANGLE",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Roof Angle",
      default: 35,
      _value: undefined,
      min: 10,
      max: 60,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    ROOF_RIDGE_AT_PERC: {
      name: "ROOF_RIDGE_AT_PERC",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Ridge at perc",
      default: 50,
      _value: undefined,
      min: 20,
      max: 80,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    ROOF_RIDGE_SLOPES_SAME: {
      name: "ROOF_RIDGE_SLOPES_SAME",
      id: undefined,
      type: "options",
      enabled: true,
      visible: undefined,
      label: "Ride slopes same",
      default: "angle",
      _value: undefined,
      min: undefined,
      max: undefined,
      step: undefined,
      options: [
        "angle",
        "height"
      ],
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    OVERHANGS_SAME: {
      name: "OVERHANGS_SAME",
      id: undefined,
      type: "boolean",
      enabled: true,
      visible: undefined,
      label: "Overhangs same",
      default: true,
      _value: undefined,
      min: undefined,
      max: undefined,
      step: undefined,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    OVERHANG_SIZE: {
      name: "OVERHANG_SIZE",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Overhangs Size",
      default: 50,
      _value: undefined,
      min: 0,
      max: 200,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
      order: 0,
      iterable: true,
      description: null
    },
    OVERHANG_FRONT: {
      name: "OVERHANG_FRONT",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Overhang Front",
      default: 50,
      _value: undefined,
      min: 0,
      max: 200,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: "cm",
      order: 0,
      iterable: true,
      description: null
    },
    OVERHANG_LEFT: {
      name: "OVERHANG_LEFT",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Overhang Left",
      default: 50,
      _value: undefined,
      min: 0,
      max: 200,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    OVERHANG_RIGHT: {
      name: "OVERHANG_RIGHT",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Overhang Right",
      default: 50,
      _value: undefined,
      min: 0,
      max: 200,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    OVERHANG_BACK: {
      name: "OVERHANG_BACK",
      id: undefined,
      type: "number",
      enabled: true,
      visible: undefined,
      label: "Overhang Back",
      default: 50,
      _value: undefined,
      min: 0,
      max: 200,
      step: 1,
      options: undefined,
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    MAIN_FACADE: {
      name: "MAIN_FACADE",
      id: undefined,
      type: "options",
      enabled: true,
      visible: undefined,
      label: "Main Facade side",
      default: "Front",
      _value: undefined,
      min: undefined,
      max: undefined,
      step: undefined,
      options: [
        "Front",
        "Left",
        "Right",
        "Back"
      ],
      length: undefined,
      listElem: undefined,
      schema: undefined,
      units: null,
      order: 0,
      iterable: true,
      description: null
    },
    GENERATE_OPENINGS: {
        name: "GENERATE_OPENINGS",
        type: "boolean",
        label: "Openings",
        default: true,
        enabled: true,
        visible: undefined,
        _value: undefined,
        min: undefined,
        max: undefined,
        step: undefined,
        options: undefined,
        length: undefined,
        listElem: undefined,
        schema: undefined,
        units: null,
        order: 0,
        iterable: true,
        description: null
      },
  },
  presets: {},
  published: {
    url: "/archiyou/urhousesketch:0.11.0",
    version: "0.5.0",
    title: "UrHouseSketch",
    public: true,
    published: "2025-10-10T14:51:31.645991",
    description: "Sketch design for URHOUSE",
    params: {
      
    },
    presets: {},
    libraryUrl: "http://localhost:4000"
  }
};

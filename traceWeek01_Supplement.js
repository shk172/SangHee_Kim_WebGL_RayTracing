// JavaScript has no 'class-defining' statements or declarations: instead we
// simply create a new object type by defining its constructor function, and
// add member methods/functions using JavaScript's 'prototype' feature.
//
// The object prototypes below (and their comments) are suitable for any and all
// features described in the Ray-Tracing Project Assignment Sheet.
//
// HOWEVER, they're not required, nor even particularly good:
//				(notably awkward style from their obvious C/C++ origins) 
// They're here to help you get 'started' on better code of your own,
// and to help you avoid common structural 'traps' in writing ray-tracers
//		that might otherwise force ugly/messy refactoring later, such as:
//  --lack of a well-polished vector/matrix library; e.g. open-source glmatrix.js
//  --lack of floating-point RGB values to compute light transport accurately,
//	--no distinct 'camera', 'image', and 'window' objects to separate lengthy 
//		ray-tracing calculations from screen display and refresh.
//	--lack of ray-trace image-buffer; window resize shouldn't discard your work! 
//  --lack of texture-mapped image display; permit ray-traced image of any 
//		resolution to display on any screen at any desired image size
//  --the need to describe geometry/shape independently from surface materials,
//		and to select material(s) for each shape from a list of materials
//  --materials that permit procedural 3D textures, turbulence & Perlin Noise,  //	--need to describe light sources independently, and possibly inherit their
//		location from a geometric shape (e.g. a light-bulb shape).
//  --need to create a sortable LIST of ray/object hit-points, and not just
//		the intersection nearest to the eyepoint, to enable shape-creation by
//		Constructive Solid Geometry (CSG), and to streamline transparency effects
//  --functions organized well to permit easy recursive ray-tracing:  don't 
//		tangle together ray/object intersection-finding tasks with shading, 
//		lighting, and materials-describing tasks.(e.g. traceRay(), findShade() )
//	--the need to match openGL/WebGL functions with ray-tracing results. 
//		Do it by constructing matching ray-tracing functions for cameras, views, 
//		transformations, lighting, and materials (e.g. rayFrustum(), rayLookAt(); //		rayTranlate(), rayRotate(), rayScale()...)
//  --need straightforward method to implement scene graphs & jointed objects. 
//		Do it by transforming world-space rays to model coordinates, rather than 
//		models to world coords, using a 4x4 worl2model matrix stored in each 
//		model (each CGeom primitive).  Set it by OpenGL-like functions 
//		rayTranslate(), rayRotate(), rayScale(), etc.


function CRay() {
//==============================================================================
// Object for a ray in an unspecified coord. system (usually 'world' coords).
	this.orig = vec4.fromValues(0,0,0,1);			// Ray starting point (x,y,z,w)
																						// (default: at origin
	this.dir = 	vec4.fromValues(0,0,-1,0);			// The ray's direction vector 
																						// (default: look down -z axis)
}

CRay.prototype.printMe = function(name) {
//==============================================================================
// print ray's values in the console window:
	if(name == undefined) name = ' ';
	console.log('CRay:', name, '   origin:\t', this.orig[0], ',\t',
												this.orig[1], ',\t', this.orig[2], ',\t', this.orig[3]);
	console.log('     ', name, 'direction:\t',  this.dir[0], ',\t',
										 		 this.dir[1], ',\t',  this.dir[2], ',\t',  this.dir[3]);
}

function CCamera() {
//==============================================================================
// Object for a ray-tracing camera defined the 'world' coordinate system, with
// a) -- 'extrinsic' parameters that set the camera's position and aiming
//	from the camera-defining UVN coordinate system 
// (coord. system origin at the eye-point; coord axes U,V define camera image 
// horizontal and vertical; camera gazes along the -N axis): 
// Default settings: put camera eye-point at world-space origin, and
	this.eyePt = vec4.fromValues(0,0,0,1);
	this.uAxis = vec4.fromValues(1,0,0,0);	// camera U axis == world x axis			
  this.vAxis = vec4.fromValues(0,1,0,0);	// camera V axis == world y axis
  this.nAxis = vec4.fromValues(0,0,1,0);	// camera N axis == world z axis.
		  	// (and thus we're gazing down the -Z axis with default camera). 

// b) --  Camera 'intrinsic' parameters that set the camera's optics and images.
// They define the camera's image frustum: its image plane is at N = -znear  (the
// plane that 'splits the universe', perpendicular to N axis), and no 'zfar' 
// plane at all (not needed: ray-tracer doesn't have or need the CVV).  
// The ray-tracing camera creates an rectangular image plane perpendicular to  
//	the cam-coord. system N axis at -iNear (defined by N vector in world coords),
// 			horizontally	spanning 'iLeft' <= u <= 'iRight' along the U vector, and
//			vertically    spanning  'iBot' <= v <=  'iTop' along the V vector. 
// As the default camera creates an image plane at distance iNear = 1 from the 
// camera's center-of-projection (at the u,v,n origin), these +/-1 
// defaults define a square ray-traced image with a +/-45-degree field-of-view:
	this.iNear = 1.0;
	this.iLeft = -1.0;		
	this.iRight = 1.0;
	this.iBot =  -1.0;
	this.iTop =   1.0; 
// And the lower-left-most corner of the image is at (u,v,n) = (iLeft,iBot,-1).
	this.xmax = 256;			// horizontal,
	this.ymax = 256;			// vertical image resolution.
// To ray-trace an image of xmax,ymax pixels, divide this rectangular image plane
// into xmax,ymax rectangular tiles, and shoot eye-rays from the camera's
// center-of-projection through those tiles to find scene color values.  For the 
// simplest, fastest image (without antialiasing) trace each eye-ray through the 
// CENTER of each tile to find pixel colors.  For slower, better-looking, 
// anti-aliased image making, apply jittered super-sampling:
//  For each pixel:		--subdivide the 'tile' into equal-sized 'sub-tiles'  
//										--trace one ray per sub-tile, but randomize (jitter)
//											 the ray's position within the sub-tile,
//										--set pixel color to the average of all sub-tile colors. 
// Divide the image plane into rectangular tiles, one for each pixel:
	this.ufrac = (this.iRight - this.iLeft) / this.xmax;	// pixel tile's width
	this.vfrac = (this.iTop   - this.iBot ) / this.ymax;	// pixel tile's height.
}

CCamera.prototype.setEyeRay = function(myeRay, xpos, ypos) {
//==============================================================================
// Set values of a CRay object to specify a ray in world coordinates that 
// originates at the camera's eyepoint (its center-of-projection: COP) and aims // in the direction towards the image-plane location (xpos,ypos) given in units // of pixels.  The ray's direction vector is *NOT* normalized.
//
// !CAREFUL! Be SURE you understand these floating-point xpos,ypos arguments!
// For the default CCamera (+/-45 degree FOV, xmax,ymax == 256x256 resolution) 
// the function call makeEyeRay(0,0) creates a ray to the image rectangle's 
// lower-left-most corner at U,V,N = (iLeft,iBot,-1), and the function call
// makeEyeRay(256,256) creates a ray to the image rectangle's upper-left-most  
// corner at U,V,N = (iRight,iTop,-1). 
//	To get the eye ray for pixel (x,y), DON'T call setEyeRay(myRay, x,y);
//                                   instead call setEyeRay(myRay,x+0.5,y+0.5)
// (Later you will trace multiple eye-rays per pixel to implement antialiasing) 
// WHY?  
//	-- because the half-pixel offset (x+0.5, y+0.5) traces the ray through the
//     CENTER of the pixel's tile, and not its lower-left corner.
// As we learned in class (and from optional reading "A Pixel is Not a Little 
// Square" by Alvy Ray Smith), a pixel is NOT a little square -- it is a 
// point-like location, one of many in a grid-like arrangement, where we store a 
// neighborhood summary of an image's color(s).  While we could (and often do) 
// define that pixel's 'neighborhood' as a small tile of the image plane, and 
// summarize its color as the tile's average color, it is not our only choice 
// and certainly not our best choice.  
// (ASIDE: You can dramatically improve the appearance of a digital image by 
//     making pixels  that summarize overlapping tiles by making a weighted 
//     average for the neighborhood colors, with maximum weight at the pixel 
//     location, and with weights that fall smoothly to zero as you reach the 
//     outer limits of the pixel's tile or 'neighborhood'. Google: antialiasing 
//     bilinear filter, Mitchell-Netravali piecewise bicubic prefilter, etc).

// Convert image-plane location (xpos,ypos) in the camera's U,V,N coords:
var posU = this.iLeft + xpos*this.ufrac; 	// U coord,
var posV = this.iBot  + ypos*this.vfrac;	// V coord,
//  and the N coord is always -1, at the image-plane (zNear) position.
// Then convert this point location to world-space X,Y,Z coords using our 
// camera's unit-length coordinate axes uAxis,vAxis,nAxis
 xyzPos = vec4.create();    // make vector 0,0,0,0.	
	vec4.scaleAndAdd(xyzPos,xyzPos, this.uAxis, posU); // xyzPos += Uaxis * posU;
	vec4.scaleAndAdd(xyzPos,xyzPos, this.vAxis, posV); // xyzPos += Vaxis * posU;
  vec4.scaleAndAdd(xyzPos, xyzPos, this.nAxis, -this.iNear); 
  // 																								xyzPos += Naxis * (-1)
  // NEXT, WE --COULD-- 
  // finish converting from UVN coordinates to XYZ coordinates: we made a
  // weighted sum of the U,V,N axes; now add UVN origin point, and we
  // would get (xyzPos + eyePt).
  // BUT WE DON'T NEED TO DO THAT.
  // The eyeRay we want consists of just 2 world-space values:
  //  	-- the ray origin == camera origin == eyePt in XYZ coords
  //		-- the ray direction TO image-plane point FROM ray origin;
  //				myeRay.dir = (xyzPos + eyePt) - eyePt = xyzPos; thus
	vec4.copy(myeRay.orig, this.eyePt);	
	vec4.copy(myeRay.dir, xyzPos);
}

// allowable values for CGeom.shapeType variable.  Add some of your own!
const JT_GNDPLANE = 0;    // An endless 'ground plane' surface.
const JT_SPHERE   = 1;    // A sphere.
const JT_BOX      = 2;    // An axis-aligned cube.
const JT_CYLINDER = 3;    // A cylinder with user-settable radius at each end
                        // and user-settable length.  radius of 0 at either
                        // end makes a cone; length of 0 with nonzero
                        // radius at each end makes a disk.
const JT_TRIANGLE = 4;    // a triangle with 3 vertices.
const JT_BLOBBIES = 5;    // Implicit surface:Blinn-style Gaussian 'blobbies'.


function CGeom(shapeSelect) {
//==============================================================================
// Generic object for a geometric shape.  Each instance describes just one shape,
// but you can select from several different kinds of shapes by setting
// the 'shapeType' member.
// CGeom can describe ANY shape, including sphere, box, cone, quadric, etc. and
// it holds all/any variables needed for each shapeType.
//
// Advanced Version: try it!
//        Ray tracing lets us position and distort these shapes in a new way;
// instead of transforming the shape itself for 'hit' testing against a traced
// ray, we transform the 3D ray by the matrix 'world2model' before the hit-test.
// This matrix simplifies our shape descriptions, because we don't need
// separate parameters for position, orientation, scale, or skew.  For example,
// JT_SPHERE and JT_BOX need NO parameters--they each describe a unit sphere or
// unit cube centered at the origin.  To get a larger, rotated, offset sphere
// or box, just set the parameters in world2model matrix. Note that you can scale
// the box or sphere differently in different directions, forming ellipsoids for
// the unit sphere and rectangles (or prisms) from the unit box.
	if(shapeSelect == undefined) shapeSelect = JT_GND_PLANE;	// default
	this.shapeType = shapeSelect;
	
	this.world2model = mat4.create();		// the matrix used to transform rays from
	                                    // 'world' coord system to 'model' coords;
	                                    // Use this to set shape size, position,
	                                    // orientation, and squash/stretch amount.
	// Ground-plane 'Line-grid' parameters:
	this.zGrid = -5.0;	// create line-grid on the unbounded plane at z=zGrid
	this.xgap = 1.0;	// line-to-line spacing
	this.ygap = 1.0;
	this.lineWidth = 0.1;	// fraction of xgap used for grid-line width
	this.lineColor = vec4.fromValues(0.1,0.5,0.1,1.0);	// RGBA green(A== opacity)
	this.gapColor = vec4.fromValues( 0.9,0.9,0.9,1.0);	// near-white
}

CGeom.prototype.traceGrid = function(inRay) {
//==============================================================================
// Find intersection of CRay object 'inRay' with the grid-plane at z== this.zGrid
// return -1 if ray MISSES the plane
// return  0 if ray hits BETWEEN lines
// return  1 if ray hits ON the lines
// HOW?!?
// 1) we parameterize the ray by 't', so that we can find any point on the
// ray by:
//          Ray(t) = ray.orig + t*ray.dir
// To find where the ray hit the plane, solve for t where R(t) = x,y,zGrid:
//          Ray(t0) = zGrid = ray.orig[2] + t0*ray.dir[2];
//  solve for t0:   t0 = (zGrid - ray.orig[2]) / ray.dir[2]
//  then find x,y value along ray for value t0:
//  hitPoint = ray.orig + t0*ray.dir
//  BUT if t0 <0, we can only hit the plane at points BEHIND our camera;
//  thus the ray going FORWARD through the camera MISSED the plane!.
//
// 2) Our grid-plane exists for all x,y, at the value z=zGrid.
//      location x,y, zGrid is ON the lines on the plane if
//          (x/xgap) has fractional part < linewidth  *OR*
//          (y/ygap) has fractional part < linewidth.
//      otherwise ray hit BETWEEN the lines.

/*
	*
	*
	*
	  YOU WRITE THIS!  
	*
	*
	*
	*
	*/
}

function CImgBuf(wide, tall) {
//==============================================================================
// Construct an 'image-buffer' object to hold a floating-point ray-traced image.
//  Contains BOTH
//	iBuf -- 2D array of 8-bit RGB pixel values we can display on-screen, AND
//	fBuf -- 2D array of floating-point RGB pixel values we usually CAN'T display,
//          but contains full-precision results of ray-tracing.
//			--Both buffers hold the same numbers of pixel values (xSiz,ySiz,pixSiz)
//			--imgBuf.int2float() copies/converts current iBuf contents to fBuf
//			--imgBuf.float2int() copies/converts current fBuf contents to iBuf
//	WHY?  
//	--Our ray-tracer computes floating-point light amounts(e.g. radiance L) //    but neither our display nor our WebGL texture-map buffers can accept 
//		images with floating-point pixel values.
//	--You will NEED all those floating-point values for applications such as
//    environment maps (re-lighting from sky image) and lighting simulations.
// Stay simple in early versions of your ray-tracer: keep 0.0 <= RGB < 1.0, 
// but later you can modify your ray-tracer 
// to use radiometric units of Radiance (watts/(steradians*meter^2), or convert 
// to use photometric units of luminance (lumens/(steradians*meter^2 aka cd/m^2) // to compute in physically verifiable units of visible light.

	this.xSiz = wide;							// image width in pixels
	this.ySiz =	tall;							// image height in pixels
	this.pixSiz = 3;							// pixel size (3 for RGB, 4 for RGBA, etc)
	this.iBuf = new Uint8Array(  this.xSiz * this.ySiz * this.pixSiz);	
	this.fBuf = new Float32Array(this.xSiz * this.ySiz * this.pixSiz);
}

CImgBuf.prototype.setTestPattern = function(pattNum) {
//==============================================================================
// Replace current 8-bit RGB contents of 'imgBuf' with a colorful pattern
	// 2D color image:  8-bit unsigned integers in a 256*256*3 array
	// to store r,g,b,r,g,b integers (8-bit)
	// In WebGL texture map sizes MUST be a power-of-two (2,4,8,16,32,64,...4096)
	// with origin at lower-left corner
	// (NOTE: this 'power-of-two' limit will probably vanish in a few years of
	// WebGL advances, just as it did for OpenGL)
	
  // use local vars to set the array's contents.
  for(var j=0; j< this.ySiz; j++) {						// for the j-th row of pixels
  	for(var i=0; i< this.xSiz; i++) {					// and the i-th pixel on that row,
	  	var idx = (j*this.xSiz + i)*this.pixSiz;// Array index at pixel (i,j) 
	  	switch(pattNum) {
	  		case 0:	//================(Colorful L-shape)============================
			  	if(i < this.xSiz/4 || j < this.ySiz/4) {
			  		this.iBuf[idx   ] = i;								// 0 <= red <= 255
			  		this.iBuf[idx +1] = j;								// 0 <= grn <= 255
			  	}
			  	else {
			  		this.iBuf[idx   ] = 0;
			  		this.iBuf[idx +1] = 0;
			  		}
			  	this.iBuf[idx +2] = 255 -i -j;								// 0 <= blu <= 255
			  	break;
			  case 1: //================(bright orange)===============================
			  	this.iBuf[idx   ] = 255;	// bright orange
			  	this.iBuf[idx +1] = 128;
			  	this.iBuf[idx +2] =   0;
	  			break;
	  		default:
	  			console.log("imgBuf.setTestPattern() says: WHUT!?");
	  		break;
	  	}
  	}
  }
  this.int2float();		// fill the floating-point buffer with same test pattern.
}

CImgBuf.prototype.int2float = function() {
//==============================================================================
// Convert current integerRGB image in iBuf into floating-point RGB image in fBuf
for(var j=0; j< this.ySiz; j++) {		// for each scanline
  	for(var i=0; i< this.xSiz; i++) {		// for each pixel on that scanline
  		var idx = (j*this.xSiz + i)*this.pixSiz;// Find array index at pixel (i,j)
			// convert integer 0 <= RGB <= 255 to floating point 0.0 <= R,G,B <= 1.0
  		this.fBuf[idx   ] = this.iBuf[idx   ] / 255.0;	// red
  		this.fBuf[idx +1] = this.iBuf[idx +1] / 255.0;	// grn
  		this.fBuf[idx +2] = this.iBuf[idx +2] / 255.0;	// blu
  		
  	}
  }
}

CImgBuf.prototype.float2int = function() {
//==============================================================================
// Convert current floating-point RGB image in fBuf into integerRGB image in iBuf
for(var j=0; j< this.ySiz; j++) {		// for each scanline
  	for(var i=0; i< this.xSiz; i++) {	// for each pixel on that scanline
  		var idx = (j*this.xSiz + i)*this.pixSiz;// Find array index at pixel (i,j)
			// find 'clamped' color values that stay >=0.0 and <=1.0:
  		var rval = Math.min(1.0, Math.max(0.0, this.fBuf[idx   ]));
  		var gval = Math.min(1.0, Math.max(0.0, this.fBuf[idx +1]));
  		var bval = Math.min(1.0, Math.max(0.0, this.fBuf[idx +2]));
			// Divide [0,1] span into 256 equal-sized parts: e.g.  Math.floor(rval*256)
			// In the rare case when rval==1.0 you get unwanted '256' result that won't
			// fit into the 8-bit RGB values.  Fix it with Math.min():
  		this.iBuf[idx   ] = Math.min(255,Math.floor(rval*256.0));	// red
  		this.iBuf[idx +1] = Math.min(255,Math.floor(gval*256.0));	// grn
  		this.iBuf[idx +2] = Math.min(255,Math.floor(bval*256.0));	// blu
  		
  	}
  }
}

CImgBuf.prototype.makeRayTracedImage = function() {
//==============================================================================
// TEMPORARY!!!! 
// THIS FUNCTION SHOULD BE A MEMBER OF YOUR CScene OBJECTS (when you make them),
// and NOT a member of CImgBuf OBJECTS!
//
// Create an image by Ray-tracing.   (called when you press 'T' or 't')

  var eyeRay = new CRay();	// the ray we trace from our camera for each pixel
  var myCam = new CCamera();	// the 3D camera that sets eyeRay values
  var myGrid = new CGeom(JT_GNDPLANE);
  var colr = vec4.create();	// floating-point RGBA color value
	var hit = 0;
	
  for(var j=0; j< this.ySiz; j++) {						// for the j-th row of pixels
  	for(var i=0; i< this.xSiz; i++) {					// and the i-th pixel on that row,
	  	var idx = (j*this.xSiz + i)*this.pixSiz;	// Array index at pixel (i,j) 
			myCam.setEyeRay(eyeRay,i,j);						  // create ray for pixel (i,j)
			hit = myGrid.traceGrid(eyeRay);						// trace ray to the grid
			if(hit==0) {
				vec4.copy(colr, myGrid.gapColor);
			}
			else if (hit==1) {
				vec4.copy(colr, myGrid.lineColor);
			}
	  	this.fBuf[idx   ] = colr[0];	// bright blue
	  	this.fBuf[idx +1] = colr[1];
	  	this.fBuf[idx +2] = colr[2];
	  	}
  	}
  this.float2int();		// create integer image from floating-point buffer.
}

/*
function CScene() {
//==============================================================================
// A complete ray tracer object prototype (formerly a C/C++ 'class').
//      My code uses just one CScene instance (myScene) to describe the entire 
//			ray tracer.  Note that I could add more CScene variables to make multiple
//			ray tracers (perhaps on different threads or processors) and combine
//			their results into a video sequence, a giant image, or use one result
//			to help create another.
//
//The CScene class includes:
// One CImgBuf object that holds a floating-point RGB image, and uses that
//		  image to create a corresponding 8,8,8 bit RGB image suitable for WebGL
//			display as a texture-map in an HTML-5 canvas object within a webpage.
// One CCamera object that describes an antialiased ray-tracing camera;
//      in my code, it is the 'rayCam' variable within the CScene prototype.
//      The CCamera class defines the SOURCE of rays we trace from our eyepoint
//      into the scene, and uses those rays to set output image pixel values.
// One CRay object 'eyeRay' that describes the ray we're currently tracing from
//      eyepoint into the scene.
// One CHitList object 'eyeHits' that describes each 3D point where the 'eyeRay'
//      pierces a shape (a CGeom object) in our CScene.  Each CHitList object
//      in our ray-tracer holds a COLLECTION of hit-points (CHit objects) for a
//      ray, and keeps track of which hit-point is closest to the camera. That
//			collection is held in the eyeHits member of the CScene class.
// a COLLECTION of CGeom objects that each describe an individual visible thing,
//      single item or thing we may see in the scene.  That collection is the 
//			held in the 'item[]' array within the CScene class.
//      		Each CGeom element in the 'item[]' array holds one shape on-screen.
//      To see three spheres and a ground-plane we'll have 4 CGeom objects, one 
//			for each of the spheres, and one for the ground-plane.
//      Each CGeom object includes a 'matlIndex' index number that selects which
//      material to use in rendering the CGeom shape. I assume all lights in the
//      scene may affect all CGeom shapes, but you may wish to add an light-src
//      index to permit each CGeom object to choose which lights(s) affect it.
// a COLLECTION of CMatl objects; each describes one light-modifying material.
//      That collection is held in the 'matter[]' array within the CScene class.
//      Each CMatl element in the 'matter[]' array describes one particular
//      individual material we will use for one or more CGeom shapes. We may
//      have one CMatl object that describes clear glass, another for a
//      Phong-shaded brass-metal material, another for a texture-map, another
//      for a bump mapped material for the surface of an orange (fruit),
//      another for a marble-like material defined by Perlin noise, etc.
// a COLLECTION of CLight objects that each describe one light source.  
//			That collection is held in the 'lamp[]' array within the CScene class.
//      Note that I apply all lights to all CGeom objects.  You may wish to
//      add an index to the CGeom class to select which lights affect each item.
//
// The default CScene constructor creates a simple scene that will create a
// picture if traced:
// --rayCam with +/- 45 degree Horiz field of view, aimed at the origin from 
// 			world-space location (0,0,5)
// --item[0] is a unit sphere at the origin that uses matter[0] material;
// --matter[0] material is a shiny red Phong-lit material, lit by lamp[0];
// --lamp[0] is a point-light source at location (5,5,5).

/*
	*
	*
	*
	  YOU WRITE THIS!  
	*
	*
	*
	*
	*/
}

function CHit() {
//==============================================================================
// Describes one ray/object intersection point that was found by 'tracing' one
// ray through one shape (through a single CGeom object, held in the
// CScene.item[] array).
// CAREFUL! We don't use isolated CHit objects, but instead gather all the CHit
// objects for one ray in one list held inside a CHitList object.
// (CHit, CHitList classes are consistent with the 'HitInfo' and 'Intersection'
// classes described in FS Hill, pg 746).

/*
	*
	*
	*
	  YOU WRITE THIS!  
	*
	*
	*
	*
	*/
}

function CHitList() {
//==============================================================================
// Holds all the ray/object intersection results from tracing a single ray(CRay)
// through all objects (CGeom) in our scene (CScene).  ALWAYS holds at least
// one valid CHit 'hit-point', as we initialize pierce[0] to the CScene's
// background color.  Otherwise, each CHit element in the 'pierce[]' array
// describes one point on the ray where it enters or leaves a CGeom object.
// (each point is in front of the ray, not behind it; t>0).
//  -- 'iEnd' index selects the next available CHit object at the end of
//      our current list in the pierce[] array. if iEnd=0, the list is empty.
//      CAREFUL! *YOU* must prevent buffer overflow! Keep iEnd<= JT_HITLIST_MAX!
//  -- 'iNearest' index selects the CHit object nearest the ray's origin point.

/*
	*
	*
	*
	  YOU WRITE THIS!  
	*
	*
	*
	*
	*/
}
*/

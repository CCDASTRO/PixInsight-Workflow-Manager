/* CCDASTRO adaptation of Franklin Marek's Automatic DBE 1.6.
 * Copyright 2026 Franklin Marek. License: CC BY-NC 4.0.
 * Source: https://www.setiastro.com/pjsr-scripts (AutoDBE.js).
 * License: https://creativecommons.org/licenses/by-nc/4.0/
 * Changes: extracted processing engine; omitted vendor GUI/main/directives;
 * included at signing time inside isolated factory; added native failure guards,
 * cooperative cancellation and a bounded background-sampling retry count.
 * Not endorsed by Franklin Marek, Seti Astro, or Pleiades Astrophoto.
 * Noncommercial use only for this engine. All original notices retained below.
 */
 /******************************************************************************
 *######################################################################
 *#        ___     __      ___       __                                #
 *#       / __/___/ /__   / _ | ___ / /________                        #
 *#      _\ \/ -_) _ _   / __ |(_-</ __/ __/ _ \                       #
 *#     /___/\__/_//_/  /_/ |_/___/\__/_/  \___/                       #
 *#                                                                    #
 *######################################################################
 *
 * Automatic DBE Script
 * Version: 1.6
 * Author: Franklin Marek
 * Website: www.setiastro.com
 *
 * This script is designed for the automatic removal of gradients in
 * astrophotographic images.  It includes finding starting points via
 * gradient descent, custom weighting scores, and custom rejection algorithms
 *
 * This work is licensed under a Creative Commons Attribution-NonCommercial 4.0 International License.
 * To view a copy of this license, visit http://creativecommons.org/licenses/by-nc/4.0/
 *
 * You are free to:
 * 1. Share — copy and redistribute the material in any medium or format
 * 2. Adapt — remix, transform, and build upon the material
 *
 * Under the following terms:
 * 1. Attribution — You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
 * 2. NonCommercial — You may not use the material for commercial purposes.
 *
 * @license CC BY-NC 4.0 (http://creativecommons.org/licenses/by-nc/4.0/)
 *
 * COPYRIGHT © 2026 Franklin Marek. ALL RIGHTS RESERVED.
 ******************************************************************************/


function enumValue( obj, name, fallback )
{
    try
    {
        let v = obj[name];
        if ( typeof v === "number" && isFinite( v ) )
            return v | 0;
    }
    catch ( e )
    {
    }
    return fallback;
}

// Conservative V8 fallbacks.
// These may vary by PI build, but these are the usual values.
const ABE_TARGET_CORRECTION_SUBTRACT = enumValue( AutomaticBackgroundExtractor, "Subtract", 0 );
const ABE_TARGET_CORRECTION_DIVIDE   = enumValue( AutomaticBackgroundExtractor, "Divide",   1 );

const DBE_TARGET_CORRECTION_SUBTRACT = enumValue( DynamicBackgroundExtraction, "Subtract", 0 );
const DBE_TARGET_CORRECTION_DIVIDE   = enumValue( DynamicBackgroundExtraction, "Divide",   1 );

// These may also need numeric fallback in V8 later.
const BN_MODE_RESCALE_AS_NEEDED      = enumValue( BackgroundNeutralization, "RescaleAsNeeded", 0 );

// Parameters

// Array to store the end points of all paths
let endPoints = [];

let GradientDescentParameters = {
    targetView: undefined,
    descentPathsInput: 50,
    tolerance: 2.0, // Default value for P.tolerance
    defaultSampleRadius: 10,
    smoothing: 0.25, // Default value for P.defaultSampleRadius
    overrideSampleRadius: false,
    overrideSmoothing: false,
    replaceTarget: false, // Default is false
    discardModel: false,  // Default is true (Show Gradient Extracted is checked by default)
    enableSimplifiedInitialModelling: true, // Default is true
    rigidlyFixCornerPoints: false, // Default is false
    polynomialDegree: 1,
    correctionType: DBE_TARGET_CORRECTION_SUBTRACT,

    load: function() {
        if (Parameters.has("descentPathsInput"))
            this.descentPathsInput = Parameters.getInteger("descentPathsInput");
        if (Parameters.has("tolerance"))
            this.tolerance = Parameters.getReal("tolerance");
        if (Parameters.has("defaultSampleRadius"))
            this.defaultSampleRadius = Parameters.getInteger("defaultSampleRadius");
        if (Parameters.has("smoothing"))
            this.smoothing = Parameters.getReal("smoothing");
        if (Parameters.has("overrideSampleRadius"))
            this.overrideSampleRadius = Parameters.getBoolean("overrideSampleRadius");
        if (Parameters.has("overrideSmoothing"))
            this.overrideSmoothing = Parameters.getBoolean("overrideSmoothing");
        if (Parameters.has("targetView"))
            this.targetView = Parameters.get("targetView");
        if (Parameters.has("replaceTarget"))
            this.replaceTarget = Parameters.getBoolean("replaceTarget");
        if (Parameters.has("discardModel"))
            this.discardModel = Parameters.getBoolean("discardModel");
        if (Parameters.has("enableSimplifiedInitialModelling"))
            this.enableSimplifiedInitialModelling = Parameters.getBoolean("enableSimplifiedInitialModelling");
        if (Parameters.has("rigidlyFixCornerPoints"))
            this.rigidlyFixCornerPoints = Parameters.getBoolean("rigidlyFixCornerPoints");
        if (Parameters.has("polynomialDegree"))
            this.polynomialDegree = Parameters.getInteger("polynomialDegree");
        else
            this.polynomialDegree = 1; // Default value

        // Load correction type
         if ( Parameters.has( "correctionType" ) )
         {
             let correctionType = Parameters.getInteger( "correctionType" );
             if ( correctionType === DBE_TARGET_CORRECTION_SUBTRACT ||
                  correctionType === DBE_TARGET_CORRECTION_DIVIDE )
                 this.correctionType = correctionType;
             else
                 this.correctionType = DBE_TARGET_CORRECTION_SUBTRACT;
         }
         else
         {
             this.correctionType = DBE_TARGET_CORRECTION_SUBTRACT;
         }
    },

    save: function() {
        Parameters.set("descentPathsInput", this.descentPathsInput);
        Parameters.set("tolerance", this.tolerance);
        Parameters.set("defaultSampleRadius", this.defaultSampleRadius);
        Parameters.set("smoothing", this.smoothing);
        Parameters.set("overrideSampleRadius", this.overrideSampleRadius);
        Parameters.set("overrideSmoothing", this.overrideSmoothing);
        Parameters.set("replaceTarget", this.replaceTarget);
        Parameters.set("discardModel", this.discardModel);
        Parameters.set("enableSimplifiedInitialModelling", this.enableSimplifiedInitialModelling);
        Parameters.set("rigidlyFixCornerPoints", this.rigidlyFixCornerPoints);
        Parameters.set("correctionType", this.correctionType);
        Parameters.set("polynomialDegree", this.polynomialDegree);
        if (this.targetView)
            Parameters.set("targetView", this.targetView.id);
    }
};



//let userDefinedRegions = null; // To store the user-defined region
let isDragging = false;
let startX, startY;

let constants =
{
    indent: 20,
    minLabelSize: 170
}

//let points = generate_starting_points_with_brightness(image_width, image_height, window_size, num_points, var_image, channels, exclusionAreas);

// Define mergeOverlappingRegions, isOverlapping, and mergeRegions functions
function mergeOverlappingRegions(regions) {
    let mergedRegions = [];
    for (let i = 0; i < regions.length; i++) {
        let region = regions[i];
        let isMerged = false;
        for (let j = 0; j < mergedRegions.length; j++) {
            if (isOverlapping(region, mergedRegions[j])) {
                mergedRegions[j] = mergeRegions(region, mergedRegions[j]);
                isMerged = true;
                break;
            }
        }
        if (!isMerged) {
            mergedRegions.push(region);
        }
    }
    return mergedRegions;
}

function isOverlapping( rect1, rect2 )
{
    return !(
        rect1.x1 < rect2.x0 ||
        rect1.x0 > rect2.x1 ||
        rect1.y1 < rect2.y0 ||
        rect1.y0 > rect2.y1
    );
}

function mergeRegions( rect1, rect2 )
{
    return new Rect(
        Math.min( rect1.x0, rect2.x0 ),
        Math.min( rect1.y0, rect2.y0 ),
        Math.max( rect1.x1, rect2.x1 ),
        Math.max( rect1.y1, rect2.y1 )
    );
}

function normalizeRect( rect )
{
    let x0 = Math.min( rect.x0, rect.x1 );
    let y0 = Math.min( rect.y0, rect.y1 );
    let x1 = Math.max( rect.x0, rect.x1 );
    let y1 = Math.max( rect.y0, rect.y1 );
    return new Rect( x0, y0, x1, y1 );
}

function clampRectToBounds( rect, imageWidth, imageHeight )
{
    let x0 = Math.max( 0, Math.min( rect.x0, imageWidth ) );
    let y0 = Math.max( 0, Math.min( rect.y0, imageHeight ) );
    let x1 = Math.max( 0, Math.min( rect.x1, imageWidth ) );
    let y1 = Math.max( 0, Math.min( rect.y1, imageHeight ) );
    return new Rect( x0, y0, x1, y1 );
}

function calculate_window_size(image_height, overrideSampleRadius, userDefinedSize) {
    if (overrideSampleRadius) {
        return userDefinedSize * 2; // Double the user-defined size for the window size
    } else {
        return Math.min(Math.round(image_height * 0.015), 30); // Default calculation
    }
}

// Function to calculate spacing
function calculate_spacing(window_size) {
    return Math.ceil(window_size * 0.5); // Increase spacing to cover fewer regions
}

function get_average_pixel_brightness(var_image, x, y, channels) {
    if (channels == 1) {
        return var_image.sample(x, y, 0); // Single channel (greyscale)
    } else {
        return (var_image.sample(x, y, 0) + var_image.sample(x, y, 1) + var_image.sample(x, y, 2)) / 3; // Color image
    }
}

// Function to get window statistics for a color image
function get_window_stats(var_image, x, y, window_size, channels, tolerance) {
    let pixel_values = [];
    for (let c = 0; c < channels; c++) {
        pixel_values.push([]);
    }

    for (let offset_x = 0; offset_x < window_size; offset_x++) {
        for (let offset_y = 0; offset_y < window_size; offset_y++) {
            for (let c = 0; c < channels; c++) {
                let brightness = var_image.sample(x + offset_x, y + offset_y, c);
                pixel_values[c].push(brightness);
            }
        }
    }

    let average_brightness = [];
    let stddev = [];
    let mad = [];
    let median_brightness = [];

    for (let c = 0; c < channels; c++) {
        let mean = pixel_values[c].reduce((a, b) => a + b, 0) / pixel_values[c].length;
        let variance = pixel_values[c].reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pixel_values[c].length;
        let sigma = Math.sqrt(variance);

        // Apply tolerance-based rejection
        let filtered_values = pixel_values[c].filter(value => Math.abs(value - mean) <= tolerance * sigma);

        let new_mean = filtered_values.reduce((a, b) => a + b, 0) / filtered_values.length;
        let new_variance = filtered_values.reduce((a, b) => a + Math.pow(b - new_mean, 2), 0) / filtered_values.length;
        let new_sigma = Math.sqrt(new_variance);

        filtered_values.sort((a, b) => a - b);
        let new_median = filtered_values[Math.floor(filtered_values.length / 2)];

        average_brightness.push(new_mean);
        stddev.push(new_sigma);
        median_brightness.push(new_median);

        let mad_sum = 0;
        for (let i = 0; i < filtered_values.length; i++) {
            mad_sum += Math.abs(filtered_values[i] - new_median);
        }
        mad.push(mad_sum / filtered_values.length);
    }

    return {
        average: average_brightness,
        stddev: stddev,
        median: median_brightness,
        mad: mad
    };
}


// Function to generate random starting points spread evenly across the image after filtering quartiles
function generate_starting_points_with_brightness(image_width, image_height, window_size, num_points, var_image, channels, exclusionAreas) {
    let points = [];
    let quartile_width = Math.floor(image_width / 2);
    let quartile_height = Math.floor(image_height / 2);
    let search_region_size = 100;

    // Define regions for quartiles
    let quartiles = [
        { startX: 0, startY: 0 },
        { startX: quartile_width, startY: 0 },
        { startX: 0, startY: quartile_height },
        { startX: quartile_width, startY: quartile_height }
    ];

    // Number of points to be generated in each quartile
    let points_per_quartile = Math.ceil(num_points / quartiles.length);

    // Container for eligible regions after filtering
    let eligibleRegions = [];

    // Process each quartile
    quartiles.forEach(quartile => {
        let grid_brightness = [];
        for (let x = quartile.startX; x < quartile.startX + quartile_width; x += search_region_size) {
            for (let y = quartile.startY; y < quartile.startY + quartile_height; y += search_region_size) {
                let region = { x0: x, y0: y, x1: x + search_region_size, y1: y + search_region_size };

                // Check if the region overlaps with any exclusion area
                if (exclusionAreas.some(exclusionArea => isOverlapping(region, exclusionArea))) {
                    continue;
                }

                let avg_brightness = 0;
                let count = 0;
                for (let dx = 0; dx < search_region_size && (x + dx) < image_width; dx++) {
                    for (let dy = 0; dy < search_region_size && (y + dy) < image_height; dy++) {
                        avg_brightness += get_average_pixel_brightness(var_image, x + dx, y + dy, channels);
                        count++;
                    }
                }
                if (count > 0) {
                    avg_brightness /= count;
                    grid_brightness.push({ x: x, y: y, avg_brightness: avg_brightness });
                }
            }
        }

        // Sort and filter out the 50% brightest
        grid_brightness.sort((a, b) => a.avg_brightness - b.avg_brightness);
        let filtered_regions = grid_brightness.slice(0, Math.floor(grid_brightness.length * 2/3));

        // Shuffle the eligible regions to ensure randomness
        filtered_regions.sort(() => Math.random() - 0.5);

        // Limit the number of points in this quartile
        filtered_regions.slice(0, points_per_quartile).forEach(region => {
            let x = Math.floor(region.x + Math.random() * (search_region_size - window_size));
            let y = Math.floor(region.y + Math.random() * (search_region_size - window_size));

            // Ensure the point is within image bounds
            x = Math.min(x, image_width - window_size);
            y = Math.min(y, image_height - window_size);

            // Check if the point falls within any exclusion area
            let point = { x0: x, y0: y, x1: x + window_size, y1: y + window_size };
            if (!exclusionAreas.some(exclusionArea => isOverlapping(point, exclusionArea))) {
                points.push({ x: x, y: y });
            }
        });

        // Add the filtered regions to eligibleRegions
        for (let i = 0; i < filtered_regions.length; i++) {
            eligibleRegions.push(filtered_regions[i]);
        }
    });

    // If the total number of points exceeds num_points, truncate the list to the specified number of points
    if (points.length > num_points) {
        points = points.slice(0, num_points);
    }

    return points;
}


//debug function for displaingpoints
function debugDisplayPoints(points, image_width, image_height, exclusionAreas) {
    console.writeln("Displaying generated points:");
    for (let i = 0; i < points.length; i++) {
        console.writeln("Point " + (i + 1) + ": (" + points[i].x + ", " + points[i].y + ")");
    }

    console.writeln("Exclusion areas:");
    for (let i = 0; i < exclusionAreas.length; i++) {
        console.writeln("Exclusion Area " + (i + 1) + ": (" + exclusionAreas[i].x0 + ", " + exclusionAreas[i].y0 + ") to (" + exclusionAreas[i].x1 + ", " + exclusionAreas[i].y1 + ")");
    }

    let debugImage = new ImageWindow(image_width, image_height, 1, 8, false, false, "debugPoints");
    debugImage.mainView.beginProcess( UndoFlag.NoSwapFile );
    debugImage.mainView.image.fill(0); // Set the background to black
    debugImage.mainView.endProcess();

    debugImage.mainView.beginProcess();
    for (let i = 0; i < points.length; i++) {
        let startX = Math.max(0, points[i].x - 4);
        let startY = Math.max(0, points[i].y - 4);
        let endX = Math.min(image_width - 1, points[i].x + 4);
        let endY = Math.min(image_height - 1, points[i].y + 4);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                debugImage.mainView.image.setSample(1, x, y); // Set the point to white
            }
        }
    }

    for (let i = 0; i < exclusionAreas.length; i++) {
      for ( let x = exclusionAreas[i].x0; x < exclusionAreas[i].x1; x++ ) {
          for ( let y = exclusionAreas[i].y0; y < exclusionAreas[i].y1; y++ ) {
                debugImage.mainView.image.setSample(0.5, x, y); // Set the exclusion area to grey
            }
        }
    }
    debugImage.mainView.endProcess();

    debugImage.show();
}



// Ensure points do not overlap exclusion zones
function isPointValid( point, window_size, exclusionAreas )
{
    let pointRect = {
        x0: point.x,
        y0: point.y,
        x1: point.x + window_size,
        y1: point.y + window_size
    };

    return !exclusionAreas.some( exclusionArea => isOverlapping( pointRect, exclusionArea ) );
}

function find_best_window(var_image, start_x, start_y, window_size, spacing, channels, tolerance) {
    let best_window = {
        average: [],
        stddev: [],
        mad: [],
        mean: [],
        x: start_x,
        y: start_y
    };
    for (let c = 0; c < channels; c++) {
        best_window.average.push(1000000000);
        best_window.stddev.push(1000000000);
        best_window.mad.push(1000000000);
        best_window.mean.push(1000000000);
    }

    let current_x = start_x;
    let current_y = start_y;
    let improved = true;

    while (improved) {
        checkAbortRequested();
        improved = false;
        for (let offset_x = -1; offset_x <= 1; offset_x++) {
            for (let offset_y = -1; offset_y <= 1; offset_y++) {
                let new_x = current_x + offset_x * spacing;
                let new_y = current_y + offset_y * spacing;
                if (new_x >= 0 && new_x + window_size <= var_image.width &&
                    new_y >= 0 && new_y + window_size <= var_image.height) {
                    let stats = get_window_stats(var_image, new_x, new_y, window_size, channels, tolerance);
                    let stats_mean_sum = stats.average.reduce((a, b) => a + b, 0);
                    let best_window_mean_sum = best_window.mean.reduce((a, b) => a + b, 0);
                    let stats_stddev_sum = stats.stddev.reduce((a, b) => a + b, 0);
                    let best_window_stddev_sum = best_window.stddev.reduce((a, b) => a + b, 0);

                    if (stats_mean_sum < best_window_mean_sum ||
                        (stats_mean_sum === best_window_mean_sum && stats_stddev_sum < best_window_stddev_sum)) {
                        best_window = {
                            average: stats.average,
                            stddev: stats.stddev,
                            mad: stats.mad,
                            mean: stats.average,
                            x: new_x,
                            y: new_y
                        };
                        improved = true;
                    }
                }
            }
        }
        current_x = best_window.x;
        current_y = best_window.y;
    }

    return best_window;
}


// Updated function to calculate the median of the entire image
function calculate_image_median(var_image) {
    return var_image.median();
}

// Function to calculate standard deviation for the entire image
function calculate_image_stddev(var_image) {
    return var_image.stdDev();
}

function random_starting_point(image_width, image_height, window_size, exclusionAreas) {
    let point;
    do {
        let x = Math.floor(Math.random() * (image_width - window_size));
        let y = Math.floor(Math.random() * (image_height - window_size));
        point = { x: x, y: y };
    } while (!isPointValid(point, window_size, exclusionAreas));
    return point;
}

// Function to get the current list of image window IDs
function getImageWindowIds() {
    return ImageWindow.windows.map(window => window.mainView.id);
}



// Function to execute Gradient Descent
function executeGradientDescent(targetView, exclusionAreas) {
    if (!targetView) throw new Error("No target image selected!");

    let sourceImage = targetView.image;
    if (sourceImage.isNull) throw new Error("No image found in the target view!");

    let channels = sourceImage.numberOfChannels;

    // Ensure `exclusionAreas` is an array
    exclusionAreas = exclusionAreas || [];

    // Function to get all existing image IDs
    function getAllImageIDs() {
        var windows = ImageWindow.windows;
        var ids = [];
        for (var i = 0; i < windows.length; ++i) {
            ids.push(windows[i].mainView.id);
        }
        return ids;
    }

    // Function to check if an ID exists in an array
    function idExists(id, idArray) {
        for (var i = 0; i < idArray.length; i++) {
            if (idArray[i] === id) {
                return true;
            }
        }
        return false;
    }

    // Function to generate a unique ID with the _ADBE suffix
    function getUniqueID(baseID, existingIDs) {
        let uniqueID = baseID;
        let counter = 1;

        // Generate a list of potential IDs
        let potentialIDs = [baseID];
        for (var i = 1; i <= 99; i++) {
            potentialIDs.push(baseID + "_" + (i < 10 ? "0" : "") + i);
        }

        // Find the first unique ID that is not in the existing IDs
        for (var j = 0; j < potentialIDs.length; j++) {
            if (!idExists(potentialIDs[j], existingIDs)) {
                return potentialIDs[j];
            }
        }

        // If all potential IDs are taken, return a default ID (fallback)
        return baseID + "_99";
    }

    // Ensure that the source image is correctly assigned
    let activeWindow = targetView.window;

    // If replaceTarget is unchecked, create a new image and use it for all operations
    if (!GradientDescentParameters.replaceTarget) {
        var existingIDs = getAllImageIDs(); // Get all image IDs before creating the new image

        let originalID = targetView.id; // Ensure correct retrieval of original image ID
        if (!originalID) {
            console.criticalln("Error: Unable to retrieve the original image ID.");
        } else {
            console.writeln("Original Image ID: " + originalID); // Debug output
        }

        let baseID = originalID + "_ADBE";
        let newID = getUniqueID(baseID, existingIDs);

        let newWindow = new ImageWindow(
            sourceImage.width,
            sourceImage.height,
            sourceImage.numberOfChannels,
            sourceImage.bitsPerSample,
            sourceImage.isReal,
            sourceImage.isColor
        );

        newWindow.mainView.beginProcess();
        newWindow.mainView.image.assign(sourceImage);
        newWindow.mainView.endProcess();
        newWindow.mainView.id = newID;  // Assign the unique ID here
        newWindow.show();

        console.writeln("New Image ID: " + newID); // Debug output

        targetView = newWindow.mainView;
        sourceImage = targetView.image;

        // Copy astrometric solution from the original image to the new image
        if (activeWindow.hasAstrometricSolution) {
            newWindow.copyAstrometricSolution(activeWindow);
            console.noteln("Astrometric solution copied from: ", activeWindow.mainView.id);
            console.noteln("Astrometric solution copied to: ", newWindow.mainView.id);
        } else {
            console.warningln("Original image has no astrometric solution to copy.");
        }

        // Copy FITS header keywords from the original image to the new image
        newWindow.keywords = activeWindow.keywords;
        console.noteln("FITS header keywords copied from: ", activeWindow.mainView.id);
        console.noteln("FITS header keywords copied to: ", newWindow.mainView.id);
    }

    if (channels > 1) {
        var P = new BackgroundNeutralization;
        P.backgroundReferenceViewId = "";
        P.backgroundLow = 0.0000000;
        P.backgroundHigh = 0.1200000;
        P.useROI = false;
        P.roiX0 = 0;
        P.roiY0 = 0;
        P.roiX1 = 0;
        P.roiY1 = 0;
        P.mode = BN_MODE_RESCALE_AS_NEEDED;
        P.targetBackground = 0.0010000;
        if(!P.executeOn(targetView))throw new Error("AutoDBE "+P.processId()+" failed.");
    }

    // Get the list of image windows before ABE execution
    let windowsBeforeABE = getAllImageIDs();
    let abeBackgroundWindow = null;

    // Execute ABE and generate its background image only if enabled
    if (GradientDescentParameters.enableSimplifiedInitialModelling) {
      var P = new AutomaticBackgroundExtractor;
      P.tolerance = 1.000;
      P.deviation = 0.800;
      P.unbalance = 1.800;
      P.minBoxFraction = 0.050;
      P.maxBackground = 1.0000;
      P.minBackground = 0.0000;
      P.useBrightnessLimits = false;
      P.polyDegree = GradientDescentParameters.polynomialDegree;
      P.boxSize = 5;
      P.boxSeparation = 5;
      P.abeDownsample = 2.00;
      P.writeSampleBoxes = false;
      P.justTrySamples = false;
      P.targetCorrection = ABE_TARGET_CORRECTION_SUBTRACT;
      P.normalize = true;
      P.discardModel = GradientDescentParameters.discardModel;
      P.replaceTarget = true;
      P.correctedImageId = "";
      P.verboseCoefficients = false;
      P.compareModel = false;
      P.compareFactor = 10.00;
      if(!P.executeOn(targetView))throw new Error("AutoDBE "+P.processId()+" failed; check samples and image scale.");
        // Get the list of image windows after ABE execution
        let windowsAfterABE = getAllImageIDs();

        // Find the new ABE background image window
        for (let id of windowsAfterABE) {
            if (windowsBeforeABE.indexOf(id) === -1) {
                abeBackgroundWindow = ImageWindow.windowById(id);
                break;
            }
        }

        if (abeBackgroundWindow) {
            abeBackgroundWindow.hide();
        }
    }

    console.show();
    console.noteln("Calculating Image Statistics");
    console.flush();
    let window_size = calculate_window_size(
        sourceImage.height,
        GradientDescentParameters.overrideSampleRadius,
        GradientDescentParameters.defaultSampleRadius
        );
    let spacing = calculate_spacing(window_size);

    if (window_size <= 0 || spacing <= 0) throw new Error("Invalid window size or spacing!");

    let best_overall_window = null;
    let completed_paths = 0;
    let final_brightnesses = [];
    let endPoints = [];

    console.noteln("Exclusion Areas: ", JSON.stringify(exclusionAreas));

   let user_defined_paths = parseInt(GradientDescentParameters.descentPathsInput, 10);
    if (isNaN(user_defined_paths) || user_defined_paths < 0) {
        user_defined_paths = 50; // Default value if input is invalid or less than 0
    }
    let total_paths = user_defined_paths + 12;

    let random_points = generate_starting_points_with_brightness(
        sourceImage.width,
        sourceImage.height,
        window_size,
        user_defined_paths,
        sourceImage,
        channels,
        exclusionAreas
    );

    // Debug display of points
    //debugDisplayPoints(random_points, sourceImage.width, sourceImage.height, exclusionAreas);

    let edge_points = [
        { x: 10, y: 10 }, // Top-left corner
        { x: sourceImage.width - window_size - 10, y: 10 }, // Top-right corner
        { x: 10, y: sourceImage.height - window_size - 10 }, // Bottom-left corner
        { x: sourceImage.width - window_size - 10, y: sourceImage.height - window_size - 10 }, // Bottom-right corner
        { x: sourceImage.width / 2 - window_size / 2, y: 10 },
        { x: sourceImage.width / 2 - window_size / 2, y: sourceImage.height - window_size - 10 },
        { x: 10, y: sourceImage.height / 2 - window_size / 2 },
        { x: sourceImage.width - window_size - 10, y: sourceImage.height / 2 - window_size / 2 },
        { x: sourceImage.width / 4 - window_size / 2, y: 10 },
        { x: 3 * sourceImage.width / 4 - window_size / 2, y: 10 },
        { x: sourceImage.width / 4 - window_size / 2, y: sourceImage.height - window_size - 10 },
        { x: 3 * sourceImage.width / 4 - window_size / 2, y: sourceImage.height - window_size - 10 }
    ];

    let starting_points = edge_points.concat(random_points);

    let tolerance = GradientDescentParameters.tolerance;

    function performGradientDescent(threshold, max_threshold, starting_points) {
        console.noteln("Starting Gradient Descent Path Algorithm");
        console.write(starting_points.length + " total paths (User Defined Amount plus 12 Edge Starting Paths). Completed: ");
        console.flush();

        let progress_interval = Math.ceil(starting_points.length / 10);
        completed_paths = 0;

        for (let i = 0; i < starting_points.length; i++) {
            checkAbortRequested();
            let starting_point = starting_points[i];

            // Check if the starting point is in the exclusion zone
            if (isPointInExclusionZone(starting_point.x, starting_point.y, exclusionAreas)) {
                continue; // Skip this starting point
            }

            let ccSampleAttempts = 0;
            while (get_window_stats(sourceImage, starting_point.x, starting_point.y, window_size, channels).average.some(avg => avg >= threshold)) {
                if(++ccSampleAttempts>256)throw new Error("AutoDBE could not find a background sample below threshold. Try different settings or a native gradient method.");
                checkAbortRequested();
                starting_point = random_starting_point(sourceImage.width, sourceImage.height, window_size, exclusionAreas);

                // Check if the new random starting point is in the exclusion zone
                if (isPointInExclusionZone(starting_point.x, starting_point.y, exclusionAreas)) {
                    continue; // Skip this starting point
                }
            }

            let best_window = find_best_window(sourceImage, starting_point.x, starting_point.y, window_size, spacing, channels, tolerance);

            let exceeds_max_threshold = best_window.average.some(avg => avg > max_threshold);
            if (!exceeds_max_threshold) {
                if (!best_overall_window ||
                    best_window.average.reduce((sum, val) => sum + val, 0) < best_overall_window.average.reduce((sum, val) => sum + val, 0) ||
                    (best_window.average.reduce((sum, val) => sum + val, 0) === best_overall_window.average.reduce((sum, val) => sum + val, 0) &&
                        best_window.stddev.reduce((sum, val) => sum + val, 0) < best_overall_window.stddev.reduce((sum, val) => sum + val, 0))) {
                    best_overall_window = best_window;
                }

                completed_paths++;

                let region_brightness = best_window.average.reduce((sum, val) => sum + val, 0) / channels;
                final_brightnesses.push(region_brightness);

                // Store the end point with channel-specific weights based on mean brightness
                let weights = best_window.average.map(avg => avg / image_median);
                endPoints.push({
                    x: best_window.x,
                    y: best_window.y,
                    average: best_window.average,
                    mad: best_window.mad,
                    weights: weights
                });
            }

            if ((i + 1) % progress_interval === 0 || i === starting_points.length - 1) {
                console.write(Math.ceil(((i + 1) / starting_points.length) * 100) + "%... ");
                console.flush();
            }
        }
    }

    function isPointInExclusionZone(x, y, exclusionAreas) {
        for (let area of exclusionAreas) {
           if ( x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1 ) {
                return true;
            }
        }
        return false;
    }

    let image_median = calculate_image_median(sourceImage);
    let image_stddev = calculate_image_stddev(sourceImage);
    let threshold = image_median + 0.3 * image_stddev;
    let max_threshold = image_median + 0.15 * image_stddev;

    console.writeln("Image median: " + image_median);
    console.writeln("Image standard deviation: " + image_stddev);

    performGradientDescent(threshold, max_threshold, starting_points);

    if (!best_overall_window) {
        console.noteln("All Starting Points Rejected, Restarting with Expanded Tolerances");
        threshold = 2 * image_median;
        max_threshold = image_median + 2 * image_stddev;
        performGradientDescent(threshold, max_threshold, starting_points);
    }

    if (!best_overall_window) {
        throw new Error("All starting points were rejected, even with expanded tolerances.");
    }

    let center_x = best_overall_window.x + window_size / 2;
    let center_y = best_overall_window.y + window_size / 2;

    let median_brightness = calculate_median(final_brightnesses);
    let mad = calculate_mad(final_brightnesses, median_brightness);
    console.writeln("calculated MAD: " + mad);

    let normalized_mad = 15 * 1.4826 * mad / image_median;
    console.writeln("Normalized MAD :" + normalized_mad);

    let smoothing_factor = 0.15 + (0.5 - 0.15) * (1 - normalized_mad);
    console.writeln("Calculated smoothing factor: " + smoothing_factor);

    smoothing_factor = Math.max(0.15, Math.min(0.5, smoothing_factor));

    let brightness_array = [];
    for (let c = 0; c < channels; c++) {
        brightness_array[c] = 0;
    }

    for (let offset_x = 0; offset_x < window_size; offset_x++) {
        for (let offset_y = 0; offset_y < window_size; offset_y++) {
            for (let c = 0; c < channels; c++) {
                brightness_array[c] += sourceImage.sample(best_overall_window.x + offset_x, best_overall_window.y + offset_y, c);
            }
        }
    }

    for (let c = 0; c < channels; c++) brightness_array[c] /= window_size;

    let highest_value = brightness_array[0];
    for (let c = 1; c < channels; c++) {
        if (brightness_array[c] > highest_value) highest_value = brightness_array[c];
    }

    if (GradientDescentParameters.rigidlyFixCornerPoints) {
        // Add corner points to the endPoints array with calculated weights
        let gap = 15;
        let corner_points = [
            { x: gap, y: gap },
            { x: sourceImage.width - window_size - gap, y: gap },
            { x: gap, y: sourceImage.height - window_size - gap },
            { x: sourceImage.width - window_size - gap, y: sourceImage.height - window_size - gap }
        ];

        for (let point of corner_points) {
            let average = [];
            let mad = [];
            for (let c = 0; c < channels; c++) {
                let avg = sourceImage.sample(point.x, point.y, c);
                average.push(avg);
                mad.push(0); // Assuming no mad value for corners
            }
            endPoints.push({
                x: point.x,
                y: point.y,
                average: average,
                mad: mad,
                weights: calculate_noise_weight(average, image_median, average, mad)
            });
        }
    }

    console.show();

    console.noteln("\n\nGradient Descent finished!");
    console.writeln("Total paths completed: " + completed_paths);

    let best_window_params = {
        center_x: center_x,
        center_y: center_y,
        smoothing_factor: smoothing_factor,
        window_size: window_size,
        tolerance: GradientDescentParameters.tolerance,
        defaultSampleRadius: window_size / 2 // Set defaultSampleRadius as half of window_size
    };

    executeDBEWithEndPoints(endPoints, targetView, abeBackgroundWindow, best_window_params);
}

// Helper function to calculate the median
function calculate_median(values) {
    values.sort(function(a, b) { return a - b; });
    let half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return (values[half - 1] + values[half]) / 2.0;
}

// Helper function to calculate the MAD
function calculate_mad(values, median) {
    let deviations = values.map(function(value) { return Math.abs(value - median); });
    return calculate_median(deviations);
}

function calculate_noise_weight(avg_brightness, median_brightness, endpoint_brightness, mad_brightness) {
    if (!Array.isArray(avg_brightness)) {
        avg_brightness = [avg_brightness, avg_brightness, avg_brightness];
    }
    if (!Array.isArray(median_brightness)) {
        median_brightness = [median_brightness, median_brightness, median_brightness];
    }
    if (!Array.isArray(endpoint_brightness)) {
        endpoint_brightness = [endpoint_brightness, endpoint_brightness, endpoint_brightness];
    }
    if (!Array.isArray(mad_brightness)) {
        mad_brightness = [mad_brightness, mad_brightness, mad_brightness];
    }

    let weights = avg_brightness.map((avg, index) => {
        let median = median_brightness[index];
        let mad = mad_brightness[index];

        if (median === 0) {
            console.warningln("Warning: Median brightness for channel " + index + " is zero. Adjusting to a small non-zero value to avoid division by zero.");
            median = 0.0001;
        }

        let noise_factor = 1.0 - (mad / median);
        return Math.max(0.0, Math.min(1.0, noise_factor));
    });

    return weights;
}

// Updated `calculate_brightness_weight` function
function calculate_brightness_weight(avg_brightness, median_brightness, endpoint_brightness) {
    if (!Array.isArray(avg_brightness)) {
        avg_brightness = [avg_brightness, avg_brightness, avg_brightness];
    }
    if (!Array.isArray(median_brightness)) {
        median_brightness = [median_brightness, median_brightness, median_brightness];
    }
    if (!Array.isArray(endpoint_brightness)) {
        endpoint_brightness = [endpoint_brightness, endpoint_brightness, endpoint_brightness];
    }

    let weights = avg_brightness.map((avg, index) => {
        let median = median_brightness[index];
        let endpoint = endpoint_brightness[index];

        if (median === 0) {
            console.warningln("Warning: Median brightness for channel " + index + " is zero. Adjusting to a small non-zero value to avoid division by zero.");
            median = 0.0001;
        }

        let start_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (avg - median) / median)));
        let end_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (endpoint - median) / median)));
        return start_weight * end_weight;
    });

    return weights;
}

// Alternative method to create arrays filled with a value
function createFilledArray(length, value) {
    let arr = [];
    for (let i = 0; i < length; i++) {
        arr.push(value);
    }
    return arr;
}

// Function to generate weight based on brightness with safety checks
function calculate_weight(avg_brightness, median_brightness, endpoint_brightness) {
    if (!Array.isArray(avg_brightness)) {
        avg_brightness = [avg_brightness, avg_brightness, avg_brightness];
    }
    if (!Array.isArray(median_brightness)) {
        median_brightness = [median_brightness, median_brightness, median_brightness];
    }
    if (!Array.isArray(endpoint_brightness)) {
        endpoint_brightness = [endpoint_brightness, endpoint_brightness, endpoint_brightness];
    }

    let weights = avg_brightness.map((avg, index) => {
        let median = median_brightness[index];
        let endpoint = endpoint_brightness[index];

        if (median === 0) {
            console.warningln("Warning: Median brightness for channel " + index + " is zero. Adjusting to a small non-zero value to avoid division by zero.");
            median = 0.0001;
        }

        let start_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (avg - median) / median)));
        let end_weight = Math.max(0.97, 1.0 - Math.min(0.03, Math.max(0, (endpoint - median) / median)));
        return start_weight * end_weight;
    });

    return weights;
}

// Function to calculate the spatial weight (varying from 1.0 at the edge to 0.8 in the middle)
function calculate_spatial_weight(x, y, width, height) {
    let centerX = width / 2;
    let centerY = height / 2;
    let distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    let maxDistance = Math.sqrt(Math.pow(centerX, 2) + Math.pow(centerY, 2));
    let normalizedDistance = distance / maxDistance;
    let centerWeight = 0.95 + 0.05 * normalizedDistance; // Weight ranges from 0.8 to 1.0

    let edgeThresholdX = width * 0.1;
    let edgeThresholdY = height * 0.1;
    let edgeWeight = (x < edgeThresholdX || x > width - edgeThresholdX || y < edgeThresholdY || y > height - edgeThresholdY) ? 0.95 : 1.0;

    return centerWeight * edgeWeight;
}

// Function to close the ABE background window
function closeWindowById(windowId) {
    let window = ImageWindow.windowById(windowId);
    if (window !== null) {
        window.forceClose();
    }
}

// Function to calculate the Median Absolute Deviation (MAD) for the entire image
function calculate_image_mad(var_image) {
    let channels = var_image.numberOfChannels;
    let mad_values = [];

    for (let c = 0; c < channels; c++) {
        let channel_values = [];
        for (let y = 0; y < var_image.height; y++) {
            for (let x = 0; x < var_image.width; x++) {
                channel_values.push(var_image.sample(x, y, c));
            }
        }
        let median = calculate_median(channel_values);
        let deviations = channel_values.map(value => Math.abs(value - median));
        mad_values.push(calculate_median(deviations));
    }

    return mad_values;
}

// Function to execute DBE with Endpoints
function executeDBEWithEndPoints( endPoints, targetView, abeBackgroundWindow, best_window_params )
{
    let image = targetView.image;
    let channels = image.numberOfChannels;
    let width = image.width;
    let height = image.height;
    let radius = best_window_params.window_size / 2;

    let median = calculate_image_median( image );
    let stddev = calculate_image_stddev( image );

    // Normalize median/stddev to 3-element arrays for compatibility
    if ( !Array.isArray( median ) )
        median = [ median, median, median ];
    if ( !Array.isArray( stddev ) )
        stddev = [ stddev, stddev, stddev ];

    while ( endPoints.length < 3 )
    {
        endPoints.push( {
            x: Math.random() * ( width - radius * 2 ) + radius,
            y: Math.random() * ( height - radius * 2 ) + radius,
            average: [ median[0], median[1], median[2] ],
            mad: [ 0, 0, 0 ]
        } );
    }

    let windowsBeforeDBE = getImageWindowIds();

    let P = new DynamicBackgroundExtraction;

    P.data = endPoints.map( point =>
    {
        let avg = Array.isArray( point.average ) ? point.average.slice() : [ point.average ];
        let mad = Array.isArray( point.mad ) ? point.mad.slice() : [ point.mad ];

        // Force mono to 3-channel-compatible layout
        if ( avg.length < 3 )
            avg = [ avg[0], avg[0], avg[0] ];
        if ( mad.length < 3 )
            mad = [ mad[0] || 0, mad[0] || 0, mad[0] || 0 ];

        let noise_weights = calculate_noise_weight( avg, median, avg, mad );

        let spatial_weight = calculate_spatial_weight( point.x, point.y, width, height );

        let w0 = noise_weights[0] * spatial_weight;
        let w1 = noise_weights[1] * spatial_weight;
        let w2 = noise_weights[2] * spatial_weight;

        if ( !isFinite( w0 ) ) w0 = 1.0;
        if ( !isFinite( w1 ) ) w1 = 1.0;
        if ( !isFinite( w2 ) ) w2 = 1.0;

        // V8 expects full 8-column rows always:
        // x, y, z0, w0, z1, w1, z2, w2
        return [
            point.x / width,
            point.y / height,
            avg[0], w0,
            avg[1], w1,
            avg[2], w2
        ];
    } );

    P.samples = endPoints.map( point =>
    {
        let avg = Array.isArray( point.average ) ? point.average.slice() : [ point.average ];
        let mad = Array.isArray( point.mad ) ? point.mad.slice() : [ point.mad ];

        if ( avg.length < 3 )
            avg = [ avg[0], avg[0], avg[0] ];
        if ( mad.length < 3 )
            mad = [ mad[0] || 0, mad[0] || 0, mad[0] || 0 ];

        let noise_weights = calculate_noise_weight( avg, median, avg, mad );
        let spatial_weight = calculate_spatial_weight( point.x, point.y, width, height );

        let w0 = noise_weights[0] * spatial_weight;
        let w1 = noise_weights[1] * spatial_weight;
        let w2 = noise_weights[2] * spatial_weight;

        if ( !isFinite( w0 ) ) w0 = 1.0;
        if ( !isFinite( w1 ) ) w1 = 1.0;
        if ( !isFinite( w2 ) ) w2 = 1.0;

        return [
            point.x,  // x
            point.y,  // y
            GradientDescentParameters.overrideSampleRadius
                ? GradientDescentParameters.defaultSampleRadius
                : best_window_params.defaultSampleRadius,
            0, // symmetries
            6, // axialCount
            0, // isFixed
            avg[0], w0,
            avg[1], w1,
            avg[2], w2
        ];
    } );

    // Keep this at 3 for compatibility, even on mono
    P.numberOfChannels = 3;

    P.derivativeOrder = 2;
    P.smoothing = GradientDescentParameters.overrideSmoothing
        ? GradientDescentParameters.smoothing
        : best_window_params.smoothing_factor;
    P.ignoreWeights = false;
    P.modelId = "";
    P.modelWidth = 0;
    P.modelHeight = 0;
    P.downsample = 2;

    // These enum assignments may also need numeric compatibility later.
    // If V8 complains, comment them out temporarily.
    try { P.modelSampleFormat = DynamicBackgroundExtraction.f32; } catch ( e ) {}
    P.targetCorrection = GradientDescentParameters.correctionType;
    P.normalize = true;
    P.discardModel = GradientDescentParameters.discardModel;
    P.replaceTarget = true;
    P.correctedImageId = "";
    try { P.correctedImageSampleFormat = DynamicBackgroundExtraction.SameAsTarget; } catch ( e ) {}

    P.imageWidth = width;
    P.imageHeight = height;
    P.symmetryCenterX = 0.500000;
    P.symmetryCenterY = 0.500000;
    P.tolerance = best_window_params.tolerance;
    P.shadowsRelaxation = 5.000;
    P.minSampleFraction = 0.050;
    P.defaultSampleRadius = GradientDescentParameters.overrideSampleRadius
        ? GradientDescentParameters.defaultSampleRadius
        : best_window_params.defaultSampleRadius;
    P.samplesPerRow = 10;
    P.minWeight = 0.400;
    P.sampleColor = 4292927712;
    P.selectedSampleColor = 4278255360;
    P.selectedSampleFillColor = 0;
    P.badSampleColor = 4294901760;
    P.badSampleFillColor = 2164195328;
    P.axisColor = 4292927712;

    if(!P.executeOn(targetView))throw new Error("AutoDBE "+P.processId()+" failed; check samples and image scale.");

    let windowsAfterDBE = getImageWindowIds();

    let dbeBackgroundWindow = null;
    for ( let id of windowsAfterDBE )
    {
        if ( windowsBeforeDBE.indexOf( id ) === -1 )
        {
            dbeBackgroundWindow = ImageWindow.windowById( id );
            break;
        }
    }

    if ( dbeBackgroundWindow )
    {
        if ( !GradientDescentParameters.discardModel )
            dbeBackgroundWindow.hide();
    }

    if ( abeBackgroundWindow && dbeBackgroundWindow )
    {
        console.writeln( "Adding ABE and DBE Background images using PixelMath." );

        let abeBackgroundId = abeBackgroundWindow.mainView.id;
        let dbeBackgroundId = dbeBackgroundWindow.mainView.id;

        let pixelMath = new PixelMath;
        pixelMath.expression = abeBackgroundId + " + " + dbeBackgroundId;
        pixelMath.expression1 = "";
        pixelMath.expression2 = "";
        pixelMath.expression3 = "";
        pixelMath.useSingleExpression = true;
        pixelMath.symbols = "";
        pixelMath.clearImageCacheAndExit = false;
        pixelMath.cacheGeneratedImages = false;
        pixelMath.generateOutput = true;
        pixelMath.singleThreaded = false;
        pixelMath.optimization = true;
        pixelMath.use64BitWorkingImage = false;
        pixelMath.rescale = false;
        pixelMath.rescaleLower = 0;
        pixelMath.rescaleUpper = 1;
        pixelMath.truncate = true;
        pixelMath.truncateLower = 0;
        pixelMath.truncateUpper = 1;
        pixelMath.createNewImage = true;
        pixelMath.showNewImage = true;
        pixelMath.newImageId = "Extracted_Background";
        pixelMath.newImageWidth = 0;
        pixelMath.newImageHeight = 0;
        pixelMath.newImageAlpha = false;
        pixelMath.newImageColorSpace = PixelMath.SameAsTarget;
        pixelMath.newImageSampleFormat = PixelMath.SameAsTarget;
        pixelMath.executeOn( dbeBackgroundWindow.mainView, false );

        closeWindowById( abeBackgroundWindow.mainView.id );
        closeWindowById( dbeBackgroundWindow.mainView.id );
    }
    else
    {
        if ( !abeBackgroundWindow )
            console.writeln( "ABE Background Window was not found for addition." );
        if ( !dbeBackgroundWindow )
            console.writeln( "DBE Background Window was not found for addition." );
        else
            dbeBackgroundWindow.show();
    }
}

